import { randomUUID } from "node:crypto";
import {
  decideQuantityRefund,
  ledgerBalance,
  quantityFeeBps,
  saleAmount,
  type LedgerKind,
} from "@talket/domain";
import type { QuantityOrder, QuantityProduct } from "@talket/contracts";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";

export type CommandResult<T> =
  | { ok: true; value: T; replay: boolean }
  | { ok: false; reason: string; conflict: boolean };

const maxUnitPrice = 10_000_000;
const maxQuantity = 100;
const maxStock = 1_000_000;

type ProductRow = RowDataPacket & {
  id: string;
  sellable_id: string;
  name: string;
  unit_price: number;
  stock: number;
};

type LockedSaleRow = RowDataPacket & {
  product_name: string;
  sellable_name: string;
  unit_price: number;
};

type OrderRow = RowDataPacket & {
  status: "sold" | "refunded" | "settled";
  line_id: string;
  sellable_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  refunded_quantity: number;
  fulfilled: number;
};

type EntryRow = RowDataPacket & {
  kind: LedgerKind;
  amount: number;
};

function fail(reason: string, conflict = false): CommandResult<never> {
  return { ok: false, reason, conflict };
}

function isName(value: string): boolean {
  return value.trim().length > 0 && value.trim().length <= 200;
}

export async function createQuantityProduct(
  pool: Pool,
  input: { name: string; unitPrice: number; stock: number },
): Promise<CommandResult<QuantityProduct>> {
  const name = input.name.trim();
  if (!isName(name)) return fail("invalid-name");
  if (!Number.isSafeInteger(input.unitPrice) || input.unitPrice < 0 || input.unitPrice > maxUnitPrice) {
    return fail("invalid-price");
  }
  if (!Number.isSafeInteger(input.stock) || input.stock < 0 || input.stock > maxStock) {
    return fail("invalid-stock");
  }

  const productId = randomUUID();
  const sellableId = randomUUID();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "INSERT INTO products (id, name, usage_method, status) VALUES (?, ?, 'quantity', 'on-sale')",
      [productId, name],
    );
    await connection.query(
      "INSERT INTO sellables (id, product_id, name, unit_price) VALUES (?, ?, ?, ?)",
      [sellableId, productId, name, input.unitPrice],
    );
    await connection.query("INSERT INTO quantity_stocks (sellable_id, on_hand) VALUES (?, ?)", [
      sellableId,
      input.stock,
    ]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const product = await findProduct(pool, productId);
  if (!product) return fail("product-not-found");
  return { ok: true, value: product, replay: false };
}

export async function listQuantityProducts(pool: Pool): Promise<QuantityProduct[]> {
  const [rows] = await pool.query<ProductRow[]>(
    `SELECT p.id, s.id AS sellable_id, p.name, s.unit_price, q.on_hand AS stock
     FROM products p
     JOIN sellables s ON s.product_id = p.id
     JOIN quantity_stocks q ON q.sellable_id = s.id
     WHERE p.usage_method = 'quantity'
     ORDER BY p.created_at DESC, p.id DESC`,
  );
  return rows.map(toProduct);
}

export async function updateQuantityProduct(
  pool: Pool,
  input: { productId: string; name?: string; unitPrice?: number },
): Promise<CommandResult<QuantityProduct>> {
  const current = await findProduct(pool, input.productId);
  if (!current) return fail("product-not-found");

  const name = input.name === undefined ? current.name : input.name.trim();
  const unitPrice = input.unitPrice === undefined ? current.unitPrice : input.unitPrice;
  if (!isName(name)) return fail("invalid-name");
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0 || unitPrice > maxUnitPrice) {
    return fail("invalid-price");
  }

  await pool.query("UPDATE products SET name = ? WHERE id = ?", [name, input.productId]);
  await pool.query("UPDATE sellables SET name = ?, unit_price = ? WHERE product_id = ?", [
    name,
    unitPrice,
    input.productId,
  ]);

  const product = await findProduct(pool, input.productId);
  if (!product) return fail("product-not-found");
  return { ok: true, value: product, replay: false };
}

export async function adjustQuantityStock(
  pool: Pool,
  input: { productId: string; delta: number },
): Promise<CommandResult<QuantityProduct>> {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) return fail("invalid-stock");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<ProductRow[]>(
      `SELECT p.id, s.id AS sellable_id, p.name, s.unit_price, q.on_hand AS stock
       FROM products p
       JOIN sellables s ON s.product_id = p.id
       JOIN quantity_stocks q ON q.sellable_id = s.id
       WHERE p.id = ? AND p.usage_method = 'quantity'
       FOR UPDATE`,
      [input.productId],
    );
    const current = rows[0];
    if (!current) {
      await connection.rollback();
      return fail("product-not-found");
    }
    const next = current.stock + input.delta;
    if (next < 0 || next > maxStock) {
      await connection.rollback();
      return fail("invalid-stock");
    }
    const [updated] = await connection.query<ResultSetHeader>(
      "UPDATE quantity_stocks SET on_hand = ? WHERE sellable_id = ? AND on_hand = ?",
      [next, current.sellable_id, current.stock],
    );
    if (updated.affectedRows !== 1) {
      await connection.rollback();
      return fail("stock-conflict", true);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const product = await findProduct(pool, input.productId);
  if (!product) return fail("product-not-found");
  return { ok: true, value: product, replay: false };
}

