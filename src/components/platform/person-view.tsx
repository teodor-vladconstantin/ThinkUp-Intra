import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionLabel } from "@/components/section-label";
import { ActionButton, ActionForm, FileUpload, ProgressSelect, fieldClass } from "@/components/platform/controls";
import { StreakCard } from "@/components/platform/streak-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { CRITERIA, MAX_CHALLENGE_SCORE, isPlatformMentor, platformPeople, schoolYear, signedUrls } from "@/lib/platform";
import { createUserClient } from "@/lib/supabase/server";
import {
  addObjective,
  archiveWarning,
  deleteObjective,
  giveBonus,
  givePuzzlePiece,
  issueWarning,
  saveProfile,
  setAvatar,
  setObjectiveProgress,
} from "@/app/platform/actions";
import { DatePicker } from "@/components/ui/date-picker";

const SOCIAL_LABELS: Record<string, string> = { github: "GitHub", linkedin: "LinkedIn", instagram: "Instagram", website: "Site" };

type PlatformProfile = { bio: string | null; social: Record<string, string>; avatar_path: string | null };
type Grade = {
  score: number; innovation: number; impact: number; feedback_score: number; efficiency: number;
  feedback: string | null; graded_at: string; challenge: { name: string; deadline: string | null; created_at: string } | null;
};
type Bonus = { id: string; points: number; reason: string; awarded_at: string };
type Warning = { id: string; body: string; issued_by: string; archived: boolean; created_at: string };
type Objective = { id: string; name: string; description: string | null; progress: number; deadline: string | null };

