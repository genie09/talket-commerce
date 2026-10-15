"use client";

import { useEffect, useState } from "react";
import type { QuantityOrder, QuantityProduct } from "@talket/contracts";
import { OptionFields } from "@/components/purchase/option-fields";
import { PurchaseShell, type ScreenReceipt } from "@/components/purchase/purchase-shell";
import { RefundPanel } from "@/components/purchase/refund-panel";
import { Stepper } from "@/components/purchase/stepper";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  initialOptions,
  optionLines,
  type QuantityProductFixture,
} from "@/lib/catalog";
import { won } from "@/lib/format";
import { refundCopy } from "@/lib/refund-copy";
import { ApiError, ensureQuantityProduct, refundQuantityOrder, reloadQuantityProduct, sellQuantity } from "@/lib/quantity-api";
import type { OfferView, SellableView } from "@talket/contracts";

const ledgerKind = {
  sale: "판매",
  fee: "수수료",
  refund: "환불",
  payable: "지급 예정",
} as const;

export function QuantityPurchase({ fixture }: { fixture: QuantityProductFixture }) {
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
  const [answers, setAnswers] = useState<Record<string, string>>({});

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

  const sellable = live ? selectedSellable(fixture, live.sellables, options) : undefined;
  const offer = selectedOffer(fixture, sellable, options);
  const stock = sellable?.stock ?? 0;
  const unitPrice = offer?.unitPrice ?? fixture.unitPrice;
  const choices = [...optionLines(fixture, options), `${quantity}개`];
  const missingAnswer = (live?.inputs ?? []).some(
    (field) => field.required && field.scope === "line" && (answers[field.id] ?? "").trim().length === 0,
  );
  const canBuy = live !== null && sellable !== undefined && stock >= quantity && quantity >= 1 && !missingAnswer && !pending;

  async function buy(): Promise<void> {
    if (!live) return;
    setPending(true);
    setMessage(null);
    try {
      if (!sellable || !offer) return;
      const order = await sellQuantity({
        sellableId: sellable.id,
        offerId: offer.id,
        quantity,
        answers: (live.inputs ?? [])
          .filter((field) => field.scope === "line" && (answers[field.id] ?? "").trim().length > 0)
          .map((field) => ({ fieldId: field.id, value: answers[field.id] ?? "" })),
      });
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
      {(live?.inputs ?? [])
        .filter((field) => field.scope === "line")
        .map((field) => (
          <div key={field.id} className="grid gap-2">
            <Label htmlFor={field.id}>{field.label}</Label>
            <Input
              id={field.id}
              value={answers[field.id] ?? ""}
              maxLength={field.maxLength}
              onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))}
            />
          </div>
        ))}
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

function selectedSellable(
  fixture: QuantityProductFixture,
  sellables: SellableView[],
  selected: Record<string, string>,
): SellableView | undefined {
  const axes = fixture.options.filter((axis) => (axis.role ?? "sellable") === "sellable");
  if (axes.length === 0) return sellables[0];
  const wanted = axes.map((axis) => ({
    axis: axis.label,
    value: axis.values.find((value) => value.id === selected[axis.id])?.label,
  }));
  return sellables.find((sellable) =>
    wanted.every((pair) => sellable.options.some((option) => option.axis === pair.axis && option.value === pair.value)),
  );
}

function selectedOffer(
  fixture: QuantityProductFixture,
  sellable: SellableView | undefined,
  selected: Record<string, string>,
): OfferView | undefined {
  if (!sellable) return undefined;
  const priceAxis = fixture.options.find((axis) => axis.role === "price");
  if (!priceAxis) return sellable.offers[0];
  return sellable.offers.find((offer) => offer.priceKey === selected[priceAxis.id]) ?? sellable.offers[0];
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
