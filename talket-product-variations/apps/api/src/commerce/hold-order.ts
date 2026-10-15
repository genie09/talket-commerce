import { randomUUID } from "node:crypto";
import { validateAnswers, type AnswerField, type AnswerInput } from "@talket/domain";
import type { HoldOrderRequest, QuantityOrder } from "@talket/contracts";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { instantMillis, parseDateTime, rangesOverlap } from "./dates";
import { lockInventories } from "./locks";
import { readOrder } from "./read-order";
import { fail, succeed, type CommandResult } from "./result";
import { withTransaction } from "./tx";

const maxQuantity = 100;

type SellableRow = RowDataPacket & {
  id: string;
  name: string;
  binding_mode: "all" | "choice";
  product_id: string;
  product_name: string;
  fee_bps: number;
};

type BindingRow = RowDataPacket & {
  inventory_id: string;
  required_quantity: number;
  policy_key: string;
};

type OfferRow = RowDataPacket & {
  id: string;
  unit_price: number;
  currency: string;
  available_from: Date | string | null;
  available_to: Date | string | null;
};

type FieldRow = RowDataPacket & AnswerField & { label: string };

type Demand = {
  inventoryId: string;
  policyKey: string;
  requiredQuantity: number;
  units: number;
  intervalStart: string | null;
  intervalEnd: string | null;
};

type ResolvedLine = {
  sellableId: string;
  offerId: string;
  productName: string;
  sellableName: string;
  unitPrice: number;
  currency: string;
  quantity: number;
  amountDueNow: number;
  feeBps: number;
  policyKey: string;
  answers: { fieldId: string; unitIndex: number; value: string; label: string; scope: "line" | "unit" }[];
  demands: Demand[];
};

export async function holdOrder(pool: Pool, input: HoldOrderRequest): Promise<CommandResult<QuantityOrder>> {
  if (!Array.isArray(input.lines) || input.lines.length === 0) return fail("invalid-body");
  return withTransaction(pool, async (connection) => {
    const resolved: ResolvedLine[] = [];
    for (const line of input.lines) {
      const result = await resolveLine(connection, line);
      if (!result.ok) return fail(result.reason, result.conflict);
      resolved.push(result.value);
    }

    const orderId = randomUUID();
    await connection.query("INSERT INTO orders (id, status) VALUES (?, 'held')", [orderId]);
    await connection.query("SELECT id FROM orders WHERE id = ? FOR UPDATE", [orderId]);

    const inventoryIds = resolved.flatMap((line) => line.demands.map((demand) => demand.inventoryId));
    const locked = await lockInventories(connection, inventoryIds);
    if (locked.length !== new Set(inventoryIds).size) return fail("invalid-subject");

    const seatIds = resolved
      .flatMap((line) => line.demands)
      .filter((demand) => demand.policyKey === "seat.v1")
      .map((demand) => demand.inventoryId);
    if (new Set(seatIds).size !== seatIds.length) return fail("invalid-subject");

    const applied = await applyDemands(connection, resolved.flatMap((line) => line.demands));
    if (!applied.ok) return applied;

    for (const line of resolved) {
      const lineId = randomUUID();
      await connection.query(
        `INSERT INTO order_lines
          (id, order_id, sellable_id, offer_id, product_name, sellable_name, policy_key, currency,
           unit_price, quantity, amount_due_now, refunded_quantity, fulfilled, fee_bps)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
        [
          lineId,
          orderId,
          line.sellableId,
          line.offerId,
          line.productName,
          line.sellableName,
          line.policyKey,
          line.currency,
          line.unitPrice,
          line.quantity,
          line.amountDueNow,
          line.feeBps,
        ],
      );
      const itemIds = new Map<number, string>();
      for (let index = 0; index < line.quantity; index += 1) {
        const itemId = randomUUID();
        itemIds.set(index, itemId);
        await connection.query("INSERT INTO order_items (id, order_line_id, unit_index) VALUES (?, ?, ?)", [
          itemId,
          lineId,
          index,
        ]);
      }
      for (const demand of line.demands) {
        await connection.query(
          `INSERT INTO order_line_policies (order_line_id, inventory_id, policy_key, required_quantity)
           VALUES (?, ?, ?, ?)`,
          [lineId, demand.inventoryId, demand.policyKey, demand.requiredQuantity],
        );
        await connection.query(
          `INSERT INTO holds
            (id, order_line_id, inventory_id, policy_key, quantity, interval_start, interval_end, state)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'held')`,
          [
            randomUUID(),
            lineId,
            demand.inventoryId,
            demand.policyKey,
            demand.units,
            demand.intervalStart,
            demand.intervalEnd,
          ],
        );
      }
      for (const answer of line.answers) {
        await connection.query(
          `INSERT INTO order_line_answers
            (id, order_line_id, order_item_id, field_id, unit_index, label, value)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            lineId,
            answer.scope === "unit" ? (itemIds.get(answer.unitIndex) ?? null) : null,
            answer.fieldId,
            answer.unitIndex,
            answer.label,
            answer.value,
          ],
        );
      }
    }

    return succeed(await readOrder(connection, orderId));
  });
}

