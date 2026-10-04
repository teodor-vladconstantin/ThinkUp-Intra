import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { NoAccess } from "@/components/no-access";
import { getCurrentProfile } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { myAlertCounts } from "@/lib/tasks-server";

// Route guard for every page inside (app): runs on the server on each request.
// proxy.ts already redirected signed-out users; here we also require an ACTIVE profile.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentProfile();
  if (!result) redirect("/sign-in");
  if (result.status === "no-access") return <NoAccess reason={result.reason} />;

  const { profile } = result;
  // The intranet is staff only (RLS: is_staff()). Students live on the platform.
  if (!isStaff(profile)) {
    if (profile.canAccessPlatform) redirect("/platform");
    return <NoAccess reason="student" />;
  }
  const { overdue } = await myAlertCounts(createUserClient(), profile);
  const overdueHref = profile.role === "mentor" ? "/tasks?scope=mine&alert=overdue" : "/tasks?alert=overdue";

  return (
    <AppShell
      profile={profile}
      banner={
        // PRD 5.2: persistent count of the user's own overdue tasks, on every page
        overdue > 0 && (
          <Link
            href={overdueHref}
            className="block bg-destructive px-4 py-2 text-center text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            {overdue === 1 ? "Ai o sarcină întârziată" : `Ai ${overdue} sarcini întârziate`} → vezi lista
          </Link>
        )
      }
    >
      {children}
    </AppShell>
  );
}
