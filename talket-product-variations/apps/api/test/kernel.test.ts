import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { changeLine } from "../src/commerce/change-order";
import { confirmOrder } from "../src/commerce/confirm-order";
import { createProduct } from "../src/commerce/create-product";
import { fulfillLine } from "../src/commerce/fulfill-order";
import { holdOrder } from "../src/commerce/hold-order";
import { refundOrder } from "../src/commerce/refund-order";
import { settleOrder } from "../src/commerce/settle-order";
import { createDatabasePool } from "../src/database/database.service";
import { ensureSchema, truncateCommerce } from "../src/database/schema";
import { loadEnv } from "../src/load-env";
import type { CommandResult } from "../src/commerce/result";

loadEnv();
const pool: Pool = createDatabasePool();

before(async () => {
  await ensureSchema(pool);
});

after(async () => {
  await pool.end();
});

function unwrap<T>(result: CommandResult<T>): T {
  if (!result.ok) {
    assert.fail(result.reason);
  }
  return result.value;
}

test("confirm records payment without taking stock a second time", async () => {
  await truncateCommerce(pool);
  const product = unwrap(await createProduct(pool, { name: "컵", unitPrice: 3_000, stock: 4 }));
  const held = unwrap(await holdOrder(pool, { lines: [{ sellableId: product.sellableId, quantity: 1 }] }));
  assert.equal(held.status, "held");
  assert.equal(held.paymentAmount, null);
  assert.equal((await reload(product.id)).stock, 3);

  const sold = unwrap(await confirmOrder(pool, held.id));
  assert.equal(sold.status, "sold");
  assert.equal(sold.paymentAmount, 3_000);
  assert.equal(sold.entries[0]?.amount, 3_000);
  assert.equal((await reload(product.id)).stock, 3);

  const replay = await confirmOrder(pool, held.id);
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.replay, true);
  assert.equal((await reload(product.id)).stock, 3);
});

test("size variants can share one stock or keep their own", async () => {
  await truncateCommerce(pool);
  const shared = unwrap(
    await createProduct(pool, {
      name: "공유 티셔츠",
      axes: [{ label: "사이즈", values: ["S", "M"] }],
      sharedInventories: [{ key: "pool", onHand: 1 }],
      sellables: [
        { name: "S", optionLabels: [{ axis: "사이즈", value: "S" }], sharedInventoryKey: "pool", unitPrice: 1_000 },
        { name: "M", optionLabels: [{ axis: "사이즈", value: "M" }], sharedInventoryKey: "pool", unitPrice: 1_000 },
      ],
    }),
  );
  assert.equal(shared.sellables.length, 2);
  const first = unwrap(await holdOrder(pool, { lines: [{ sellableId: shared.sellables[0].id, quantity: 1 }] }));
  const second = await holdOrder(pool, { lines: [{ sellableId: shared.sellables[1].id, quantity: 1 }] });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, "insufficient-stock");
  assert.equal(first.lines[0]?.policyKey, "quantity.v1");

  const split = unwrap(
    await createProduct(pool, {
      name: "린넨 토트",
      unitPrice: 32_000,
      stock: 8,
      axes: [
        { label: "색", values: ["블랙", "내추럴"] },
        { label: "사이즈", values: ["S", "M"] },
      ],
    }),
  );
  assert.equal(split.sellables.length, 4);
  assert.deepEqual(
    split.sellables.map((sellable) => sellable.stock),
    [8, 8, 8, 8],
  );
  unwrap(await holdOrder(pool, { lines: [{ sellableId: split.sellables[0].id, quantity: 1 }] }));
  const [listed] = await pool.query<RowDataPacket[]>("SELECT on_hand FROM availability_quantity_stocks WHERE inventory_id = ?", [
    split.sellables[0].inventories[0]?.id,
  ]);
  assert.equal(Number(listed[0]?.on_hand), 7);
});

