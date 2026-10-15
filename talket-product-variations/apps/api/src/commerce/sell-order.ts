import type { QuantityOrder } from "@talket/contracts";
import type { Pool } from "mysql2/promise";
import { confirmOrder } from "./confirm-order";
import { holdOrder } from "./hold-order";
import { releaseOrder } from "./release-order";
import type { CommandResult } from "./result";

export async function sellQuantity(
  pool: Pool,
  input: { sellableId: string; quantity: number; offerId?: string },
): Promise<CommandResult<QuantityOrder>> {
  const held = await holdOrder(pool, {
    lines: [{ sellableId: input.sellableId, quantity: input.quantity, offerId: input.offerId }],
  });
  if (!held.ok) return held;
  const confirmed = await confirmOrder(pool, held.value.id);
  if (!confirmed.ok) {
    await releaseOrder(pool, held.value.id);
    return confirmed;
  }
  return confirmed;
}
