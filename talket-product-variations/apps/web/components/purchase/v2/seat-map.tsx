"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { Seat } from "@/lib/catalog";
import { won } from "@/lib/format";

type SeatCell = {
  id: string;
  number: number;
  tooltip: string;
  isReserved: boolean;
} | null;

type SeatPick = { row: string; number: string | number; id: string | number };
type Accept = (row: string, number: string | number, id?: string | number) => void;

const SeatPicker = dynamic(() => import("react-seat-picker"), { ssr: false }) as ComponentType<{
  rows: SeatCell[][];
  alpha?: boolean;
  visible?: boolean;
  maxReservableSeats?: number;
  addSeatCallback?: (seat: SeatPick, accept: Accept) => void;
  removeSeatCallback?: (seat: SeatPick, accept: Accept) => void;
}>;

export function SeatMap({
  seats,
  onAdd,
  onRemove,
}: {
  seats: Seat[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const rows = new Map<string, Seat[]>();
  for (const seat of seats) {
    const row = rows.get(seat.row) ?? [];
    row.push(seat);
    rows.set(seat.row, row);
  }
  const taken = seats
    .filter((seat) => seat.taken)
    .map((seat) => seat.id)
    .join(",");

  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-muted-foreground">무대</p>
      <SeatPicker
        key={taken}
        alpha
        visible
        maxReservableSeats={12}
        rows={[...rows.values()].map((row) =>
          row.map((seat) => ({
            id: seat.id,
            number: seat.number,
            isReserved: seat.taken,
            tooltip: `${seat.grade} ${won(seat.price)}`,
          })),
        )}
        addSeatCallback={(seat, accept) => {
          onAdd(String(seat.id));
          accept(seat.row, seat.number, seat.id);
        }}
        removeSeatCallback={(seat, accept) => {
          onRemove(String(seat.id));
          accept(seat.row, seat.number);
        }}
      />
    </div>
  );
}
