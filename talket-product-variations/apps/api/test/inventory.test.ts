import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { confirmOrder } from "../src/commerce/confirm-order";
import { createProduct } from "../src/commerce/create-product";
import { fulfillLine } from "../src/commerce/fulfill-order";
import { holdOrder } from "../src/commerce/hold-order";
import { refundOrder } from "../src/commerce/refund-order";
import { releaseOrder } from "../src/commerce/release-order";
import type { CommandResult } from "../src/commerce/result";
import { createDatabasePool } from "../src/database/database.service";
import { ensureSchema, truncateCommerce } from "../src/database/schema";
import { loadEnv } from "../src/load-env";

loadEnv();
const pool: Pool = createDatabasePool();

before(async () => {
  await ensureSchema(pool);
});

after(async () => {
  await pool.end();
});

function unwrap<T>(result: CommandResult<T>): T {
  if (!result.ok) assert.fail(result.reason);
  return result.value;
}

test("eight overlapping stays leave one hold", async () => {
  await truncateCommerce(pool);
  const product = unwrap(
    await createProduct(pool, {
      name: "독채",
      sellables: [{ name: "독채", unitPrice: 180_000, inventories: [{ policyKey: "interval.v1", label: "독채" }] }],
    }),
  );
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      holdOrder(pool, {
        lines: [{ sellableId: product.sellableId, quantity: 1, intervalStart: "2026-10-01", intervalEnd: "2026-10-04" }],
      }),
    ),
  );
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.ok(results.filter((result) => !result.ok).every((result) => result.conflict && result.reason === "overlap"));
  const [holds] = await pool.query<RowDataPacket[]>(
    "SELECT state FROM holds WHERE state IN ('held', 'committed')",
  );
  assert.equal(holds.length, 1);
});

test("a rejected line rolls back every inventory taken in that order", async () => {
  await truncateCommerce(pool);
  const goods = unwrap(await createProduct(pool, { name: "응원봉", unitPrice: 35_000, stock: 1 }));
  const concert = unwrap(
    await createProduct(pool, {
      name: "콘서트",
      sessions: [{ label: "10월 3일", startsAt: "2026-10-03 19:00", grades: [{ label: "R", unitPrice: 77_000, seats: [{ label: "A1" }] }] }],
    }),
  );
  const seat = concert.sellables[0]?.inventories[0];
  assert.ok(seat);
  unwrap(await holdOrder(pool, { lines: [{ sellableId: concert.sellableId, quantity: 1, subjects: [{ inventoryId: seat.id }] }] }));

  const rejected = await holdOrder(pool, {
    lines: [
      { sellableId: goods.sellableId, quantity: 1 },
      { sellableId: concert.sellableId, quantity: 1, subjects: [{ inventoryId: seat.id }] },
    ],
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.reason, "seat-taken");

  const [stock] = await pool.query<RowDataPacket[]>("SELECT on_hand FROM availability_quantity_stocks");
  assert.equal(Number(stock[0]?.on_hand), 1);
  const [holds] = await pool.query<RowDataPacket[]>("SELECT state FROM holds");
  assert.deepEqual(holds.map((row) => row.state), ["held"]);
});

test("unused occupancy comes back and fulfilled occupancy stays taken", async () => {
  await truncateCommerce(pool);
  const concert = unwrap(
    await createProduct(pool, {
      name: "콘서트",
      sessions: [{
        label: "10월 3일",
        startsAt: "2026-10-03 19:00",
        grades: [{ label: "R", unitPrice: 77_000, seats: [{ label: "A1" }, { label: "A2" }] }],
      }],
    }),
  );
  const room = unwrap(
    await createProduct(pool, {
      name: "독채",
      sellables: [{ name: "독채", unitPrice: 180_000, inventories: [{ policyKey: "interval.v1", label: "독채" }] }],
    }),
  );
  const releasedSeat = concert.sellables[0]?.inventories.find((inventory) => inventory.label === "A1");
  const usedSeat = concert.sellables[0]?.inventories.find((inventory) => inventory.label === "A2");
  assert.ok(releasedSeat && usedSeat);

  const heldSeat = unwrap(
    await holdOrder(pool, { lines: [{ sellableId: concert.sellableId, quantity: 1, subjects: [{ inventoryId: releasedSeat.id }] }] }),
  );
  unwrap(await releaseOrder(pool, heldSeat.id));
  const refundableSeat = unwrap(
    await confirmOrder(
      pool,
      unwrap(await holdOrder(pool, { lines: [{ sellableId: concert.sellableId, quantity: 1, subjects: [{ inventoryId: releasedSeat.id }] }] })).id,
    ),
  );
  unwrap(await refundOrder(pool, { orderId: refundableSeat.id, quantity: 1, idempotencyKey: "unused-seat" }));
  const [released] = await pool.query<RowDataPacket[]>(
    "SELECT state FROM availability_seats WHERE inventory_id = ?",
    [releasedSeat.id],
  );
  assert.equal(released[0]?.state, "free");

  const stay = { sellableId: room.sellableId, quantity: 1, intervalStart: "2026-10-01", intervalEnd: "2026-10-04" };
  const heldStay = unwrap(await holdOrder(pool, { lines: [stay] }));
  unwrap(await releaseOrder(pool, heldStay.id));
  assert.equal((await holdOrder(pool, { lines: [stay] })).ok, true);

  const soldSeat = unwrap(
    await confirmOrder(
      pool,
      unwrap(await holdOrder(pool, { lines: [{ sellableId: concert.sellableId, quantity: 1, subjects: [{ inventoryId: usedSeat.id }] }] })).id,
    ),
  );
  unwrap(await fulfillLine(pool, { orderId: soldSeat.id, lineId: soldSeat.line.id }));
  unwrap(await refundOrder(pool, { orderId: soldSeat.id, quantity: 1, idempotencyKey: "used-seat" }));
  const [used] = await pool.query<RowDataPacket[]>(
    "SELECT state FROM availability_seats WHERE inventory_id = ?",
    [usedSeat.id],
  );
  assert.equal(used[0]?.state, "sold");

  const soldStay = unwrap(await confirmOrder(pool, unwrap(await holdOrder(pool, {
    lines: [{ sellableId: room.sellableId, quantity: 1, intervalStart: "2026-11-01", intervalEnd: "2026-11-04" }],
  })).id));
  unwrap(await fulfillLine(pool, { orderId: soldStay.id, lineId: soldStay.line.id }));
  unwrap(await refundOrder(pool, { orderId: soldStay.id, quantity: 1, idempotencyKey: "used-stay" }));
  const again = await holdOrder(pool, {
    lines: [{ sellableId: room.sellableId, quantity: 1, intervalStart: "2026-11-02", intervalEnd: "2026-11-03" }],
  });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.reason, "overlap");
});
