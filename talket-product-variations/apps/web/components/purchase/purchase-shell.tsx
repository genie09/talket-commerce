"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { VersionBar, type PurchaseVersion } from "@/components/purchase/version-bar";
import { archetypeLabels, type CatalogProduct } from "@/lib/catalog";
import { won } from "@/lib/format";

export type ScreenReceipt = {
  source: "api" | "screen";
  lines: string[];
  total: number;
  detail?: string;
};

export function PurchaseShell({
  product,
  version,
  children,
  choiceLines,
  total,
  canBuy,
  pending = false,
  message,
  onBuy,
  receipt,
  below,
}: {
  product: CatalogProduct;
  version: PurchaseVersion;
  children: ReactNode;
  choiceLines: string[];
  total: number | null;
  canBuy: boolean;
  pending?: boolean;
  message?: string | null;
  onBuy: () => void;
  receipt: ScreenReceipt | null;
  below?: ReactNode;
}) {
  const live = product.archetype === "quantity";

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <VersionBar version={version} product={product} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <div className="space-y-3">
          <Link href="/buy" className="text-sm text-muted-foreground hover:text-foreground">
            상품 목록
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{archetypeLabels[product.archetype]}</Badge>
            <Badge variant="outline">{live ? "판매 API" : "화면 시연"}</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
          <p className="text-muted-foreground">{product.summary}</p>
        </div>
        {children}
        {receipt ? <ReceiptCard receipt={receipt} /> : null}
        {below}
      </div>
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>주문</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {choiceLines.length === 0 ? (
              <p className="text-muted-foreground">고른 내용이 여기에 모입니다.</p>
            ) : (
              <ul className="space-y-1">
                {choiceLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <p className="text-base font-medium">{total === null ? "금액 확인 중" : won(total)}</p>
            {message ? <p className="text-destructive">{message}</p> : null}
          </CardContent>
          <CardFooter>
            <Button type="button" className="w-full" disabled={!canBuy || pending} onClick={onBuy}>
              {pending ? "구매 중" : "구매"}
            </Button>
          </CardFooter>
        </Card>
      </aside>
      </div>
    </main>
  );
}

function ReceiptCard({ receipt }: { receipt: ScreenReceipt }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{receipt.source === "api" ? "판매된 주문" : "이 화면의 주문"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-1">
          {receipt.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="font-medium">{won(receipt.total)}</p>
        {receipt.detail ? <p className="text-muted-foreground">{receipt.detail}</p> : null}
      </CardContent>
    </Card>
  );
}
