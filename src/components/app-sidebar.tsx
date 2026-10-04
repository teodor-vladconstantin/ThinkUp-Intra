"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  FolderKanban,
  Images,
  FileText,
  Gavel,
  KanbanSquare,
  TriangleAlert,
  LayoutDashboard,
  ListChecks,
  Map,
  Megaphone,
  Trophy,
  UserRound,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { canSeeInvitations, isCd, isStaff, ROLE_LABELS, type Actor, type AppRole } from "@/lib/permissions";

// Only plain data crosses the server -> client boundary (no functions, no secrets).
export type SidebarUser = Actor & {
  fullName: string | null;
  departmentName: string | null;
  canAccessPn: boolean;
  canAccessPlatform: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  visible: (u: SidebarUser) => boolean;
  soon?: boolean; // built in a later phase: shown, but not clickable yet
};

// Role-aware navigation. Hiding a link is only UX: every page re-checks on the server.
// Intranet items need staff; students only ever see the platform group.
const staff = (more: (u: SidebarUser) => boolean = () => true) => (u: SidebarUser) => isStaff(u) && more(u);

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Acasă", icon: LayoutDashboard, visible: staff() },
  { href: "/tasks", label: "Sarcini", icon: ListChecks, visible: staff() },
  { href: "/board", label: "Board", icon: KanbanSquare, visible: staff() },
  { href: "/leadership", label: "Întârzieri", icon: TriangleAlert, visible: staff(isCd) },
  { href: "/meetings", label: "Ședințe", icon: CalendarDays, visible: staff() },
  { href: "/decisions", label: "Decizii", icon: Gavel, visible: staff() },
  { href: "/documents", label: "Documente", icon: FileText, visible: staff() },
  { href: "/announcements", label: "Anunțuri", icon: Megaphone, visible: staff() },
  { href: "/pn", label: "Program Național", icon: Map, visible: staff((u) => u.canAccessPn) },
  { href: "/admin/invitations", label: "Invitații", icon: UserPlus, visible: staff(canSeeInvitations) },
  { href: "/admin/users", label: "Utilizatori", icon: Users, visible: staff(canSeeInvitations) },
];

// The ambassadors platform: ambassadors and people with PN access.
const PLATFORM_NAV: NavItem[] = [
  { href: "/platform/projects", label: "Proiecte", icon: FolderKanban, visible: (u) => u.canAccessPlatform },
  { href: "/platform/challenges", label: "Challenge-uri", icon: Trophy, visible: (u) => u.canAccessPlatform },
  { href: "/platform/open-school", label: "Open School", icon: BookOpen, visible: (u) => u.canAccessPlatform },
  { href: "/platform/me", label: "Profilul meu", icon: UserRound, visible: (u) => u.canAccessPlatform },
  // Board only: CEO, President, Secretary, every VP, superadmin (is_cd in the database).
  { href: "/platform/gallery", label: "Galerie", icon: Images, visible: isCd },
];

export function AppSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5">
        {/* TODO(logo): replace with the light logo from public/logos/ once it is copied in */}
        <Link href={isStaff(user) ? "/dashboard" : "/platform"} className="text-lg font-semibold tracking-tight">
          ThinkUp <span className="text-sidebar-primary">Intranet</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {[
          { label: "Intranet", items: NAV },
          { label: "Platforma ambasadorilor", items: PLATFORM_NAV },
        ].map((group) => {
          const items = group.items.filter((item) => item.visible(user));
          if (items.length === 0) return null;
          return (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
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
          );
        })}
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
