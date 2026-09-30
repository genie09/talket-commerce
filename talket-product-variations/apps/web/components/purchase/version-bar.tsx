"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import type { CatalogProduct } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export type PurchaseVersion = "1" | "2";

export function VersionBar({ version, product }: { version: PurchaseVersion; product: CatalogProduct }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2">
        <Link href={pathname} className={cn(buttonVariants({ size: "sm", variant: version === "1" ? "default" : "outline" }))}>
          v1 기본
        </Link>
        <Link
          href={`${pathname}?v=2`}
          className={cn(buttonVariants({ size: "sm", variant: version === "2" ? "default" : "outline" }))}
        >
          v2 통용 UI
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">{version === "1" ? "숫자와 버튼으로 고릅니다." : v2Note(product)}</p>
    </div>
  );
}

function v2Note(product: CatalogProduct): string {
  switch (product.archetype) {
    case "quantity":
      return "수량형에 통용되는 전용 라이브러리는 없습니다. 상품 페이지 배치만 바꿉니다.";
    case "session-seat":
      return "좌석표는 react-seat-picker입니다.";
    case "time-slot":
      return "날짜는 React DayPicker이고, 고른 날의 슬롯을 이어서 봅니다.";
    case "interval":
      return product.unit === "night"
        ? "날짜 범위는 React DayPicker입니다. 가로줄은 이미 점유한 밤입니다."
        : "날짜는 React DayPicker이고, 시간은 칸을 이어서 범위로 고릅니다.";
    case "shipping":
      return "배송지 전용 라이브러리는 없습니다. 수량 다음에 주소를 받습니다.";
  }
}
