"use client";

import type { ReactNode } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ko } from "react-day-picker/locale";
import "react-day-picker/style.css";

const october = new Date(2026, 9, 1);

export function formatDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function RangeCalendar({
  start,
  end,
  booked,
  onChange,
}: {
  start: string;
  end: string;
  booked: string[];
  onChange: (start: string, end: string) => void;
}) {
  const selected: DateRange = { from: parseDay(start), to: parseDay(end) };
  return (
    <CalendarFrame
      booked={booked}
      calendar={
        <DayPicker
          mode="range"
          locale={ko}
          weekStartsOn={0}
          numberOfMonths={2}
          defaultMonth={october}
          selected={selected}
          onSelect={(range) => {
            if (!range?.from) return;
            onChange(formatDay(range.from), formatDay(range.to ?? range.from));
          }}
          modifiers={{ booked: (date) => new Set(booked).has(formatDay(date)) }}
          modifiersClassNames={{ booked: "is-booked" }}
        />
      }
    />
  );
}

export function DayCalendar({
  day,
  disabled,
  onChange,
}: {
  day: string;
  disabled: (date: Date) => boolean;
  onChange: (day: string) => void;
}) {
  return (
    <CalendarFrame
      calendar={
        <DayPicker
          mode="single"
          locale={ko}
          weekStartsOn={0}
          defaultMonth={october}
          selected={parseDay(day)}
          onSelect={(next) => {
            if (next) onChange(formatDay(next));
          }}
          disabled={disabled}
        />
      }
    />
  );
}

function CalendarFrame({ calendar, booked = [] }: { calendar: ReactNode; booked?: string[] }) {
  return (
    <div className="booking-calendar space-y-2">
      {calendar}
      {booked.length > 0 ? <p className="text-sm text-muted-foreground">가로줄 친 날은 이미 점유한 밤입니다.</p> : null}
    </div>
  );
}