async function resolveLine(
  connection: PoolConnection,
  line: HoldOrderRequest["lines"][number],
): Promise<CommandResult<ResolvedLine>> {
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > maxQuantity) {
    return fail("invalid-quantity");
  }
  const [sellables] = await connection.query<SellableRow[]>(
    `SELECT s.id, s.name, s.binding_mode, p.id AS product_id, p.name AS product_name, p.fee_bps
     FROM sellables s
     JOIN products p ON p.id = s.product_id
     WHERE s.id = ?`,
    [line.sellableId],
  );
  const sellable = sellables[0];
  if (!sellable) return fail("sellable-not-found");

  const [bindings] = await connection.query<BindingRow[]>(
    `SELECT b.inventory_id, b.required_quantity, i.policy_key
     FROM availability_bindings b
     JOIN availability_inventories i ON i.id = b.inventory_id
     WHERE b.sellable_id = ?
     ORDER BY b.inventory_id`,
    [line.sellableId],
  );
  if (bindings.length === 0) return fail("invalid-stock");

  const offer = await loadOffer(connection, line.sellableId, line.offerId);
  if (!offer.ok) return offer;

  const [fields] = await connection.query<FieldRow[]>(
    `SELECT id, label, required, min_length AS minLength, max_length AS maxLength, scope
     FROM input_fields WHERE product_id = ?`,
    [sellable.product_id],
  );
  const answers: AnswerInput[] = (line.answers ?? []).map((answer) => ({
    fieldId: answer.fieldId,
    unitIndex: answer.unitIndex ?? 0,
    value: answer.value,
  }));
  const answerCheck = validateAnswers(
    fields.map((field) => ({
      id: field.id,
      required: Boolean(field.required),
      minLength: Number(field.minLength),
      maxLength: Number(field.maxLength),
      scope: field.scope,
    })),
    answers,
    line.quantity,
  );
  if (!answerCheck.ok) return fail(answerCheck.reason);

  const demands = resolveDemands(sellable.binding_mode, bindings, line);
  if (!demands.ok) return demands;

  const policies = new Set(demands.value.map((demand) => demand.policyKey));
  const amountDueNow = Number(offer.value.unit_price) * line.quantity;
  if (!Number.isSafeInteger(amountDueNow)) return fail("invalid-price");

  return succeed({
      sellableId: sellable.id,
      offerId: offer.value.id,
      productName: sellable.product_name,
      sellableName: sellable.name,
      unitPrice: Number(offer.value.unit_price),
      currency: offer.value.currency,
      quantity: line.quantity,
      amountDueNow,
      feeBps: Number(sellable.fee_bps),
      policyKey: policies.size === 1 ? [...policies][0] : "mixed",
      answers: answers
        .map((answer) => {
          const field = fields.find((item) => item.id === answer.fieldId);
          return {
            ...answer,
            value: answer.value.trim(),
            label: field?.label ?? "",
            scope: field?.scope === "unit" ? ("unit" as const) : ("line" as const),
          };
        })
        .filter((answer) => answer.value.length > 0),
      demands: demands.value,
  });
}

