"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { isPlatformMentor, storageName, type Bucket } from "@/lib/platform";
import { createUserClient } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message: string } | null;

// Every check here only produces a readable error. RLS on the platform tables and on
// Storage decides in the database (see supabase/migrations/20261005000*_platform_*.sql).
// Server actions are public endpoints: typed arguments are validated too.

const id = z.uuid();
const optionalText = (max: number) => z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().trim().max(max).optional());
const optionalDate = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.iso.date().optional());
const progress = z.coerce.number().int().min(0).max(100);
const fileMeta = z.object({ path: z.string().min(1).max(400), name: z.string().trim().min(1).max(200), type: z.string().max(150).optional() });
const fail = (message: string): FormState => ({ ok: false, message });
const done = (message = "Salvat."): FormState => {
  revalidatePath("/platform", "layout");
  return { ok: true, message };
};

async function actor() {
  const p = await requireProfile();
  return p?.canAccessPlatform ? p : null;
}

// ---------- uploads (browser -> Storage directly, via a signed upload URL) ----------

const BUCKET_FOLDER: Record<Bucket, (folder: string, me: string) => boolean> = {
  "project-files": (f) => id.safeParse(f).success,
  avatars: (f, me) => f === me,
  "open-school": (f) => f === "files",
};

// Created AS the user: Storage checks the INSERT policy now (member of the project,
// own avatar folder, PN for Open School). The browser then uploads with the token.
export async function prepareUpload(bucket: Bucket, folder: string, fileName: string) {
  const me = await actor();
  if (!me) return { ok: false as const, message: "Nu ai acces." };
  if (!(bucket in BUCKET_FOLDER) || !BUCKET_FOLDER[bucket](String(folder), me.clerkId)) return { ok: false as const, message: "Destinație invalidă." };
  if (!z.string().min(1).max(200).safeParse(fileName).success) return { ok: false as const, message: "Nume de fișier invalid." };

  const path = `${folder}/${storageName(fileName)}`;
  const { data, error } = await createUserClient().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return { ok: false as const, message: "Nu ai dreptul să încarci aici." };
  return { ok: true as const, path: data.path, token: data.token };
}

async function removeObject(bucket: Bucket, path: string | null | undefined) {
  // ponytail: row first, object second; a failed remove leaves an orphan file, never a broken row.
  if (path) await createUserClient().storage.from(bucket).remove([path]);
}

// ---------- projects ----------

const projectSchema = z.object({
  name: z.string().trim().min(1, "Numele e obligatoriu").max(150),
  description: optionalText(5000),
  challengeId: z.preprocess((v) => (v === "" || v == null ? undefined : v), id.optional()),
  acceptReviews: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  if (!me) return fail("Nu ai acces.");
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const f = parsed.data;

  const { data, error } = await createUserClient()
    .from("projects")
    .insert({ name: f.name, description: f.description ?? null, challenge_id: f.challengeId ?? null, accept_reviews: f.acceptReviews, created_by: me.clerkId })
    .select("id")
    .single();
  if (error) return fail("Proiectul nu a putut fi creat.");
  revalidatePath("/platform", "layout");
  redirect(`/platform/projects/${data.id}`);
}

export async function updateProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  const pid = id.safeParse(formData.get("id"));
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!me || !pid.success) return fail("Cerere invalidă.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const f = parsed.data;

  const { data, error } = await createUserClient()
    .from("projects")
    .update({ name: f.name, description: f.description ?? null, challenge_id: f.challengeId ?? null, accept_reviews: f.acceptReviews })
    .eq("id", pid.data)
    .select("id");
  if (error || !data?.length) return fail("Doar membrii proiectului îl pot modifica.");
  return done();
}

export async function setProjectArchived(projectId: string, archived: boolean): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(projectId).success || typeof archived !== "boolean") return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("projects").update({ archived }).eq("id", projectId).select("id");
  return data?.length ? done(archived ? "Proiect arhivat." : "Proiect reactivat.") : fail("Nu ai dreptul.");
}

export async function addMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const pid = id.safeParse(formData.get("projectId"));
  const who = z.string().min(1).max(100).safeParse(formData.get("profileId"));
  if (!(await actor()) || !pid.success || !who.success) return fail("Alege o persoană.");
  const { error } = await createUserClient().from("project_members").insert({ project_id: pid.data, profile_id: who.data });
  if (error) return fail(error.code === "23505" ? "E deja membru." : "Nu ai dreptul să adaugi membri.");
  return done("Membru adăugat.");
}

