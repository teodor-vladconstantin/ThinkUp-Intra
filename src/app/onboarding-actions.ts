"use server";

import { requireProfile } from "@/lib/auth";
import { ONBOARDING_VERSION } from "@/lib/onboarding";
import { SECTION_TOURS } from "@/lib/section-tours";
import { createAdminClient } from "@/lib/supabase/admin";

// Finished or closed: either way the tour does not come back until the version is bumped.
export async function completeOnboarding() {
  const profile = await requireProfile();
  if (!profile) return;
  await createAdminClient().from("profiles").update({ onboarding_version: ONBOARDING_VERSION }).eq("clerk_id", profile.clerkId);
}

// A page's own tour was shown. ponytail: read-then-write, so two tabs finishing different
// tours at the same instant can drop one key; that page's tour then shows once more.
export async function markSectionSeen(key: string) {
  const profile = await requireProfile();
  if (!profile || !SECTION_TOURS.some((s) => s.key === key) || profile.onboardingSections.includes(key)) return;
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("onboarding_sections").eq("clerk_id", profile.clerkId).single();
  const seen = new Set<string>((data?.onboarding_sections as string[] | undefined) ?? []);
  seen.add(key);
  await db.from("profiles").update({ onboarding_sections: [...seen] }).eq("clerk_id", profile.clerkId);
}
