export const quantityFeeBps = 0;

export type LedgerKind = "sale" | "fee" | "refund" | "payable";

export type LedgerLine = {
  kind: "sale" | "fee" | "refund";
  amount: number;
};

export type PolicyFailure = {
  ok: false;
  reason: "invalid-quantity" | "invalid-money" | "exceeds-remaining" | "nothing-remaining";
};

export type RefundDecision = {
  ok: true;
  quantity: number;
  returnStock: number;
  lines: LedgerLine[];
};

export function saleAmount(unitPrice: number, quantity: number): number {
  return unitPrice * quantity;
}

export function ledgerBalance(entries: { kind: LedgerKind; amount: number }[]): number {
  return entries
    .filter((entry) => entry.kind !== "payable")
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function decideQuantityRefund(input: {
  unitPrice: number;
  quantity: number;
  refundedQuantity: number;
  requestedQuantity: number;
  fulfilled: boolean;
  feeBps: number;
}): RefundDecision | PolicyFailure {
  if (!Number.isSafeInteger(input.requestedQuantity) || input.requestedQuantity < 1) {
    return { ok: false, reason: "invalid-quantity" };
  }
  if (!Number.isSafeInteger(input.unitPrice) || input.unitPrice < 0 || !Number.isSafeInteger(input.feeBps)) {
    return { ok: false, reason: "invalid-money" };
  }

  const remaining = input.quantity - input.refundedQuantity;
  if (remaining < 1) return { ok: false, reason: "nothing-remaining" };
  if (input.requestedQuantity > remaining) return { ok: false, reason: "exceeds-remaining" };

  const gross = input.unitPrice * input.requestedQuantity;
  const fee = input.fulfilled ? Math.floor((gross * input.feeBps) / 10_000) : 0;
  const lines: LedgerLine[] = [{ kind: "refund", amount: -(gross - fee) }];
  if (fee > 0) lines.push({ kind: "fee", amount: -fee });

  return {
    ok: true,
    quantity: input.requestedQuantity,
    returnStock: input.fulfilled ? 0 : input.requestedQuantity,
    lines,
  };
}
