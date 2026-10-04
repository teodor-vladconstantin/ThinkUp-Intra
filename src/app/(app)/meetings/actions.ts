"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { deadlineFromDate } from "@/lib/dates";
import { canWriteMeeting } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message: string } | null;

const emptyToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);

const meetingFields = z.object({
  kind: z.enum(["cd", "department"]),
  departmentId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  title: z.string().trim().min(1, "Titlul e obligatoriu").max(200, "Titlu prea lung"),
  heldAt: z.iso.date("Alege data ședinței"),
  minutes: z.preprocess(emptyToUndefined, z.string().max(20000, "Minuta e prea lungă").optional()),
});

// Follow-up rows come from the client as one JSON field (a dynamic list of rows).
const followUps = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(200),
      assigneeId: z.string().max(100).optional(),
      deadline: z.preprocess(emptyToUndefined, z.iso.date().optional()),
    }),
  )
  .max(30, "Maximum 30 de sarcini într-o ședință");

const decisionLines = (raw: FormDataEntryValue | null) =>
  String(raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const attendeeIds = (fd: FormData) => fd.getAll("attendees").map(String).slice(0, 200);

// held_at is a date in the form; stored like deadlines (end of that day, Bucharest).
const heldAtUtc = (date: string) => deadlineFromDate(date);

export async function createMeeting(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor) return { ok: false, message: "Nu ești autentificat." };

  const parsed = meetingFields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const f = parsed.data;
  const departmentId = f.kind === "department" ? (f.departmentId ?? null) : null;
  if (f.kind === "department" && departmentId === null) return { ok: false, message: "Alege departamentul." };

  if (!canWriteMeeting(actor, f.kind, departmentId)) {
    return { ok: false, message: "Nu poți crea această ședință." };
  }

  let tasks: z.infer<typeof followUps>;
  try {
    const result = followUps.safeParse(JSON.parse(String(formData.get("tasks") ?? "[]")));
    if (!result.success) return { ok: false, message: result.error.issues[0].message };
    tasks = result.data;
  } catch {
    return { ok: false, message: "Lista de sarcini e invalidă." };
  }
  const decisions = decisionLines(formData.get("decisions"));
  if (decisions.length > 50 || decisions.some((d) => d.length > 1000)) {
    return { ok: false, message: "Prea multe decizii sau o decizie prea lungă." };
  }

  const db = createUserClient();
  const assignees = [...new Set(tasks.map((t) => t.assigneeId).filter((a): a is string => Boolean(a)))];
  if (assignees.length) {
    const { data: active } = await db.from("profiles").select("clerk_id").in("clerk_id", assignees).eq("is_active", true);
    if ((active?.length ?? 0) !== assignees.length) return { ok: false, message: "Un responsabil nu are cont activ." };
  }

  // One RPC = one transaction: minutes, decisions and follow-up tasks are saved together
  // or not at all. It runs as the user, so RLS checks every insert inside it.
  const { data: id, error } = await db.rpc("create_meeting", {
    p_kind: f.kind,
    p_department_id: departmentId,
    p_title: f.title,
    p_held_at: heldAtUtc(f.heldAt),
    p_minutes: f.minutes ?? null,
    p_attendees: attendeeIds(formData),
    p_decisions: decisions,
    p_tasks: tasks.map((t) => ({
      title: t.title,
      assignee_id: t.assigneeId || null,
      deadline: t.deadline ? deadlineFromDate(t.deadline) : null,
    })),
  });
  if (error || !id) return { ok: false, message: "Ședința nu a putut fi salvată. Nimic nu a fost creat." };

  revalidatePath("/", "layout");
  redirect(`/meetings/${id}`);
}

export async function updateMeeting(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor) return { ok: false, message: "Nu ești autentificat." };

  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = meetingFields.safeParse(Object.fromEntries(formData));
  if (!id.success) return { ok: false, message: "Ședință invalidă." };
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const db = createUserClient();
  const { data: meeting } = await db.from("meetings").select("kind, department_id").eq("id", id.data).maybeSingle();
  if (!meeting) return { ok: false, message: "Ședința nu există sau nu ai acces la ea." };
  if (!canWriteMeeting(actor, meeting.kind, meeting.department_id)) {
    return { ok: false, message: "Nu poți modifica această ședință." };
  }

  // kind and department are fixed after creation: they decide who can see the minutes.
  const { data: updated, error } = await db
    .from("meetings")
    .update({
      title: parsed.data.title,
      held_at: heldAtUtc(parsed.data.heldAt),
      minutes: parsed.data.minutes ?? null,
      attendees: attendeeIds(formData),
    })
    .eq("id", id.data)
    .select("id");
  if (error || !updated?.length) return { ok: false, message: "Modificarea nu a putut fi salvată." };

  revalidatePath(`/meetings/${id.data}`);
  return { ok: true, message: "Salvat." };
}

export async function addDecision(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor) return { ok: false, message: "Nu ești autentificat." };

  const meetingId = z.uuid().safeParse(formData.get("meetingId"));
  const text = z.string().trim().min(1, "Decizia e goală").max(1000, "Decizie prea lungă").safeParse(formData.get("text"));
  if (!meetingId.success) return { ok: false, message: "Ședință invalidă." };
  if (!text.success) return { ok: false, message: text.error.issues[0].message };

  const { error } = await createUserClient()
    .from("decisions")
    .insert({ meeting_id: meetingId.data, text: text.data, author_id: actor.clerkId });
  if (error) return { ok: false, message: "Decizia nu a putut fi salvată." };

  revalidatePath(`/meetings/${meetingId.data}`);
  revalidatePath("/decisions");
  return { ok: true, message: "" };
}