export async function removeMember(projectId: string, profileId: string): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(projectId).success || !z.string().min(1).max(100).safeParse(profileId).success) return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("project_members").delete().eq("project_id", projectId).eq("profile_id", profileId).select("profile_id");
  return data?.length ? done("Membru scos.") : fail("Nu se poate scoate (creatorul rămâne mereu).");
}

// ---------- goals ----------

export async function addGoal(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ projectId: id, name: z.string().trim().min(1, "Numele e obligatoriu").max(200), description: optionalText(2000), deadline: optionalDate })
    .safeParse(Object.fromEntries(formData));
  if (!(await actor())) return fail("Nu ai acces.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const f = parsed.data;
  const { error } = await createUserClient().from("goals").insert({ project_id: f.projectId, name: f.name, description: f.description ?? null, deadline: f.deadline ?? null });
  return error ? fail("Doar membrii adaugă obiective.") : done("Obiectiv adăugat.");
}

export async function setGoalProgress(goalId: string, value: number): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(goalId).success || !progress.safeParse(value).success) return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("goals").update({ progress: value }).eq("id", goalId).select("id");
  return data?.length ? done() : fail("Nu ai dreptul.");
}

export async function deleteGoal(goalId: string): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(goalId).success) return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("goals").delete().eq("id", goalId).select("id");
  return data?.length ? done("Șters.") : fail("Nu ai dreptul.");
}

// ---------- materials & files ----------

export async function addMaterial(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  const parsed = z
    .object({ projectId: id, name: z.string().trim().min(1, "Numele e obligatoriu").max(200), description: optionalText(5000) })
    .safeParse(Object.fromEntries(formData));
  if (!me) return fail("Nu ai acces.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const f = parsed.data;
  const db = createUserClient();
  const { data: last } = await db.from("materials").select("position").eq("project_id", f.projectId).order("position", { ascending: false }).limit(1);
  const { error } = await db
    .from("materials")
    .insert({ project_id: f.projectId, name: f.name, description: f.description ?? null, position: (last?.[0]?.position ?? -1) + 1, created_by: me.clerkId });
  return error ? fail("Doar membrii adaugă materiale.") : done("Material adăugat.");
}

// Swap positions with the neighbour above/below.
export async function moveMaterial(materialId: string, direction: "up" | "down"): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(materialId).success || !["up", "down"].includes(direction)) return fail("Cerere invalidă.");
  const db = createUserClient();
  const { data: m } = await db.from("materials").select("id, project_id, position").eq("id", materialId).maybeSingle();
  if (!m) return fail("Material inexistent.");
  const { data: other } = await db
    .from("materials")
    .select("id, position")
    .eq("project_id", m.project_id)
    [direction === "up" ? "lt" : "gt"]("position", m.position)
    .order("position", { ascending: direction === "down" })
    .limit(1)
    .maybeSingle();
  if (!other) return { ok: true, message: "" };
  // ponytail: two updates, not one transaction; a failure in between leaves equal positions, still ordered by created_at.
  const a = await db.from("materials").update({ position: other.position }).eq("id", m.id).select("id");
  if (!a.data?.length) return fail("Nu ai dreptul.");
  await db.from("materials").update({ position: m.position }).eq("id", other.id);
  return done("");
}

export async function deleteMaterial(materialId: string): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(materialId).success) return fail("Cerere invalidă.");
  const db = createUserClient();
  const { data: files } = await db.from("material_files").select("storage_path").eq("material_id", materialId);
  const { data } = await db.from("materials").delete().eq("id", materialId).select("id");
  if (!data?.length) return fail("Nu ai dreptul.");
  if (files?.length) await db.storage.from("project-files").remove(files.map((f) => f.storage_path));
  return done("Șters.");
}

export async function attachMaterialFile(materialId: string, file: z.infer<typeof fileMeta>): Promise<FormState> {
  const f = fileMeta.safeParse(file);
  if (!(await actor()) || !id.safeParse(materialId).success || !f.success) return fail("Cerere invalidă.");
  const { error } = await createUserClient()
    .from("material_files")
    .insert({ material_id: materialId, storage_path: f.data.path, name: f.data.name, file_type: f.data.type ?? null });
  return error ? fail("Fișierul nu a putut fi atașat.") : done("Fișier încărcat.");
}

export async function deleteMaterialFile(fileId: string): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(fileId).success) return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("material_files").delete().eq("id", fileId).select("storage_path");
  if (!data?.length) return fail("Nu ai dreptul.");
  await removeObject("project-files", data[0].storage_path);
  return done("Șters.");
}

