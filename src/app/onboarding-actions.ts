"use server";

import { requireProfile } from "@/lib/auth";
import { ONBOARDING_VERSION } from "@/lib/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";

// Finished or closed: either way the tour does not come back until the version is bumped.
export async function completeOnboarding() {
  const profile = await requireProfile();
  if (!profile) return;
  await createAdminClient().from("profiles").update({ onboarding_version: ONBOARDING_VERSION }).eq("clerk_id", profile.clerkId);
}
