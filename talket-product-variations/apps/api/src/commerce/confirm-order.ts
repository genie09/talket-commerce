import { randomUUID } from "node:crypto";
import type { QuantityOrder } from "@talket/contracts";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { lockInventories } from "./locks";
import { lockOrder, readOrder } from "./read-order";
import { fail, succeed, type CommandResult } from "./result";
import { withTransaction } from "./tx";

type HoldRow = RowDataPacket & {
  inventory_id: string;
  policy_key: string;
};

export async function confirmOrder(pool: Pool, orderId: string): Promise<CommandResult<QuantityOrder>> {
  return withTransaction(pool, (connection) => confirmIn(connection, orderId));
}

async function confirmIn(connection: PoolConnection, orderId: string): Promise<CommandResult<QuantityOrder>> {
  const order = await lockOrder(connection, orderId);
  if (!order) return fail("order-not-found");
  if (order.status === "sold" || order.status === "fulfilled" || order.status === "refunded" || order.status === "settled") {
    return succeed(await readOrder(connection, orderId), true);
  }
  if (order.status !== "held") return fail("not-held");
  if (order.lines.length === 0) return fail("order-not-found");

  const [holds] = await connection.query<HoldRow[]>(
    `SELECT h.inventory_id, h.policy_key
     FROM holds h
     JOIN order_lines l ON l.id = h.order_line_id
     WHERE l.order_id = ? AND h.state = 'held'
     ORDER BY h.inventory_id`,
    [orderId],
  );
  await lockInventories(
    connection,
    holds.map((hold) => hold.inventory_id),
  );

  await connection.query(
    `UPDATE holds h
     JOIN order_lines l ON l.id = h.order_line_id
     SET h.state = 'committed'
     WHERE l.order_id = ? AND h.state = 'held'`,
    [orderId],
  );

  for (const hold of holds.filter((item) => item.policy_key === "seat.v1")) {
    const [updated] = await connection.query<ResultSetHeader>(
      "UPDATE availability_seats SET state = 'sold' WHERE inventory_id = ? AND state = 'held'",
      [hold.inventory_id],
    );
    if (updated.affectedRows !== 1) return fail("seat-taken", true);
  }

  const amount = order.lines.reduce((sum, line) => sum + Number(line.amount_due_now), 0);
  await connection.query(
    `INSERT INTO payments (id, order_id, order_line_id, kind, amount, currency, idempotency_key)
     VALUES (?, ?, NULL, 'capture', ?, 'KRW', ?)`,
    [randomUUID(), orderId, amount, `capture:${orderId}`],
  );
  for (const line of order.lines) {
    await connection.query(
      `INSERT INTO ledger_entries (id, order_id, order_line_id, kind, amount, recipient, idempotency_key)
       VALUES (?, ?, ?, 'sale', ?, NULL, ?)`,
      [randomUUID(), orderId, line.id, Number(line.amount_due_now), `sale:${line.id}`],
    );
  }
  await connection.query("UPDATE orders SET status = 'sold' WHERE id = ?", [orderId]);
  return succeed(await readOrder(connection, orderId));
}