export async function addProjectPhoto(projectId: string, file: z.infer<typeof fileMeta>): Promise<FormState> {
  const f = fileMeta.safeParse(file);
  if (!(await actor()) || !id.safeParse(projectId).success || !f.success) return fail("Cerere invalidă.");
  const { error } = await createUserClient().from("project_photos").insert({ project_id: projectId, storage_path: f.data.path });
  return error ? fail("Poza nu a putut fi salvată.") : done("Poză adăugată.");
}

export async function deleteProjectPhoto(photoId: string): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(photoId).success) return fail("Cerere invalidă.");
  const db = createUserClient();
  const { data } = await db.from("project_photos").delete().eq("id", photoId).select("storage_path, project_id");
  if (!data?.length) return fail("Nu ai dreptul.");
  // If it was the thumbnail, clear it first so the project never points at a missing file.
  await db.from("projects").update({ thumbnail_path: null }).eq("id", data[0].project_id).eq("thumbnail_path", data[0].storage_path);
  await removeObject("project-files", data[0].storage_path);
  return done("Poză ștearsă.");
}

export async function setThumbnail(projectId: string, path: string | null): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(projectId).success || !z.string().max(400).nullable().safeParse(path).success) return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("projects").update({ thumbnail_path: path }).eq("id", projectId).select("id");
  return data?.length ? done("Copertă setată.") : fail("Nu ai dreptul.");
}

// PDF summary of the project; the old file is removed from Storage when replaced or cleared.
export async function setProjectSummary(projectId: string, file: z.infer<typeof fileMeta> | null): Promise<FormState> {
  const f = file === null ? null : fileMeta.safeParse(file);
  if (!(await actor()) || !id.safeParse(projectId).success || (f && !f.success)) return fail("Cerere invalidă.");
  const db = createUserClient();
  const { data: old } = await db.from("projects").select("summary_path").eq("id", projectId).maybeSingle();
  const { data } = await db
    .from("projects")
    .update({ summary_path: f?.data?.path ?? null, summary_name: f?.data?.name ?? null })
    .eq("id", projectId)
    .select("id");
  if (!data?.length) return fail("Nu ai dreptul.");
  if (old?.summary_path && old.summary_path !== f?.data?.path) await removeObject("project-files", old.summary_path);
  return done(f ? "Rezumat încărcat." : "Șters.");
}

// ---------- reviews & mentor feedback ----------

export async function addReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  const parsed = z
    .object({ projectId: id, rating: z.coerce.number().int().min(1, "Alege o notă").max(5), body: optionalText(2000) })
    .safeParse(Object.fromEntries(formData));
  if (!me) return fail("Nu ai acces.");
  if (!me.isPeerReviewer) return fail("Doar ambasadorii dau feedback colegilor.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const f = parsed.data;
  const { error } = await createUserClient().from("reviews").insert({ project_id: f.projectId, author_id: me.clerkId, rating: f.rating, body: f.body ?? null });
  if (error) return fail(error.code === "23505" ? "Ai lăsat deja feedback." : "Nu poți lăsa feedback aici.");
  return done("Mulțumim pentru feedback.");
}

export async function deleteReview(reviewId: string): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(reviewId).success) return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("reviews").delete().eq("id", reviewId).select("id");
  return data?.length ? done("Feedback șters.") : fail("Nu ai dreptul.");
}

export async function addFeedback(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  const parsed = z.object({ projectId: id, body: z.string().trim().min(1, "Scrie feedback-ul").max(5000) }).safeParse(Object.fromEntries(formData));
  if (!me || !isPlatformMentor(me)) return fail("Doar mentorii PN dau feedback.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { error } = await createUserClient().from("mentor_feedback").insert({ project_id: parsed.data.projectId, mentor_id: me.clerkId, body: parsed.data.body });
  return error ? fail("Feedback-ul nu a putut fi salvat.") : done("Feedback trimis.");
}

export async function deleteFeedback(feedbackId: string): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(feedbackId).success) return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("mentor_feedback").delete().eq("id", feedbackId).select("id");
  return data?.length ? done("Șters.") : fail("Nu ai dreptul.");
}

// ---------- challenges & grading ----------

export async function createChallenge(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Numele e obligatoriu").max(200),
      description: optionalText(5000),
      deadline: optionalDate,
    })
    .safeParse(Object.fromEntries(formData));
  if (!me || !isPlatformMentor(me)) return fail("Doar mentorii PN creează challenge-uri.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const f = parsed.data;
  const { error } = await createUserClient()
    .from("challenges")
    .insert({ name: f.name, description: f.description ?? null, deadline: f.deadline ?? null, created_by: me.clerkId });
  return error ? fail("Challenge-ul nu a putut fi creat.") : done("Challenge creat.");
}

