import { randomUUID } from "node:crypto";
import type { CatalogKind, QuantityProduct } from "@talket/contracts";
import type { Pool, PoolConnection } from "mysql2/promise";
import { parseDateTime } from "./dates";
import { loadProduct } from "./read-product";
import { fail, succeed, type CommandResult } from "./result";

const maxUnitPrice = 10_000_000;
const maxStock = 1_000_000;
const maxSellables = 50;

type OfferInput = {
  priceKey: string;
  unitPrice: number;
  channel?: string;
  currency?: string;
  availableFrom?: string | null;
  availableTo?: string | null;
};

type InventoryInput = {
  policyKey: "quantity.v1" | "interval.v1";
  onHand?: number;
  requiredQuantity?: number;
  label?: string;
  slot?: { label: string; startsAt: string; endsAt: string };
};

type SellableInput = {
  name: string;
  optionLabels?: { axis: string; value: string }[];
  unitPrice?: number;
  stock?: number;
  sharedInventoryKey?: string;
  bindingMode?: "all" | "choice";
  offers?: OfferInput[];
  inventories?: InventoryInput[];
};

type InputFieldInput = {
  label: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  scope?: "line" | "unit";
};

export type CreateProductInput = {
  name: string;
  unitPrice?: number;
  stock?: number;
  feeBps?: number;
  fulfillment?: "shipping";
  binding?: "each" | "shared";
  axes?: { label: string; values: string[] }[];
  priceRows?: { priceKey: string; unitPrice: number }[];
  inputs?: InputFieldInput[];
  sharedInventories?: { key: string; onHand: number }[];
  sellables?: SellableInput[];
  sessions?: {
    label: string;
    startsAt: string;
    grades: { label: string; unitPrice: number; seats: { label: string }[] }[];
  }[];
};

