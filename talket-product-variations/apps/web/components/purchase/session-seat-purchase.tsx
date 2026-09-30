"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SeatMap } from "@/components/purchase/v2/seat-map";
import { OptionFields } from "@/components/purchase/option-fields";
import { PurchaseShell, type ScreenReceipt } from "@/components/purchase/purchase-shell";
import { RefundPanel, type RefundUnit } from "@/components/purchase/refund-panel";
import type { PurchaseVersion } from "@/components/purchase/version-bar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  initialOptions,
  optionLines,
  type Seat,
  type SessionSeatProduct,
} from "@/lib/catalog";
import { won } from "@/lib/format";
import { refundCopy } from "@/lib/refund-copy";

export function SessionSeatPurchase({ product, version }: { product: SessionSeatProduct; version: PurchaseVersion }) {
  const [options, setOptions] = useState(() => initialOptions(product));
  const [sessions, setSessions] = useState(product.sessions);
  const [sessionId, setSessionId] = useState(product.sessions[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<ScreenReceipt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hold, setHold] = useState<{ sessionId: string; units: RefundUnit[] } | null>(null);
  const [refundNote, setRefundNote] = useState<string | null>(null);

  const session = sessions.find((item) => item.id === sessionId) ?? sessions[0];
  const chosen = session?.seats.filter((seat) => selected.includes(seat.id)) ?? [];
  const total = chosen.reduce((sum, seat) => sum + seat.price, 0);
  const grades = session ? [...new Set(session.seats.map((seat) => seat.grade))] : [];
  const choices = [
    ...optionLines(product, options),
    ...(session ? [session.label] : []),
    ...chosen.map((seat) => `${seat.grade} ${seat.row}${seat.number} ${won(seat.price)}`),
  ];

  function refundSeats(ids: string[], consumed: boolean): void {
    if (!hold) return;
    const picked = new Set(ids);
    setHold({
      ...hold,
      units: hold.units.map((unit) => (picked.has(unit.id) ? { ...unit, refunded: true } : unit)),
    });
    if (!consumed) {
      setSessions((current) =>
        current.map((item) =>
          item.id === hold.sessionId
            ? { ...item, seats: item.seats.map((seat) => (picked.has(seat.id) ? { ...seat, taken: false } : seat)) }
            : item,
        ),
      );
    }
    setRefundNote(refundCopy(consumed, !consumed));
  }

  function buy(): void {
    if (!session || chosen.length === 0) return;
    const taken = new Set(chosen.map((seat) => seat.id));
    setSessions((current) =>
      current.map((item) =>
        item.id === session.id
          ? { ...item, seats: item.seats.map((seat) => (taken.has(seat.id) ? { ...seat, taken: true } : seat)) }
          : item,
      ),
    );
    setSelected([]);
    setMessage(null);
    setHold({
      sessionId: session.id,
      units: chosen.map((seat) => ({
        id: seat.id,
        label: `${seat.grade} ${seat.row}${seat.number}`,
        amount: seat.price,
        refunded: false,
      })),
    });
    setRefundNote(null);
    setReceipt({
      source: "screen",
      lines: choices,
      total,
      detail: "이 브라우저 안에서만 좌석이 점유됐습니다.",
    });
  }

  return (
    <PurchaseShell
      version={version}
      product={product}
      choiceLines={choices}
      total={chosen.length === 0 ? 0 : total}
      canBuy={chosen.length > 0}
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
            onRefund={refundSeats}
          />
        ) : null
      }
    >
      <OptionFields
        axes={product.options}
        value={options}
        onChange={(axisId, valueId) => setOptions((current) => ({ ...current, [axisId]: valueId }))}
      />
      <section className="space-y-3">
        <h2 className="text-sm font-medium">회차</h2>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          value={session?.id}
          onValueChange={(next) => {
            if (!next) return;
            setSessionId(next);
            setSelected([]);
          }}
        >
          {sessions.map((item) => (
            <ToggleGroupItem key={item.id} value={item.id}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>
      {session && version === "2" ? (
        <SeatMap
          seats={session.seats}
          onAdd={(id) => setSelected((current) => (current.includes(id) ? current : [...current, id]))}
          onRemove={(id) => setSelected((current) => current.filter((item) => item !== id))}
        />
      ) : session ? (
        <section className="space-y-4">
          <h2 className="text-sm font-medium">좌석</h2>
          {grades.map((grade) => (
            <div key={grade} className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {grade} · {won(session.seats.find((seat) => seat.grade === grade)?.price ?? 0)}
              </p>
              <div className="flex flex-wrap gap-2">
                {session.seats
                  .filter((seat) => seat.grade === grade)
                  .map((seat) => (
                    <SeatButton
                      key={seat.id}
                      seat={seat}
                      pressed={selected.includes(seat.id)}
                      onClick={() =>
                        setSelected((current) =>
                          current.includes(seat.id) ? current.filter((id) => id !== seat.id) : [...current, seat.id],
                        )
                      }
                    />
                  ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </PurchaseShell>
  );
}

function SeatButton({ seat, pressed, onClick }: { seat: Seat; pressed: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant={pressed ? "default" : "outline"}
      size="sm"
      disabled={seat.taken}
      onClick={onClick}
      aria-pressed={pressed}
    >
      {seat.row}
      {seat.number}
    </Button>
  );
}
