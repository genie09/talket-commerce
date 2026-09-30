"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Stepper } from "@/components/purchase/stepper";
import { won } from "@/lib/format";

export type RefundUnit = {
  id: string;
  label: string;
  amount: number;
  refunded: boolean;
};

export function RefundPanel({
  openLabel,
  consumedLabel,
  note,
  pending = false,
  ...target
}: {
  openLabel: string;
  consumedLabel: string;
  note: string | null;
  pending?: boolean;
} & (
  | {
      kind: "count";
      remaining: number;
      onRefund: (quantity: number, consumed: boolean) => void;
    }
  | {
      kind: "units";
      units: RefundUnit[];
      onRefund: (ids: string[], consumed: boolean) => void;
    }
)) {
  const [consumed, setConsumed] = useState(false);
  const [count, setCount] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const openUnits = target.kind === "units" ? target.units.filter((unit) => !unit.refunded) : [];
  const refundedUnits = target.kind === "units" ? target.units.filter((unit) => unit.refunded) : [];
  const canRefund = target.kind === "count" ? target.remaining >= count && count >= 1 : picked.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>환불</CardTitle>
        <CardDescription>방금 산 주문만 다룹니다. 사용·출고 전과 뒤, 전부와 일부가 갈립니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ToggleGroup
          type="single"
          variant="outline"
          value={consumed ? "used" : "open"}
          onValueChange={(next) => {
            if (next) setConsumed(next === "used");
          }}
        >
          <ToggleGroupItem value="open">{openLabel}</ToggleGroupItem>
          <ToggleGroupItem value="used">{consumedLabel}</ToggleGroupItem>
        </ToggleGroup>
        {target.kind === "count" ? (
          target.remaining < 1 ? (
            <p className="text-sm text-muted-foreground">환불할 수량이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">남은 {target.remaining}개 중 되돌릴 수량</p>
              <Stepper value={Math.min(count, target.remaining)} min={1} max={target.remaining} onChange={setCount} />
            </div>
          )
        ) : openUnits.length === 0 ? (
          <p className="text-sm text-muted-foreground">환불할 점유가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {openUnits.map((unit) => {
              const checked = picked.includes(unit.id);
              return (
                <li key={unit.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setPicked((current) =>
                          checked ? current.filter((id) => id !== unit.id) : [...current, unit.id],
                        )
                      }
                    />
                    <span>
                      {unit.label} · {won(unit.amount)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {refundedUnits.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {refundedUnits.map((unit) => (
              <li key={unit.id}>{unit.label} 환불됨</li>
            ))}
          </ul>
        ) : null}
        {note ? <p className="text-sm">{note}</p> : null}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          variant="outline"
          disabled={!canRefund || pending}
          onClick={() => {
            if (target.kind === "count") target.onRefund(Math.min(count, target.remaining), consumed);
            else target.onRefund(picked, consumed);
            setPicked([]);
          }}
        >
          {pending ? "환불 중" : "환불"}
        </Button>
      </CardFooter>
    </Card>
  );
}
