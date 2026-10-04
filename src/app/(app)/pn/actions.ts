"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { canManageZones, isPnMember } from "@/lib/permissions";
import { SCHOOL_STATUSES } from "@/lib/pn";
import { createUserClient } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message: string } | null;

// The checks here only produce readable errors. RLS (and move_county's own check)
// decide in the database. Contact values are never echoed back in messages or logs (PRD 10).

const optionalText = (max: number) => z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().trim().max(max).optional());
const countyCode = z.string().regex(/^[A-Z]{1,2}$/);

// ---------- counties & zones ----------

export async function moveCounty(code: string, zoneId: number | null): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor || !canManageZones(actor)) return { ok: false, message: "Doar VP PN mută județe." };
  // Server actions are public endpoints: validate even typed arguments.
  if (!countyCode.safeParse(code).success) return { ok: false, message: "Județ invalid." };
  if (!z.number().int().positive().nullable().safeParse(zoneId).success) return { ok: false, message: "Zonă invalidă." };

  // move_county() is the only way to change a county's zone; it also writes the history row.
  const { error } = await createUserClient().rpc("move_county", { p_code: code, p_zone: zoneId });
  if (error) return { ok: false, message: "Mutarea nu a reușit." };

  revalidatePath("/pn");
  return { ok: true, message: "Mutat." };
}

const zoneSchema = z.object({
  id: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().positive().optional()),
  name: z.string().trim().min(1, "Numele e obligatoriu").max(80, "Nume prea lung"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Culoare invalidă"),
});

export async function saveZone(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor || !canManageZones(actor)) return { ok: false, message: "Doar VP PN editează zonele." };

  const parsed = zoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, name, color } = parsed.data;

  const db = createUserClient();
  const { error } = id
    ? await db.from("zones").update({ name, color }).eq("id", id)
    : await db.from("zones").insert({ name, color });
  if (error) return { ok: false, message: error.code === "23505" ? "Există deja o zonă cu acest nume." : "Zona nu a putut fi salvată." };

  revalidatePath("/pn", "layout");
  return { ok: true, message: id ? "Zonă salvată." : "Zonă creată." };
}

// ---------- schools ----------

const schoolSchema = z.object({
  name: z.string().trim().min(1, "Numele liceului e obligatoriu").max(200),
  city: optionalText(100),
  countyCode,
  contactName: optionalText(150),
  contactEmail: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.email("Email invalid").max(200).optional()),
  contactPhone: optionalText(40),
  status: z.enum(SCHOOL_STATUSES),
});

const schoolRow = (f: z.infer<typeof schoolSchema>) => ({
  name: f.name,
  city: f.city ?? null,
  county_code: f.countyCode,
  contact_name: f.contactName ?? null,
  contact_email: f.contactEmail ?? null,
  contact_phone: f.contactPhone ?? null,
  status: f.status,
});

export async function createSchool(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor || !isPnMember(actor)) return { ok: false, message: "Doar departamentul PN adaugă licee." };

  const parsed = schoolSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { data, error } = await createUserClient().from("schools").insert(schoolRow(parsed.data)).select("id").single();
  if (error) return { ok: false, message: "Liceul nu a putut fi salvat." };

  revalidatePath("/pn", "layout");
  redirect(`/pn/schools/${data.id}`);
}

export async function updateSchool(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor || !isPnMember(actor)) return { ok: false, message: "Doar departamentul PN editează licee." };

  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  const parsed = schoolSchema.safeParse(Object.fromEntries(formData));
  if (!id.success) return { ok: false, message: "Liceu invalid." };
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { data, error } = await createUserClient().from("schools").update(schoolRow(parsed.data)).eq("id", id.data).select("id");
  if (error || !data?.length) return { ok: false, message: "Modificarea nu a putut fi salvată." };

  revalidatePath("/pn", "layout");
  return { ok: true, message: "Salvat." };
}

export async function logSchoolContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor || !isPnMember(actor)) return { ok: false, message: "Doar departamentul PN completează jurnalul." };

  const schoolId = z.coerce.number().int().positive().safeParse(formData.get("schoolId"));
  const note = z.string().trim().min(1, "Scrie o notă").max(2000, "Notă prea lungă").safeParse(formData.get("note"));
  if (!schoolId.success) return { ok: false, message: "Liceu invalid." };
  if (!note.success) return { ok: false, message: note.error.issues[0].message };

  const { error } = await createUserClient()
    .from("school_contact_log")
    .insert({ school_id: schoolId.data, contacted_by: actor.clerkId, note: note.data });
  if (error) return { ok: false, message: "Nota nu a putut fi salvată." };

  revalidatePath(`/pn/schools/${schoolId.data}`);
  return { ok: true, message: "" };
}

// ---------- ambassadors ----------

const ambassadorSchema = z.object({
  schoolId: z.coerce.number().int().positive(),
  fullName: z.string().trim().min(1, "Numele e obligatoriu").max(150),
  platformUserId: optionalText(100),
  email: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.email("Email invalid").max(200).optional()),
  phone: optionalText(40),
});

export async function addAmbassador(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor || !isPnMember(actor)) return { ok: false, message: "Doar departamentul PN adaugă ambasadori." };

  const parsed = ambassadorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const f = parsed.data;

  // One function = one transaction: the ambassador and their contacts are saved together.
  const { error } = await createUserClient().rpc("add_ambassador", {
    p_full_name: f.fullName,
    p_school_id: f.schoolId,
    p_platform_user_id: f.platformUserId ?? null,
    p_email: f.email ?? null,
    p_phone: f.phone ?? null,
  });
  if (error) {
    return { ok: false, message: error.code === "23505" ? "Contul de pe platformă e deja asociat unui ambasador." : "Ambasadorul nu a putut fi salvat." };
  }

  revalidatePath("/pn", "layout");
  return { ok: true, message: "Ambasador adăugat." };
}

export async function setAmbassadorActive(formData: FormData) {
  const actor = await requireProfile();
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!actor || !isPnMember(actor) || !id.success) return;
  await createUserClient().from("ambassadors").update({ active: formData.get("active") === "true" }).eq("id", id.data);
  revalidatePath("/pn", "layout");
}

const contactSchema = z.object({
  id: z.coerce.number().int().positive(),
  email: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.email("Email invalid").max(200).optional()),
  phone: optionalText(40),
});

// Fix an ambassador's contacts. RLS (ambc_all) limits this to the PN department.
// Both empty = delete the row: we keep only what is needed about minors.
export async function updateAmbassadorContacts(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor || !isPnMember(actor)) return { ok: false, message: "Doar departamentul PN editează contactele." };

  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, email, phone } = parsed.data;

  const contacts = createUserClient().from("ambassador_contacts");
  const { error } =
    email || phone
      ? await contacts.upsert({ ambassador_id: id, email: email ?? null, phone: phone ?? null }, { onConflict: "ambassador_id" })
      : await contacts.delete().eq("ambassador_id", id);
  if (error) return { ok: false, message: "Contactul nu a putut fi salvat." };

  revalidatePath("/pn", "layout");
  return { ok: true, message: "Salvat." };
}
