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
  useSidebar,
} from "@/components/ui/sidebar";
import { canSeeInvitations, isCd, isStaff, ROLE_LABELS, type Actor, type AppRole } from "@/lib/permissions";

// Only plain data crosses the server -> client boundary (no functions, no secrets).
export type SidebarUser = Actor & {
  fullName: string | null;
  departmentName: string | null;
  canAccessPn: boolean;
  canAccessPlatform: boolean;
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  hint: string; // shown by the onboarding tour
  visible: (u: SidebarUser) => boolean;
  soon?: boolean; // built in a later phase: shown, but not clickable yet
};

// Role-aware navigation. Hiding a link is only UX: every page re-checks on the server.
// Intranet items need staff; students only ever see the platform group.
const staff = (more: (u: SidebarUser) => boolean = () => true) => (u: SidebarUser) => isStaff(u) && more(u);

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Acasă", icon: LayoutDashboard, hint: "Prima pagină: sarcinile tale și ce s-a mai întâmplat de curând.", visible: staff() },
  { href: "/tasks", label: "Sarcini", icon: ListChecks, hint: "Aici găsești sarcinile tale și ale departamentului. Termenele depășite apar și într-o bandă roșie, sus.", visible: staff() },
  { href: "/board", label: "Board", icon: KanbanSquare, hint: "Aceleași sarcini, pe coloane după stare. Le muți dintr-o coloană în alta.", visible: staff() },
  { href: "/leadership", label: "Întârzieri", icon: TriangleAlert, hint: "Sarcinile întârziate din toate departamentele, pentru conducere.", visible: staff(isCd) },
  { href: "/meetings", label: "Ședințe", icon: CalendarDays, hint: "Ședințele echipei, cu agenda și notițele lor.", visible: staff() },
  { href: "/decisions", label: "Decizii", icon: Gavel, hint: "Deciziile luate, ca să nu se piardă în conversații.", visible: staff() },
  { href: "/documents", label: "Documente", icon: FileText, hint: "Documentele echipei, într-un singur loc.", visible: staff() },
  { href: "/announcements", label: "Anunțuri", icon: Megaphone, hint: "Anunțurile importante pentru toată organizația.", visible: staff() },
  { href: "/pn", label: "Program Național", icon: Map, hint: "Programul Național: zone, județe, licee, ambasadori și jurnalul de contact.", visible: staff((u) => u.canAccessPn) },
  { href: "/admin/invitations", label: "Invitații", icon: UserPlus, hint: "Aici inviți oameni noi. Fără invitație nimeni nu poate intra.", visible: staff(canSeeInvitations) },
  { href: "/admin/users", label: "Utilizatori", icon: Users, hint: "Lista utilizatorilor: roluri, departamente, cine e activ.", visible: staff(canSeeInvitations) },
];

// The ambassadors platform: ambassadors and people with PN access.
export const PLATFORM_NAV: NavItem[] = [
  { href: "/platform/projects", label: "Proiecte", icon: FolderKanban, hint: "Proiectele ambasadorilor. Setările proiectului se salvează singure, iar pozele și PDF-ul se salvează imediat.", visible: (u) => u.canAccessPlatform },
  { href: "/platform/challenges", label: "Challenge-uri", icon: Trophy, hint: "Challenge-urile active și notele primite pe criterii.", visible: (u) => u.canAccessPlatform },
  { href: "/platform/open-school", label: "Open School", icon: BookOpen, hint: "Open School: materialele și activitatea ta.", visible: (u) => u.canAccessPlatform },
  { href: "/platform/me", label: "Profilul meu", icon: UserRound, hint: "Profilul tău: proiectele, notele și progresul.", visible: (u) => u.canAccessPlatform },
  // Board only: CEO, President, Secretary, every VP, superadmin (is_cd in the database).
  { href: "/platform/gallery", label: "Galerie", icon: Images, hint: "Galeria cu pozele din toate proiectele.", visible: isCd },
];

export function AppSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const closeMobile = () => setOpenMobile(false); // phone: the sheet must not stay over the new page

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5">
        {/* TODO(logo): replace with the light logo from public/logos/ once it is copied in */}
        <Link href={isStaff(user) ? "/dashboard" : "/platform"} className="text-lg font-semibold tracking-tight" onClick={closeMobile}>
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
                      <Link href={item.href} onClick={closeMobile} data-tour={item.href}>
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
        <button type="button" className="mb-2 w-fit underline-offset-2 hover:underline" onClick={() => window.dispatchEvent(new Event("thinkup:tour"))}>
          Tur ghidat
        </button>
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
