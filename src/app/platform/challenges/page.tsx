import Link from "next/link";
import { SectionLabel } from "@/components/section-label";
import { ActionButton, ActionForm, fieldClass } from "@/components/platform/controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/dates";
import { MAX_CHALLENGE_SCORE, isPlatformMentor, platformPeople, requirePlatformProfile } from "@/lib/platform";
import { createUserClient } from "@/lib/supabase/server";
import { createChallenge, setChallengeArchived } from "../actions";
import { DatePicker } from "@/components/ui/date-picker";

type Challenge = {
  id: string;
  name: string;
  description: string | null;
  deadline: string | null;
  created_by: string;
  archived: boolean;
  projects: { id: string; name: string; archived: boolean }[];
  submissions: { student_id: string; score: number }[];
};

export default async function ChallengesPage(props: PageProps<"/platform/challenges">) {
  const me = await requirePlatformProfile();
  const archived = (await props.searchParams).archived === "1";
  const mentor = isPlatformMentor(me);

  const db = createUserClient();
  const [{ data }, people] = await Promise.all([
    db
      .from("challenges")
      // submissions: RLS gives PN every grade and a student only their own
      .select("id, name, description, deadline, created_by, archived, projects(id, name, archived), submissions(student_id, score)")
      .eq("archived", archived)
      .order("created_at", { ascending: false }),
    platformPeople(db),
  ]);
  const challenges = (data ?? []) as unknown as Challenge[];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Platforma ambasadorilor</SectionLabel>
        <h1 className="text-2xl font-semibold">Challenge-uri</h1>
        <Link href={archived ? "/platform/challenges" : "/platform/challenges?archived=1"} className="text-sm text-primary hover:underline">
          {archived ? "← Active" : "Vezi arhivate"}
        </Link>
      </div>

      {mentor && !archived && (
        <Card>
          <CardHeader>
            <CardTitle>Challenge nou</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createChallenge} submitLabel="Creează">
              <Input name="name" required maxLength={200} placeholder="Nume" aria-label="Nume" />
              <textarea name="description" rows={3} maxLength={5000} placeholder="Descriere / cerințe" aria-label="Descriere" className={fieldClass} />
              <DatePicker name="deadline" aria-label="Termen" placeholder="Termen (opțional)" />
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {challenges.length === 0 && <p className="text-sm text-muted-foreground">Niciun challenge.</p>}
      <ul className="space-y-4">
        {challenges.map((c) => (
          <li key={c.id}>
            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>{c.name}</CardTitle>
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {c.deadline && <Badge variant="secondary">până la {formatDate(c.deadline)}</Badge>}
                  <Badge variant="secondary">max {MAX_CHALLENGE_SCORE}p</Badge>
                  {mentor && c.created_by === me.clerkId && (
                    <ActionButton action={setChallengeArchived.bind(null, c.id, !c.archived)} confirmText="Confirmă">
                      {c.archived ? "Reactivează" : "Arhivează"}
                    </ActionButton>
                  )}
                </span>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {c.description && <p className="whitespace-pre-wrap">{c.description}</p>}
                <div>
                  <p className="font-medium">Proiecte ({c.projects.filter((p) => !p.archived).length})</p>
                  <ul className="flex flex-wrap gap-2">
                    {c.projects
                      .filter((p) => !p.archived)
                      .map((p) => (
                        <li key={p.id}>
                          <Link href={`/platform/projects/${p.id}`} className="text-primary hover:underline">
                            {p.name}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
                {c.submissions.length > 0 && (
                  <div>
                    <p className="font-medium">{mentor ? "Note" : "Nota ta"}</p>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1">
                      {c.submissions.map((s) => (
                        <li key={s.student_id}>
                          {mentor ? `${people.name(s.student_id)}: ` : ""}
                          <span className="font-medium">{s.score}</span> / {MAX_CHALLENGE_SCORE}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
