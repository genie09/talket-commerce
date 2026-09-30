import { notFound } from "next/navigation";
import { PurchaseScreen } from "@/components/purchase/purchase-screen";
import { findProduct } from "@/lib/catalog";

export default async function ProductPurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { productId } = await params;
  const { v } = await searchParams;
  const product = findProduct(productId);
  if (!product) notFound();
  return <PurchaseScreen product={product} version={v === "2" ? "2" : "1"} />;
}
