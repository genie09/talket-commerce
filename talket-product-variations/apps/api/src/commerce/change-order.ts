import { randomUUID } from "node:crypto";
import type { QuantityOrder } from "@talket/contracts";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { instantMillis, parseDateTime, rangesOverlap } from "./dates";
import { lockInventories } from "./locks";
import { lockOrder, readOrder } from "./read-order";
import { fail, succeed, type CommandResult } from "./result";
import { withTransaction } from "./tx";

type HoldRow = RowDataPacket & {
  id: string;
  inventory_id: string;
  policy_key: string;
  quantity: number;
  interval_start: Date | string | null;
  interval_end: Date | string | null;
  state: string;
};

type NextRow = RowDataPacket & {
  sellable_id: string;
  sellable_name: string;
  product_name: string;
  binding_mode: "all" | "choice";
  inventory_id: string;
  required_quantity: number;
  policy_key: string;
  offer_id: string;
  unit_price: number;
  currency: string;
};

export async function changeLine(
  pool: Pool,
  input: { orderId: string; lineId: string; sellableId?: string; offerId?: string; intervalEnd?: string },
): Promise<CommandResult<QuantityOrder>> {
  if (!input.sellableId && !input.intervalEnd) return fail("invalid-body");
  if (input.sellableId && input.intervalEnd) return fail("invalid-body");
  return withTransaction(pool, async (connection) => {
    const order = await lockOrder(connection, input.orderId);
    if (!order) return fail("order-not-found");
    if (order.status !== "held" && order.status !== "sold" && order.status !== "fulfilled") return fail("not-sold");
    const line = order.lines.find((item) => item.id === input.lineId);
    if (!line) return fail("line-not-found");
    if (line.fulfilled === 1 || Number(line.refunded_quantity) > 0) return fail("invalid-change");

    if (input.intervalEnd) return shortenInterval(connection, input.orderId, line.id, input.intervalEnd);
    return switchSellable(connection, order.status, input.orderId, line, input.sellableId ?? "", input.offerId);
  });
}

async function shortenInterval(
  connection: import("mysql2/promise").PoolConnection,
  orderId: string,
  lineId: string,
  intervalEnd: string,
): Promise<CommandResult<QuantityOrder>> {
  const end = parseDateTime(intervalEnd);
  if (!end) return fail("invalid-body");
  const [holds] = await connection.query<HoldRow[]>(
    `SELECT id, inventory_id, policy_key, quantity, interval_start, interval_end, state
     FROM holds WHERE order_line_id = ? AND state IN ('held', 'committed')`,
    [lineId],
  );
  const hold = holds[0];
  if (!hold || holds.length !== 1 || hold.policy_key !== "interval.v1" || !hold.interval_start || !hold.interval_end) {
    return fail("invalid-change");
  }
  const startMs = instantMillis(hold.interval_start);
  const oldEndMs = instantMillis(hold.interval_end);
  const endMs = instantMillis(end);
  if (startMs === null || oldEndMs === null || endMs === null || endMs <= startMs || endMs >= oldEndMs) {
    return fail("invalid-change");
  }
  await lockInventories(connection, [hold.inventory_id]);
  const [overlaps] = await connection.query<RowDataPacket[]>(
    `SELECT interval_start, interval_end FROM holds
     WHERE inventory_id = ? AND id <> ? AND state IN ('held', 'committed')
       AND interval_start < ? AND interval_end > ?`,
    [hold.inventory_id, hold.id, end, hold.interval_start],
  );
  if (overlaps.some((row) => rangesOverlap(hold.interval_start!, end, row.interval_start, row.interval_end))) {
    return fail("overlap", true);
  }
  await connection.query("UPDATE holds SET interval_end = ? WHERE id = ?", [end, hold.id]);
  return succeed(await readOrder(connection, orderId));
}

