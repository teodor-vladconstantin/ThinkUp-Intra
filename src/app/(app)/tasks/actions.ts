"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile, type Profile } from "@/lib/auth";
import { deadlineFromDate } from "@/lib/dates";
import { canCreateTaskIn, canEditTask, canMoveTask } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { STATUSES } from "@/lib/tasks";

export type FormState = { ok: boolean; message: string } | null;

// Every write goes through the user client, so RLS + the tasks_guard trigger have the
// last word. The checks below only turn a database refusal into a readable message.

const emptyToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);

const taskFields = z.object({
  title: z.string().trim().min(1, "Titlul e obligatoriu").max(200, "Titlu prea lung"),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(5000, "Descriere prea lungă").optional()),
  priority: z.coerce.number().int().min(1).max(3),
  deadline: z.preprocess(emptyToUndefined, z.iso.date("Dată invalidă").optional()),
  assigneeId: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  departmentId: z.coerce.number().int().positive("Alege un departament"),
});

const uuid = z.uuid();

// PN links are only applied when the form actually sent them (users with PN access).
// Someone without PN access editing a linked task must not wipe the link by omission.
const pnLinkFields = z.object({
  schoolId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  countyCode: z.preprocess(emptyToUndefined, z.string().regex(/^[A-Z]{1,2}$/).optional()),
  zoneId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
});
function pnLinks(formData: FormData) {
  if (formData.get("pnLinks") !== "1") return {};
  const p = pnLinkFields.safeParse(Object.fromEntries(formData));
  if (!p.success) return {};
  return { school_id: p.data.schoolId ?? null, county_code: p.data.countyCode ?? null, zone_id: p.data.zoneId ?? null };
}

// Refresh every page: banners in the layout depend on any task change.
const refreshAll = () => revalidatePath("/", "layout");

async function assigneeIsActive(db: ReturnType<typeof createUserClient>, clerkId: string | undefined) {
  if (!clerkId) return true;
  const { data } = await db.from("profiles").select("clerk_id").eq("clerk_id", clerkId).eq("is_active", true).maybeSingle();
  return Boolean(data);
}

// A task a VP creates for another department is also shown to their own (PRD 5.1),
// so the requesting department is derived, never typed in.
function requestingDepartmentFor(actor: Profile, departmentId: number) {
  return actor.departmentId !== null && actor.departmentId !== departmentId ? actor.departmentId : null;
}

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor) return { ok: false, message: "Nu ești autentificat." };

  const parsed = taskFields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const f = parsed.data;

  if (!canCreateTaskIn(actor, f.departmentId)) {
    return { ok: false, message: "Poți crea sarcini doar în departamentul tău." };
  }

  const db = createUserClient();
  if (!(await assigneeIsActive(db, f.assigneeId))) return { ok: false, message: "Persoana aleasă nu are un cont activ." };

  // Optional link to a meeting: only a meeting this user can see (RLS on meetings).
  const meetingId = uuid.safeParse(formData.get("meetingId"));
  if (meetingId.success) {
    const { data: meeting } = await db.from("meetings").select("id").eq("id", meetingId.data).maybeSingle();
    if (!meeting) return { ok: false, message: "Ședința nu există sau nu ai acces la ea." };
  }

  const { data, error } = await db
    .from("tasks")
    .insert({
      title: f.title,
      description: f.description ?? null,
      priority: f.priority,
      deadline: f.deadline ? deadlineFromDate(f.deadline) : null,
      assignee_id: f.assigneeId ?? null,
      creator_id: actor.clerkId,
      department_id: f.departmentId,
      requesting_department_id: requestingDepartmentFor(actor, f.departmentId),
      meeting_id: meetingId.success ? meetingId.data : null,
      ...pnLinks(formData),
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: "Sarcina nu a putut fi salvată." };

  refreshAll();
  redirect(`/tasks/${data.id}`);
}

export async function updateTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor) return { ok: false, message: "Nu ești autentificat." };

  const id = uuid.safeParse(formData.get("id"));
  const parsed = taskFields.safeParse(Object.fromEntries(formData));
  if (!id.success) return { ok: false, message: "Sarcină invalidă." };
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const f = parsed.data;

  const db = createUserClient();
  const { data: current } = await db
    .from("tasks")
    .select("creator_id, assignee_id, department_id, requesting_department_id")
    .eq("id", id.data)
    .maybeSingle();
  if (!current) return { ok: false, message: "Sarcina nu există sau nu ai acces la ea." };

  const ref = {
    creatorId: current.creator_id,
    assigneeId: current.assignee_id,
    departmentId: current.department_id,
    requestingDepartmentId: current.requesting_department_id,
  };
  if (!canEditTask(actor, ref)) return { ok: false, message: "Nu poți modifica această sarcină." };
  if (f.departmentId !== current.department_id && !canMoveTask(actor)) {
    return { ok: false, message: "Doar membrii CD pot muta o sarcină în alt departament." };
  }
  if (!(await assigneeIsActive(db, f.assigneeId))) return { ok: false, message: "Persoana aleasă nu are un cont activ." };

  const { data: updated, error } = await db
    .from("tasks")
    .update({
      title: f.title,
      description: f.description ?? null,
      priority: f.priority,
      deadline: f.deadline ? deadlineFromDate(f.deadline) : null,
      assignee_id: f.assigneeId ?? null,
      department_id: f.departmentId,
      ...pnLinks(formData),
    })
    .eq("id", id.data)
    .select("id");
  if (error || !updated?.length) return { ok: false, message: "Modificarea nu a putut fi salvată." };

  refreshAll();
  return { ok: true, message: "Salvat." };
}

// Used by the status dropdown on cards; plain form action, no return value.
export async function updateTaskStatus(formData: FormData) {
  const actor = await requireProfile();
  const id = uuid.safeParse(formData.get("id"));
  const status = z.enum(STATUSES).safeParse(formData.get("status"));
  if (!actor || !id.success || !status.success) return;

  // RLS filters the update to tasks this user may edit; anything else matches 0 rows.
  await createUserClient().from("tasks").update({ status: status.data }).eq("id", id.data);
  refreshAll();
}

export async function archiveTask(formData: FormData) {
  const actor = await requireProfile();
  const id = uuid.safeParse(formData.get("id"));
  if (!actor || !id.success) return;

  // No hard delete anywhere (PRD 5.1): archived tasks disappear from lists, history stays.
  await createUserClient().from("tasks").update({ archived: true }).eq("id", id.data);
  refreshAll();
  redirect("/tasks");
}

export async function addComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor) return { ok: false, message: "Nu ești autentificat." };

  const taskId = uuid.safeParse(formData.get("taskId"));
  const body = z.string().trim().min(1, "Comentariul e gol").max(2000, "Comentariu prea lung").safeParse(formData.get("body"));
  if (!taskId.success) return { ok: false, message: "Sarcină invalidă." };
  if (!body.success) return { ok: false, message: body.error.issues[0].message };

  const { error } = await createUserClient()
    .from("task_comments")
    .insert({ task_id: taskId.data, author_id: actor.clerkId, body: body.data });
  if (error) return { ok: false, message: "Comentariul nu a putut fi salvat." };

  revalidatePath(`/tasks/${taskId.data}`);
  return { ok: true, message: "" };
}
