import type { HoldOrderRequest, PackageProductView, QuantityOrder } from "@talket/contracts";
import { ApiError } from "./quantity-api";
import { reasonText } from "./reasons";

type Failure = { ok: false; reason?: string };

export async function loadPackage(slug: string): Promise<PackageProductView | null> {
  try {
    const response = await fetch(`http://127.0.0.1:3001/packages/${slug}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { ok: true; package: PackageProductView };
    return body.package;
  } catch {
    return null;
  }
}

export async function purchasePackage(lines: HoldOrderRequest["lines"]): Promise<QuantityOrder> {
  const heldResponse = await fetch("/backend/orders/hold", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines }),
  });
  const held = (await readBody(heldResponse)) as { ok: true; order: QuantityOrder } | Failure;
  if (!heldResponse.ok || !held.ok) throw new ApiError(message(held));

  const confirmedResponse = await fetch(`/backend/orders/${held.order.id}/confirm`, { method: "POST" });
  const confirmed = (await readBody(confirmedResponse)) as { ok: true; order: QuantityOrder } | Failure;
  if (!confirmedResponse.ok || !confirmed.ok) {
    await fetch(`/backend/orders/${held.order.id}/release`, { method: "POST" });
    throw new ApiError(message(confirmed));
  }
  return confirmed.order;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiError("응답을 읽지 못했습니다");
  }
}

function message(body: Failure | { ok: true }): string {
  return !body.ok && body.reason ? (reasonText[body.reason] ?? body.reason) : "요청이 거절되었습니다";
}