export async function setChallengeArchived(challengeId: string, archived: boolean): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(challengeId).success || typeof archived !== "boolean") return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("challenges").update({ archived }).eq("id", challengeId).select("id");
  return data?.length ? done(archived ? "Arhivat." : "Reactivat.") : fail("Doar autorul îl poate arhiva.");
}

// Grades every member of the project (grade_project: one transaction, RLS per row).
const grade = z.coerce.number().int().min(1, "Notele sunt de la 1 la 5").max(5, "Notele sunt de la 1 la 5");
export async function gradeProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  const parsed = z
    .object({ projectId: id, challengeId: id, innovation: grade, impact: grade, feedbackScore: grade, efficiency: grade, feedback: optionalText(5000) })
    .safeParse(Object.fromEntries(formData));
  if (!me || !isPlatformMentor(me)) return fail("Doar mentorii PN notează.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const f = parsed.data;
  const { data, error } = await createUserClient().rpc("grade_project", {
    p_project: f.projectId,
    p_challenge: f.challengeId,
    p_innovation: f.innovation,
    p_impact: f.impact,
    p_feedback_score: f.feedbackScore,
    p_efficiency: f.efficiency,
    p_feedback: f.feedback ?? null,
  });
  if (error) return fail("Notarea nu a reușit.");
  return done(`Notat: ${data} ${data === 1 ? "elev" : "elevi"}.`);
}

// Bonus points for a student (e.g. posters), counted in the school year they are awarded in.
export async function giveBonus(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  const parsed = z
    .object({
      profileId: z.string().min(1),
      points: z.coerce.number().int().min(1, "Puncte invalide").max(100),
      reason: z.string().trim().min(1, "Motivul e obligatoriu").max(300),
    })
    .safeParse(Object.fromEntries(formData));
  if (!me || !isPlatformMentor(me)) return fail("Doar mentorii PN acordă bonusuri.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const f = parsed.data;
  const { error } = await createUserClient()
    .from("bonus_points")
    .insert({ student_id: f.profileId, points: f.points, reason: f.reason, awarded_by: me.clerkId });
  return error ? fail("Bonusul nu a putut fi acordat.") : done("Bonus acordat.");
}

// ---------- personal objectives ----------

export async function addObjective(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  const parsed = z
    .object({ name: z.string().trim().min(1, "Numele e obligatoriu").max(200), description: optionalText(2000), deadline: optionalDate })
    .safeParse(Object.fromEntries(formData));
  if (!me) return fail("Nu ai acces.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const f = parsed.data;
  const { error } = await createUserClient()
    .from("personal_objectives")
    .insert({ owner_id: me.clerkId, name: f.name, description: f.description ?? null, deadline: f.deadline ?? null });
  return error ? fail("Obiectivul nu a putut fi salvat.") : done("Obiectiv adăugat.");
}

export async function setObjectiveProgress(objectiveId: string, value: number): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(objectiveId).success || !progress.safeParse(value).success) return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("personal_objectives").update({ progress: value }).eq("id", objectiveId).select("id");
  return data?.length ? done() : fail("Nu ai dreptul.");
}

export async function deleteObjective(objectiveId: string): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(objectiveId).success) return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("personal_objectives").delete().eq("id", objectiveId).select("id");
  return data?.length ? done("Șters.") : fail("Nu ai dreptul.");
}

// ---------- platform profile ----------

const SOCIALS = ["github", "linkedin", "instagram", "website"] as const;
const url = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.url({ protocol: /^https$/, message: "Link invalid (https://…)" }).max(300).optional());

export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  const parsed = z
    .object({ bio: optionalText(2000), github: url, linkedin: url, instagram: url, website: url })
    .safeParse(Object.fromEntries(formData));
  if (!me) return fail("Nu ai acces.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const f = parsed.data;
  const social = Object.fromEntries(SOCIALS.filter((k) => f[k]).map((k) => [k, f[k]]));
  const { error } = await createUserClient()
    .from("platform_profiles")
    .upsert({ profile_id: me.clerkId, bio: f.bio ?? null, social, updated_at: new Date().toISOString() }, { onConflict: "profile_id" });
  return error ? fail("Profilul nu a putut fi salvat.") : done("Profil salvat.");
}