function resolveDemands(
  mode: "all" | "choice",
  bindings: BindingRow[],
  line: HoldOrderRequest["lines"][number],
): CommandResult<Demand[]> {
  const byId = new Map(bindings.map((binding) => [binding.inventory_id, binding]));
  if (mode === "all") {
    if ((line.subjects?.length ?? 0) > 0) return fail("invalid-subject");
    if (bindings.length === 1 && bindings[0].policy_key === "interval.v1") {
      if (line.quantity !== 1) return fail("invalid-quantity");
      const start = line.intervalStart ? parseDateTime(line.intervalStart) : null;
      const end = line.intervalEnd ? parseDateTime(line.intervalEnd) : null;
      if (!start || !end || (instantMillis(end) ?? 0) <= (instantMillis(start) ?? 0)) return fail("invalid-body");
      return succeed([
          {
            inventoryId: bindings[0].inventory_id,
            policyKey: "interval.v1",
            requiredQuantity: 1,
            units: 1,
            intervalStart: start,
            intervalEnd: end,
          },
        ]);
    }
    if (bindings.some((binding) => binding.policy_key !== "quantity.v1")) return fail("invalid-subject");
    return succeed(bindings.map((binding) => ({
        inventoryId: binding.inventory_id,
        policyKey: binding.policy_key,
        requiredQuantity: Number(binding.required_quantity),
        units: line.quantity * Number(binding.required_quantity),
        intervalStart: null,
        intervalEnd: null,
      })));
  }

  const subjects = line.subjects ?? [];
  if (subjects.length === 0) return fail("invalid-subject");
  const demands: Demand[] = [];
  for (const subject of subjects) {
    const binding = byId.get(subject.inventoryId);
    if (!binding) return fail("invalid-subject");
    if (binding.policy_key === "seat.v1") {
      demands.push({
        inventoryId: binding.inventory_id,
        policyKey: "seat.v1",
        requiredQuantity: 1,
        units: 1,
        intervalStart: null,
        intervalEnd: null,
      });
      continue;
    }
    if (binding.policy_key !== "quantity.v1") return fail("invalid-subject");
    demands.push({
      inventoryId: binding.inventory_id,
      policyKey: "quantity.v1",
      requiredQuantity: Number(binding.required_quantity),
      units: line.quantity * Number(binding.required_quantity),
      intervalStart: null,
      intervalEnd: null,
    });
  }
  if (new Set(demands.map((demand) => demand.inventoryId)).size !== demands.length) return fail("invalid-subject");
  const seatCount = demands.filter((demand) => demand.policyKey === "seat.v1").length;
  if (seatCount > 0 && (seatCount !== demands.length || seatCount !== line.quantity)) return fail("invalid-subject");
  return succeed(demands);
}

async function loadOffer(
  connection: PoolConnection,
  sellableId: string,
  offerId: string | undefined,
): Promise<CommandResult<OfferRow>> {
  const [offers] = offerId
    ? await connection.query<OfferRow[]>(
        `SELECT id, unit_price, currency, available_from, available_to
         FROM offers WHERE sellable_id = ? AND id = ?`,
        [sellableId, offerId],
      )
    : await connection.query<OfferRow[]>(
        `SELECT id, unit_price, currency, available_from, available_to
         FROM offers WHERE sellable_id = ?
         ORDER BY price_key = 'default' DESC, price_key, id LIMIT 1`,
        [sellableId],
      );
  const offer = offers[0];
  if (!offer) return fail("offer-not-found");
  if (offer.currency !== "KRW") return fail("invalid-price");
  const now = Date.now();
  const opens = instantMillis(offer.available_from);
  const closes = instantMillis(offer.available_to);
  if ((opens !== null && now < opens) || (closes !== null && now >= closes)) return fail("offer-closed");
  return succeed(offer);
}

async function applyDemands(connection: PoolConnection, demands: Demand[]): Promise<CommandResult<null>> {
  const quantity = new Map<string, number>();
  const intervals: Demand[] = [];
  const seats: Demand[] = [];
  for (const demand of demands) {
    if (demand.policyKey === "quantity.v1") {
      quantity.set(demand.inventoryId, (quantity.get(demand.inventoryId) ?? 0) + demand.units);
    } else if (demand.policyKey === "seat.v1") seats.push(demand);
    else intervals.push(demand);
  }

  for (const inventoryId of [...quantity.keys()].sort()) {
    const units = quantity.get(inventoryId) ?? 0;
    const [updated] = await connection.query<ResultSetHeader>(
      "UPDATE availability_quantity_stocks SET on_hand = on_hand - ? WHERE inventory_id = ? AND on_hand >= ?",
      [units, inventoryId, units],
    );
    if (updated.affectedRows !== 1) return fail("insufficient-stock", true);
  }

  for (const seat of [...seats].sort((left, right) => left.inventoryId.localeCompare(right.inventoryId))) {
    const [updated] = await connection.query<ResultSetHeader>(
      "UPDATE availability_seats SET state = 'held' WHERE inventory_id = ? AND state = 'free'",
      [seat.inventoryId],
    );
    if (updated.affectedRows !== 1) return fail("seat-taken", true);
  }

  const accepted: Demand[] = [];
  for (const interval of [...intervals].sort((left, right) => left.inventoryId.localeCompare(right.inventoryId))) {
    if (!interval.intervalStart || !interval.intervalEnd) return fail("invalid-body");
    const clashes = accepted.some(
      (prior) =>
        prior.inventoryId === interval.inventoryId &&
        prior.intervalStart &&
        prior.intervalEnd &&
        rangesOverlap(interval.intervalStart!, interval.intervalEnd!, prior.intervalStart, prior.intervalEnd),
    );
    if (clashes) return fail("overlap", true);
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM holds
       WHERE inventory_id = ? AND state IN ('held', 'committed')
         AND interval_start < ? AND interval_end > ?`,
      [interval.inventoryId, interval.intervalEnd, interval.intervalStart],
    );
    if (rows.length > 0) return fail("overlap", true);
    accepted.push(interval);
  }
  return succeed(null);
}
