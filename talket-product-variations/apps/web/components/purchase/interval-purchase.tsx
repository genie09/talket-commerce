"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionFields } from "@/components/purchase/option-fields";
import { DayCalendar, RangeCalendar } from "@/components/purchase/v2/booking-calendar";
import { HourRange } from "@/components/purchase/v2/hour-range";
import { PurchaseShell, type ScreenReceipt } from "@/components/purchase/purchase-shell";
import { RefundPanel, type RefundUnit } from "@/components/purchase/refund-panel";
import type { PurchaseVersion } from "@/components/purchase/version-bar";
import { initialOptions, optionLines, type BlockedRange, type IntervalProduct } from "@/lib/catalog";
import { hourDraft, nightDraft } from "@/lib/interval-draft";
import { koreanDay, won } from "@/lib/format";
import { refundCopy } from "@/lib/refund-copy";
import {
  closeHour,
  hourIds,
  nightIds,
  occupiedHours,
  occupiedNights,
  openHour,
  rangesFromHourIds,
  rangesFromNightIds,
} from "@/lib/ranges";

export function IntervalPurchase({ product, version }: { product: IntervalProduct; version: PurchaseVersion }) {
  const [options, setOptions] = useState(() => initialOptions(product));
  const [pastBlocks, setPastBlocks] = useState<BlockedRange[]>([]);
  const [hold, setHold] = useState<RefundUnit[] | null>(null);
  const [startDate, setStartDate] = useState("2026-10-01");
  const [endDate, setEndDate] = useState("2026-10-03");
  const [hourDate, setHourDate] = useState("2026-10-02");
  const [startHour, setStartHour] = useState(openHour);
  const [duration, setDuration] = useState(2);
  const [receipt, setReceipt] = useState<ScreenReceipt | null>(null);
  const [refundNote, setRefundNote] = useState<string | null>(null);

  const blocked = [...product.blocked, ...pastBlocks, ...blocksFor(hold, product.unit)];
  const draft = product.unit === "night" ? nightDraft(startDate, endDate, blocked) : hourDraft(hourDate, startHour, duration, blocked);
  const choices = [...optionLines(product, options), ...(draft.label ? [draft.label] : [])];
  const total = draft.units === null ? 0 : draft.units * product.unitPrice;

  function buy(): void {
    const range = draft.range;
    if (!draft.ok || draft.units === null || !range) return;
    if (hold) setPastBlocks((current) => [...current, ...blocksFor(hold, product.unit)]);
    setHold(unitsFor(product.unit, range.start, range.end, product.unitPrice));
    setRefundNote(null);
    setReceipt({
      source: "screen",
      lines: [...choices, `${draft.units}${product.unit === "night" ? "박" : "시간"} · ${won(product.unitPrice)}`],
      total,
      detail: "이 브라우저 안에서만 구간이 점유됐습니다. 환불에서 밤이나 시간을 일부만 되돌릴 수 있습니다.",
    });
  }

  function refundInterval(ids: string[], consumed: boolean): void {
    if (!hold) return;
    const picked = new Set(ids);
    setHold(hold.map((unit) => (picked.has(unit.id) ? { ...unit, refunded: true } : unit)));
    setRefundNote(refundCopy(consumed, !consumed));
    if (consumed) setPastBlocks((current) => [...current, ...blocksFor(hold.filter((unit) => picked.has(unit.id)), product.unit)]);
  }

  return (
    <PurchaseShell
      version={version}
      product={product}
      choiceLines={choices}
      total={draft.ok ? total : 0}
      canBuy={draft.ok}
      message={draft.ok ? null : draft.reason}
      onBuy={buy}
      receipt={receipt}
      below={
        hold ? (
          <RefundPanel
            kind="units"
            openLabel="사용 전"
            consumedLabel="이미 사용함"
            units={hold}
            note={refundNote}
            onRefund={refundInterval}
          />
        ) : null
      }
    >
      <OptionFields
        axes={product.options}
        value={options}
        onChange={(axisId, valueId) => setOptions((current) => ({ ...current, [axisId]: valueId }))}
      />
      {version === "2" && product.unit === "night" ? (
        <RangeCalendar
          start={startDate}
          end={endDate}
          booked={[...occupiedNights(blocked)]}
          onChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />
      ) : version === "2" ? (
        <div className="space-y-4">
          <DayCalendar
            day={hourDate}
            disabled={() => false}
            onChange={(day) => {
              setHourDate(day);
              setStartHour(openHour);
              setDuration(1);
            }}
          />
          <HourRange
            occupied={occupiedHours(blocked, hourDate)}
            startHour={startHour}
            duration={duration}
            onChange={(hour, nextDuration) => {
              setStartHour(hour);
              setDuration(nextDuration);
            }}
          />
        </div>
      ) : product.unit === "night" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="start-date">시작</Label>
            <Input id="start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="end-date">종료</Label>
            <Input id="end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground sm:col-span-2">종료일은 체크아웃입니다. 그 전날 밤까지 점유합니다.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="hour-date">날짜</Label>
            <Input id="hour-date" type="date" value={hourDate} onChange={(event) => setHourDate(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="start-hour">시작</Label>
            <Input
              id="start-hour"
              type="number"
              min={openHour}
              max={closeHour - 1}
              value={startHour}
              onChange={(event) => setStartHour(Number(event.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="duration">시간</Label>
            <Input
              id="duration"
              type="number"
              min={1}
              max={closeHour - openHour}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            />
          </div>
          <p className="text-sm text-muted-foreground sm:col-span-3">
            {openHour}:00부터 {closeHour}:00 전까지만 점유합니다. 종료 시각은 포함하지 않습니다.
          </p>
        </div>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">이미 점유한 구간</h2>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {blocked.map((range) => (
            <li key={`${range.start}-${range.end}`}>{range.label}</li>
          ))}
        </ul>
      </section>
    </PurchaseShell>
  );
}

function unitsFor(unit: "night" | "hour", start: string, end: string, amount: number): RefundUnit[] {
  if (unit === "night") {
    return nightIds(start, end).map((id) => ({ id, label: `${koreanDay(id)} 밤`, amount, refunded: false }));
  }
  return hourIds(start, end).map((id) => ({
    id,
    label: `${id.slice(11, 16)}–${id.slice(11, 13) === "23" ? "24:00" : nextLabel(id)}`,
    amount,
    refunded: false,
  }));
}

function nextLabel(id: string): string {
  const hour = Number(id.slice(11, 13)) + 1;
  return `${String(hour).padStart(2, "0")}:00`;
}

function blocksFor(units: RefundUnit[] | null, unit: "night" | "hour"): BlockedRange[] {
  if (!units) return [];
  const kept = units.filter((item) => !item.refunded).map((item) => item.id);
  const ranges = unit === "night" ? rangesFromNightIds(kept) : rangesFromHourIds(kept);
  return ranges.map((range) => ({ ...range, label: range.label }));
}