test("one sellable can require several stocks", async () => {
  await truncateCommerce(pool);
  const product = unwrap(
    await createProduct(pool, {
      name: "세트",
      sellables: [
        {
          name: "세트",
          unitPrice: 5_000,
          inventories: [
            { policyKey: "quantity.v1", onHand: 10, requiredQuantity: 1, label: "컵" },
            { policyKey: "quantity.v1", onHand: 4, requiredQuantity: 2, label: "접시" },
          ],
        },
      ],
    }),
  );
  const blocked = await holdOrder(pool, { lines: [{ sellableId: product.sellableId, quantity: 3 }] });
  assert.equal(blocked.ok, false);
  const held = unwrap(await holdOrder(pool, { lines: [{ sellableId: product.sellableId, quantity: 2 }] }));
  assert.equal(held.lines.length, 1);
  const stocks = await pool.query<RowDataPacket[]>(
    "SELECT on_hand FROM availability_quantity_stocks ORDER BY on_hand",
  );
  assert.deepEqual(
    stocks[0].map((row) => Number(row.on_hand)),
    [0, 8],
  );
});

test("direct input is stored on the line and is not a stock key", async () => {
  await truncateCommerce(pool);
  const product = unwrap(
    await createProduct(pool, {
      name: "유니폼",
      unitPrice: 2_000,
      stock: 2,
      inputs: [
        { label: "등번호", required: true, minLength: 1, maxLength: 4, scope: "unit" },
        { label: "각인", required: false, minLength: 0, maxLength: 20, scope: "line" },
      ],
    }),
  );
  const missing = await holdOrder(pool, {
    lines: [{ sellableId: product.sellableId, quantity: 1, answers: [] }],
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "missing-answer");
  assert.equal((await reload(product.id)).stock, 2);

  const field = product.inputs.find((input) => input.label === "등번호");
  const engraving = product.inputs.find((input) => input.label === "각인");
  assert.ok(field && engraving);
  unwrap(
    await holdOrder(pool, {
      lines: [
        {
          sellableId: product.sellableId,
          quantity: 1,
          answers: [
            { fieldId: field.id, unitIndex: 0, value: "7" },
            { fieldId: engraving.id, value: "안녕" },
          ],
        },
      ],
    }),
  );
  unwrap(
    await holdOrder(pool, {
      lines: [
        {
          sellableId: product.sellableId,
          quantity: 1,
          answers: [{ fieldId: field.id, unitIndex: 0, value: "11" }],
        },
      ],
    }),
  );
  assert.equal((await reload(product.id)).stock, 0);
  const [answers] = await pool.query<RowDataPacket[]>(
    "SELECT value, order_item_id FROM order_line_answers ORDER BY value",
  );
  assert.deepEqual(
    answers.map((row) => row.value),
    ["11", "7", "안녕"],
  );
  assert.equal(
    answers.filter((row) => row.value === "안녕")[0]?.order_item_id,
    null,
  );
  assert.ok(answers.filter((row) => row.value === "7")[0]?.order_item_id);
});

test("adult and youth prices share one pool across two lines", async () => {
  await truncateCommerce(pool);
  const product = unwrap(
    await createProduct(pool, {
      name: "스탠딩",
      unitPrice: 10_000,
      stock: 5,
      priceRows: [
        { priceKey: "adult", unitPrice: 10_000 },
        { priceKey: "youth", unitPrice: 7_000 },
      ],
    }),
  );
  const adult = product.sellables[0]?.offers.find((offer) => offer.priceKey === "adult");
  const youth = product.sellables[0]?.offers.find((offer) => offer.priceKey === "youth");
  assert.ok(adult && youth);
  const held = unwrap(
    await holdOrder(pool, {
      lines: [
        { sellableId: product.sellableId, offerId: adult.id, quantity: 2 },
        { sellableId: product.sellableId, offerId: youth.id, quantity: 1 },
      ],
    }),
  );
  assert.equal((await reload(product.id)).stock, 2);
  const sold = unwrap(await confirmOrder(pool, held.id));
  assert.equal(sold.paymentAmount, 27_000);
  assert.deepEqual(
    sold.entries.map((entry) => entry.amount).sort((left, right) => left - right),
    [7_000, 20_000],
  );
  const youthLine = sold.lines.find((line) => line.unitPrice === 7_000);
  assert.ok(youthLine);
  const refunded = unwrap(
    await refundOrder(pool, { orderId: sold.id, lineId: youthLine.id, quantity: 1, idempotencyKey: "youth" }),
  );
  assert.equal(refunded.lines.find((line) => line.unitPrice === 10_000)?.refundedQuantity, 0);
  assert.equal(refunded.lines.find((line) => line.unitPrice === 7_000)?.refundedQuantity, 1);
  assert.equal((await reload(product.id)).stock, 3);
  const settled = unwrap(await settleOrder(pool, sold.id));
  const payables = settled.entries.filter((entry) => entry.kind === "payable");
  assert.equal(payables.length, 2);
  assert.ok(payables.every((entry) => entry.recipient === "platform"));
});

test("a closed offer does not take stock", async () => {
  await truncateCommerce(pool);
  const product = unwrap(
    await createProduct(pool, {
      name: "지난 가격",
      sellables: [
        {
          name: "지난 가격",
          stock: 3,
          offers: [{ priceKey: "default", unitPrice: 1_000, availableTo: "2000-01-01 00:00:00" }],
        },
      ],
    }),
  );
  const held = await holdOrder(pool, { lines: [{ sellableId: product.sellableId, quantity: 1 }] });
  assert.equal(held.ok, false);
  if (!held.ok) assert.equal(held.reason, "offer-closed");
  const [stocks] = await pool.query<RowDataPacket[]>("SELECT on_hand FROM availability_quantity_stocks");
  assert.equal(Number(stocks[0]?.on_hand), 3);
});

test("eight buyers of one seat produce one hold", async () => {
  await truncateCommerce(pool);
  const product = unwrap(
    await createProduct(pool, {
      name: "봄 콘서트",
      sessions: [
        {
          label: "10월 3일",
          startsAt: "2026-10-03 19:00",
          grades: [{ label: "VIP", unitPrice: 99_000, seats: [{ label: "A1" }, { label: "A2" }] }],
        },
      ],
    }),
  );
  const seat = product.sellables[0]?.inventories[0];
  assert.ok(seat);
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      holdOrder(pool, {
        lines: [{ sellableId: product.sellableId, quantity: 1, subjects: [{ inventoryId: seat.id }] }],
      }),
    ),
  );
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.ok(results.filter((result) => !result.ok).every((result) => result.conflict && result.reason === "seat-taken"));
  const [states] = await pool.query<RowDataPacket[]>("SELECT state FROM availability_seats WHERE inventory_id = ?", [seat.id]);
  assert.equal(states[0]?.state, "held");
});

