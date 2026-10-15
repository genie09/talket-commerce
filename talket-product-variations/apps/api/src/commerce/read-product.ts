import type { CatalogKind, InputFieldView, InventoryView, QuantityProduct, SellableView } from "@talket/contracts";
import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";

type ProductRow = RowDataPacket & {
  id: string;
  name: string;
  catalog_kind: CatalogKind;
  fee_bps: number;
};

type SellableRow = RowDataPacket & {
  id: string;
  product_id: string;
  name: string;
  binding_mode: "all" | "choice";
};

type OfferRow = RowDataPacket & {
  id: string;
  sellable_id: string;
  price_key: string;
  channel: string;
  currency: string;
  unit_price: number;
};

type OptionRow = RowDataPacket & {
  sellable_id: string;
  axis_label: string;
  value_label: string;
};

type InventoryRow = RowDataPacket & {
  sellable_id: string;
  inventory_id: string;
  policy_key: InventoryView["policyKey"];
  required_quantity: number;
  on_hand: number | null;
  seat_state: string | null;
  seat_label: string | null;
  slot_label: string | null;
  resource_label: string | null;
};

type FieldRow = RowDataPacket & {
  id: string;
  product_id: string;
  label: string;
  required: number;
  min_length: number;
  max_length: number;
  scope: "line" | "unit";
};

export async function loadProduct(
  pool: Pool | PoolConnection,
  productId: string,
): Promise<QuantityProduct | null> {
  const products = await loadProducts(pool, [productId]);
  return products[0] ?? null;
}

export async function listQuantityProducts(pool: Pool): Promise<QuantityProduct[]> {
  const [rows] = await pool.query<ProductRow[]>(
    `SELECT id, name, catalog_kind, fee_bps
     FROM products
     WHERE catalog_kind = 'quantity'
     ORDER BY created_at DESC, id DESC`,
  );
  return loadProducts(
    pool,
    rows.map((row) => row.id),
  );
}

async function loadProducts(pool: Pool | PoolConnection, productIds: string[]): Promise<QuantityProduct[]> {
  if (productIds.length === 0) return [];
  const [products] = await pool.query<ProductRow[]>(
    "SELECT id, name, catalog_kind, fee_bps FROM products WHERE id IN (?) ORDER BY created_at DESC, id DESC",
    [productIds],
  );
  const [sellableRows] = await pool.query<SellableRow[]>(
    "SELECT id, product_id, name, binding_mode FROM sellables WHERE product_id IN (?) ORDER BY name, id",
    [productIds],
  );
  const sellableIds = sellableRows.map((row) => row.id);
  const offerRows = sellableIds.length
    ? (
        await pool.query<OfferRow[]>(
          `SELECT id, sellable_id, price_key, channel, currency, unit_price
           FROM offers WHERE sellable_id IN (?)
           ORDER BY price_key = 'default' DESC, price_key, id`,
          [sellableIds],
        )
      )[0]
    : [];
  const optionRows = sellableIds.length
    ? (
        await pool.query<OptionRow[]>(
          `SELECT sv.sellable_id, a.label AS axis_label, v.label AS value_label
           FROM sellable_option_values sv
           JOIN option_values v ON v.id = sv.option_value_id
           JOIN option_axes a ON a.id = v.axis_id
           WHERE sv.sellable_id IN (?)
           ORDER BY a.position, v.position`,
          [sellableIds],
        )
      )[0]
    : [];
  const inventoryRows = sellableIds.length
    ? (
        await pool.query<InventoryRow[]>(
          `SELECT b.sellable_id, b.inventory_id, i.policy_key, b.required_quantity,
                  q.on_hand, se.state AS seat_state, se.label AS seat_label,
                  sl.label AS slot_label, ir.label AS resource_label
           FROM availability_bindings b
           JOIN availability_inventories i ON i.id = b.inventory_id
           LEFT JOIN availability_quantity_stocks q ON q.inventory_id = i.id
           LEFT JOIN availability_seats se ON se.inventory_id = i.id
           LEFT JOIN availability_slot_subjects sl ON sl.inventory_id = i.id
           LEFT JOIN availability_interval_resources ir ON ir.inventory_id = i.id
           WHERE b.sellable_id IN (?)
           ORDER BY b.inventory_id`,
          [sellableIds],
        )
      )[0]
    : [];
  const [fieldRows] = await pool.query<FieldRow[]>(
    `SELECT id, product_id, label, required, min_length, max_length, scope
     FROM input_fields WHERE product_id IN (?) ORDER BY label, id`,
    [productIds],
  );

  return products.map((product) => {
    const sellables = sellableRows
      .filter((row) => row.product_id === product.id)
      .map((row) => toSellable(row, offerRows, optionRows, inventoryRows));
    const first = sellables[0];
    const offer = first?.offers[0];
    const inputs: InputFieldView[] = fieldRows
      .filter((row) => row.product_id === product.id)
      .map((row) => ({
        id: row.id,
        label: row.label,
        required: row.required === 1,
        minLength: row.min_length,
        maxLength: row.max_length,
        scope: row.scope,
      }));
    return {
      id: product.id,
      name: product.name,
      usageMethod: product.catalog_kind,
      sellableId: first?.id ?? "",
      offerId: offer?.id ?? "",
      unitPrice: offer?.unitPrice ?? 0,
      stock: first?.stock ?? 0,
      sellables,
      inputs,
    };
  });
}

function toSellable(
  row: SellableRow,
  offers: OfferRow[],
  options: OptionRow[],
  inventories: InventoryRow[],
): SellableView {
  const bound = inventories
    .filter((inventory) => inventory.sellable_id === row.id)
    .map((inventory) => toInventory(inventory));
  return {
    id: row.id,
    name: row.name,
    bindingMode: row.binding_mode,
    stock: sellableStock(row.binding_mode, bound),
    options: options
      .filter((option) => option.sellable_id === row.id)
      .map((option) => ({ axis: option.axis_label, value: option.value_label })),
    offers: offers
      .filter((offer) => offer.sellable_id === row.id)
      .map((offer) => ({
        id: offer.id,
        priceKey: offer.price_key,
        channel: offer.channel,
        currency: offer.currency,
        unitPrice: Number(offer.unit_price),
      })),
    inventories: bound,
  };
}

function toInventory(row: InventoryRow): InventoryView {
  return {
    id: row.inventory_id,
    policyKey: row.policy_key,
    label: row.seat_label ?? row.slot_label ?? row.resource_label,
    onHand: row.on_hand === null ? null : Number(row.on_hand),
    requiredQuantity: Number(row.required_quantity),
    state: row.seat_state,
  };
}

function sellableStock(mode: "all" | "choice", inventories: InventoryView[]): number | null {
  if (inventories.length === 0) return null;
  if (inventories.every((inventory) => inventory.policyKey === "seat.v1")) {
    return inventories.filter((inventory) => inventory.state === "free").length;
  }
  if (inventories.every((inventory) => inventory.policyKey === "interval.v1")) return null;
  const counts = inventories.map((inventory) => {
    if (inventory.onHand === null) return 0;
    return Math.floor(inventory.onHand / inventory.requiredQuantity);
  });
  if (mode === "choice") return counts.reduce((sum, count) => sum + count, 0);
  return Math.min(...counts);
}
