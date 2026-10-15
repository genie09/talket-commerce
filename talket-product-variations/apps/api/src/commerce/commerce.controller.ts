import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import type { HoldOrderRequest, QuantityOrder, QuantityProduct } from "@talket/contracts";
import { DatabaseService } from "../database/database.service";
import { changeLine } from "./change-order";
import { confirmOrder } from "./confirm-order";
import { createProduct, type CreateProductInput } from "./create-product";
import { fulfillLine } from "./fulfill-order";
import { holdOrder } from "./hold-order";
import { adjustStock, listQuantityProducts, updateProduct } from "./product-edits";
import { getOrder } from "./read-order";
import { refundOrder } from "./refund-order";
import { releaseOrder } from "./release-order";
import type { CommandResult } from "./result";
import { sellQuantity } from "./sell-order";
import { settleOrder } from "./settle-order";

@Controller()
export class CommerceController {
  constructor(private readonly database: DatabaseService) {}

  @Get("products")
  async list(): Promise<{ ok: true; products: QuantityProduct[] }> {
    return { ok: true, products: await listQuantityProducts(this.database.pool) };
  }

  @Post("products")
  async create(@Body() body: unknown): Promise<{ ok: true; replay: boolean; product: QuantityProduct }> {
    const record = objectBody(body);
    if (!record || typeof record.name !== "string") invalidBody();
    return unwrap(await createProduct(this.database.pool, record as CreateProductInput), "product");
  }

  @Patch("products/:productId")
  async update(
    @Param("productId") productId: string,
    @Body() body: unknown,
  ): Promise<{ ok: true; replay: boolean; product: QuantityProduct }> {
    const record = objectBody(body);
    if (!record) invalidBody();
    const name = readOptionalString(record, "name");
    const unitPrice = readOptionalNumber(record, "unitPrice");
    if (name === "invalid" || unitPrice === "invalid") invalidBody();
    return unwrap(
      await updateProduct(this.database.pool, {
        productId,
        ...(name === undefined ? {} : { name }),
        ...(unitPrice === undefined ? {} : { unitPrice }),
      }),
      "product",
    );
  }

  @Post("products/:productId/stock")
  async adjust(
    @Param("productId") productId: string,
    @Body() body: unknown,
  ): Promise<{ ok: true; replay: boolean; product: QuantityProduct }> {
    const record = objectBody(body);
    const delta = record ? readNumber(record, "delta") : null;
    if (!record || delta === null) invalidBody();
    return unwrap(await adjustStock(this.database.pool, { productId, delta }), "product");
  }

  @Post("orders/hold")
  async hold(@Body() body: unknown): Promise<{ ok: true; replay: boolean; order: QuantityOrder }> {
    const request = parseHold(body);
    if (!request) invalidBody();
    return unwrap(await holdOrder(this.database.pool, request), "order");
  }

  @Post("orders")
  async sell(@Body() body: unknown): Promise<{ ok: true; replay: boolean; order: QuantityOrder }> {
    const record = objectBody(body);
    const sellableId = record ? readString(record, "sellableId") : null;
    const quantity = record ? readNumber(record, "quantity") : null;
    const offerId = record ? readOptionalString(record, "offerId") : undefined;
    if (!record || sellableId === null || quantity === null || offerId === "invalid") invalidBody();
    return unwrap(
      await sellQuantity(this.database.pool, {
        sellableId,
        quantity,
        ...(offerId ? { offerId } : {}),
      }),
      "order",
    );
  }

  @Post("orders/:orderId/confirm")
  async confirm(@Param("orderId") orderId: string): Promise<{ ok: true; replay: boolean; order: QuantityOrder }> {
    return unwrap(await confirmOrder(this.database.pool, orderId), "order");
  }

  @Post("orders/:orderId/release")
  async release(@Param("orderId") orderId: string): Promise<{ ok: true; replay: boolean; order: QuantityOrder }> {
    return unwrap(await releaseOrder(this.database.pool, orderId), "order");
  }

