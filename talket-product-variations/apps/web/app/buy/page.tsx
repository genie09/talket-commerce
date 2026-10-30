import Link from "next/link";
import type { PackageProductView } from "@talket/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  archetypeDescriptions,
  archetypeLabels,
  archetypes,
  catalog,
} from "@/lib/catalog";
import { won } from "@/lib/format";

export const dynamic = "force-dynamic";

async function loadPackages(): Promise<PackageProductView[]> {
  try {
    const response = await fetch("http://127.0.0.1:3001/packages", { cache: "no-store" });
    if (!response.ok) return [];
    const body = (await response.json()) as { packages?: PackageProductView[] };
    return body.packages ?? [];
  } catch {
    return [];
  }
}

export default async function BuyPage() {
  const packages = await loadPackages();
  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">구매</h1>
        <p className="max-w-2xl text-muted-foreground">
          화면은 업종이 아니라 재고를 점유하는 방식으로 나뉩니다. 패키지 예시는 서로 다른 점유 방식을 한 주문과 DB 트랜잭션으로 묶습니다.
        </p>
      </div>
      {packages.length > 0 ? (
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-medium">묶음 상품</h2>
            <p className="text-sm text-muted-foreground">항공·지정좌석·관광 슬롯·숙박 구간을 실제 재고에 연결한 구매 흐름입니다.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {packages.map((item) => (
              <Link key={item.id} href={`/buy/packages/${item.slug}`}>
                <Card className="h-full border-primary/30 transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle>{item.name}</CardTitle>
                      <Badge>DB 연결</Badge>
                    </div>
                    <CardDescription>{item.summary}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {item.startsOn} → {item.endsOn} · 구성품 {item.components.length}개
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {archetypes.map((archetype) => (
        <section key={archetype} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-medium">{archetypeLabels[archetype]}</h2>
            <p className="text-sm text-muted-foreground">{archetypeDescriptions[archetype]}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {catalog
              .filter((product) => product.archetype === archetype)
              .map((product) => (
                <Link key={product.id} href={`/buy/${product.id}`} className="block">
                  <Card className="h-full transition-colors hover:bg-muted/40">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>{product.name}</CardTitle>
                        <Badge variant="outline">{archetype === "quantity" ? "판매 API" : "개별 UI 예시"}</Badge>
                      </div>
                      <CardDescription>{product.summary}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium">
                        {product.archetype === "session-seat" ? `${won(product.unitPrice)}부터` : won(product.unitPrice)}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {product.archetype === "session-seat" ? "좌석 등급별" : product.priceNote}
                        </span>
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </section>
      ))}
    </main>
  );
}
