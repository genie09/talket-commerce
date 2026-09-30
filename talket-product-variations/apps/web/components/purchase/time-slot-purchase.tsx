"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OptionFields } from "@/components/purchase/option-fields";
import { DayCalendar, formatDay } from "@/components/purchase/v2/booking-calendar";
import { PurchaseShell, type ScreenReceipt } from "@/components/purchase/purchase-shell";
import { RefundPanel, type RefundUnit } from "@/components/purchase/refund-panel";
import type { PurchaseVersion } from "@/components/purchase/version-bar";
import { initialOptions, optionLines, type TimeSlot, type TimeSlotProduct } from "@/lib/catalog";
import { koreanDay, won } from "@/lib/format";
import { refundCopy } from "@/lib/refund-copy";

export function TimeSlotPurchase({ product, version }: { product: TimeSlotProduct; version: PurchaseVersion }) {
  const [options, setOptions] = useState(() => initialOptions(product));
  const [slots, setSlots] = useState(product.slots);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ScreenReceipt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hold, setHold] = useState<{ slotId: string; demand: number; units: RefundUnit[] } | null>(null);
  const [refundNote, setRefundNote] = useState<string | null>(null);

  const demand = demandOf(product, options);
  const dates = [...new Set(slots.map((slot) => slot.date))];
  const [calendarDay, setCalendarDay] = useState(dates[0] ?? "2026-10-02");
  const visibleDates = version === "2" ? [calendarDay] : dates;
  const selected = slots.find((slot) => slot.id === slotId) ?? null;
  const available = selected !== null && selected.remaining >= demand;
  const total = product.unitPrice * demand;
  const choices = [
    ...optionLines(product, options),
    ...(selected ? [`${formatDate(selected.date)} ${selected.label}`] : []),
  ];

  function buy(): void {
    if (!selected || !available) {
      setMessage("정원이 남은 슬롯을 고르세요");
      return;
    }
    setSlots((current) =>
      current.map((slot) => (slot.id === selected.id ? { ...slot, remaining: slot.remaining - demand } : slot)),
    );
    setSlotId(null);
    setMessage(null);
    setHold({
      slotId: selected.id,
      demand,
      units: [{ id: selected.id, label: `${koreanDay(selected.date)} ${selected.label}`, amount: total, refunded: false }],
    });
    setRefundNote(null);
    setReceipt({
      source: "screen",
      lines: [...choices, `단가 ${won(product.unitPrice)}`],
      total,
      detail: "이 브라우저 안에서만 슬롯 정원이 줄었습니다.",
    });
  }

  function refundSlot(ids: string[], consumed: boolean): void {
    if (!hold || !ids.includes(hold.slotId)) return;
    setHold({ ...hold, units: hold.units.map((unit) => ({ ...unit, refunded: true })) });
    if (!consumed) {
      setSlots((current) =>
        current.map((slot) => (slot.id === hold.slotId ? { ...slot, remaining: slot.remaining + hold.demand } : slot)),
      );
    }
    setRefundNote(refundCopy(consumed, !consumed));
  }

  return (
    <PurchaseShell
      version={version}
      product={product}
      choiceLines={choices}
      total={selected ? total : 0}
      canBuy={available}
      message={message}
      onBuy={buy}
      receipt={receipt}
      below={
        hold ? (
          <RefundPanel
            kind="units"
            openLabel="사용 전"
            consumedLabel="이미 사용함"
            units={hold.units}
            note={refundNote}
            onRefund={refundSlot}
          />
        ) : null
      }
    >
      <OptionFields
        axes={product.options}
        value={options}
        onChange={(axisId, valueId) => {
          setOptions((current) => ({ ...current, [axisId]: valueId }));
          setMessage(null);
        }}
      />
      <section className="space-y-4">
        <h2 className="text-sm font-medium">슬롯</h2>
        {version === "2" ? (
          <DayCalendar
            day={calendarDay}
            disabled={(date) => !slots.some((slot) => slot.date === formatDay(date) && slot.remaining >= demand)}
            onChange={(day) => {
              setCalendarDay(day);
              setSlotId(null);
            }}
          />
        ) : null}
        {visibleDates.map((date) => (
          <div key={date} className="space-y-2">
            <p className="text-sm text-muted-foreground">{formatDate(date)}</p>
            <div className="flex flex-wrap gap-2">
              {slots
                .filter((slot) => slot.date === date)
                .map((slot) => (
                  <SlotButton
                    key={slot.id}
                    slot={slot}
                    demand={demand}
                    pressed={slot.id === slotId}
                    onClick={() => {
                      setSlotId(slot.id);
                      setMessage(null);
                    }}
                  />
                ))}
            </div>
          </div>
        ))}
      </section>
    </PurchaseShell>
  );
}

function SlotButton({
  slot,
  demand,
  pressed,
  onClick,
}: {
  slot: TimeSlot;
  demand: number;
  pressed: boolean;
  onClick: () => void;
}) {
  const short = slot.remaining < demand;
  return (
    <Button type="button" variant={pressed ? "default" : "outline"} disabled={short} onClick={onClick}>
      {slot.label}
      <span className="text-xs opacity-70">{slot.remaining === 0 ? "마감" : `잔여 ${slot.remaining}`}</span>
    </Button>
  );
}

function demandOf(product: TimeSlotProduct, options: Record<string, string>): number {
  if (!product.demandOptionId) return 1;
  const value = Number(options[product.demandOptionId]);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function formatDate(value: string): string {
  return koreanDay(value);
}
