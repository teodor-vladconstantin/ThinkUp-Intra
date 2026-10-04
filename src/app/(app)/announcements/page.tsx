import { redirect } from "next/navigation";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
import { SectionLabel } from "@/components/section-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activeAnnouncements } from "@/lib/announcements";
import { requireProfile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { canManageOwn, canPostAnnouncement } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { archiveAnnouncement } from "./actions";

export default async function AnnouncementsPage() {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  const items = await activeAnnouncements(createUserClient());

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Anunțuri</SectionLabel>
        <h1 className="text-2xl font-semibold">Anunțuri</h1>
      </div>

      {canPostAnnouncement(profile) && (
        <Card>
          <CardHeader>
            <CardTitle>Anunț nou</CardTitle>
          </CardHeader>
          <CardContent>
            <AnnouncementForm />
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Niciun anunț activ.</p>
      ) : (
        <ul className="grid gap-3">
          {items.map((a) => (
            <li key={a.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold">
                  {a.important && <span className="mr-2 rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">Important</span>}
                  {a.title}
                </p>
                {canManageOwn(profile, a.author_id) && (
                  <form action={archiveAnnouncement}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" variant="ghost" size="sm">Arhivează</Button>
                  </form>
                )}
              </div>
              {a.body && <p className="mt-2 text-sm whitespace-pre-wrap">{a.body}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                {a.author?.full_name ?? "—"} · {formatDate(a.starts_at)}
                {a.expires_at && ` · expiră pe ${formatDate(a.expires_at)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
