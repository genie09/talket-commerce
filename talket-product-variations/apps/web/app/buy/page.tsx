import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  archetypeDescriptions,
  archetypeLabels,
  archetypes,
  catalog,
} from "@/lib/catalog";
import { won } from "@/lib/format";

export default function BuyPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">구매</h1>
        <p className="max-w-2xl text-muted-foreground">
          화면은 업종이 아니라 재고를 점유하는 방식으로 나뉩니다. 상품 안에서 v1 기본과 v2 통용 UI를 바꿔 볼 수 있고, 구매 뒤에는 환불이 붙습니다. 수량형만 판매 API에 연결됩니다.
        </p>
      </div>
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
                        <Badge variant="outline">{archetype === "quantity" ? "판매 API" : "화면 시연"}</Badge>
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
