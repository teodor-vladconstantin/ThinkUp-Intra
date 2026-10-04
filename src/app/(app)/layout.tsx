import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { NoAccess } from "@/components/no-access";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getCurrentProfile } from "@/lib/auth";

// Route guard for every page inside (app): runs on the server on each request.
// proxy.ts already redirected signed-out users; here we also require an ACTIVE profile.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentProfile();
  if (!result) redirect("/sign-in");
  if (result.status === "no-access") return <NoAccess reason={result.reason} />;

  const { profile } = result;
  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          role: profile.role,
          departmentId: profile.departmentId,
          isSuperadmin: profile.isSuperadmin,
          fullName: profile.fullName,
          departmentName: profile.departmentName,
          canAccessPn: profile.canAccessPn,
        }}
      />
      <SidebarInset className="bg-workspace">
        {/* Dark, glassy header that stays on top while the work area scrolls */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar/95 px-4 text-sidebar-foreground backdrop-blur-md">
          <SidebarTrigger />
          <div className="ml-auto">
            <UserButton />
          </div>
        </header>
        {/* Banner area (overdue count, announcements) is added in phase 2 */}
        <div className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