async function switchSellable(
  connection: import("mysql2/promise").PoolConnection,
  status: string,
  orderId: string,
  line: { id: string; sellable_id: string; offer_id: string; quantity: number; amount_due_now: number },
  sellableId: string,
  offerId: string | undefined,
): Promise<CommandResult<QuantityOrder>> {
  const [nextRows] = await connection.query<NextRow[]>(
    `SELECT s.id AS sellable_id, s.name AS sellable_name, s.binding_mode, p.name AS product_name,
            b.inventory_id, b.required_quantity, i.policy_key,
            o.id AS offer_id, o.unit_price, o.currency
     FROM sellables s
     JOIN products p ON p.id = s.product_id
     JOIN availability_bindings b ON b.sellable_id = s.id
     JOIN availability_inventories i ON i.id = b.inventory_id
     JOIN offers o ON o.sellable_id = s.id
     WHERE s.id = ?
     ORDER BY o.price_key = 'default' DESC, o.price_key, o.id`,
    [sellableId],
  );
  const chosen = nextRows.filter((row) => (offerId ? row.offer_id === offerId : true));
  const next = offerId ? chosen[0] : nextRows[0];
  if (!next || next.currency !== "KRW") return fail("offer-not-found");
  const bindings = new Set(nextRows.map((row) => row.inventory_id));
  if (next.binding_mode !== "all" || bindings.size !== 1 || next.policy_key !== "quantity.v1" || Number(next.required_quantity) !== 1) {
    return fail("invalid-change");
  }
  if (line.sellable_id === next.sellable_id && line.offer_id === next.offer_id) {
    return succeed(await readOrder(connection, orderId), true);
  }

  const [holds] = await connection.query<HoldRow[]>(
    `SELECT id, inventory_id, policy_key, quantity, interval_start, interval_end, state
     FROM holds WHERE order_line_id = ? AND state IN ('held', 'committed')`,
    [line.id],
  );
  const hold = holds[0];
  if (!hold || holds.length !== 1 || hold.policy_key !== "quantity.v1") return fail("invalid-change");

  await lockInventories(connection, [hold.inventory_id, next.inventory_id]);
  const units = Number(line.quantity);
  if (hold.inventory_id !== next.inventory_id) {
    const [returned] = await connection.query<ResultSetHeader>(
      "UPDATE availability_quantity_stocks SET on_hand = on_hand + ? WHERE inventory_id = ?",
      [units, hold.inventory_id],
    );
    if (returned.affectedRows !== 1) return fail("invalid-stock");
    const [taken] = await connection.query<ResultSetHeader>(
      "UPDATE availability_quantity_stocks SET on_hand = on_hand - ? WHERE inventory_id = ? AND on_hand >= ?",
      [units, next.inventory_id, units],
    );
    if (taken.affectedRows !== 1) return fail("insufficient-stock", true);
  }

  const amount = Number(next.unit_price) * units;
  const delta = amount - Number(line.amount_due_now);
  await connection.query(
    `UPDATE order_lines
     SET sellable_id = ?, offer_id = ?, product_name = ?, sellable_name = ?, unit_price = ?, amount_due_now = ?
     WHERE id = ?`,
    [next.sellable_id, next.offer_id, next.product_name, next.sellable_name, next.unit_price, amount, line.id],
  );
  await connection.query("DELETE FROM order_line_policies WHERE order_line_id = ?", [line.id]);
  await connection.query(
    `INSERT INTO order_line_policies (order_line_id, inventory_id, policy_key, required_quantity)
     VALUES (?, ?, 'quantity.v1', 1)`,
    [line.id, next.inventory_id],
  );
  await connection.query("UPDATE holds SET inventory_id = ?, quantity = ? WHERE id = ?", [
    next.inventory_id,
    units,
    hold.id,
  ]);
  if ((status === "sold" || status === "fulfilled") && delta !== 0) {
    await connection.query(
      `INSERT INTO ledger_entries (id, order_id, order_line_id, kind, amount, recipient, idempotency_key)
       VALUES (?, ?, ?, 'sale', ?, NULL, ?)`,
      [randomUUID(), orderId, line.id, delta, `change:${line.id}:${next.sellable_id}:${next.offer_id}`],
    );
  }
  return succeed(await readOrder(connection, orderId));
}