test("overlapping stays are rejected and a shorter stay replaces the range", async () => {
  await truncateCommerce(pool);
  const product = unwrap(
    await createProduct(pool, {
      name: "독채",
      sellables: [{ name: "독채", unitPrice: 180_000, inventories: [{ policyKey: "interval.v1", label: "독채" }] }],
    }),
  );
  const first = unwrap(
    await holdOrder(pool, {
      lines: [{ sellableId: product.sellableId, quantity: 1, intervalStart: "2026-10-01", intervalEnd: "2026-10-04" }],
    }),
  );
  const overlap = await holdOrder(pool, {
    lines: [{ sellableId: product.sellableId, quantity: 1, intervalStart: "2026-10-03", intervalEnd: "2026-10-05" }],
  });
  assert.equal(overlap.ok, false);
  if (!overlap.ok) assert.equal(overlap.reason, "overlap");
  const later = unwrap(
    await holdOrder(pool, {
      lines: [{ sellableId: product.sellableId, quantity: 1, intervalStart: "2026-10-04", intervalEnd: "2026-10-06" }],
    }),
  );
  assert.equal(later.status, "held");
  const shortened = unwrap(
    await changeLine(pool, { orderId: first.id, lineId: first.line.id, intervalEnd: "2026-10-03" }),
  );
  assert.equal(shortened.line.id, first.line.id);
  const [ranges] = await pool.query<RowDataPacket[]>(
    "SELECT DATE_FORMAT(interval_end, '%Y-%m-%d') AS end_on FROM holds WHERE order_line_id = ?",
    [first.line.id],
  );
  assert.equal(ranges[0]?.end_on, "2026-10-03");
});

