import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Pool } from "mysql2/promise";
import { createDatabasePool } from "../src/database/database.service";
import { ensureSchema, truncateCommerce } from "../src/database/schema";
import { loadEnv } from "../src/load-env";
import {
  adjustQuantityStock,
  createQuantityProduct,
  getQuantityOrder,
  listQuantityProducts,
  refundQuantity,
  sellQuantity,
  settleQuantity,
  updateQuantityProduct,
} from "../src/quantity/quantity.commands";

loadEnv();
const pool: Pool = createDatabasePool();

before(async () => {
  await ensureSchema(pool);
});

after(async () => {
  await pool.end();
});

test("a price change does not change the refund of an earlier sale", async () => {
  await truncateCommerce(pool);
  const created = await createQuantityProduct(pool, { name: "머그컵", unitPrice: 10_000, stock: 5 });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const sold = await sellQuantity(pool, { sellableId: created.value.sellableId, quantity: 2 });
  assert.equal(sold.ok, true);
  if (!sold.ok) return;
  assert.equal(sold.value.entries[0]?.amount, 20_000);
  assert.equal(sold.value.line.unitPrice, 10_000);

  const updated = await updateQuantityProduct(pool, { productId: created.value.id, unitPrice: 8_000 });
  assert.equal(updated.ok, true);

  const refunded = await refundQuantity(pool, {
    orderId: sold.value.id,
    quantity: 1,
    idempotencyKey: "refund-once",
  });
  assert.equal(refunded.ok, true);
  if (!refunded.ok) return;
  assert.equal(refunded.value.line.unitPrice, 10_000);
  assert.deepEqual(
    refunded.value.entries.map((entry) => entry.amount),
    [20_000, -10_000],
  );
  assert.equal(refunded.value.balance, 10_000);

  const replay = await refundQuantity(pool, {
    orderId: sold.value.id,
    quantity: 1,
    idempotencyKey: "refund-once",
  });
  assert.equal(replay.ok, true);
  if (!replay.ok) return;
  assert.equal(replay.replay, true);
  assert.equal(replay.value.entries.filter((entry) => entry.kind === "refund").length, 1);

  const products = await listQuantityProducts(pool);
  assert.equal(products[0]?.stock, 4);
  assert.equal(products[0]?.unitPrice, 8_000);

  const settled = await settleQuantity(pool, { orderId: sold.value.id });
  assert.equal(settled.ok, true);
  if (!settled.ok) return;
  assert.equal(settled.value.entries.find((entry) => entry.kind === "payable")?.amount, 10_000);

  const afterSettle = await refundQuantity(pool, {
    orderId: sold.value.id,
    quantity: 1,
    idempotencyKey: "refund-after-settle",
  });
  assert.deepEqual(afterSettle, { ok: false, reason: "already-settled", conflict: false });
});

test("eight buyers of the last item produce one sale", async () => {
  await truncateCommerce(pool);
  const created = await createQuantityProduct(pool, { name: "마지막 티켓", unitPrice: 5_000, stock: 1 });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const results = await Promise.all(
    Array.from({ length: 8 }, () => sellQuantity(pool, { sellableId: created.value.sellableId, quantity: 1 })),
  );
  const wins = results.filter((result) => result.ok);
  const losses = results.filter((result) => !result.ok);
  assert.equal(wins.length, 1);
  assert.equal(losses.length, 7);
  assert.ok(losses.every((result) => result.conflict && result.reason === "insufficient-stock"));

  const products = await listQuantityProducts(pool);
  assert.equal(products[0]?.stock, 0);
});

test("two full refunds of the same line record one ledger entry", async () => {
  await truncateCommerce(pool);
  const created = await createQuantityProduct(pool, { name: "포스터", unitPrice: 4_000, stock: 4 });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const sold = await sellQuantity(pool, { sellableId: created.value.sellableId, quantity: 2 });
  assert.equal(sold.ok, true);
  if (!sold.ok) return;

  const results = await Promise.all([
    refundQuantity(pool, { orderId: sold.value.id, quantity: 2, idempotencyKey: "a" }),
    refundQuantity(pool, { orderId: sold.value.id, quantity: 2, idempotencyKey: "b" }),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  const loser = results.find((result) => !result.ok);
  assert.ok(loser);
  if (!loser || loser.ok) return;
  assert.equal(loser.reason, "nothing-remaining");
  assert.equal(loser.conflict, false);

  const stored = await getQuantityOrder(pool, sold.value.id);
  assert.equal(stored?.entries.filter((entry) => entry.kind === "refund").length, 1);

  const products = await listQuantityProducts(pool);
  assert.equal(products[0]?.stock, 4);

  const blocked = await adjustQuantityStock(pool, { productId: created.value.id, delta: -100 });
  assert.equal(blocked.ok, false);
});