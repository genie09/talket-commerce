"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/buy", label: "구매" },
  { href: "/", label: "운영 콘솔" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/buy" className="text-sm font-medium">
          상품 변형
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = link.href === "/buy" ? pathname.startsWith("/buy") : pathname === "/";
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-sm",
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