test("a slot is a quantity subject", async () => {
  await truncateCommerce(pool);
  const product = unwrap(
    await createProduct(pool, {
      name: "오므라이스",
      sellables: [
        {
          name: "오므라이스",
          unitPrice: 28_000,
          inventories: [
            {
              policyKey: "quantity.v1",
              onHand: 1,
              slot: { label: "11:30", startsAt: "2026-10-02 11:30", endsAt: "2026-10-02 12:00" },
            },
            {
              policyKey: "quantity.v1",
              onHand: 4,
              slot: { label: "12:00", startsAt: "2026-10-02 12:00", endsAt: "2026-10-02 12:30" },
            },
          ],
        },
      ],
    }),
  );
  const slot = product.sellables[0]?.inventories.find((inventory) => inventory.label === "11:30");
  const other = product.sellables[0]?.inventories.find((inventory) => inventory.label === "12:00");
  assert.ok(slot && other);
  unwrap(
    await holdOrder(pool, {
      lines: [{ sellableId: product.sellableId, quantity: 1, subjects: [{ inventoryId: slot.id }] }],
    }),
  );
  const again = await holdOrder(pool, {
    lines: [{ sellableId: product.sellableId, quantity: 1, subjects: [{ inventoryId: slot.id }] }],
  });
  assert.equal(again.ok, false);
  const [hands] = await pool.query<RowDataPacket[]>(
    "SELECT on_hand FROM availability_quantity_stocks WHERE inventory_id = ?",
    [other.id],
  );
  assert.equal(Number(hands[0]?.on_hand), 4);
});

test("shipping refund returns stock only before fulfillment", async () => {
  await truncateCommerce(pool);
  const product = unwrap(
    await createProduct(pool, {
      name: "포스터",
      unitPrice: 18_000,
      stock: 5,
      feeBps: 1_000,
      fulfillment: "shipping",
      inputs: [{ label: "주소", required: true, minLength: 1, maxLength: 100, scope: "line" }],
    }),
  );
  const address = product.inputs[0];
  assert.ok(address);
  const sold = unwrap(
    await confirmOrder(
      pool,
      unwrap(
        await holdOrder(pool, {
          lines: [
            {
              sellableId: product.sellableId,
              quantity: 1,
              answers: [{ fieldId: address.id, value: "서울" }],
            },
          ],
        }),
      ).id,
    ),
  );
  const fulfilled = unwrap(await fulfillLine(pool, { orderId: sold.id, lineId: sold.line.id }));
  assert.equal(fulfilled.status, "fulfilled");
  const refunded = unwrap(
    await refundOrder(pool, { orderId: sold.id, quantity: 1, idempotencyKey: "shipped" }),
  );
  assert.equal(
    refunded.entries.find((entry) => entry.kind === "fee")?.amount,
    -1_800,
  );
  const [afterUse] = await pool.query<RowDataPacket[]>("SELECT on_hand FROM availability_quantity_stocks");
  assert.equal(Number(afterUse[0]?.on_hand), 4);

  const open = unwrap(
    await confirmOrder(
      pool,
      unwrap(
        await holdOrder(pool, {
          lines: [
            {
              sellableId: product.sellableId,
              quantity: 1,
              answers: [{ fieldId: address.id, value: "부산" }],
            },
          ],
        }),
      ).id,
    ),
  );
  unwrap(await refundOrder(pool, { orderId: open.id, quantity: 1, idempotencyKey: "open" }));
  const [beforeShip] = await pool.query<RowDataPacket[]>("SELECT on_hand FROM availability_quantity_stocks");
  assert.equal(Number(beforeShip[0]?.on_hand), 4);
});

test("changing sellable moves stock and records the price difference", async () => {
  await truncateCommerce(pool);
  const mug = unwrap(await createProduct(pool, { name: "머그", unitPrice: 10_000, stock: 5 }));
  const cup = unwrap(await createProduct(pool, { name: "컵", unitPrice: 8_000, stock: 5 }));
  const sold = unwrap(await confirmOrder(pool, unwrap(await holdOrder(pool, { lines: [{ sellableId: mug.sellableId, quantity: 1 }] })).id));
  const changed = unwrap(
    await changeLine(pool, { orderId: sold.id, lineId: sold.line.id, sellableId: cup.sellableId }),
  );
  assert.equal(changed.line.unitPrice, 8_000);
  assert.equal(changed.balance, 8_000);
  assert.equal((await reload(mug.id)).stock, 5);
  assert.equal((await reload(cup.id)).stock, 4);
});

async function reload(productId: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT q.on_hand
     FROM availability_quantity_stocks q
     JOIN availability_bindings b ON b.inventory_id = q.inventory_id
     JOIN sellables s ON s.id = b.sellable_id
     WHERE s.product_id = ?
     ORDER BY q.inventory_id
     LIMIT 1`,
    [productId],
  );
  return { stock: Number(rows[0]?.on_hand ?? 0) };
}
