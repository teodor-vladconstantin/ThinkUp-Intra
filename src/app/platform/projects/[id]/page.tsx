import { notFound } from "next/navigation";
import { z } from "zod";
import { SectionLabel } from "@/components/section-label";
import { ActionButton, ActionForm, FileUpload, ProgressSelect, fieldClass } from "@/components/platform/controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate, formatDateTime } from "@/lib/dates";
import { CRITERIA, MAX_CHALLENGE_SCORE, isPlatformMentor, platformPeople, requirePlatformProfile, signedUrls } from "@/lib/platform";
import { createUserClient } from "@/lib/supabase/server";
import {
  addFeedback,
  addGoal,
  addMember,
  addProjectPhoto,
  addReview,
  deleteFeedback,
  deleteGoal,
  deleteProjectPhoto,
  deleteReview,
  gradeProject,
  removeMember,
  setGoalProgress,
  setProjectArchived,
  setProjectSummary,
  setThumbnail,
  updateProject,
} from "../../actions";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";

type Project = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  challenge_id: string | null;
  thumbnail_path: string | null;
  summary_path: string | null;
  summary_name: string | null;
  accept_reviews: boolean;
  archived: boolean;
  created_at: string;
};
type Goal = { id: string; name: string; description: string | null; progress: number; deadline: string | null };
type Review = { id: string; author_id: string; rating: number; body: string | null; created_at: string };
type Feedback = { id: string; mentor_id: string; body: string; created_at: string };
type Grade = { student_id: string; score: number; innovation: number; impact: number; feedback_score: number; efficiency: number; challenge: { name: string } | null };

