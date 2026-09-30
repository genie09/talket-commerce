"use client";

import { useEffect, useState } from "react";
import type { QuantityOrder, QuantityProduct } from "@talket/contracts";
import { OptionFields } from "@/components/purchase/option-fields";
import { PurchaseShell, type ScreenReceipt } from "@/components/purchase/purchase-shell";
import { RefundPanel } from "@/components/purchase/refund-panel";
import { Stepper } from "@/components/purchase/stepper";
import type { PurchaseVersion } from "@/components/purchase/version-bar";
import {
  initialOptions,
  optionLines,
  type QuantityProductFixture,
} from "@/lib/catalog";
import { won } from "@/lib/format";
import { refundCopy } from "@/lib/refund-copy";
import { ApiError, ensureQuantityProduct, refundQuantityOrder, reloadQuantityProduct, sellQuantity } from "@/lib/quantity-api";

const ledgerKind = {
  sale: "판매",
  fee: "수수료",
  refund: "환불",
  payable: "지급 예정",
} as const;

export function QuantityPurchase({ fixture, version }: { fixture: QuantityProductFixture; version: PurchaseVersion }) {
  const [options, setOptions] = useState(() => initialOptions(fixture));
  const [quantity, setQuantity] = useState(1);
  const [live, setLive] = useState<QuantityProduct | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<ScreenReceipt | null>(null);
  const [sold, setSold] = useState<QuantityOrder | null>(null);
  const [screenRefunded, setScreenRefunded] = useState(0);
  const [refundNote, setRefundNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureQuantityProduct(fixture)
      .then((product) => {
        if (!cancelled) setLive(product);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "상품을 불러오지 못했습니다");
      });
    return () => {
      cancelled = true;
    };
  }, [fixture]);

  const stock = live?.stock ?? 0;
  const unitPrice = live?.unitPrice ?? fixture.unitPrice;
  const choices = [...optionLines(fixture, options), `${quantity}개`];
  const canBuy = live !== null && stock >= quantity && quantity >= 1 && !pending;

  async function buy(): Promise<void> {
    if (!live) return;
    setPending(true);
    setMessage(null);
    try {
      const order = await sellQuantity(live.sellableId, quantity);
      const refreshed = await reloadQuantityProduct(live.id);
      if (refreshed) setLive(refreshed);
      setSold(order);
      setScreenRefunded(0);
      setRefundNote(null);
      setReceipt(serverReceipt(order, choices));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "구매하지 못했습니다");
      if (live) {
        const refreshed = await reloadQuantityProduct(live.id);
        if (refreshed) setLive(refreshed);
      }
    } finally {
      setPending(false);
    }
  }

  async function refund(count: number, consumed: boolean): Promise<void> {
    if (!sold || !live) return;
    if (consumed) {
      setScreenRefunded((current) => current + count);
      setRefundNote(refundCopy(true, false));
      return;
    }
    setPending(true);
    try {
      const order = await refundQuantityOrder(sold.id, count, crypto.randomUUID());
      const refreshed = await reloadQuantityProduct(live.id);
      if (refreshed) setLive(refreshed);
      setSold(order);
      setReceipt(serverReceipt(order, optionLines(fixture, options)));
      setRefundNote(refundCopy(false, true));
    } catch (error) {
      setRefundNote(error instanceof ApiError ? error.message : "환불하지 못했습니다");
    } finally {
      setPending(false);
    }
  }

  const refundable = sold ? sold.line.quantity - sold.line.refundedQuantity - screenRefunded : 0;

  return (
    <PurchaseShell
      version={version}
      product={fixture}
      choiceLines={live ? [...choices, `단가 ${won(unitPrice)}`, `재고 ${stock}`] : ["상품을 불러오는 중"]}
      total={live ? unitPrice * quantity : null}
      canBuy={canBuy}
      pending={pending}
      message={message ?? loadError ?? (live && stock < quantity ? "재고가 부족합니다" : null)}
      onBuy={() => void buy()}
      receipt={receipt}
      below={
        sold ? (
          <RefundPanel
            kind="count"
            openLabel="사용 전"
            consumedLabel="이미 사용함"
            remaining={refundable}
            note={refundNote}
            pending={pending}
            onRefund={(count, consumed) => void refund(count, consumed)}
          />
        ) : null
      }
    >
      <OptionFields
        axes={fixture.options}
        value={options}
        onChange={(axisId, valueId) => setOptions((current) => ({ ...current, [axisId]: valueId }))}
      />
      {version === "2" ? (
        <p className="text-2xl font-semibold tracking-tight">
          {won(unitPrice)} <span className="text-base font-normal text-muted-foreground">{fixture.priceNote}</span>
        </p>
      ) : null}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">수량</h2>
        <Stepper
          value={quantity}
          min={1}
          max={Math.max(stock, 1)}
          onChange={(next) => setQuantity(Math.min(Math.max(next, 1), Math.max(stock, 1)))}
        />
        <p className="text-sm text-muted-foreground">
          {live ? `남은 재고 ${stock}개. 판매 단가는 등록된 상품을 따릅니다.` : "판매 API에 상품을 맞추는 중입니다."}
        </p>
      </section>
    </PurchaseShell>
  );
}

function serverReceipt(order: QuantityOrder, choices: string[]): ScreenReceipt {
  return {
    source: "api",
    lines: [
      ...choices,
      `주문 ${order.id}`,
      `상태 ${order.status}`,
      ...order.entries.map((entry) => `${ledgerKind[entry.kind]} ${won(entry.amount)}`),
      `잔액 ${won(order.balance)}`,
    ],
    total: order.line.unitPrice * order.line.quantity,
    detail: "사용 전 환불은 이 화면에서 판매 API로 재고를 되돌립니다.",
  };
}
