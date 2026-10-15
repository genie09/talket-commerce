import type { QuantityOrder } from "@talket/contracts";
import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { lockOrder, readOrder } from "./read-order";
import { fail, succeed, type CommandResult } from "./result";
import { withTransaction } from "./tx";

export async function fulfillLine(
  pool: Pool,
  input: { orderId: string; lineId: string },
): Promise<CommandResult<QuantityOrder>> {
  return withTransaction(pool, async (connection) => {
    const order = await lockOrder(connection, input.orderId);
    if (!order) return fail("order-not-found");
    if (order.status !== "sold" && order.status !== "fulfilled") return fail("not-sold");
    const line = order.lines.find((item) => item.id === input.lineId);
    if (!line) return fail("line-not-found");
    await connection.query("UPDATE order_lines SET fulfilled = 1 WHERE id = ?", [line.id]);
    const [open] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM order_lines WHERE order_id = ? AND fulfilled = 0",
      [input.orderId],
    );
    if (open.length === 0) {
      await connection.query("UPDATE orders SET status = 'fulfilled' WHERE id = ?", [input.orderId]);
    }
    return succeed(await readOrder(connection, input.orderId));
  });
}
