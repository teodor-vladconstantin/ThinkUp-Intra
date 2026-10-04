"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { isDriveUrl, VISIBILITIES } from "@/lib/documents";
import { canCreateDocument } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message: string } | null;

const schema = z.object({
  title: z.string().trim().min(1, "Titlul e obligatoriu").max(200, "Titlu prea lung"),
  url: z.string().trim().max(2000).refine(isDriveUrl, "Doar linkuri https://drive.google.com sau https://docs.google.com"),
  visibility: z.enum(VISIBILITIES),
  departmentId: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().positive().optional()),
});

export async function createDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor) return { ok: false, message: "Nu ești autentificat." };
  if (!canCreateDocument(actor)) return { ok: false, message: "Doar membrii CD adaugă documente." };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const f = parsed.data;
  if (f.visibility === "department" && !f.departmentId) return { ok: false, message: "Alege departamentul." };

  const { error } = await createUserClient()
    .from("documents")
    .insert({
      title: f.title,
      url: f.url,
      visibility: f.visibility,
      department_id: f.departmentId ?? null,
      created_by: actor.clerkId,
    });
  if (error) return { ok: false, message: "Documentul nu a putut fi salvat." };

  revalidatePath("/documents");
  return { ok: true, message: "Document adăugat." };
}

// Archive, never delete (PRD 7). RLS (docs_update) limits this to the creator or superadmin.
export async function archiveDocument(formData: FormData) {
  const actor = await requireProfile();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!actor || !id.success) return;
  await createUserClient().from("documents").update({ archived: true }).eq("id", id.data);
  revalidatePath("/documents");
}
