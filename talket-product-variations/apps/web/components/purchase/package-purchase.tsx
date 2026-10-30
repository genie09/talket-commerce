"use client";

import { useMemo, useState, type ReactNode } from "react";
import type {
  HoldLineRequest,
  InventoryView,
  PackageComponentView,
  PackageProductView,
  QuantityOrder,
  SellableView,
} from "@talket/contracts";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DayCalendar } from "@/components/purchase/v2/booking-calendar";
import { ApiError } from "@/lib/quantity-api";
import { purchasePackage } from "@/lib/package-api";
import { won } from "@/lib/format";

const roleLabel = {
  flight: "항공",
  concert: "콘서트 지정좌석",
  activity: "선택 관광",
  lodging: "숙박",
} as const;

export function PackagePurchase({ item }: { item: PackageProductView }) {
  const flight = component(item, "flight");
  const concert = component(item, "concert");
  const activities = item.components.filter((entry) => entry.role === "activity");
  const lodging = component(item, "lodging");
  const [flightId, setFlightId] = useState(flight?.product.sellables[0]?.id ?? "");
  const initialFlightInventory = flight?.product.sellables[0]?.inventories[0];
  const [flightDay, setFlightDay] = useState(dayOf(initialFlightInventory) ?? item.startsOn);
  const [flightInventoryId, setFlightInventoryId] = useState(initialFlightInventory?.id ?? "");
  const [seatId, setSeatId] = useState(firstFreeSeat(concert)?.inventory.id ?? "");
  const [activityChoices, setActivityChoices] = useState(() => initialActivityChoices(activities));
  const [lodgingId, setLodgingId] = useState(lodging?.product.sellables[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [order, setOrder] = useState<QuantityOrder | null>(null);

  const seat = useMemo(() => {
    if (!concert) return null;
    for (const sellable of concert.product.sellables) {
      const inventory = sellable.inventories.find((entry) => entry.id === seatId);
      if (inventory) return { sellable, inventory };
    }
    return null;
  }, [concert, seatId]);
  const flightSellable = flight ? findSellable(flight, flightId) : undefined;
  const flightInventories = flightSellable?.inventories.filter((inventory) => dayOf(inventory) === flightDay) ?? [];
  const selectedActivities = activities.flatMap((activity) => {
    const choice = activityChoices[activity.id];
    if (!choice?.included) return [];
    const sellable = findSellable(activity, choice.sellableId);
    const inventory = sellable?.inventories.find((entry) => entry.id === choice.inventoryId);
    return sellable && inventory ? [{ activity, sellable, inventory }] : [];
  });
  const selected = [
    flightSellable ?? null,
    seat?.sellable ?? null,
    ...selectedActivities.map((entry) => entry.sellable),
    lodging ? findSellable(lodging, lodgingId) : null,
  ].filter((value): value is SellableView => Boolean(value));
  const total = selected.reduce((sum, sellable) => sum + (sellable.offers[0]?.unitPrice ?? 0), 0);
  const valid = Boolean(flightId && flightInventoryId && seat && lodgingId);

  async function buy(): Promise<void> {
    if (!flight || !concert || !lodging || !seat || !valid) return;
    const lines: HoldLineRequest[] = [
      {
        ...lineFor(flightSellable),
        subjects: [{ inventoryId: flightInventoryId }],
      },
      {
        ...lineFor(seat.sellable),
        subjects: [{ inventoryId: seat.inventory.id }],
      },
      ...selectedActivities.map(({ sellable, inventory }) => ({
        ...lineFor(sellable),
        subjects: [{ inventoryId: inventory.id }],
      })),
      {
        ...lineFor(findSellable(lodging, lodgingId)),
        intervalStart: `${item.startsOn}T15:00:00`,
        intervalEnd: `${item.endsOn}T11:00:00`,
      },
    ];
    setPending(true);
    setMessage(null);
    try {
      setOrder(await purchasePackage(lines));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "패키지를 예약하지 못했습니다");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <Link href="/buy" className="text-sm text-muted-foreground hover:text-foreground">상품 목록</Link>
      <header className="space-y-3">
        <div className="flex gap-2">
          <Badge>패키지</Badge>
          <Badge variant="outline">DB 실구매 흐름</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{item.name}</h1>
        <p className="text-muted-foreground">{item.summary}</p>
        <p className="text-sm font-medium">{item.startsOn} → {item.endsOn} · 2박 3일</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {flight ? (
            <ChoiceCard component={flight}>
              <DayCalendar
                day={flightDay}
                disabled={(date) => {
                  const day = localDay(date);
                  return !flight.product.sellables.some((sellable) =>
                    sellable.inventories.some((inventory) => dayOf(inventory) === day && (inventory.onHand ?? 0) > 0),
                  );
                }}
                onChange={(day) => {
                  setFlightDay(day);
                  const available = flight.product.sellables.find((sellable) =>
                    sellable.inventories.some((inventory) => dayOf(inventory) === day && (inventory.onHand ?? 0) > 0),
                  );
                  if (!available) return;
                  setFlightId(available.id);
                  setFlightInventoryId(available.inventories.find((inventory) => dayOf(inventory) === day)?.id ?? "");
                }}
              />
              <Select
                value={flightId}
                onChange={(id) => {
                  setFlightId(id);
                  const inventory = findSellable(flight, id)?.inventories.find((entry) => dayOf(entry) === flightDay);
                  setFlightInventoryId(inventory?.id ?? "");
                }}
                options={flight.product.sellables}
              />
              <ScheduleSelect
                value={flightInventoryId}
                onChange={setFlightInventoryId}
                options={flightInventories}
              />
            </ChoiceCard>
          ) : null}
          {concert ? (
            <ChoiceCard component={concert}>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {concert.product.sellables.flatMap((sellable) =>
                  sellable.inventories.map((inventory) => (
                    <Button
                      key={inventory.id}
                      type="button"
                      size="sm"
                      variant={seatId === inventory.id ? "default" : "outline"}
                      disabled={inventory.state !== "free" || Boolean(order)}
                      onClick={() => setSeatId(inventory.id)}
                    >
                      {inventory.grade} {inventory.label}
                    </Button>
                  )),
                )}
              </div>
            </ChoiceCard>
          ) : null}
          {activities.map((activity) => {
            const choice = activityChoices[activity.id];
            const sellable = findSellable(activity, choice?.sellableId ?? "");
            return (
              <ChoiceCard key={activity.id} component={activity}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={choice?.included ?? false}
                    disabled={Boolean(order)}
                    onChange={(event) => updateActivity(activity.id, { included: event.target.checked })}
                  />
                  이 관광 상품 추가
                </label>
                {choice?.included ? (
                  <>
                    {activity.product.sellables.length > 1 ? (
                      <Select
                        value={choice.sellableId}
                        onChange={(sellableId) => {
                          const next = findSellable(activity, sellableId);
                          updateActivity(activity.id, {
                            sellableId,
                            inventoryId: next?.inventories[0]?.id ?? "",
                          });
                        }}
                        options={activity.product.sellables}
                      />
                    ) : null}
                    <ScheduleSelect
                      value={choice.inventoryId}
                      onChange={(inventoryId) => updateActivity(activity.id, { inventoryId })}
                      options={sellable?.inventories ?? []}
                    />
                  </>
                ) : null}
              </ChoiceCard>
            );
          })}
          {lodging ? (
            <ChoiceCard component={lodging}>
              <Select value={lodgingId} onChange={setLodgingId} options={lodging.product.sellables} />
              <p className="text-xs text-muted-foreground">11월 20일 체크인 · 11월 22일 체크아웃</p>
            </ChoiceCard>
          ) : null}
          {order ? <OrderCard order={order} /> : null}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader><CardTitle>한 주문으로 예약</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {selected.map((sellable) => (
                  <li key={sellable.id} className="flex justify-between gap-3">
                    <span>{sellable.name}</span>
                    <span>{won(sellable.offers[0]?.unitPrice ?? 0)}</span>
                  </li>
                ))}
              </ul>
              <p className="border-t pt-3 text-lg font-semibold">{won(total)}</p>
              {message ? <p className="text-sm text-destructive">{message}</p> : null}
              <Button className="w-full" disabled={!valid || pending || Boolean(order)} onClick={() => void buy()}>
                {pending ? "재고를 점유하는 중" : order ? "예약 완료" : "패키지 예약"}
              </Button>
              <p className="text-xs text-muted-foreground">
                모든 구성품을 같은 DB 트랜잭션에서 점유한 뒤 한 번에 결제 확정합니다.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );

  function updateActivity(
    activityId: string,
    patch: Partial<{ included: boolean; sellableId: string; inventoryId: string }>,
  ): void {
    setActivityChoices((current) => ({
      ...current,
      [activityId]: { ...current[activityId], ...patch },
    }));
  }
}

function ChoiceCard({ component: value, children }: { component: PackageComponentView; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{roleLabel[value.role]}</CardTitle>
          <Badge variant={value.required ? "secondary" : "outline"}>{value.required ? "필수" : "선택"}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{value.product.name}</p>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function ScheduleSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: InventoryView[];
}) {
  return (
    <select
      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id} disabled={(option.onHand ?? 0) < 1}>
          {option.label} · 잔여 {option.onHand ?? 0}
        </option>
      ))}
    </select>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: SellableView[] }) {
  return (
    <select
      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name} · {won(option.offers[0]?.unitPrice ?? 0)}
        </option>
      ))}
    </select>
  );
}

