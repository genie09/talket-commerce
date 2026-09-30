import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import type { QuantityOrder, QuantityProduct } from "@talket/contracts";
import { DatabaseService } from "../database/database.service";
import {
  adjustQuantityStock,
  createQuantityProduct,
  getQuantityOrder,
  listQuantityProducts,
  refundQuantity,
  sellQuantity,
  settleQuantity,
  updateQuantityProduct,
  type CommandResult,
} from "./quantity.commands";

@Controller()
export class QuantityController {
  constructor(private readonly database: DatabaseService) {}

  @Get("products")
  async list(): Promise<{ ok: true; products: QuantityProduct[] }> {
    return { ok: true, products: await listQuantityProducts(this.database.pool) };
  }

  @Post("products")
  async create(@Body() body: unknown): Promise<{ ok: true; replay: boolean; product: QuantityProduct }> {
    const record = objectBody(body);
    const name = record ? readString(record, "name") : null;
    const unitPrice = record ? readNumber(record, "unitPrice") : null;
    const stock = record ? readNumber(record, "stock") : null;
    if (!record || name === null || unitPrice === null || stock === null) invalidBody();
    return unwrap(
      await createQuantityProduct(this.database.pool, { name, unitPrice, stock }),
      "product",
    );
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
      await updateQuantityProduct(this.database.pool, {
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
    return unwrap(await adjustQuantityStock(this.database.pool, { productId, delta }), "product");
  }

  @Post("orders")
  async sell(@Body() body: unknown): Promise<{ ok: true; replay: boolean; order: QuantityOrder }> {
    const record = objectBody(body);
    const sellableId = record ? readString(record, "sellableId") : null;
    const quantity = record ? readNumber(record, "quantity") : null;
    if (!record || sellableId === null || quantity === null) invalidBody();
    return unwrap(await sellQuantity(this.database.pool, { sellableId, quantity }), "order");
  }

  @Get("orders/:orderId")
  async order(@Param("orderId") orderId: string): Promise<{ ok: true; order: QuantityOrder }> {
    const order = await getQuantityOrder(this.database.pool, orderId);
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
    if (!record || quantity === null || idempotencyKey === null) invalidBody();
    return unwrap(
      await refundQuantity(this.database.pool, { orderId, quantity, idempotencyKey }),
      "order",
    );
  }

  @Post("orders/:orderId/settlement")
  async settle(
    @Param("orderId") orderId: string,
  ): Promise<{ ok: true; replay: boolean; order: QuantityOrder }> {
    return unwrap(await settleQuantity(this.database.pool, { orderId }), "order");
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
  throw new HttpException(
    { ok: false, reason: "invalid-body", conflict: false },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
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
