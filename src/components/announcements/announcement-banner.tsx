import { Megaphone } from "lucide-react";
import type { Announcement } from "@/lib/announcements";
import { cn } from "@/lib/utils";

// Dashboard banner (PRD 5.6): shown until archived or expired. Important ones stand out.
export function AnnouncementBanner({ items }: { items: Announcement[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Anunțuri" className="grid gap-2">
      {items.map((a) => (
        <div
          key={a.id}
          className={cn(
            "flex gap-3 rounded-xl p-4 text-sm",
            a.important ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]" : "border bg-card",
          )}
        >
          <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">{a.title}</p>
            {a.body && <p className="whitespace-pre-wrap opacity-90">{a.body}</p>}
          </div>
        </div>
      ))}
    </section>
  );
}
