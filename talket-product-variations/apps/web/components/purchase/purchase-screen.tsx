"use client";

import { IntervalPurchase } from "@/components/purchase/interval-purchase";
import { QuantityPurchase } from "@/components/purchase/quantity-purchase";
import { SessionSeatPurchase } from "@/components/purchase/session-seat-purchase";
import { ShippingPurchase } from "@/components/purchase/shipping-purchase";
import { TimeSlotPurchase } from "@/components/purchase/time-slot-purchase";
import type { PurchaseVersion } from "@/components/purchase/version-bar";
import type { CatalogProduct } from "@/lib/catalog";

export function PurchaseScreen({ product, version }: { product: CatalogProduct; version: PurchaseVersion }) {
  switch (product.archetype) {
    case "quantity":
      return <QuantityPurchase fixture={product} version={version} />;
    case "session-seat":
      return <SessionSeatPurchase product={product} version={version} />;
    case "time-slot":
      return <TimeSlotPurchase product={product} version={version} />;
    case "interval":
      return <IntervalPurchase product={product} version={version} />;
    case "shipping":
      return <ShippingPurchase product={product} version={version} />;
  }
}
