"use client";

import type { QuantityOrder, QuantityProduct } from "@talket/contracts";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { won } from "@/lib/format";
import { reasonText } from "@/lib/reasons";

type Failure = { ok: false; reason: string };

export function QuantityConsole() {
  const [products, setProducts] = useState<QuantityProduct[]>([]);
  const [order, setOrder] = useState<QuantityOrder | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const refundKey = useRef(crypto.randomUUID());

  async function refresh(): Promise<void> {
    const response = await fetch("/backend/products");
    const body = (await response.json()) as { products: QuantityProduct[] };
    setProducts(body.products);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submit(path: string, payload: unknown, rotateRefundKey = false): Promise<void> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as { ok: true; order?: QuantityOrder; product?: QuantityProduct } | Failure;
    if (!body.ok) {
      setMessage(reasonText[body.reason] ?? body.reason);
      return;
    }
    setMessage(null);
    if (body.order) setOrder(body.order);
    if (rotateRefundKey) refundKey.current = crypto.randomUUID();
    await refresh();
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-medium">수량형</h2>
        <p className="text-sm text-muted-foreground">등록, 가격 수정, 판매, 환불, 정산은 여기서 합니다.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>상품 등록</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void submit("/backend/products", {
                name: String(form.get("name") ?? ""),
                unitPrice: Number(form.get("unitPrice")),
                stock: Number(form.get("stock")),
              });
              event.currentTarget.reset();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="product-name">이름</Label>
              <Input id="product-name" name="name" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="product-price">가격</Label>
              <Input id="product-price" name="unitPrice" type="number" min={0} required defaultValue={10000} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="product-stock">재고</Label>
              <Input id="product-stock" name="stock" type="number" min={0} required defaultValue={5} />
            </div>
            <Button type="submit">상품 등록</Button>
          </form>
        </CardContent>
      </Card>

      {products.map((product) => (
        <Card key={product.id}>
          <CardHeader>
            <CardTitle>{product.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {won(product.unitPrice)} · 재고 {product.stock}
            </p>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void fetch(`/backend/products/${product.id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ unitPrice: Number(form.get("unitPrice")) }),
                }).then(() => refresh());
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor={`price-${product.id}`}>가격 수정</Label>
                <Input
                  id={`price-${product.id}`}
                  name="unitPrice"
                  type="number"
                  min={0}
                  defaultValue={product.unitPrice}
                  className="w-32"
                />
              </div>
              <Button type="submit" variant="outline">
                가격 저장
              </Button>
            </form>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void submit("/backend/orders", {
                  sellableId: product.sellableId,
                  quantity: Number(form.get("quantity")),
                });
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor={`qty-${product.id}`}>판매 수량</Label>
                <Input
                  id={`qty-${product.id}`}
                  name="quantity"
                  type="number"
                  min={1}
                  defaultValue={2}
                  className="w-32"
                />
              </div>
              <Button type="submit">판매</Button>
            </form>
          </CardContent>
        </Card>
      ))}

      {order ? (
        <Card>
          <CardHeader>
            <CardTitle>주문 {order.status}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              판매 당시 {won(order.line.unitPrice)} · {order.line.quantity}개 · 환불 {order.line.refundedQuantity}개 ·
              잔액 {won(order.balance)}
            </p>
            <ul className="space-y-1 text-sm">
              {order.entries.map((entry, index) => (
                <li key={`${entry.kind}-${index}`}>
                  {entry.kind} {won(entry.amount)}
                </li>
              ))}
            </ul>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void submit(
                  `/backend/orders/${order.id}/refunds`,
                  { quantity: Number(form.get("quantity")), idempotencyKey: refundKey.current },
                  true,
                );
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="refund-quantity">환불 수량</Label>
                <Input id="refund-quantity" name="quantity" type="number" min={1} defaultValue={1} className="w-32" />
              </div>
              <Button type="submit" variant="outline">
                환불
              </Button>
            </form>
          </CardContent>
          <CardFooter>
            <Button type="button" variant="secondary" onClick={() => void submit(`/backend/orders/${order.id}/settlement`, {})}>
              정산
            </Button>
          </CardFooter>
        </Card>
      ) : null}
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </section>
  );
}
