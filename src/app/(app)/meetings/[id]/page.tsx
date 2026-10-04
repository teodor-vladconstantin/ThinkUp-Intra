import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { DecisionForm } from "@/components/meetings/decision-form";
import { MeetingForm } from "@/components/meetings/meeting-form";
import { SectionLabel } from "@/components/section-label";
import { TaskCard } from "@/components/tasks/task-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { dateInputValue, formatDate } from "@/lib/dates";
import { MEETING_SELECT, meetingLabel, type Meeting } from "@/lib/meetings";
import { canWriteMeeting } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { listTasks } from "@/lib/tasks-server";
import { updateMeeting } from "../actions";

type Decision = { id: string; text: string; decided_at: string; author: { full_name: string | null } | null };

export default async function MeetingPage(props: PageProps<"/meetings/[id]">) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();

  // If RLS hides the meeting, it does not exist for this user.
  const db = createUserClient();
  const { data } = await db.from("meetings").select(MEETING_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const meeting = data as unknown as Meeting;

  const [decisions, tasks, people] = await Promise.all([
    db.from("decisions").select("id, text, decided_at, author:profiles!author_id(full_name)").eq("meeting_id", id).order("decided_at"),
    listTasks(db, (q) => q.eq("meeting_id", id)),
    db.from("profiles").select("clerk_id, full_name, department_id, role, is_active").order("full_name"),
  ]);

  const editable = canWriteMeeting(profile, meeting.kind, meeting.department_id);
  const names = new Map((people.data ?? []).map((p) => [p.clerk_id, p.full_name ?? "—"]));
  const target = meeting.kind === "cd" ? "cd" : `dept:${meeting.department_id}`;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Ședință {meetingLabel(meeting)}</SectionLabel>
        <h1 className="text-2xl font-semibold">{meeting.title}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(meeting.held_at)} · minuta de {meeting.author?.full_name ?? "—"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Minuta</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Plain text on purpose: no markdown renderer, no HTML injection risk. */}
              {meeting.minutes ? (
                <p className="text-sm whitespace-pre-wrap">{meeting.minutes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Fără minută.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Sarcini din ședință</CardTitle>
              {editable && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/tasks/new?meeting=${meeting.id}`}>Adaugă sarcină</Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio sarcină.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {tasks.map((t) => (
                    <TaskCard key={t.id} task={t} viewer={profile} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {editable && (
            <Card>
              <CardHeader>
                <CardTitle>Editează minuta</CardTitle>
              </CardHeader>
              <CardContent>
                <MeetingForm
                  action={updateMeeting}
                  mode="edit"
                  targets={[{ value: target, label: meetingLabel(meeting), kind: meeting.kind, departmentId: meeting.department_id }]}
                  people={(people.data ?? []).filter((p) => p.is_active && p.role !== "student")}
                  defaults={{
                    id: meeting.id,
                    title: meeting.title,
                    heldAt: dateInputValue(meeting.held_at),
                    minutes: meeting.minutes,
                    attendees: meeting.attendees,
                    target,
                  }}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Participanți</CardTitle>
            </CardHeader>
            <CardContent>
              {meeting.attendees.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nemarcați.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {meeting.attendees.map((a) => (
                    <li key={a}>{names.get(a) ?? "—"}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Decizii</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {(decisions.data as unknown as Decision[] | null)?.map((d) => (
                  <li key={d.id}>{d.text}</li>
                ))}
              </ol>
              {editable && <DecisionForm meetingId={meeting.id} />}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
