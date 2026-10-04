import { UserButton } from "@clerk/nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { Profile } from "@/lib/auth";

// Sidebar + header + work area, shared by the intranet and the platform layouts.
// `banner` sits between the header and the page (the intranet's overdue strip).
export function AppShell({ profile, banner, children }: { profile: Profile; banner?: React.ReactNode; children: React.ReactNode }) {
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
          canAccessPlatform: profile.canAccessPlatform,
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
        {banner}
        <div className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
