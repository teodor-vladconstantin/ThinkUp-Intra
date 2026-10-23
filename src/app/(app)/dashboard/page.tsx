import Link from "next/link";
import { redirect } from "next/navigation";
import { AnnouncementBanner } from "@/components/announcements/announcement-banner";
import { SectionLabel } from "@/components/section-label";
import { AlertBadge, AlertBanner } from "@/components/tasks/alert-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activeAnnouncements } from "@/lib/announcements";
import { requireProfile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { createUserClient } from "@/lib/supabase/server";
import { listTasks } from "@/lib/tasks-server";

export default async function DashboardPage() {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");
  const firstName = profile.fullName?.split(" ")[0];

  // Open tasks assigned to me (the alert banner counts come from the same rows) + active announcements.
  const db = createUserClient();
  const [mine, announcements] = await Promise.all([
    listTasks(db, (q) => q.eq("assignee_id", profile.clerkId).neq("status", "done")),
    activeAnnouncements(db),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <SectionLabel>Panou</SectionLabel>
        <h1 className="font-display text-4xl italic">Bună{firstName ? `, ${firstName}` : ""}!</h1>
      </div>

      <AnnouncementBanner items={announcements} />

      <AlertBanner
        overdue={mine.filter((t) => t.alert === "overdue").length}
        dueSoon={mine.filter((t) => t.alert === "due_soon").length}
      />

      <div className="grid gap-4">
        <Card data-tour="dash-tasks">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Sarcinile mele</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/tasks">Toate</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nicio sarcină deschisă.</p>
            ) : (
              <ul className="divide-y text-sm">
                {mine.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/tasks/${t.id}`} className="min-w-0 truncate font-medium hover:text-primary">
                      {t.title}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {t.deadline && formatDate(t.deadline)}
                      <AlertBadge alert={t.alert} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