export default async function ProjectPage(props: PageProps<"/platform/projects/[id]">) {
  const me = await requirePlatformProfile();
  const pid = z.uuid().safeParse((await props.params).id);
  if (!pid.success) notFound();

  const db = createUserClient();
  const { data } = await db
    .from("projects")
    .select("id, name, description, created_by, challenge_id, thumbnail_path, summary_path, summary_name, accept_reviews, archived, created_at")
    .eq("id", pid.data)
    .maybeSingle();
  if (!data) notFound();
  const project = data as Project;
  const mentor = isPlatformMentor(me);

  const [members, photos, goals, reviews, feedback, challenges, grades, people] = await Promise.all([
    db.from("project_members").select("profile_id").eq("project_id", project.id),
    db.from("project_photos").select("id, storage_path").eq("project_id", project.id).order("created_at"),
    db.from("goals").select("id, name, description, progress, deadline").eq("project_id", project.id).order("created_at"),
    db.from("reviews").select("id, author_id, rating, body, created_at").eq("project_id", project.id).order("created_at", { ascending: false }),
    db.from("mentor_feedback").select("id, mentor_id, body, created_at").eq("project_id", project.id).order("created_at", { ascending: false }),
    db.from("challenges").select("id, name").eq("archived", false).order("created_at", { ascending: false }),
    // RLS: PN sees every grade, a student only their own.
    db.from("submissions").select("student_id, score, innovation, impact, feedback_score, efficiency, challenge:challenges(name)").eq("project_id", project.id),
    platformPeople(db),
  ]);

  const memberIds = (members.data ?? []).map((m) => m.profile_id as string);
  const isMember = memberIds.includes(me.clerkId);
  const photoRows = (photos.data ?? []) as { id: string; storage_path: string }[];
  const reviewRows = (reviews.data ?? []) as Review[];
  const challengeRows = (challenges.data ?? []) as { id: string; name: string }[];
  const urls = await signedUrls(db, "project-files", [project.summary_path ?? "", ...photoRows.map((p) => p.storage_path)]);
  const thumb = project.thumbnail_path ? urls.get(project.thumbnail_path) : undefined;
  const avg = reviewRows.length ? (reviewRows.reduce((s, r) => s + r.rating, 0) / reviewRows.length).toFixed(1) : null;
  const canReview = me.isPeerReviewer && !isMember && project.accept_reviews && !project.archived && !reviewRows.some((r) => r.author_id === me.clerkId);
  const candidates = people.list.filter((p) => !memberIds.includes(p.clerk_id));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Proiect</SectionLabel>
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
          <img src={thumb} alt="" className="aspect-[3/1] w-full rounded-xl object-cover" />
        )}
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>creat {formatDate(project.created_at)}</span>
          {project.archived && <Badge variant="secondary">Arhivat</Badge>}
          {avg && <Badge variant="secondary">★ {avg} ({reviewRows.length})</Badge>}
          {project.challenge_id && <Badge>{challengeRows.find((c) => c.id === project.challenge_id)?.name ?? "Challenge"}</Badge>}
        </div>
        {project.description && <p className="whitespace-pre-wrap text-sm">{project.description}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {/* ---------- goals ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Obiective</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(goals.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Niciun obiectiv.</p>}
              <ul className="space-y-3">
                {((goals.data ?? []) as Goal[]).map((g) => (
                  <li key={g.id} className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{g.name}</span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        {g.deadline && <span>până la {formatDate(g.deadline)}</span>}
                        {isMember ? <ProgressSelect value={g.progress} action={setGoalProgress.bind(null, g.id)} /> : <span>{g.progress}%</span>}
                        {isMember && (
                          <ActionButton action={deleteGoal.bind(null, g.id)} confirmText="Sigur?">
                            Șterge
                          </ActionButton>
                        )}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-accent" role="progressbar" aria-valuenow={g.progress} aria-valuemin={0} aria-valuemax={100} aria-label={g.name}>
                      <div className="h-full bg-primary" style={{ width: `${g.progress}%` }} />
                    </div>
                    {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
                  </li>
                ))}
              </ul>
              {isMember && (
                <ActionForm action={addGoal} submitLabel="Adaugă obiectiv">
                  <input type="hidden" name="projectId" value={project.id} />
                  <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                    <Input name="name" required maxLength={200} placeholder="Obiectiv nou" aria-label="Obiectiv" />
                    <DatePicker name="deadline" aria-label="Termen" placeholder="Termen (opțional)" />
                  </div>
                  <textarea name="description" rows={2} maxLength={2000} placeholder="Detalii (opțional)" aria-label="Detalii" className={fieldClass} />
                </ActionForm>
              )}
            </CardContent>
          </Card>

          {/* ---------- summary (PDF) ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Rezumat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!project.summary_path && <p className="text-sm text-muted-foreground">Niciun rezumat încărcat.</p>}
              {project.summary_path && (
                <a href={urls.get(project.summary_path)} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-primary underline-offset-2 hover:underline">
                  📄 {project.summary_name ?? "Rezumat (PDF)"}
                </a>
              )}
              {isMember && !mentor && (
                <div className="flex flex-wrap items-center gap-2">
                  <FileUpload bucket="project-files" folder={project.id} accept="application/pdf" label={project.summary_path ? "Înlocuiește PDF" : "Încarcă PDF"} complete={setProjectSummary.bind(null, project.id)} />
                  {project.summary_path && (
                    <ActionButton action={setProjectSummary.bind(null, project.id, null)} confirmText="Sigur?">
                      Șterge
                    </ActionButton>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---------- photos ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Galerie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {photoRows.length === 0 && <p className="text-sm text-muted-foreground">Nicio poză.</p>}
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {photoRows.map((p) => (
                  <li key={p.id} className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                    <img src={urls.get(p.storage_path)} alt="" className="aspect-square w-full rounded-lg object-cover" />
                    {isMember && (
                      <span className="flex flex-wrap gap-1">
                        {project.thumbnail_path !== p.storage_path && <ActionButton action={setThumbnail.bind(null, project.id, p.storage_path)}>Copertă</ActionButton>}
                        <ActionButton action={deleteProjectPhoto.bind(null, p.id)} confirmText="Sigur?">
                          Șterge
                        </ActionButton>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {isMember && <FileUpload bucket="project-files" folder={project.id} accept="image/*" label="Adaugă poză" complete={addProjectPhoto.bind(null, project.id)} />}
            </CardContent>
          </Card>

          {/* ---------- reviews ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Feedback de la colegi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!project.accept_reviews && <p className="text-sm text-muted-foreground">Proiectul nu acceptă feedback nou.</p>}
              <ul className="space-y-3">
                {reviewRows.map((r) => (
                  <li key={r.id} className="text-sm">
                    <p>
                      <span className="font-medium">{people.name(r.author_id)}</span> · {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)} · <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                      {r.author_id === me.clerkId && (
                        <ActionButton action={deleteReview.bind(null, r.id)} confirmText="Sigur?">
                          Șterge
                        </ActionButton>
                      )}
                    </p>
                    {r.body && <p className="whitespace-pre-wrap text-muted-foreground">{r.body}</p>}
                  </li>
                ))}
              </ul>
              {canReview && (
                <ActionForm action={addReview} submitLabel="Lasă feedback">
                  <input type="hidden" name="projectId" value={project.id} />
                  <Select
                    name="rating"
                    required
                    aria-label="Notă"
                    placeholder="Notă (1–5 stele)"
                    options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: "★".repeat(n) + "☆".repeat(5 - n) }))}
                  />
                  <textarea name="body" rows={2} maxLength={2000} placeholder="Comentariu (opțional)" aria-label="Comentariu" className={fieldClass} />
                </ActionForm>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* ---------- members ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Echipă</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1 text-sm">
                {memberIds.map((m) => (
                  <li key={m} className="flex items-center justify-between gap-2">
                    <a href={`/platform/people/${m}`} className="hover:underline">
                      {people.name(m)}
                      {m === project.created_by && <span className="text-muted-foreground"> · creator</span>}
                    </a>
                    {isMember && m !== project.created_by && (
                      <ActionButton action={removeMember.bind(null, project.id, m)} confirmText="Scoți?">
                        Scoate
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ul>
              {isMember && candidates.length > 0 && (
                <ActionForm action={addMember} submitLabel="Adaugă în echipă">
                  <input type="hidden" name="projectId" value={project.id} />
                  <Select
                    name="profileId"
                    required
                    aria-label="Persoană"
                    options={candidates.map((p) => ({ value: p.clerk_id, label: `${p.full_name ?? "—"}${p.is_mentor ? " (mentor)" : ""}` }))}
                  />
                </ActionForm>
              )}
            </CardContent>
          </Card>

          {/* ---------- mentor feedback ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Feedback mentori</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(feedback.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Niciun feedback încă.</p>}
              <ul className="space-y-3 text-sm">
                {((feedback.data ?? []) as Feedback[]).map((f) => (
                  <li key={f.id}>
                    <p className="text-muted-foreground">
                      {people.name(f.mentor_id)} · {formatDateTime(f.created_at)}
                      {f.mentor_id === me.clerkId && (
                        <ActionButton action={deleteFeedback.bind(null, f.id)} confirmText="Sigur?">
                          Șterge
                        </ActionButton>
                      )}
                    </p>
                    <p className="whitespace-pre-wrap">{f.body}</p>
                  </li>
                ))}
              </ul>
              {mentor && (
                <ActionForm action={addFeedback} submitLabel="Trimite feedback">
                  <input type="hidden" name="projectId" value={project.id} />
                  <textarea name="body" required rows={3} maxLength={5000} placeholder="Feedback pentru echipă" aria-label="Feedback" className={fieldClass} />
                </ActionForm>
              )}
            </CardContent>
          </Card>

          {/* ---------- grades ---------- */}
          {((grades.data ?? []).length > 0 || mentor) && (
            <Card>
              <CardHeader>
                <CardTitle>Note</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-sm">
                  {((grades.data ?? []) as unknown as Grade[]).map((g) => (
                    <li key={g.student_id + (g.challenge?.name ?? "")}>
                      {people.name(g.student_id)}: <span className="font-medium">{g.score}</span>
                      {` / ${MAX_CHALLENGE_SCORE}`}
                      {g.challenge && ` · ${g.challenge.name}`}
                      <span className="text-muted-foreground"> ({CRITERIA.map((c) => `${c.label} ${g[c.key]}`).join(" · ")})</span>
                    </li>
                  ))}
                </ul>
                {mentor && challengeRows.length > 0 && (
                  <ActionForm action={gradeProject} submitLabel="Notează echipa">
                    <input type="hidden" name="projectId" value={project.id} />
                    <Select
                      name="challengeId"
                      required
                      aria-label="Challenge"
                      placeholder="Challenge…"
                      defaultValue={project.challenge_id ?? ""}
                      options={challengeRows.map((c) => ({ value: c.id, label: c.name }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {CRITERIA.map((c) => (
                        <Select
                          key={c.key}
                          name={c.key === "feedback_score" ? "feedbackScore" : c.key}
                          required
                          aria-label={c.label}
                          placeholder={`${c.label} (1–5)`}
                          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                        />
                      ))}
                    </div>
                    <textarea name="feedback" rows={2} maxLength={5000} placeholder="Comentariu (opțional)" aria-label="Comentariu" className={fieldClass} />
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          )}

          {/* ---------- settings ---------- */}
          {isMember && (
            <Card>
              <CardHeader>
                <CardTitle>Setări</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ActionForm action={updateProject} submitLabel="Salvează" keep>
                  <input type="hidden" name="id" value={project.id} />
                  <Input name="name" required maxLength={150} defaultValue={project.name} aria-label="Nume" />
                  <textarea name="description" rows={4} maxLength={5000} defaultValue={project.description ?? ""} aria-label="Descriere" className={fieldClass} />
                  <Select
                    name="challengeId"
                    aria-label="Challenge"
                    defaultValue={project.challenge_id ?? ""}
                    options={[{ value: "", label: "Fără challenge" }, ...challengeRows.map((c) => ({ value: c.id, label: c.name }))]}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox name="acceptReviews" defaultChecked={project.accept_reviews} /> Acceptă feedback de la colegi
                  </label>
                </ActionForm>
                <ActionButton action={setProjectArchived.bind(null, project.id, !project.archived)} variant="outline" confirmText="Confirmă">
                  {project.archived ? "Reactivează proiectul" : "Arhivează proiectul"}
                </ActionButton>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
