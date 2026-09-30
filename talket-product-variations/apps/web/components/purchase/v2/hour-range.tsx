"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { closeHour, openHour } from "@/lib/ranges";

const hours = Array.from({ length: closeHour - openHour }, (_, index) => openHour + index);

export function HourRange({
  occupied,
  startHour,
  duration,
  onChange,
}: {
  occupied: number[];
  startHour: number;
  duration: number;
  onChange: (startHour: number, duration: number) => void;
}) {
  const [anchor, setAnchor] = useState<number | null>(null);
  const occupiedSet = new Set(occupied);
  const end = startHour + duration;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {anchor === null ? "시작 칸을 고르고, 이어서 끝 칸을 고릅니다." : "끝 칸을 고르면 사이가 한 구간이 됩니다."}
      </p>
      <div className="flex flex-wrap gap-2">
        {hours.map((hour) => {
          const inside = hour >= startHour && hour < end;
          const blocked = occupiedSet.has(hour);
          return (
            <Button
              key={hour}
              type="button"
              variant={inside && !blocked ? "default" : "outline"}
              disabled={blocked}
              onClick={() => {
                if (anchor === null) {
                  setAnchor(hour);
                  onChange(hour, 1);
                  return;
                }
                const start = Math.min(anchor, hour);
                onChange(start, Math.abs(hour - anchor) + 1);
                setAnchor(null);
              }}
            >
              {String(hour).padStart(2, "0")}:00
              {blocked ? " 마감" : ""}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
