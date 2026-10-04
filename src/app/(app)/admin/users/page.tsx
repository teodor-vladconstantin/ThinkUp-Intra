import { redirect } from "next/navigation";
import { UserActiveButton } from "@/components/admin/user-active-button";
import { SectionLabel } from "@/components/section-label";
import { requireProfile } from "@/lib/auth";
import { canManageUser, canSeeInvitations, ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";

type Row = {
  clerk_id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  department_id: number | null;
  is_superadmin: boolean;
  is_active: boolean;
  department: { name: string } | null;
};

// Same audience as invitations (superadmin, CEO, President, VPs). Buttons show only
// where canManageUser() allows; set_user_active() re-checks in the database.
export default async function UsersPage() {
  const profile = await requireProfile();
  if (!profile || !canSeeInvitations(profile)) redirect("/dashboard");

  const { data } = await createUserClient()
    .from("profiles")
    .select("clerk_id, email, full_name, role, department_id, is_superadmin, is_active, department:departments(name)")
    .order("is_active", { ascending: false })
    .order("full_name");
  const users = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Administrare</SectionLabel>
        <h1 className="text-2xl font-semibold">Utilizatori</h1>
        <p className="text-sm text-muted-foreground">
          Un cont dezactivat pierde imediat accesul; sarcinile lui deschise apar ca nealocate.
        </p>
      </div>

      <ul className="divide-y rounded-xl border bg-card">
        {users.map((u) => {
          const target = { clerkId: u.clerk_id, role: u.role, departmentId: u.department_id, isSuperadmin: u.is_superadmin };
          return (
            <li key={u.clerk_id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 p-4 ${u.is_active ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {u.full_name ?? "—"}
                  {!u.is_active && <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px]">Dezactivat</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <span className="text-sm text-muted-foreground">
                {ROLE_LABELS[u.role]}
                {u.department ? ` ${u.department.name}` : ""}
                {u.is_superadmin ? " · superadmin" : ""}
              </span>
              {canManageUser(profile, target) && (
                <UserActiveButton clerkId={u.clerk_id} active={u.is_active} name={u.full_name ?? u.email} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
