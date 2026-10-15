import { randomUUID } from "node:crypto";
import { ledgerBalance, type LedgerKind } from "@talket/domain";
import type { QuantityOrder } from "@talket/contracts";
import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { lockOrder, readOrder } from "./read-order";
import { fail, succeed, type CommandResult } from "./result";
import { withTransaction } from "./tx";

type EntryRow = RowDataPacket & { order_line_id: string | null; kind: LedgerKind; amount: number };

export async function settleOrder(pool: Pool, orderId: string): Promise<CommandResult<QuantityOrder>> {
  return withTransaction(pool, async (connection) => {
    const order = await lockOrder(connection, orderId);
    if (!order) return fail("order-not-found");
    if (order.status === "settled") return succeed(await readOrder(connection, orderId), true);
    if (order.status !== "sold" && order.status !== "fulfilled" && order.status !== "refunded") {
      return fail("not-sold");
    }

    const [entries] = await connection.query<EntryRow[]>(
      "SELECT order_line_id, kind, amount FROM ledger_entries WHERE order_id = ? ORDER BY seq",
      [orderId],
    );
    for (const line of order.lines) {
      const key = `settle:${line.id}`;
      const [existing] = await connection.query<RowDataPacket[]>(
        "SELECT seq FROM ledger_entries WHERE idempotency_key = ? FOR UPDATE",
        [key],
      );
      if (existing.length > 0) continue;
      const amount = ledgerBalance(
        entries
          .filter((entry) => entry.order_line_id === line.id)
          .map((entry) => ({ kind: entry.kind, amount: Number(entry.amount) })),
      );
      await connection.query(
        `INSERT INTO ledger_entries
          (id, order_id, order_line_id, kind, amount, recipient, idempotency_key)
         VALUES (?, ?, ?, 'payable', ?, 'platform', ?)`,
        [randomUUID(), orderId, line.id, amount, key],
      );
    }
    await connection.query("UPDATE orders SET status = 'settled' WHERE id = ?", [orderId]);
    return succeed(await readOrder(connection, orderId));
  });
}
