import "server-only";
import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessPn, isAllowedEmail, type Actor, type AppRole } from "@/lib/permissions";
import { escapeLike } from "@/lib/utils";

export type Profile = Actor & {
  clerkId: string;
  email: string;
  fullName: string | null;
  departmentName: string | null;
  canAccessPn: boolean;
  canAccessPlatform: boolean; // ambassadors + anyone with PN access (has_platform_access in SQL)
};

// "student" is set by the intranet layout, not here: students have a valid profile.
export type NoAccessReason = "inactive" | "email-unverified" | "domain" | "no-invitation" | "student";

export type ProfileResult =
  | { status: "ok"; profile: Profile }
  | { status: "no-access"; reason: NoAccessReason };

const PROFILE_COLUMNS =
  "clerk_id, email, full_name, role, department_id, is_superadmin, is_active, departments(name, can_access_pn)";

type ProfileRow = {
  clerk_id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  department_id: number | null;
  is_superadmin: boolean;
  is_active: boolean;
  departments: { name: string; can_access_pn: boolean } | null;
};

// Returns the signed-in user's profile, creating it on first sign-in from a pending
// invitation. Wrapped in React cache() so layout + page + actions in the same request
// share one lookup.
//
// Why the admin (secret-key) client here: the user has no profile yet, so every RLS
// helper returns null and the user client cannot read invitations or insert a profile.
// The input we trust is only what Clerk's server SDK gives us (user id, verified email),
// never anything from the browser.
export const getCurrentProfile = cache(async (): Promise<ProfileResult | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const db = createAdminClient();

  const existing = await db.from("profiles").select(PROFILE_COLUMNS).eq("clerk_id", userId).maybeSingle();
  if (existing.error) throw new Error("Could not load profile");
  if (existing.data) return toResult(db, existing.data as unknown as ProfileRow);

  // --- First sign-in: create the profile from the pending invitation ---
  const user = await currentUser();
  const primary = user?.primaryEmailAddress;
  if (!user || !primary || primary.verification?.status !== "verified") {
    return { status: "no-access", reason: "email-unverified" };
  }
  const email = primary.emailAddress.toLowerCase();
  if (!isAllowedEmail(email)) return { status: "no-access", reason: "domain" };

  // Case-insensitive exact match: ilike with its wildcards escaped ("_" is legal in emails).
  const pattern = escapeLike(email);
  const invitation = await db
    .from("invitations")
    .select("id, role, department_id, ambassador_id")
    .ilike("email", pattern)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (invitation.error) throw new Error("Could not load invitation");
  if (!invitation.data) return { status: "no-access", reason: "no-invitation" };

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;

  // Idempotent: two parallel first loads both reach this point; the second insert is
  // ignored (on conflict (clerk_id) do nothing) and both re-read the same row below.
  const inserted = await db.from("profiles").upsert(
    {
      clerk_id: userId,
      email,
      full_name: fullName,
      role: invitation.data.role,
      department_id: invitation.data.department_id,
    },
    { onConflict: "clerk_id", ignoreDuplicates: true },
  );
  if (inserted.error) throw new Error("Could not create profile");

  // ponytail: two separate writes, not one transaction. If this update fails the profile
  // still exists and the user is in; the invitation just stays "pending". Move both
  // writes into one SQL function if that ever happens in practice.
  await db.from("invitations").update({ status: "accepted" }).eq("id", invitation.data.id).eq("status", "pending");

  // An ambassador invited from PN: link the new account to their PN record, so the
  // platform opens for them. Only fills an empty link, never moves an existing one.
  if (invitation.data.ambassador_id) {
    await db.from("ambassadors").update({ profile_id: userId }).eq("id", invitation.data.ambassador_id).is("profile_id", null);
  }

  const created = await db.from("profiles").select(PROFILE_COLUMNS).eq("clerk_id", userId).single();
  if (created.error) throw new Error("Could not load profile");
  return toResult(db, created.data as unknown as ProfileRow);
});

async function toResult(db: ReturnType<typeof createAdminClient>, row: ProfileRow): Promise<ProfileResult> {
  if (!row.is_active) return { status: "no-access", reason: "inactive" };
  // Being an ambassador lives on the PN side (ambassadors.profile_id); the SQL function
  // answers for this one profile only.
  const platform = await db.rpc("has_platform_access", { p_id: row.clerk_id });
  if (platform.error) throw new Error("Could not check platform access");
  const actor: Actor = { role: row.role, departmentId: row.department_id, isSuperadmin: row.is_superadmin };
  return {
    status: "ok",
    profile: {
      ...actor,
      clerkId: row.clerk_id,
      email: row.email,
      fullName: row.full_name,
      departmentName: row.departments?.name ?? null,
      canAccessPn: canAccessPn(actor, row.departments?.can_access_pn ?? false),
      canAccessPlatform: platform.data === true,
    },
  };
}

// For server actions: the active profile or null. Never trust role data sent by the client.
export async function requireProfile(): Promise<Profile | null> {
  const result = await getCurrentProfile();
  return result?.status === "ok" ? result.profile : null;
}