  @Get("orders/:orderId")
  async order(@Param("orderId") orderId: string): Promise<{ ok: true; order: QuantityOrder }> {
    const order = await getOrder(this.database.pool, orderId);
    if (!order) {
      throw new HttpException(
        { ok: false, reason: "order-not-found", conflict: false },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return { ok: true, order };
  }

  @Post("orders/:orderId/refunds")
  async refund(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ): Promise<{ ok: true; replay: boolean; order: QuantityOrder }> {
    const record = objectBody(body);
    const quantity = record ? readNumber(record, "quantity") : null;
    const idempotencyKey = record ? readString(record, "idempotencyKey") : null;
    const lineId = record ? readOptionalString(record, "lineId") : undefined;
    if (!record || quantity === null || idempotencyKey === null || lineId === "invalid") invalidBody();
    return unwrap(
      await refundOrder(this.database.pool, {
        orderId,
        quantity,
        idempotencyKey,
        ...(lineId ? { lineId } : {}),
      }),
      "order",
    );
  }

  @Post("orders/:orderId/lines/:lineId/fulfillment")
  async fulfill(
    @Param("orderId") orderId: string,
    @Param("lineId") lineId: string,
  ): Promise<{ ok: true; replay: boolean; order: QuantityOrder }> {
    return unwrap(await fulfillLine(this.database.pool, { orderId, lineId }), "order");
  }

  @Post("orders/:orderId/lines/:lineId/change")
  async change(
    @Param("orderId") orderId: string,
    @Param("lineId") lineId: string,
    @Body() body: unknown,
  ): Promise<{ ok: true; replay: boolean; order: QuantityOrder }> {
    const record = objectBody(body);
    if (!record) invalidBody();
    const sellableId = readOptionalString(record, "sellableId");
    const offerId = readOptionalString(record, "offerId");
    const intervalEnd = readOptionalString(record, "intervalEnd");
    if (sellableId === "invalid" || offerId === "invalid" || intervalEnd === "invalid") invalidBody();
    return unwrap(
      await changeLine(this.database.pool, {
        orderId,
        lineId,
        ...(sellableId ? { sellableId } : {}),
        ...(offerId ? { offerId } : {}),
        ...(intervalEnd ? { intervalEnd } : {}),
      }),
      "order",
    );
  }

  @Post("orders/:orderId/settlement")
  async settle(@Param("orderId") orderId: string): Promise<{ ok: true; replay: boolean; order: QuantityOrder }> {
    return unwrap(await settleOrder(this.database.pool, orderId), "order");
  }
}

function unwrap(
  result: CommandResult<QuantityProduct>,
  field: "product",
): { ok: true; replay: boolean; product: QuantityProduct };
function unwrap(
  result: CommandResult<QuantityOrder>,
  field: "order",
): { ok: true; replay: boolean; order: QuantityOrder };
function unwrap(
  result: CommandResult<QuantityProduct | QuantityOrder>,
  field: "product" | "order",
): { ok: true; replay: boolean; product: QuantityProduct } | { ok: true; replay: boolean; order: QuantityOrder } {
  if (!result.ok) {
    throw new HttpException(
      { ok: false, reason: result.reason, conflict: result.conflict },
      result.conflict ? HttpStatus.CONFLICT : HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  if (field === "product") {
    return { ok: true, replay: result.replay, product: result.value as QuantityProduct };
  }
  return { ok: true, replay: result.replay, order: result.value as QuantityOrder };
}

function invalidBody(): never {
  throw new HttpException({ ok: false, reason: "invalid-body", conflict: false }, HttpStatus.UNPROCESSABLE_ENTITY);
}

function objectBody(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" ? value : null;
}

function readNumber(body: Record<string, unknown>, key: string): number | null {
  const value = body[key];
  return typeof value === "number" ? value : null;
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined | "invalid" {
  if (!(key in body)) return undefined;
  const value = body[key];
  return typeof value === "string" ? value : "invalid";
}

function readOptionalNumber(body: Record<string, unknown>, key: string): number | undefined | "invalid" {
  if (!(key in body)) return undefined;
  const value = body[key];
  return typeof value === "number" ? value : "invalid";
}

function parseHold(body: unknown): HoldOrderRequest | null {
  const record = objectBody(body);
  const lines = record?.lines;
  if (!record || !Array.isArray(lines) || lines.length === 0) return null;
  const parsed = lines.map(parseHoldLine);
  if (parsed.some((line) => line === null)) return null;
  return { lines: parsed.filter((line) => line !== null) };
}

function parseHoldLine(value: unknown): HoldOrderRequest["lines"][number] | null {
  const record = objectBody(value);
  const sellableId = record ? readString(record, "sellableId") : null;
  const quantity = record ? readNumber(record, "quantity") : null;
  if (!record || sellableId === null || quantity === null) return null;
  const offerId = readOptionalString(record, "offerId");
  const intervalStart = readOptionalString(record, "intervalStart");
  const intervalEnd = readOptionalString(record, "intervalEnd");
  if (offerId === "invalid" || intervalStart === "invalid" || intervalEnd === "invalid") return null;
  const subjects = parseSubjects(record.subjects);
  const answers = parseAnswers(record.answers);
  if (subjects === "invalid" || answers === "invalid") return null;
  return {
    sellableId,
    quantity,
    ...(offerId ? { offerId } : {}),
    ...(intervalStart ? { intervalStart } : {}),
    ...(intervalEnd ? { intervalEnd } : {}),
    ...(subjects ? { subjects } : {}),
    ...(answers ? { answers } : {}),
  };
}

function parseSubjects(value: unknown): HoldOrderRequest["lines"][number]["subjects"] | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return "invalid";
  const subjects = [];
  for (const item of value) {
    const record = objectBody(item);
    const inventoryId = record ? readString(record, "inventoryId") : null;
    if (!record || !inventoryId) return "invalid";
    const intervalStart = readOptionalString(record, "intervalStart");
    const intervalEnd = readOptionalString(record, "intervalEnd");
    if (intervalStart === "invalid" || intervalEnd === "invalid") return "invalid";
    subjects.push({
      inventoryId,
      ...(intervalStart ? { intervalStart } : {}),
      ...(intervalEnd ? { intervalEnd } : {}),
    });
  }
  return subjects;
}

function parseAnswers(value: unknown): HoldOrderRequest["lines"][number]["answers"] | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return "invalid";
  const answers = [];
  for (const item of value) {
    const record = objectBody(item);
    const fieldId = record ? readString(record, "fieldId") : null;
    const text = record ? readString(record, "value") : null;
    const unitIndex = record ? readOptionalNumber(record, "unitIndex") : undefined;
    if (!record || !fieldId || text === null || unitIndex === "invalid") return "invalid";
    answers.push({ fieldId, value: text, ...(unitIndex === undefined ? {} : { unitIndex }) });
  }
  return answers;
}
