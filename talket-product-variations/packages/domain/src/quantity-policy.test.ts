import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideQuantityRefund,
  ledgerBalance,
  quantityFeeBps,
  saleAmount,
} from "./quantity-policy";

test("quantity sales currently take no fee", () => {
  assert.equal(quantityFeeBps, 0);
});

test("sale amount is unit price times quantity", () => {
  assert.equal(saleAmount(10_000, 2), 20_000);
});

test("balance ignores the payable checkpoint", () => {
  assert.equal(
    ledgerBalance([
      { kind: "sale", amount: 20_000 },
      { kind: "refund", amount: -10_000 },
      { kind: "payable", amount: 10_000 },
    ]),
    10_000,
  );
});

test("unfulfilled refund returns stock at the snapshot price", () => {
  const decision = decideQuantityRefund({
    unitPrice: 10_000,
    quantity: 3,
    refundedQuantity: 1,
    requestedQuantity: 1,
    fulfilled: false,
    feeBps: 1_000,
  });

  assert.deepEqual(decision, {
    ok: true,
    quantity: 1,
    returnStock: 1,
    lines: [{ kind: "refund", amount: -10_000 }],
  });
});

test("fulfilled refund keeps the stock and records a fee", () => {
  const decision = decideQuantityRefund({
    unitPrice: 10_000,
    quantity: 1,
    refundedQuantity: 0,
    requestedQuantity: 1,
    fulfilled: true,
    feeBps: 1_000,
  });

  assert.deepEqual(decision, {
    ok: true,
    quantity: 1,
    returnStock: 0,
    lines: [
      { kind: "refund", amount: -9_000 },
      { kind: "fee", amount: -1_000 },
    ],
  });
  assert.equal(ledgerBalance([{ kind: "sale", amount: 10_000 }, ...(decision.ok ? decision.lines : [])]), 0);
});

test("refund rejects a quantity past what is still sold", () => {
  assert.deepEqual(
    decideQuantityRefund({
      unitPrice: 10_000,
      quantity: 2,
      refundedQuantity: 1,
      requestedQuantity: 2,
      fulfilled: false,
      feeBps: 0,
    }),
    { ok: false, reason: "exceeds-remaining" },
  );
});
