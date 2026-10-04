import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { NoAccess } from "@/components/no-access";
import { getCurrentProfile } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";

// The ambassadors platform: ambassadors and anyone with PN access (can_access_platform).
// Tech/MK staff who are not ambassadors go back to the intranet; RLS returns them nothing anyway.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentProfile();
  if (!result) redirect("/sign-in");
  if (result.status === "no-access") return <NoAccess reason={result.reason} />;

  const { profile } = result;
  if (!profile.canAccessPlatform) {
    if (isStaff(profile)) redirect("/dashboard");
    return <NoAccess reason="student" />;
  }
  return <AppShell profile={profile}>{children}</AppShell>;
}
