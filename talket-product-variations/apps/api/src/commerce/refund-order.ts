import { randomUUID } from "node:crypto";
import { decideQuantityRefund } from "@talket/domain";
import type { QuantityOrder } from "@talket/contracts";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { lockInventories } from "./locks";
import { lockOrder, readOrder } from "./read-order";
import { fail, succeed, type CommandResult } from "./result";
import { withTransaction } from "./tx";

const maxQuantity = 100;

type PolicyRow = RowDataPacket & {
  inventory_id: string;
  policy_key: string;
  required_quantity: number;
};

type HoldRow = RowDataPacket & { id: string; inventory_id: string };

export async function refundOrder(
  pool: Pool,
  input: { orderId: string; lineId?: string; quantity: number; idempotencyKey: string },
): Promise<CommandResult<QuantityOrder>> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > maxQuantity) {
    return fail("invalid-quantity");
  }
  if (input.idempotencyKey.trim().length === 0 || input.idempotencyKey.length > 191) {
    return fail("invalid-idempotency-key");
  }

  return withTransaction(pool, async (connection) => {
    const order = await lockOrder(connection, input.orderId);
    if (!order) return fail("order-not-found");
    if (order.status === "settled") return fail("already-settled");
    if (order.status !== "sold" && order.status !== "fulfilled" && order.status !== "refunded") {
      return fail("not-sold");
    }

    const [existing] = await connection.query<RowDataPacket[]>(
      "SELECT seq FROM ledger_entries WHERE idempotency_key = ? FOR UPDATE",
      [input.idempotencyKey],
    );
    if (existing.length > 0) return succeed(await readOrder(connection, input.orderId), true);

    const line =
      (input.lineId ? order.lines.find((item) => item.id === input.lineId) : undefined) ??
      (order.lines.length === 1 ? order.lines[0] : undefined);
    if (!line) return fail(input.lineId ? "line-not-found" : "ambiguous-line");

    const decision = decideQuantityRefund({
      unitPrice: Number(line.unit_price),
      quantity: Number(line.quantity),
      refundedQuantity: Number(line.refunded_quantity),
      requestedQuantity: input.quantity,
      fulfilled: line.fulfilled === 1,
      feeBps: Number(line.fee_bps),
    });
    if (!decision.ok) return fail(decision.reason);

    const [policies] = await connection.query<PolicyRow[]>(
      `SELECT inventory_id, policy_key, required_quantity
       FROM order_line_policies WHERE order_line_id = ? ORDER BY inventory_id`,
      [line.id],
    );
    if (decision.returnStock > 0) {
      await lockInventories(
        connection,
        policies.map((policy) => policy.inventory_id),
      );
      for (const policy of policies) {
        if (policy.policy_key === "quantity.v1") {
          const units = decision.returnStock * Number(policy.required_quantity);
          const [updated] = await connection.query<ResultSetHeader>(
            "UPDATE availability_quantity_stocks SET on_hand = on_hand + ? WHERE inventory_id = ?",
            [units, policy.inventory_id],
          );
          if (updated.affectedRows !== 1) return fail("invalid-stock");
          const [holdUpdated] = await connection.query<ResultSetHeader>(
            `UPDATE holds
             SET quantity = quantity - ?,
                 state = IF(quantity - ? = 0, 'released', state)
             WHERE order_line_id = ? AND inventory_id = ? AND state = 'committed' AND quantity >= ?`,
            [units, units, line.id, policy.inventory_id, units],
          );
          if (holdUpdated.affectedRows !== 1) return fail("refund-conflict", true);
        }
      }
      if (policies.some((policy) => policy.policy_key === "seat.v1")) {
        const [holds] = await connection.query<HoldRow[]>(
          `SELECT id, inventory_id FROM holds
           WHERE order_line_id = ? AND policy_key = 'seat.v1' AND state = 'committed'
           ORDER BY inventory_id
           LIMIT ${decision.returnStock}`,
          [line.id],
        );
        if (holds.length !== decision.returnStock) return fail("seat-taken", true);
        for (const hold of holds) {
          const [updated] = await connection.query<ResultSetHeader>(
            "UPDATE availability_seats SET state = 'free' WHERE inventory_id = ? AND state = 'sold'",
            [hold.inventory_id],
          );
          if (updated.affectedRows !== 1) return fail("seat-taken", true);
          await connection.query("UPDATE holds SET state = 'released' WHERE id = ?", [hold.id]);
        }
      }
      if (policies.some((policy) => policy.policy_key === "interval.v1")) {
        const [updated] = await connection.query<ResultSetHeader>(
          `UPDATE holds SET state = 'released'
           WHERE order_line_id = ? AND policy_key = 'interval.v1' AND state = 'committed'`,
          [line.id],
        );
        if (updated.affectedRows !== 1) return fail("overlap", true);
      }
    }

    const [updated] = await connection.query<ResultSetHeader>(
      `UPDATE order_lines SET refunded_quantity = refunded_quantity + ?
       WHERE id = ? AND refunded_quantity = ?`,
      [decision.quantity, line.id, line.refunded_quantity],
    );
    if (updated.affectedRows !== 1) return fail("refund-conflict", true);

    for (const entry of decision.lines) {
      const key = entry.kind === "refund" ? input.idempotencyKey : `fee:${input.idempotencyKey}`;
      await connection.query(
        `INSERT INTO ledger_entries (id, order_id, order_line_id, kind, amount, recipient, idempotency_key)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
        [randomUUID(), input.orderId, line.id, entry.kind, entry.amount, key],
      );
      if (entry.kind === "refund") {
        await connection.query(
          `INSERT INTO payments (id, order_id, order_line_id, kind, amount, currency, idempotency_key)
           VALUES (?, ?, ?, 'refund', ?, 'KRW', ?)`,
          [randomUUID(), input.orderId, line.id, -entry.amount, `refund-pay:${input.idempotencyKey}`],
        );
      }
    }

    const [remaining] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM order_lines
       WHERE order_id = ? AND refunded_quantity < quantity`,
      [input.orderId],
    );
    if (remaining.length === 0) {
      await connection.query("UPDATE orders SET status = 'refunded' WHERE id = ?", [input.orderId]);
    }
    return succeed(await readOrder(connection, input.orderId));
  });
}
