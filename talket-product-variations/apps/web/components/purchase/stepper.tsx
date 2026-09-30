"use client";

import { Button } from "@/components/ui/button";

export function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        aria-label="수량 줄이기"
      >
        −
      </Button>
      <span className="w-8 text-center text-sm tabular-nums">{value}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="수량 늘리기"
      >
        +
      </Button>
    </div>
  );
}
