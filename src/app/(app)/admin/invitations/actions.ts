"use server";

import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { canInvite, isAllowedEmail, needsDepartment, ROLES, ALLOWED_EMAIL_HINT } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
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
  if (!isAllowedEmail(email)) return { ok: false, message: `Doar adrese ${ALLOWED_EMAIL_HINT}.` };

  // ceo/president/secretary have no department; vp/mentor must have one.
  const departmentId = needsDepartment(role) ? (parsed.data.departmentId ?? null) : null;
  if (needsDepartment(role) && departmentId === null) {
    return { ok: false, message: "Alege un departament." };
  }

  // 3. Permission check (mirrors the inv_insert RLS policy, which runs anyway in step 4).
  if (!canInvite(actor, { role, departmentId })) {
    return { ok: false, message: "Nu ai dreptul să trimiți această invitație." };
  }

  const db = createUserClient();
  const existing = await db.from("profiles").select("clerk_id").eq("email", email).maybeSingle();
  if (existing.data) return { ok: false, message: "Această persoană are deja cont." };

  // 4. Insert as the user, so RLS is the final judge. Done BEFORE Clerk sends the
  //    email: if RLS or the unique index says no, nobody gets an invitation.
  const inserted = await db
    .from("invitations")
    .insert({ email, role, department_id: departmentId, invited_by: actor.clerkId })
    .select("id")
    .single();
  if (inserted.error) {
    // 23505 = unique_violation (invitations_pending_email_key)
    if (inserted.error.code === "23505") return { ok: false, message: "Există deja o invitație în așteptare pentru acest email." };
    return { ok: false, message: "Invitația nu a putut fi salvată." };
  }

  // 5. Create the Clerk invitation. publicMetadata is informational only: the
  //    profile is built from the invitations row, never from Clerk metadata.
  try {
    const clerk = await clerkClient();
    await clerk.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role, departmentId },
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`,
    });
  } catch {
    // Roll our row back to "revoked" so the email can be invited again. Admin client
    // because a VP has no update right on invitations; we only touch the row we just created.
    await createAdminClient().from("invitations").update({ status: "revoked" }).eq("id", inserted.data.id);
    return { ok: false, message: "Clerk a refuzat invitația (poate există deja una în Clerk)." };
  }

  revalidatePath("/admin/invitations");
  return { ok: true, message: `Invitație trimisă către ${email}.` };
}

// Revoke a pending invitation. Database first (revoke_invitation() checks who may and
// only flips status), then Clerk, so the link in the email stops working too.
export async function revokeInvitation(formData: FormData) {
  const actor = await requireProfile();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!actor || !id.success) return;

  const db = createUserClient();
  const { data: invitation } = await db.from("invitations").select("email").eq("id", id.data).maybeSingle();
  const { error } = await db.rpc("revoke_invitation", { p_id: id.data });
  if (error || !invitation) return;

  try {
    const clerk = await clerkClient();
    const { data } = await clerk.invitations.getInvitationList({ query: invitation.email, status: "pending" });
    for (const inv of data.filter((i) => i.emailAddress.toLowerCase() === invitation.email)) {
      await clerk.invitations.revokeInvitation(inv.id);
    }
  } catch {
    // Already safe without Clerk: profile creation needs a *pending* row in our table.
  }
  revalidatePath("/admin/invitations");
}
