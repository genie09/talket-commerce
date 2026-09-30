"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { OptionAxis } from "@/lib/catalog";

export function OptionFields({
  axes,
  value,
  onChange,
}: {
  axes: OptionAxis[];
  value: Record<string, string>;
  onChange: (axisId: string, valueId: string) => void;
}) {
  if (axes.length === 0) return null;

  return (
    <div className="space-y-4">
      {axes.map((axis) => (
        <fieldset key={axis.id} className="space-y-2">
          <legend className="text-sm font-medium">{axis.label}</legend>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            value={value[axis.id]}
            onValueChange={(next) => {
              if (next) onChange(axis.id, next);
            }}
          >
            {axis.values.map((item) => (
              <ToggleGroupItem key={item.id} value={item.id}>
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </fieldset>
      ))}
    </div>
  );
}
