import { ledgerBalance, type LedgerKind } from "@talket/domain";
import type { OrderLineView, OrderStatus, QuantityOrder } from "@talket/contracts";
import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";

type OrderRow = RowDataPacket & { status: OrderStatus };

type LineRow = RowDataPacket & {
  id: string;
  sellable_id: string;
  product_name: string;
  sellable_name: string;
  unit_price: number;
  quantity: number;
  refunded_quantity: number;
  amount_due_now: number;
  fulfilled: number;
  policy_key: string;
  fee_bps: number;
  offer_id: string;
};

type EntryRow = RowDataPacket & {
  kind: LedgerKind;
  amount: number;
  recipient: string | null;
  order_line_id: string | null;
};

type PaymentRow = RowDataPacket & { amount: number };

export type LockedLine = LineRow;

export async function getOrder(pool: Pool, orderId: string): Promise<QuantityOrder | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM orders WHERE id = ?", [orderId]);
  if (!rows[0]) return null;
  return readOrder(pool, orderId);
}

export async function readOrder(connection: Pool | PoolConnection, orderId: string): Promise<QuantityOrder> {
  const [orders] = await connection.query<OrderRow[]>("SELECT status FROM orders WHERE id = ?", [orderId]);
  const order = orders[0];
  if (!order) throw new Error(`order ${orderId} disappeared after write`);
  const [lineRows] = await connection.query<LineRow[]>(
    `SELECT id, sellable_id, product_name, sellable_name, unit_price, quantity, refunded_quantity,
            amount_due_now, fulfilled, policy_key, fee_bps, offer_id
     FROM order_lines WHERE order_id = ? ORDER BY id`,
    [orderId],
  );
  const [entries] = await connection.query<EntryRow[]>(
    "SELECT kind, amount, recipient, order_line_id FROM ledger_entries WHERE order_id = ? ORDER BY seq",
    [orderId],
  );
  const [payments] = await connection.query<PaymentRow[]>(
    "SELECT amount FROM payments WHERE order_id = ? AND kind = 'capture' LIMIT 1",
    [orderId],
  );
  const lines = lineRows.map(toLine);
  const line = lines[0];
  if (!line) throw new Error(`order ${orderId} has no lines`);
  return {
    id: orderId,
    status: order.status,
    lines,
    line,
    entries: entries.map((entry) => ({
      kind: entry.kind,
      amount: Number(entry.amount),
      recipient: entry.recipient,
      orderLineId: entry.order_line_id,
    })),
    balance: ledgerBalance(entries.map((entry) => ({ kind: entry.kind, amount: Number(entry.amount) }))),
    paymentAmount: payments[0] ? Number(payments[0].amount) : null,
  };
}

export async function lockOrder(
  connection: PoolConnection,
  orderId: string,
): Promise<{ status: OrderStatus; lines: LockedLine[] } | null> {
  const [orders] = await connection.query<OrderRow[]>("SELECT status FROM orders WHERE id = ? FOR UPDATE", [orderId]);
  const order = orders[0];
  if (!order) return null;
  const [lines] = await connection.query<LineRow[]>(
    `SELECT id, sellable_id, product_name, sellable_name, unit_price, quantity, refunded_quantity,
            amount_due_now, fulfilled, policy_key, fee_bps, offer_id
     FROM order_lines WHERE order_id = ? ORDER BY id FOR UPDATE`,
    [orderId],
  );
  return { status: order.status, lines };
}

function toLine(row: LineRow): OrderLineView {
  return {
    id: row.id,
    sellableId: row.sellable_id,
    productName: row.product_name,
    sellableName: row.sellable_name,
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
    refundedQuantity: Number(row.refunded_quantity),
    amountDueNow: Number(row.amount_due_now),
    fulfilled: row.fulfilled === 1,
    policyKey: row.policy_key,
  };
}