export async function setAvatar(file: z.infer<typeof fileMeta>): Promise<FormState> {
  const me = await actor();
  const f = fileMeta.safeParse(file);
  if (!me || !f.success) return fail("Cerere invalidă.");
  const path = f.data.path;
  const db = createUserClient();
  const { data: old } = await db.from("platform_profiles").select("avatar_path").eq("profile_id", me.clerkId).maybeSingle();
  const { error } = await db.from("platform_profiles").upsert({ profile_id: me.clerkId, avatar_path: path, updated_at: new Date().toISOString() }, { onConflict: "profile_id" });
  if (error) return fail("Poza nu a putut fi salvată.");
  if (old?.avatar_path && old.avatar_path !== path) await removeObject("avatars", old.avatar_path);
  return done("Poză actualizată.");
}

// ---------- mentoring: warnings, puzzle ----------

export async function issueWarning(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  const parsed = z
    .object({ studentId: z.string().min(1).max(100), body: z.string().trim().min(1, "Scrie motivul").max(2000) })
    .safeParse(Object.fromEntries(formData));
  if (!me || !isPlatformMentor(me)) return fail("Doar mentorii PN dau avertismente.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { error } = await createUserClient().from("warnings").insert({ student_id: parsed.data.studentId, issued_by: me.clerkId, body: parsed.data.body });
  return error ? fail("Avertismentul nu a putut fi salvat.") : done("Avertisment trimis.");
}

export async function archiveWarning(warningId: string): Promise<FormState> {
  if (!(await actor()) || !id.safeParse(warningId).success) return fail("Cerere invalidă.");
  const { data } = await createUserClient().from("warnings").update({ archived: true }).eq("id", warningId).select("id");
  return data?.length ? done("Arhivat.") : fail("Doar cine l-a dat (sau VP PN) îl poate arhiva.");
}

export async function givePuzzlePiece(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actor();
  const parsed = z
    .object({ profileId: z.string().min(1).max(100), piece: z.coerce.number().int().min(1, "Piesă invalidă").max(1000) })
    .safeParse(Object.fromEntries(formData));
  if (!me || !isPlatformMentor(me)) return fail("Doar mentorii PN dau piese.");
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { error } = await createUserClient().from("puzzle_pieces").insert({ profile_id: parsed.data.profileId, piece: parsed.data.piece, given_by: me.clerkId });
  if (error) return fail(error.code === "23505" ? "Are deja piesa asta." : "Piesa nu a putut fi dată.");
  return done("Piesă acordată.");
}

// ---------- Open School ----------

export async function addOpenSchoolFile(file: z.infer<typeof fileMeta> & { description?: string }): Promise<FormState> {
  const me = await actor();
  const f = fileMeta.extend({ description: z.string().trim().max(2000).optional() }).safeParse(file);
  if (!me || !isPlatformMentor(me)) return fail("Doar mentorii PN încarcă în Open School.");
  if (!f.success) return fail("Fișier invalid.");
  const { error } = await createUserClient()
    .from("open_school_files")
    .insert({ name: f.data.name, description: f.data.description || null, storage_path: f.data.path, file_type: f.data.type ?? null, uploaded_by: me.clerkId });
  return error ? fail("Fișierul nu a putut fi salvat.") : done("Fișier adăugat.");
}

export async function deleteOpenSchoolFile(fileId: string): Promise<FormState> {
  const me = await actor();
  if (!me || !isPlatformMentor(me) || !id.safeParse(fileId).success) return fail("Nu ai dreptul.");
  const { data } = await createUserClient().from("open_school_files").delete().eq("id", fileId).select("storage_path");
  if (!data?.length) return fail("Nu ai dreptul.");
  await removeObject("open-school", data[0].storage_path);
  return done("Șters.");
}

// Opening a file counts a view and returns a fresh signed link (1 hour).
export async function openOpenSchoolFile(fileId: string): Promise<{ url: string | null }> {
  if (!(await actor()) || !id.safeParse(fileId).success) return { url: null };
  const db = createUserClient();
  const { data: file } = await db.from("open_school_files").select("storage_path").eq("id", fileId).maybeSingle();
  if (!file) return { url: null };
  await db.rpc("open_school_view", { p_id: fileId });
  const { data } = await db.storage.from("open-school").createSignedUrl(file.storage_path, 60 * 60);
  return { url: data?.signedUrl ?? null };
}

export async function toggleFavorite(fileId: string, on: boolean): Promise<FormState> {
  const me = await actor();
  if (!me || !id.safeParse(fileId).success || typeof on !== "boolean") return fail("Cerere invalidă.");
  const db = createUserClient();
  const { error } = on
    ? await db.from("open_school_favorites").insert({ profile_id: me.clerkId, file_id: fileId })
    : await db.from("open_school_favorites").delete().eq("profile_id", me.clerkId).eq("file_id", fileId);
  return error && error.code !== "23505" ? fail("Nu a mers.") : done("");
}