function OrderCard({ order }: { order: QuantityOrder }) {
  return (
    <Card>
      <CardHeader><CardTitle>예약 완료</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="font-mono text-xs">{order.id}</p>
        <p>{order.lines.length}개 구성품 · 상태 {order.status}</p>
        <ul className="space-y-1">
          {order.lines.map((line) => <li key={line.id}>{line.productName} — {won(line.amountDueNow)}</li>)}
        </ul>
        <p className="font-semibold">결제 {won(order.paymentAmount ?? 0)}</p>
      </CardContent>
    </Card>
  );
}

function component(item: PackageProductView, role: PackageComponentView["role"]): PackageComponentView | undefined {
  return item.components.find((entry) => entry.role === role);
}

function findSellable(componentValue: PackageComponentView, id: string): SellableView | undefined {
  return componentValue.product.sellables.find((sellable) => sellable.id === id);
}

function lineFor(sellable: SellableView | undefined): HoldLineRequest {
  return { sellableId: sellable?.id ?? "", offerId: sellable?.offers[0]?.id, quantity: 1 };
}

function firstFreeSeat(componentValue: PackageComponentView | undefined) {
  if (!componentValue) return null;
  for (const sellable of componentValue.product.sellables) {
    const inventory = sellable.inventories.find((entry) => entry.state === "free");
    if (inventory) return { sellable, inventory };
  }
  return null;
}

function initialActivityChoices(activities: PackageComponentView[]) {
  return Object.fromEntries(activities.map((activity) => {
    const sellable = activity.product.sellables[0];
    return [activity.id, {
      included: false,
      sellableId: sellable?.id ?? "",
      inventoryId: sellable?.inventories[0]?.id ?? "",
    }];
  }));
}

function dayOf(inventory: InventoryView | undefined): string | null {
  return inventory?.startsAt?.slice(0, 10) ?? null;
}

function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
