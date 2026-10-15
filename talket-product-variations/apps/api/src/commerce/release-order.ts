import type { QuantityOrder } from "@talket/contracts";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { lockInventories } from "./locks";
import { lockOrder, readOrder } from "./read-order";
import { fail, succeed, type CommandResult } from "./result";
import { withTransaction } from "./tx";

type HoldRow = RowDataPacket & {
  inventory_id: string;
  policy_key: string;
  quantity: number;
};

export async function releaseOrder(pool: Pool, orderId: string): Promise<CommandResult<QuantityOrder>> {
  return withTransaction(pool, async (connection) => {
    const order = await lockOrder(connection, orderId);
    if (!order) return fail("order-not-found");
    if (order.status === "draft") return succeed(await readOrder(connection, orderId), true);
    if (order.status !== "held") return fail("not-held");

    const [holds] = await connection.query<HoldRow[]>(
      `SELECT h.inventory_id, h.policy_key, h.quantity
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

    for (const hold of holds) {
      if (hold.policy_key === "quantity.v1") {
        const [updated] = await connection.query<ResultSetHeader>(
          "UPDATE availability_quantity_stocks SET on_hand = on_hand + ? WHERE inventory_id = ?",
          [Number(hold.quantity), hold.inventory_id],
        );
        if (updated.affectedRows !== 1) return fail("invalid-stock");
      }
      if (hold.policy_key === "seat.v1") {
        const [updated] = await connection.query<ResultSetHeader>(
          "UPDATE availability_seats SET state = 'free' WHERE inventory_id = ? AND state = 'held'",
          [hold.inventory_id],
        );
        if (updated.affectedRows !== 1) return fail("seat-taken", true);
      }
    }

    await connection.query(
      `UPDATE holds h
       JOIN order_lines l ON l.id = h.order_line_id
       SET h.state = 'released'
       WHERE l.order_id = ? AND h.state = 'held'`,
      [orderId],
    );
    await connection.query("UPDATE orders SET status = 'draft' WHERE id = ?", [orderId]);
    return succeed(await readOrder(connection, orderId));
  });
}