export async function sellQuantity(
  pool: Pool,
  input: { sellableId: string; quantity: number },
): Promise<CommandResult<QuantityOrder>> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > maxQuantity) {
    return fail("invalid-quantity");
  }

  const connection = await pool.getConnection();
  const orderId = randomUUID();
  try {
    await connection.beginTransaction();
    await connection.query("INSERT INTO orders (id, status) VALUES (?, 'sold')", [orderId]);
    const [locked] = await connection.query<LockedSaleRow[]>(
      `SELECT p.name AS product_name, s.name AS sellable_name, s.unit_price
       FROM sellables s
       JOIN products p ON p.id = s.product_id
       JOIN quantity_stocks q ON q.sellable_id = s.id
       WHERE s.id = ? AND p.usage_method = 'quantity'
       FOR UPDATE`,
      [input.sellableId],
    );
    const snapshot = locked[0];
    if (!snapshot) {
      await connection.rollback();
      return fail("sellable-not-found");
    }

    const [updated] = await connection.query<ResultSetHeader>(
      "UPDATE quantity_stocks SET on_hand = on_hand - ? WHERE sellable_id = ? AND on_hand >= ?",
      [input.quantity, input.sellableId, input.quantity],
    );
    if (updated.affectedRows !== 1) {
      await connection.rollback();
      return fail("insufficient-stock", true);
    }

    const lineId = randomUUID();
    await connection.query(
      `INSERT INTO order_lines
        (id, order_id, sellable_id, product_name, sellable_name, unit_price, quantity, refunded_quantity, fulfilled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [
        lineId,
        orderId,
        input.sellableId,
        snapshot.product_name,
        snapshot.sellable_name,
        snapshot.unit_price,
        input.quantity,
      ],
    );
    await connection.query(
      `INSERT INTO ledger_entries (id, order_id, order_line_id, kind, amount, idempotency_key)
       VALUES (?, ?, ?, 'sale', ?, ?)`,
      [randomUUID(), orderId, lineId, saleAmount(snapshot.unit_price, input.quantity), `sale:${orderId}`],
    );
    await connection.commit();
    return { ok: true, value: await readOrder(connection, orderId), replay: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function refundQuantity(
  pool: Pool,
  input: { orderId: string; quantity: number; idempotencyKey: string },
): Promise<CommandResult<QuantityOrder>> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > maxQuantity) {
    return fail("invalid-quantity");
  }
  if (input.idempotencyKey.trim().length === 0 || input.idempotencyKey.length > 191) {
    return fail("invalid-idempotency-key");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const order = await lockOrder(connection, input.orderId);
    if (!order) {
      await connection.rollback();
      return fail("order-not-found");
    }
    if (order.status === "settled") {
      await connection.rollback();
      return fail("already-settled");
    }

    const [existing] = await connection.query<RowDataPacket[]>(
      "SELECT seq FROM ledger_entries WHERE idempotency_key = ? FOR UPDATE",
      [input.idempotencyKey],
    );
    if (existing.length > 0) {
      await connection.rollback();
      return { ok: true, value: await readOrder(connection, input.orderId), replay: true };
    }

    const decision = decideQuantityRefund({
      unitPrice: order.unit_price,
      quantity: order.quantity,
      refundedQuantity: order.refunded_quantity,
      requestedQuantity: input.quantity,
      fulfilled: order.fulfilled === 1,
      feeBps: quantityFeeBps,
    });
    if (!decision.ok) {
      await connection.rollback();
      return fail(decision.reason);
    }

    const [updated] = await connection.query<ResultSetHeader>(
      `UPDATE order_lines
       SET refunded_quantity = refunded_quantity + ?
       WHERE id = ? AND refunded_quantity = ?`,
      [decision.quantity, order.line_id, order.refunded_quantity],
    );
    if (updated.affectedRows !== 1) {
      await connection.rollback();
      return fail("refund-conflict", true);
    }

    if (decision.returnStock > 0) {
      await connection.query("UPDATE quantity_stocks SET on_hand = on_hand + ? WHERE sellable_id = ?", [
        decision.returnStock,
        order.sellable_id,
      ]);
    }

    for (const line of decision.lines) {
      const key = line.kind === "refund" ? input.idempotencyKey : `fee:${input.idempotencyKey}`;
      await connection.query(
        `INSERT INTO ledger_entries (id, order_id, order_line_id, kind, amount, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), input.orderId, order.line_id, line.kind, line.amount, key],
      );
    }

    const refundedQuantity = order.refunded_quantity + decision.quantity;
    if (refundedQuantity === order.quantity) {
      await connection.query("UPDATE orders SET status = 'refunded' WHERE id = ?", [input.orderId]);
    }
    await connection.commit();
    return { ok: true, value: await readOrder(connection, input.orderId), replay: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function settleQuantity(
  pool: Pool,
  input: { orderId: string },
): Promise<CommandResult<QuantityOrder>> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const order = await lockOrder(connection, input.orderId);
    if (!order) {
      await connection.rollback();
      return fail("order-not-found");
    }

    const settleKey = `settle:${input.orderId}`;
    const [existing] = await connection.query<RowDataPacket[]>(
      "SELECT seq FROM ledger_entries WHERE idempotency_key = ? FOR UPDATE",
      [settleKey],
    );
    if (existing.length > 0) {
      await connection.rollback();
      return { ok: true, value: await readOrder(connection, input.orderId), replay: true };
    }

    const entries = await readEntries(connection, input.orderId);
    await connection.query(
      `INSERT INTO ledger_entries (id, order_id, order_line_id, kind, amount, idempotency_key)
       VALUES (?, ?, NULL, 'payable', ?, ?)`,
      [randomUUID(), input.orderId, ledgerBalance(entries), settleKey],
    );
    await connection.query("UPDATE orders SET status = 'settled' WHERE id = ?", [input.orderId]);
    await connection.commit();
    return { ok: true, value: await readOrder(connection, input.orderId), replay: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getQuantityOrder(pool: Pool, orderId: string): Promise<QuantityOrder | null> {
  const [rows] = await pool.query<OrderRow[]>(orderSql, [orderId]);
  const order = rows[0];
  if (!order) return null;
  return toOrder(pool, orderId, order);
}

async function findProduct(pool: Pool, productId: string): Promise<QuantityProduct | null> {
  const [rows] = await pool.query<ProductRow[]>(
    `SELECT p.id, s.id AS sellable_id, p.name, s.unit_price, q.on_hand AS stock
     FROM products p
     JOIN sellables s ON s.product_id = p.id
     JOIN quantity_stocks q ON q.sellable_id = s.id
     WHERE p.id = ? AND p.usage_method = 'quantity'`,
    [productId],
  );
  return rows[0] ? toProduct(rows[0]) : null;
}

const orderSql = `SELECT o.status, l.id AS line_id, l.sellable_id, l.product_name, l.unit_price,
    l.quantity, l.refunded_quantity, l.fulfilled
  FROM orders o
  JOIN order_lines l ON l.order_id = o.id
  WHERE o.id = ?`;

async function lockOrder(connection: PoolConnection, orderId: string): Promise<OrderRow | null> {
  const [rows] = await connection.query<OrderRow[]>(`${orderSql} FOR UPDATE`, [orderId]);
  return rows[0] ?? null;
}

async function readEntries(connection: Pool | PoolConnection, orderId: string): Promise<EntryRow[]> {
  const [rows] = await connection.query<EntryRow[]>(
    "SELECT kind, amount FROM ledger_entries WHERE order_id = ? ORDER BY seq",
    [orderId],
  );
  return rows;
}

async function readOrder(connection: Pool | PoolConnection, orderId: string): Promise<QuantityOrder> {
  const [rows] = await connection.query<OrderRow[]>(orderSql, [orderId]);
  const order = rows[0];
  if (!order) throw new Error(`order ${orderId} disappeared after write`);
  return toOrder(connection, orderId, order);
}

async function toOrder(
  connection: Pool | PoolConnection,
  orderId: string,
  order: OrderRow,
): Promise<QuantityOrder> {
  const entries = await readEntries(connection, orderId);
  return {
    id: orderId,
    status: order.status,
    line: {
      sellableId: order.sellable_id,
      productName: order.product_name,
      unitPrice: order.unit_price,
      quantity: order.quantity,
      refundedQuantity: order.refunded_quantity,
    },
    entries: entries.map((entry) => ({ kind: entry.kind, amount: entry.amount })),
    balance: ledgerBalance(entries),
  };
}

function toProduct(row: ProductRow): QuantityProduct {
  return {
    id: row.id,
    sellableId: row.sellable_id,
    name: row.name,
    unitPrice: row.unit_price,
    stock: row.stock,
    usageMethod: "quantity",
  };
}
