"use server";

import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { canInvite, needsDepartment, ROLES } from "@/lib/permissions";
import { sendInvitation } from "@/lib/invitations";
import { createUserClient } from "@/lib/supabase/server";

export type InviteState = { ok: boolean; message: string } | null;

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Email invalid")),
  role: z.enum(ROLES, "Rol invalid"),
  // An empty <select> sends "", which means "no department".
  departmentId: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
});

export async function createInvitation(_prev: InviteState, formData: FormData): Promise<InviteState> {
  // 1. Who is asking? Always from the server-side session + profiles table.
  const actor = await requireProfile();
  if (!actor) return { ok: false, message: "Nu ești autentificat." };

  // 2. Validate input (never trust the form).
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { email, role } = parsed.data;

  // ceo/president/secretary have no department; vp/mentor must have one.
  const departmentId = needsDepartment(role) ? (parsed.data.departmentId ?? null) : null;
  if (needsDepartment(role) && departmentId === null) {
    return { ok: false, message: "Alege un departament." };
  }

  // 3. Permission check (mirrors the inv_insert RLS policy, which runs anyway in step 4).
  if (!canInvite(actor, { role, departmentId })) {
    return { ok: false, message: "Nu ai dreptul să trimiți această invitație." };
  }

  const existing = await createUserClient().from("profiles").select("clerk_id").eq("email", email).maybeSingle();
  if (existing.data) return { ok: false, message: "Această persoană are deja cont." };

  // 4. Insert (RLS decides) + Clerk invitation, rolled back if Clerk refuses.
  const result = await sendInvitation(actor, { email, role, departmentId });
  if (result.ok) revalidatePath("/admin/invitations");
  return result;
}

// Revoke a pending invitation. Database first (revoke_invitation() checks who may and
// only flips status), then Clerk, so the link in the email stops working too.
export async function revokeInvitation(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const actor = await requireProfile();
  if (!actor) return { ok: false, message: "Nu ești autentificat." };

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "Invitație invalidă." };

  const db = createUserClient();
  const { data: invitation, error: lookupError } = await db
    .from("invitations")
    .select("email")
    .eq("id", id.data)
    .maybeSingle();
  if (lookupError) return { ok: false, message: "Invitația nu a putut fi găsită." };
  if (!invitation) return { ok: false, message: "Invitația nu există sau nu ai permisiunea." };

  const { error } = await db.rpc("revoke_invitation", { p_id: id.data });
  if (error) return { ok: false, message: "Invitația nu a putut fi revocată sau nu ai permisiunea." };

  try {
    const clerk = await clerkClient();
    const { data } = await clerk.invitations.getInvitationList({ query: invitation.email, status: "pending" });
    for (const inv of data.filter((i) => i.emailAddress.toLowerCase() === invitation.email)) {
      await clerk.invitations.revokeInvitation(inv.id);
    }
  } catch (error) {
    // The local pending row is already revoked, so an outstanding Clerk link cannot create a profile.
    console.error("Failed to revoke the Clerk invitation after revoking its local record.", error);
  }
  revalidatePath("/admin/invitations");
  return { ok: true, message: "Invitație revocată." };
}
