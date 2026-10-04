import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { Profile } from "@/lib/auth";
import type { AppRole } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export type InviteResult = { ok: boolean; message: string };

// Shared by the admin invitations page and the PN ambassador invite.
// Callers validate the email domain and permission first; RLS (inv_insert) is the final judge.
export async function sendInvitation(
  actor: Profile,
  invite: { email: string; role: AppRole; departmentId: number | null; ambassadorId?: number },
): Promise<InviteResult> {
  const { email, role, departmentId, ambassadorId } = invite;
  const db = createUserClient();

  // Insert as the user, so RLS is the final judge. Done BEFORE Clerk sends the
  // email: if RLS or the unique index says no, nobody gets an invitation.
  const inserted = await db
    .from("invitations")
    .insert({ email, role, department_id: departmentId, invited_by: actor.clerkId, ambassador_id: ambassadorId ?? null })
    .select("id")
    .single();
  if (inserted.error) {
    // 23505 = unique_violation (one pending invitation per email / per ambassador)
    if (inserted.error.code === "23505") return { ok: false, message: "Există deja o invitație în așteptare." };
    return { ok: false, message: "Invitația nu a putut fi salvată." };
  }

  // Clerk invitation. publicMetadata is informational only: the profile is built from
  // the invitations row, never from Clerk metadata.
  try {
    const clerk = await clerkClient();
    await clerk.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role, departmentId },
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`,
    });
  } catch {
    // Roll our row back to "revoked" so the email can be invited again. Admin client
    // because the inviter may have no update right on invitations; only this row is touched.
    await createAdminClient().from("invitations").update({ status: "revoked" }).eq("id", inserted.data.id);
    return { ok: false, message: "Clerk a refuzat invitația (poate există deja una în Clerk)." };
  }

  return { ok: true, message: `Invitație trimisă către ${email}.` };
}
