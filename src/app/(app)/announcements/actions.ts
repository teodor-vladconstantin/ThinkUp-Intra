"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { deadlineFromDate } from "@/lib/dates";
import { canPostAnnouncement } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message: string } | null;

const schema = z.object({
  title: z.string().trim().min(1, "Titlul e obligatoriu").max(200, "Titlu prea lung"),
  body: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(5000, "Text prea lung").optional()),
  expiresAt: z.preprocess((v) => (v === "" ? undefined : v), z.iso.date("Dată invalidă").optional()),
  important: z.preprocess((v) => v === "on", z.boolean()),
});

export async function createAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor) return { ok: false, message: "Nu ești autentificat." };
  if (!canPostAnnouncement(actor)) return { ok: false, message: "Nu poți publica anunțuri." };

  const parsed = schema.safeParse({ ...Object.fromEntries(formData), important: formData.get("important") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const f = parsed.data;

  const { error } = await createUserClient()
    .from("announcements")
    .insert({
      title: f.title,
      body: f.body ?? null,
      important: f.important,
      // Expires at the end of the chosen day, Romanian time (same rule as deadlines).
      expires_at: f.expiresAt ? deadlineFromDate(f.expiresAt) : null,
      author_id: actor.clerkId,
    });
  if (error) return { ok: false, message: "Anunțul nu a putut fi publicat." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Anunț publicat." };
}

// RLS (ann_update) limits this to the author or superadmin.
export async function archiveAnnouncement(formData: FormData) {
  const actor = await requireProfile();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!actor || !id.success) return;
  await createUserClient().from("announcements").update({ archived: true }).eq("id", id.data);
  revalidatePath("/", "layout");
}
