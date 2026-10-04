"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FileText,
  Gavel,
  KanbanSquare,
  TriangleAlert,
  LayoutDashboard,
  ListChecks,
  Map,
  Megaphone,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { canSeeInvitations, isCd, ROLE_LABELS, type Actor, type AppRole } from "@/lib/permissions";

// Only plain data crosses the server -> client boundary (no functions, no secrets).
export type SidebarUser = Actor & {
  fullName: string | null;
  departmentName: string | null;
  canAccessPn: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  visible: (u: SidebarUser) => boolean;
  soon?: boolean; // built in a later phase: shown, but not clickable yet
};

// Role-aware navigation. Hiding a link is only UX: every page re-checks on the server.
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Acasă", icon: LayoutDashboard, visible: () => true },
  { href: "/tasks", label: "Sarcini", icon: ListChecks, visible: () => true },
  { href: "/board", label: "Board", icon: KanbanSquare, visible: () => true },
  { href: "/leadership", label: "Întârzieri", icon: TriangleAlert, visible: isCd },
  { href: "/meetings", label: "Ședințe", icon: CalendarDays, visible: () => true },
  { href: "/decisions", label: "Decizii", icon: Gavel, visible: () => true },
  { href: "/documents", label: "Documente", icon: FileText, visible: () => true },
  { href: "/announcements", label: "Anunțuri", icon: Megaphone, visible: () => true },
  { href: "/pn", label: "Program Național", icon: Map, visible: (u) => u.canAccessPn, soon: true },
  { href: "/admin/invitations", label: "Invitații", icon: UserPlus, visible: canSeeInvitations },
];

export function AppSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5">
        {/* TODO(logo): replace with the light logo from public/logos/ once it is copied in */}
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          ThinkUp <span className="text-sidebar-primary">Intranet</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.filter((item) => item.visible(user)).map((item) => (
                <SidebarMenuItem key={item.href}>
                  {item.soon ? (
                    <SidebarMenuButton disabled aria-disabled className="nav-link pr-14 opacity-50">
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)} className="nav-link">
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                  {item.soon && <SidebarMenuBadge className="text-[10px] opacity-60">curând</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-4 text-xs text-sidebar-foreground/70">
        <p className="font-medium text-sidebar-foreground">{user.fullName ?? "—"}</p>
        <p>{roleLine(user.role, user.departmentName, user.isSuperadmin)}</p>
      </SidebarFooter>
    </Sidebar>
  );
}

function roleLine(role: AppRole, dept: string | null, superadmin: boolean) {
  const base = dept ? `${ROLE_LABELS[role]} ${dept}` : ROLE_LABELS[role];
  return superadmin ? `${base} · superadmin` : base;
}
