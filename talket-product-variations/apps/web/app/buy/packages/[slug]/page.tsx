import { notFound } from "next/navigation";
import { PackagePurchase } from "@/components/purchase/package-purchase";
import { loadPackage } from "@/lib/package-api";

export const dynamic = "force-dynamic";

export default async function PackagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await loadPackage(slug);
  if (!item) notFound();
  return <PackagePurchase item={item} />;
}
