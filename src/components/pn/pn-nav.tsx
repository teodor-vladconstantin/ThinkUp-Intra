"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/pn", label: "Hartă" },
  { href: "/pn/schools", label: "Licee" },
  { href: "/pn/ambassadors", label: "Ambasadori" },
  { href: "/pn/zones", label: "Zone" },
];

export function PnNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 text-sm" aria-label="Program Național">
      {TABS.map((t) => {
        const active = t.href === "/pn" ? pathname === "/pn" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1", active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
