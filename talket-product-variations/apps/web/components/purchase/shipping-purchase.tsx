"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionFields } from "@/components/purchase/option-fields";
import { PurchaseShell, type ScreenReceipt } from "@/components/purchase/purchase-shell";
import { RefundPanel } from "@/components/purchase/refund-panel";
import { Stepper } from "@/components/purchase/stepper";
import type { PurchaseVersion } from "@/components/purchase/version-bar";
import { initialOptions, optionLines, type ShippingProduct } from "@/lib/catalog";
import { won } from "@/lib/format";
import { refundCopy } from "@/lib/refund-copy";

export function ShippingPurchase({ product, version }: { product: ShippingProduct; version: PurchaseVersion }) {
  const [options, setOptions] = useState(() => initialOptions(product));
  const [stock, setStock] = useState(product.stock);
  const [quantity, setQuantity] = useState(1);
  const [recipient, setRecipient] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [detail, setDetail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ScreenReceipt | null>(null);
  const [hold, setHold] = useState<{ quantity: number; refunded: number } | null>(null);
  const [refundNote, setRefundNote] = useState<string | null>(null);

  const addressReady = recipient.trim() !== "" && phone.trim() !== "" && address.trim() !== "";
  const choices = [
    ...optionLines(product, options),
    `${quantity}개`,
    recipient.trim() ? recipient.trim() : "",
    [address.trim(), detail.trim()].filter(Boolean).join(" "),
  ].filter((line) => line.length > 0);

  function buy(): void {
    if (!addressReady) {
      setMessage("받는 사람, 연락처, 주소를 적어 주세요");
      return;
    }
    if (quantity < 1 || quantity > stock) {
      setMessage("수량을 확인해 주세요");
      return;
    }
    setStock((current) => current - quantity);
    setQuantity(1);
    setMessage(null);
    setHold({ quantity, refunded: 0 });
    setRefundNote(null);
    setReceipt({
      source: "screen",
      lines: [...choices, `단가 ${won(product.unitPrice)}`, "출고 전"],
      total: product.unitPrice * quantity,
      detail: "이 브라우저 안에서만 재고가 줄었습니다. 출고 상태는 주문에 붙는 표시입니다.",
    });
  }

  function refundShipment(count: number, consumed: boolean): void {
    if (!hold) return;
    setHold({ ...hold, refunded: hold.refunded + count });
    if (!consumed) setStock((current) => current + count);
    setRefundNote(refundCopy(consumed, !consumed));
  }

  return (
    <PurchaseShell
      version={version}
      product={product}
      choiceLines={[...choices, `재고 ${stock}`]}
      total={product.unitPrice * quantity}
      canBuy={addressReady && stock >= quantity && quantity >= 1}
      message={message}
      onBuy={buy}
      receipt={receipt}
      below={
        hold ? (
          <RefundPanel
            kind="count"
            openLabel="출고 전"
            consumedLabel="출고함"
            remaining={hold.quantity - hold.refunded}
            note={refundNote}
            onRefund={refundShipment}
          />
        ) : null
      }
    >
      <OptionFields
        axes={product.options}
        value={options}
        onChange={(axisId, valueId) => setOptions((current) => ({ ...current, [axisId]: valueId }))}
      />
      <section className="space-y-2">
        <h2 className="text-sm font-medium">{version === "2" ? "1. 수량" : "수량"}</h2>
        <Stepper value={quantity} min={1} max={Math.max(stock, 1)} onChange={setQuantity} />
        <p className="text-sm text-muted-foreground">남은 재고 {stock}개</p>
      </section>
      <section className="grid gap-4">
        <h2 className="text-sm font-medium">{version === "2" ? "2. 받는 곳" : "받는 곳"}</h2>
        <div className="grid gap-2">
          <Label htmlFor="recipient">받는 사람</Label>
          <Input id="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">연락처</Label>
          <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="address">주소</Label>
          <Input id="address" value={address} onChange={(event) => setAddress(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="detail">상세 주소</Label>
          <Input id="detail" value={detail} onChange={(event) => setDetail(event.target.value)} />
        </div>
      </section>
    </PurchaseShell>
  );
}