// One person on the platform. Self: edit profile, avatar, objectives. PN mentors: warnings,
// puzzle pieces, and the private parts (grades, objectives). RLS returns those parts only to
// the person themself and to PN, so for anyone else the queries simply come back empty.
export async function PersonView({ me, personId }: { me: Profile; personId: string }) {
  const db = createUserClient();
  const people = await platformPeople(db);
  const person = people.list.find((p) => p.clerk_id === personId);
  if (!person) notFound(); // not on the platform, or not visible to me

  const self = personId === me.clerkId;
  const mentor = isPlatformMentor(me);

  const [profile, pieces, projects, grades, warnings, objectives, challenges, bonuses] = await Promise.all([
    db.from("platform_profiles").select("bio, social, avatar_path").eq("profile_id", personId).maybeSingle(),
    db.from("puzzle_pieces").select("piece").eq("profile_id", personId).order("piece"),
    db.from("project_members").select("project:projects(id, name, archived)").eq("profile_id", personId),
    db.from("submissions").select("score, innovation, impact, feedback_score, efficiency, feedback, graded_at, challenge:challenges(name, deadline, created_at)").eq("student_id", personId).order("graded_at", { ascending: false }),
    db.from("warnings").select("id, body, issued_by, archived, created_at").eq("student_id", personId).order("created_at", { ascending: false }),
    db.from("personal_objectives").select("id, name, description, progress, deadline").eq("owner_id", personId).order("created_at"),
    db.from("challenges").select("deadline, created_at"),
    db.from("bonus_points").select("id, points, reason, awarded_at").eq("student_id", personId).order("awarded_at", { ascending: false }),
  ]);
  // Yearly total: grades of the school year's challenges + bonuses; max = 20 per challenge that year.
  const gradeRows = (grades.data ?? []) as unknown as Grade[];
  const bonusRows = (bonuses.data ?? []) as Bonus[];
  const years = new Map<number, { score: number; max: number; bonus: number }>();
  const year = (y: number) => years.get(y) ?? years.set(y, { score: 0, max: 0, bonus: 0 }).get(y)!;
  for (const c of challenges.data ?? []) year(schoolYear(c.deadline ?? c.created_at)).max += MAX_CHALLENGE_SCORE;
  for (const g of gradeRows) if (g.challenge) year(schoolYear(g.challenge.deadline ?? g.challenge.created_at)).score += g.score;
  for (const b of bonusRows) year(schoolYear(b.awarded_at)).bonus += b.points;
  const pp = (profile.data ?? { bio: null, social: {}, avatar_path: null }) as PlatformProfile;
  const avatar = pp.avatar_path ? (await signedUrls(db, "avatars", [pp.avatar_path])).get(pp.avatar_path) : undefined;
  const projectRows = ((projects.data ?? []) as unknown as { project: { id: string; name: string; archived: boolean } | null }[])
    .map((r) => r.project)
    .filter((p): p is { id: string; name: string; archived: boolean } => !!p && !p.archived);
  const privateVisible = self || mentor;
  const thisYear = years.get(schoolYear(new Date().toISOString()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
          <img src={avatar} alt="" className="size-20 rounded-full object-cover" />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-full bg-accent text-2xl font-semibold text-primary" aria-hidden>
            {(person.full_name ?? "?").slice(0, 1)}
          </div>
        )}
        <div className="space-y-2">
          <SectionLabel>{self ? "Profilul meu" : "Profil"}</SectionLabel>
          <h1 className="text-2xl font-semibold">
            {person.full_name ?? "—"} {person.is_mentor && <Badge>Mentor</Badge>}
          </h1>
          <div className="flex flex-wrap gap-3 text-sm">
            {Object.entries(pp.social ?? {}).map(([k, v]) => (
              <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {SOCIAL_LABELS[k] ?? k}
              </a>
            ))}
          </div>
        </div>
      </div>
      {pp.bio && <p className="whitespace-pre-wrap text-sm">{pp.bio}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {privateVisible && <StreakCard personId={personId} points={(thisYear?.score ?? 0) + (thisYear?.bonus ?? 0)} />}
        <Card data-tour="person-projects">
          <CardHeader>
            <CardTitle>Proiecte</CardTitle>
          </CardHeader>
          <CardContent>
            {projectRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Niciun proiect activ.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {projectRows.map((p) => (
                  <li key={p.id}>
                    <Link href={`/platform/projects/${p.id}`} className="text-primary hover:underline">
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Puzzle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(pieces.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nicio piesă încă.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {(pieces.data ?? []).map((p) => (
                  <li key={p.piece}>
                    <Badge variant="secondary">🧩 {p.piece}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {mentor && !self && (
              <ActionForm action={givePuzzlePiece} submitLabel="Acordă piesa" className="sm:grid-cols-[1fr_auto]">
                <input type="hidden" name="profileId" value={personId} />
                <Input name="piece" type="number" min={1} required placeholder="Nr. piesă" aria-label="Număr piesă" />
              </ActionForm>
            )}
          </CardContent>
        </Card>

        {privateVisible && (
          <Card>
            <CardHeader>
              <CardTitle>Note</CardTitle>
            </CardHeader>
            <CardContent>
              {[...years].sort((a, b) => b[0] - a[0]).map(([y, t]) => (
                <p key={y} className="mb-2 text-sm font-medium">
                  {y}–{y + 1}: {t.score + t.bonus} / {t.max}
                  {t.bonus > 0 && <span className="font-normal text-muted-foreground"> (din care {t.bonus} bonus)</span>}
                </p>
              ))}
              {gradeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio notă încă.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {gradeRows.map((g, i) => (
                    <li key={i}>
                      <span className="font-medium">{g.score}</span> / {MAX_CHALLENGE_SCORE}
                      {g.challenge && ` · ${g.challenge.name}`}
                      <span className="text-muted-foreground"> · {formatDate(g.graded_at)}</span>
                      <p className="text-muted-foreground">{CRITERIA.map((c) => `${c.label} ${g[c.key]}`).join(" · ")}</p>
                      {g.feedback && <p className="whitespace-pre-wrap text-muted-foreground">{g.feedback}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {bonusRows.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {bonusRows.map((b) => (
                    <li key={b.id}>
                      <Badge variant="secondary">+{b.points} bonus</Badge> {b.reason}
                      <span className="text-muted-foreground"> · {formatDate(b.awarded_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {mentor && !self && (
                <ActionForm action={giveBonus} submitLabel="Acordă bonus" className="mt-3">
                  <input type="hidden" name="profileId" value={personId} />
                  <Input name="points" type="number" min={1} max={100} required placeholder="Puncte" aria-label="Puncte bonus" />
                  <Input name="reason" required maxLength={300} placeholder="Motiv (ex. afiș)" aria-label="Motiv" />
                </ActionForm>
              )}
            </CardContent>
          </Card>
        )}

        {privateVisible && (
          <Card>
            <CardHeader>
              <CardTitle>Avertismente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {((warnings.data ?? []) as Warning[]).filter((w) => !w.archived).length === 0 && <p className="text-sm text-muted-foreground">Niciun avertisment activ.</p>}
              <ul className="space-y-2 text-sm">
                {((warnings.data ?? []) as Warning[])
                  .filter((w) => !w.archived)
                  .map((w) => (
                    <li key={w.id}>
                      <p className="whitespace-pre-wrap">{w.body}</p>
                      <p className="text-muted-foreground">
                        {people.name(w.issued_by)} · {formatDate(w.created_at)}
                        {mentor && (
                          <ActionButton action={archiveWarning.bind(null, w.id)} confirmText="Arhivezi?">
                            Arhivează
                          </ActionButton>
                        )}
                      </p>
                    </li>
                  ))}
              </ul>
              {mentor && !self && (
                <ActionForm action={issueWarning} submitLabel="Dă avertisment">
                  <input type="hidden" name="studentId" value={personId} />
                  <textarea name="body" required rows={2} maxLength={2000} placeholder="Motiv" aria-label="Motiv" className={fieldClass} />
                </ActionForm>
              )}
            </CardContent>
          </Card>
        )}

        {privateVisible && (
          <Card className="lg:col-span-2" data-tour="person-goals">
            <CardHeader>
              <CardTitle>Obiective personale</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(objectives.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Niciun obiectiv.</p>}
              <ul className="space-y-2 text-sm">
                {((objectives.data ?? []) as Objective[]).map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{o.name}</span>
                      {o.deadline && <span className="text-muted-foreground"> · până la {formatDate(o.deadline)}</span>}
                      {o.description && <span className="block text-muted-foreground">{o.description}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      {self ? <ProgressSelect value={o.progress} action={setObjectiveProgress.bind(null, o.id)} /> : <span>{o.progress}%</span>}
                      {self && (
                        <ActionButton action={deleteObjective.bind(null, o.id)} confirmText="Sigur?">
                          Șterge
                        </ActionButton>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {self && (
                <ActionForm action={addObjective} submitLabel="Adaugă obiectiv">
                  <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                    <Input name="name" required maxLength={200} placeholder="Obiectiv nou" aria-label="Obiectiv" />
                    <DatePicker name="deadline" aria-label="Termen" placeholder="Termen (opțional)" />
                  </div>
                  <Input name="description" maxLength={2000} placeholder="Detalii (opțional)" aria-label="Detalii" />
                </ActionForm>
              )}
            </CardContent>
          </Card>
        )}

        {self && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Editează profilul</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileUpload bucket="avatars" folder={me.clerkId} accept="image/png,image/jpeg,image/webp,image/gif" label="Schimbă poza" complete={setAvatar} />
              <ActionForm action={saveProfile} submitLabel="Salvează profilul" keep>
                <textarea name="bio" rows={3} maxLength={2000} defaultValue={pp.bio ?? ""} placeholder="Despre tine" aria-label="Despre tine" className={fieldClass} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(SOCIAL_LABELS).map(([k, label]) => (
                    <Input key={k} name={k} type="url" maxLength={300} defaultValue={pp.social?.[k] ?? ""} placeholder={`${label} (https://…)`} aria-label={label} />
                  ))}
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
