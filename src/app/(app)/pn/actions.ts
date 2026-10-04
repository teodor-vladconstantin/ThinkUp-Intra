"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { sendInvitation } from "@/lib/invitations";
import { ALLOWED_EMAIL_HINT, canManageZones, isAllowedEmail, isPnMember } from "@/lib/permissions";
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

// Contact email and phone are required for every ambassador (program decision).
const requiredEmail = z.string().trim().min(1, "Emailul e obligatoriu").pipe(z.email("Email invalid").max(200));
const requiredPhone = z
  .string()
  .trim()
  .min(1, "Telefonul e obligatoriu")
  .regex(/^[+()\d\s.-]{6,40}$/, "Telefon invalid");

const ambassadorSchema = z.object({
  schoolId: z.coerce.number().int().positive(),
  fullName: z.string().trim().min(1, "Numele e obligatoriu").max(150),
  email: requiredEmail,
  phone: requiredPhone,
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
    p_email: f.email,
    p_phone: f.phone,
  });
  if (error) return { ok: false, message: "Ambasadorul nu a putut fi salvat." };

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
  email: requiredEmail,
  phone: requiredPhone,
});

// Fix an ambassador's contacts. RLS (ambc_all) limits this to the PN department.
// Both fields are required, so a contact row always has both.
export async function updateAmbassadorContacts(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor || !isPnMember(actor)) return { ok: false, message: "Doar departamentul PN editează contactele." };

  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, email, phone } = parsed.data;

  const { error } = await createUserClient()
    .from("ambassador_contacts")
    .upsert({ ambassador_id: id, email, phone }, { onConflict: "ambassador_id" });
  if (error) return { ok: false, message: "Contactul nu a putut fi salvat." };

  revalidatePath("/pn", "layout");
  return { ok: true, message: "Salvat." };
}

// ---------- ambassador accounts (platform access) ----------

// Gives an ambassador their platform account. An existing account with that email
// (e.g. a Tech mentor who is also an ambassador) is linked right away; otherwise a
// student invitation carrying the ambassador id is sent, linked at first sign-in.
export async function inviteAmbassador(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireProfile();
  if (!actor || !isPnMember(actor)) return { ok: false, message: "Doar departamentul PN invită ambasadori." };

  const ambassadorId = z.coerce.number().int().positive().safeParse(formData.get("ambassadorId"));
  const email = z.string().trim().toLowerCase().pipe(z.email("Email invalid")).safeParse(formData.get("email"));
  if (!ambassadorId.success) return { ok: false, message: "Ambasador invalid." };
  if (!email.success) return { ok: false, message: email.error.issues[0].message };
  if (!isAllowedEmail(email.data)) return { ok: false, message: `Doar adrese ${ALLOWED_EMAIL_HINT}.` };

  const db = createUserClient();
  // PN reads staff and student profiles (profiles_read), so an existing account is found here.
  const { data: existing } = await db.from("profiles").select("clerk_id").eq("email", email.data).maybeSingle();
  if (existing) {
    const { data, error } = await db.from("ambassadors").update({ profile_id: existing.clerk_id }).eq("id", ambassadorId.data).select("id");
    if (error?.code === "23505") return { ok: false, message: "Contul e deja legat de alt ambasador." };
    if (error || !data?.length) return { ok: false, message: "Legătura nu a putut fi salvată." };
    revalidatePath("/pn", "layout");
    return { ok: true, message: "Cont existent legat." };
  }

  const result = await sendInvitation(actor, { email: email.data, role: "student", departmentId: null, ambassadorId: ambassadorId.data });
  if (result.ok) revalidatePath("/pn", "layout");
  return result;
}

// Removes platform access by unlinking the account (the account itself stays; deactivate it in Users if needed).
export async function unlinkAmbassador(formData: FormData) {
  const actor = await requireProfile();
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!actor || !isPnMember(actor) || !id.success) return;
  await createUserClient().from("ambassadors").update({ profile_id: null }).eq("id", id.data);
  revalidatePath("/pn", "layout");
}
