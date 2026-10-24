"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { canFillReports, canManageReports } from "@/lib/permissions";
import { fieldsSchema, parseAnswers } from "@/lib/reports";
import { createUserClient } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message: string } | null;
const fail = (message: string): FormState => ({ ok: false, message });

const newFormSchema = z.object({
  title: z.string().trim().min(1, "Titlul e obligatoriu").max(200, "Titlu prea lung"),
  description: z.string().trim().max(2000, "Descriere prea lungă"),
  fields: z.string().transform((s, ctx) => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Câmpuri invalide" });
      return z.NEVER;
    }
  }),
});

export async function createReportForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireProfile();
  if (!me) return fail("Nu ești autentificat.");
  if (!canManageReports(me)) return fail("Doar consiliul director creează formulare.");
  const parsed = newFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const fields = fieldsSchema.safeParse(parsed.data.fields);
  if (!fields.success) return fail(fields.error.issues[0].message);

  const { error } = await createUserClient().from("report_forms").insert({
    title: parsed.data.title,
    description: parsed.data.description || null,
    fields: fields.data,
    created_by: me.clerkId,
  });
  if (error) return fail("Formularul nu a putut fi creat.");
  revalidatePath("/reports");
  return { ok: true, message: "Formular creat." };
}

export async function setReportFormOpen(formData: FormData) {
  const me = await requireProfile();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!me || !canManageReports(me) || !id.success) return;
  await createUserClient().from("report_forms").update({ is_open: formData.get("open") === "1" }).eq("id", id.data);
  revalidatePath("/reports", "layout");
}

export async function submitReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireProfile();
  if (!me) return fail("Nu ești autentificat.");
  if (!canFillReports(me)) return fail("Doar mentorii completează rapoarte.");
  const id = z.uuid().safeParse(formData.get("formId"));
  if (!id.success) return fail("Formular invalid.");

  const db = createUserClient();
  const { data: form } = await db.from("report_forms").select("fields, is_open").eq("id", id.data).maybeSingle();
  if (!form?.is_open) return fail("Formularul nu mai e deschis.");
  const fields = fieldsSchema.safeParse(form.fields);
  if (!fields.success) return fail("Formularul are o problemă.");

  const result = parseAnswers(fields.data, (n) => formData.getAll(n).filter((v): v is string => typeof v === "string"));
  if (!result.ok) return fail(result.message);

  const { error } = await db.from("report_responses").insert({ form_id: id.data, submitted_by: me.clerkId, answers: result.answers });
  if (error) return fail("Raportul nu a putut fi trimis.");
  revalidatePath("/reports", "layout");
  return { ok: true, message: "Raport trimis. Mulțumim!" };
}
