import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionLabel } from "@/components/section-label";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { MEETING_SELECT, meetingLabel, meetingTargets, type Meeting } from "@/lib/meetings";
import { createUserClient } from "@/lib/supabase/server";

// RLS (meetings_read) decides the list: CD meetings for CD, department meetings for that department.
export default async function MeetingsPage() {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  const db = createUserClient();
  const [{ data }, { data: departments }] = await Promise.all([
    db.from("meetings").select(MEETING_SELECT).order("held_at", { ascending: false }).limit(100),
    db.from("departments").select("id, name"),
  ]);
  const meetings = (data ?? []) as unknown as Meeting[];
  const canCreate = meetingTargets(profile, departments ?? []).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <SectionLabel>Ședințe</SectionLabel>
          <h1 className="text-2xl font-semibold">Ședințe și minute</h1>
        </div>
        {canCreate && (
          <Button asChild data-tour="new-meeting">
            <Link href="/meetings/new">Ședință nouă</Link>
          </Button>
        )}
      </div>

      {meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nicio ședință încă.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {meetings.map((m) => (
            <li key={m.id}>
              <Link href={`/meetings/${m.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-muted/50">
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary uppercase">{meetingLabel(m)}</span>
                <span className="min-w-0 flex-1 font-medium">{m.title}</span>
                <time className="text-sm text-muted-foreground" dateTime={m.held_at}>
                  {formatDate(m.held_at)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