export async function createProduct(
  pool: Pool,
  input: CreateProductInput,
): Promise<CommandResult<QuantityProduct>> {
  if (!input || typeof input.name !== "string") return fail("invalid-body");
  if (input.axes !== undefined && !Array.isArray(input.axes)) return fail("invalid-body");
  if (input.sellables !== undefined && !Array.isArray(input.sellables)) return fail("invalid-body");
  if (input.sessions !== undefined && !Array.isArray(input.sessions)) return fail("invalid-body");
  if (input.inputs !== undefined && !Array.isArray(input.inputs)) return fail("invalid-body");
  if (input.priceRows !== undefined && !Array.isArray(input.priceRows)) return fail("invalid-body");
  const name = input.name.trim();
  if (!isName(name)) return fail("invalid-name");
  const feeBps = input.feeBps ?? 0;
  if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > 10_000) return fail("invalid-price");

  const connection = await pool.getConnection();
  const productId = randomUUID();
  try {
    await connection.beginTransaction();
    const kind = catalogKind(input);
    await connection.query(
      "INSERT INTO products (id, name, catalog_kind, status, fee_bps) VALUES (?, ?, ?, 'on-sale', ?)",
      [productId, name, kind, feeBps],
    );
    const valueIds = await insertAxes(connection, productId, input.axes ?? []);
    if (typeof valueIds === "string") {
      await connection.rollback();
      return fail(valueIds);
    }
    const inputReason = await insertInputs(connection, productId, input.inputs ?? []);
    if (inputReason) {
      await connection.rollback();
      return fail(inputReason);
    }

    if (input.sessions) {
      const reason = await insertSessions(connection, productId, input.sessions);
      if (reason) {
        await connection.rollback();
        return fail(reason);
      }
    } else if (input.sellables) {
      const shared = await insertSharedInventories(connection, input.sharedInventories ?? []);
      if (typeof shared === "string") {
        await connection.rollback();
        return fail(shared);
      }
      for (const sellable of input.sellables) {
        const reason = await insertSellable(connection, productId, sellable, valueIds, shared);
        if (reason) {
          await connection.rollback();
          return fail(reason);
        }
      }
    } else {
      const reason = await insertGeneratedSellables(connection, productId, name, input, valueIds);
      if (reason) {
        await connection.rollback();
        return fail(reason);
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const product = await loadProduct(pool, productId);
  if (!product) return fail("product-not-found");
  return succeed(product);
}

function catalogKind(input: CreateProductInput): CatalogKind {
  if (input.sessions) return "session-seat";
  if (input.fulfillment === "shipping") return "shipping";
  const inventories = input.sellables?.flatMap((sellable) => sellable.inventories ?? []) ?? [];
  if (inventories.some((inventory) => inventory.policyKey === "interval.v1")) return "interval";
  if (inventories.some((inventory) => inventory.slot)) return "time-slot";
  return "quantity";
}

async function insertAxes(
  connection: PoolConnection,
  productId: string,
  axes: { label: string; values: string[] }[],
): Promise<Map<string, string> | string> {
  const valueIds = new Map<string, string>();
  const labels = new Set<string>();
  for (const [axisPosition, axis] of axes.entries()) {
    const label = axis.label.trim();
    if (!isName(label) || labels.has(label) || axis.values.length === 0) return "invalid-body";
    labels.add(label);
    const axisId = randomUUID();
    await connection.query("INSERT INTO option_axes (id, product_id, label, position) VALUES (?, ?, ?, ?)", [
      axisId,
      productId,
      label,
      axisPosition,
    ]);
    const seen = new Set<string>();
    for (const [valuePosition, raw] of axis.values.entries()) {
      const value = raw.trim();
      if (!isName(value) || seen.has(value)) return "invalid-body";
      seen.add(value);
      const valueId = randomUUID();
      await connection.query(
        "INSERT INTO option_values (id, axis_id, label, position) VALUES (?, ?, ?, ?)",
        [valueId, axisId, value, valuePosition],
      );
      valueIds.set(`${label}\0${value}`, valueId);
    }
  }
  return valueIds;
}

async function insertInputs(
  connection: PoolConnection,
  productId: string,
  inputs: InputFieldInput[],
): Promise<string | null> {
  for (const input of inputs) {
    const label = input.label.trim();
    if (!isName(label)) return "invalid-name";
    const scope = input.scope ?? "line";
    if (scope !== "line" && scope !== "unit") return "invalid-body";
    const minLength = input.minLength ?? 0;
    const maxLength = input.maxLength ?? 200;
    if (!Number.isSafeInteger(minLength) || !Number.isSafeInteger(maxLength) || minLength < 0 || maxLength < minLength) {
      return "invalid-body";
    }
    await connection.query(
      `INSERT INTO input_fields (id, product_id, label, required, min_length, max_length, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), productId, label, input.required ? 1 : 0, minLength, maxLength, scope],
    );
  }
  return null;
}

async function insertSharedInventories(
  connection: PoolConnection,
  inventories: { key: string; onHand: number }[],
): Promise<Map<string, string> | string> {
  const ids = new Map<string, string>();
  for (const inventory of inventories) {
    if (!isName(inventory.key) || ids.has(inventory.key)) return "invalid-stock";
    if (!isStock(inventory.onHand)) return "invalid-stock";
    const id = randomUUID();
    await connection.query("INSERT INTO availability_inventories (id, policy_key) VALUES (?, 'quantity.v1')", [id]);
    await connection.query("INSERT INTO availability_quantity_stocks (inventory_id, on_hand) VALUES (?, ?)", [id, inventory.onHand]);
    ids.set(inventory.key, id);
  }
  return ids;
}

async function insertGeneratedSellables(
  connection: PoolConnection,
  productId: string,
  productName: string,
  input: CreateProductInput,
  valueIds: Map<string, string>,
): Promise<string | null> {
  const unitPrice = input.unitPrice;
  const stock = input.stock;
  if (!isPrice(unitPrice)) return "invalid-price";
  if (!isStock(stock)) return "invalid-stock";
  const combos = cartesian(input.axes ?? []);
  if (combos.length > maxSellables) return "invalid-body";
  const priceRows = input.priceRows ?? [];
  for (const row of priceRows) {
    if (!isName(row.priceKey) || !isPrice(row.unitPrice)) return "invalid-price";
  }
  let sharedId: string | null = null;
  if (input.binding === "shared") {
    sharedId = randomUUID();
    await connection.query("INSERT INTO availability_inventories (id, policy_key) VALUES (?, 'quantity.v1')", [sharedId]);
    await connection.query("INSERT INTO availability_quantity_stocks (inventory_id, on_hand) VALUES (?, ?)", [sharedId, stock]);
  }
  const rows = combos.length === 0 ? [[]] : combos;
  for (const combo of rows) {
    const sellableName = combo.length === 0 ? productName : combo.map((item) => item.value).join(" / ");
    const offers =
      priceRows.length > 0
        ? priceRows.map((row) => ({ priceKey: row.priceKey, unitPrice: row.unitPrice }))
        : [{ priceKey: "default", unitPrice }];
    const reason = await insertSellable(
      connection,
      productId,
      {
        name: sellableName,
        optionLabels: combo,
        offers,
        stock: input.binding === "shared" ? undefined : stock,
        sharedInventoryKey: sharedId ? "generated" : undefined,
      },
      valueIds,
      sharedId ? new Map([["generated", sharedId]]) : new Map(),
    );
    if (reason) return reason;
  }
  return null;
}

function cartesian(axes: { label: string; values: string[] }[]): { axis: string; value: string }[][] {
  let rows: { axis: string; value: string }[][] = [[]];
  for (const axis of axes) {
    rows = rows.flatMap((row) =>
      axis.values.map((value) => [...row, { axis: axis.label.trim(), value: value.trim() }]),
    );
  }
  return rows.filter((row) => row.length > 0);
}

async function insertSellable(
  connection: PoolConnection,
  productId: string,
  input: SellableInput,
  valueIds: Map<string, string>,
  shared: Map<string, string>,
): Promise<string | null> {
  const name = input.name.trim();
  if (!isName(name)) return "invalid-name";
  const inventories = input.inventories ?? [];
  const hasSlot = inventories.some((inventory) => inventory.slot);
  const bindingMode =
    input.bindingMode ?? (hasSlot || inventories.some((inventory) => inventory.policyKey === "interval.v1" && hasSlot) ? "choice" : "all");
  const mode = hasSlot ? "choice" : bindingMode;
  const sellableId = randomUUID();
  await connection.query("INSERT INTO sellables (id, product_id, name, binding_mode) VALUES (?, ?, ?, ?)", [
    sellableId,
    productId,
    name,
    mode,
  ]);
  for (const option of input.optionLabels ?? []) {
    const valueId = valueIds.get(`${option.axis}\0${option.value}`);
    if (!valueId) return "invalid-body";
    await connection.query("INSERT INTO sellable_option_values (sellable_id, option_value_id) VALUES (?, ?)", [
      sellableId,
      valueId,
    ]);
  }
  const offers = input.offers ?? (isPrice(input.unitPrice) ? [{ priceKey: "default", unitPrice: input.unitPrice }] : []);
  if (offers.length === 0) return "invalid-price";
  for (const offer of offers) {
    const reason = await insertOffer(connection, sellableId, offer);
    if (reason) return reason;
  }

  if (input.sharedInventoryKey) {
    const inventoryId = shared.get(input.sharedInventoryKey);
    if (!inventoryId) return "invalid-stock";
    await connection.query(
      "INSERT INTO availability_bindings (sellable_id, inventory_id, required_quantity) VALUES (?, ?, 1)",
      [sellableId, inventoryId],
    );
    return null;
  }

  if (inventories.length === 0) {
    if (!isStock(input.stock)) return "invalid-stock";
    const inventoryId = randomUUID();
    await connection.query("INSERT INTO availability_inventories (id, policy_key) VALUES (?, 'quantity.v1')", [inventoryId]);
    await connection.query("INSERT INTO availability_quantity_stocks (inventory_id, on_hand) VALUES (?, ?)", [
      inventoryId,
      input.stock,
    ]);
    await connection.query(
      "INSERT INTO availability_bindings (sellable_id, inventory_id, required_quantity) VALUES (?, ?, 1)",
      [sellableId, inventoryId],
    );
    return null;
  }

  for (const inventory of inventories) {
    const required = inventory.requiredQuantity ?? 1;
    if (!Number.isSafeInteger(required) || required < 1 || required > 100) return "invalid-stock";
    const inventoryId = randomUUID();
    await connection.query("INSERT INTO availability_inventories (id, policy_key) VALUES (?, ?)", [inventoryId, inventory.policyKey]);
    if (inventory.policyKey === "quantity.v1") {
      if (!isStock(inventory.onHand)) return "invalid-stock";
      await connection.query("INSERT INTO availability_quantity_stocks (inventory_id, on_hand) VALUES (?, ?)", [
        inventoryId,
        inventory.onHand,
      ]);
      if (inventory.slot) {
        const starts = parseDateTime(inventory.slot.startsAt);
        const ends = parseDateTime(inventory.slot.endsAt);
        if (!starts || !ends || !isName(inventory.slot.label)) return "invalid-body";
        await connection.query(
          "INSERT INTO availability_slot_subjects (inventory_id, label, starts_at, ends_at) VALUES (?, ?, ?, ?)",
          [inventoryId, inventory.slot.label.trim(), starts, ends],
        );
      }
    } else {
      const label = inventory.label?.trim() ?? name;
      if (!isName(label)) return "invalid-name";
      await connection.query("INSERT INTO availability_interval_resources (inventory_id, label) VALUES (?, ?)", [
        inventoryId,
        label,
      ]);
    }
    await connection.query(
      "INSERT INTO availability_bindings (sellable_id, inventory_id, required_quantity) VALUES (?, ?, ?)",
      [sellableId, inventoryId, required],
    );
  }
  return null;
}

async function insertOffer(connection: PoolConnection, sellableId: string, offer: OfferInput): Promise<string | null> {
  if (!isName(offer.priceKey) || !isPrice(offer.unitPrice)) return "invalid-price";
  const currency = offer.currency ?? "KRW";
  if (currency !== "KRW") return "invalid-price";
  const availableFrom = offer.availableFrom ? parseDateTime(offer.availableFrom) : null;
  const availableTo = offer.availableTo ? parseDateTime(offer.availableTo) : null;
  if ((offer.availableFrom && !availableFrom) || (offer.availableTo && !availableTo)) return "invalid-body";
  await connection.query(
    `INSERT INTO offers (id, sellable_id, price_key, channel, currency, unit_price, available_from, available_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      sellableId,
      offer.priceKey.trim(),
      offer.channel?.trim() || "store",
      currency,
      offer.unitPrice,
      availableFrom,
      availableTo,
    ],
  );
  return null;
}

async function insertSessions(
  connection: PoolConnection,
  productId: string,
  sessions: NonNullable<CreateProductInput["sessions"]>,
): Promise<string | null> {
  let count = 0;
  for (const session of sessions) {
    const starts = parseDateTime(session.startsAt);
    if (!starts || !isName(session.label)) return "invalid-body";
    const sessionId = randomUUID();
    await connection.query("INSERT INTO availability_sessions (id, product_id, label, starts_at) VALUES (?, ?, ?, ?)", [
      sessionId,
      productId,
      session.label.trim(),
      starts,
    ]);
    for (const grade of session.grades) {
      if (!isName(grade.label) || !isPrice(grade.unitPrice) || grade.seats.length === 0) return "invalid-body";
      count += grade.seats.length;
      if (count > maxSellables * 4) return "invalid-body";
      const sellableId = randomUUID();
      await connection.query("INSERT INTO sellables (id, product_id, name, binding_mode) VALUES (?, ?, ?, 'choice')", [
        sellableId,
        productId,
        `${session.label.trim()} ${grade.label.trim()}`,
      ]);
      const offerReason = await insertOffer(connection, sellableId, { priceKey: "default", unitPrice: grade.unitPrice });
      if (offerReason) return offerReason;
      for (const seat of grade.seats) {
        if (!isName(seat.label)) return "invalid-body";
        const inventoryId = randomUUID();
        await connection.query("INSERT INTO availability_inventories (id, policy_key) VALUES (?, 'seat.v1')", [inventoryId]);
        await connection.query(
          "INSERT INTO availability_seats (inventory_id, session_id, label, grade, state) VALUES (?, ?, ?, ?, 'free')",
          [inventoryId, sessionId, seat.label.trim(), grade.label.trim()],
        );
        await connection.query(
          "INSERT INTO availability_bindings (sellable_id, inventory_id, required_quantity) VALUES (?, ?, 1)",
          [sellableId, inventoryId],
        );
      }
    }
  }
  return null;
}

function isName(value: string): boolean {
  return value.trim().length > 0 && value.trim().length <= 200;
}

function isPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maxUnitPrice;
}

function isStock(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maxStock;
}
