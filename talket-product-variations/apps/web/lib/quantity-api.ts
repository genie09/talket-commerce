import type { QuantityOrder, QuantityProduct } from "@talket/contracts";
import type { QuantityProductFixture } from "./catalog";
import { reasonText } from "./reasons";

export class ApiError extends Error {}

type Failure = { ok: false; reason?: string };

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiError("응답을 읽지 못했습니다");
  }
}

function failureMessage(body: unknown): string {
  if (typeof body === "object" && body !== null && "reason" in body && typeof body.reason === "string") {
    return reasonText[body.reason] ?? body.reason;
  }
  return "요청이 거절되었습니다";
}

const pendingProducts = new Map<string, Promise<QuantityProduct>>();

export function ensureQuantityProduct(fixture: QuantityProductFixture): Promise<QuantityProduct> {
  const pending = pendingProducts.get(fixture.name);
  if (pending) return pending;
  const request = findOrCreateQuantityProduct(fixture).finally(() => {
    pendingProducts.delete(fixture.name);
  });
  pendingProducts.set(fixture.name, request);
  return request;
}

async function findOrCreateQuantityProduct(fixture: QuantityProductFixture): Promise<QuantityProduct> {
  const listed = await fetch("/backend/products");
  const listedBody = (await readBody(listed)) as { products?: QuantityProduct[] } | Failure;
  if (!listed.ok || !("products" in listedBody) || !listedBody.products) {
    throw new ApiError("상품 목록을 불러오지 못했습니다");
  }
  const found = listedBody.products.find((product) => product.name === fixture.name);
  if (found) return found;

  const created = await fetch("/backend/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: fixture.name,
      unitPrice: fixture.unitPrice,
      stock: fixture.stock,
    }),
  });
  const createdBody = (await readBody(created)) as { ok: true; product: QuantityProduct } | Failure;
  if (!created.ok || !createdBody.ok) throw new ApiError(failureMessage(createdBody));
  return createdBody.product;
}

export async function refundQuantityOrder(
  orderId: string,
  quantity: number,
  idempotencyKey: string,
): Promise<QuantityOrder> {
  const response = await fetch(`/backend/orders/${orderId}/refunds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quantity, idempotencyKey }),
  });
  const body = (await readBody(response)) as { ok: true; order: QuantityOrder } | Failure;
  if (!response.ok || !body.ok) throw new ApiError(failureMessage(body));
  return body.order;
}

export async function sellQuantity(sellableId: string, quantity: number): Promise<QuantityOrder> {
  const response = await fetch("/backend/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sellableId, quantity }),
  });
  const body = (await readBody(response)) as { ok: true; order: QuantityOrder } | Failure;
  if (!response.ok || !body.ok) throw new ApiError(failureMessage(body));
  return body.order;
}

export async function reloadQuantityProduct(productId: string): Promise<QuantityProduct | null> {
  const response = await fetch("/backend/products");
  const body = (await readBody(response)) as { products?: QuantityProduct[] };
  if (!response.ok || !body.products) return null;
  return body.products.find((product) => product.id === productId) ?? null;
}
