import { redirect } from "next/navigation";
import { SectionLabel } from "@/components/section-label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { canSeeInvitations, invitableRoles, ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";

const STATUS_LABELS = { pending: "În așteptare", accepted: "Acceptată", revoked: "Revocată" } as const;

const dateFmt = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", dateStyle: "medium", timeStyle: "short" });

type InvitationRow = {
  id: string;
  email: string;
  role: AppRole;
  status: keyof typeof STATUS_LABELS;
  created_at: string;
  departments: { name: string } | null;
};

export default async function InvitationsPage() {
  const profile = await requireProfile();
  if (!profile || !canSeeInvitations(profile)) redirect("/dashboard");

  // User client: RLS (dept_read, inv_read) decides what comes back.
  const db = createUserClient();
  const [departments, invitations] = await Promise.all([
    db.from("departments").select("id, name").order("id"),
    db
      .from("invitations")
      .select("id, email, role, status, created_at, departments(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const roles = invitableRoles(profile);
  const isVpOnly = !profile.isSuperadmin && profile.role === "vp";

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <SectionLabel>Administrare</SectionLabel>
        <h1 className="text-2xl font-semibold">Invitații</h1>
        {isVpOnly && (
          <p className="text-sm text-muted-foreground">Ca VP poți invita doar mentori în departamentul tău.</p>
        )}
      </div>

      {roles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invită o persoană</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm
              roles={roles}
              departments={departments.data ?? []}
              fixedDepartmentId={isVpOnly ? profile.departmentId : null}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invitații trimise</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.error ? (
            <p className="text-sm text-destructive">Lista nu a putut fi încărcată.</p>
          ) : invitations.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nicio invitație încă.</p>
          ) : (
            <ul className="divide-y">
              {(invitations.data as unknown as InvitationRow[]).map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{inv.email}</span>
                  <span className="text-muted-foreground">
                    {ROLE_LABELS[inv.role]}
                    {inv.departments ? ` · ${inv.departments.name}` : ""}
                  </span>
                  <Badge variant={inv.status === "pending" ? "default" : "outline"}>{STATUS_LABELS[inv.status]}</Badge>
                  <time className="text-xs text-muted-foreground" dateTime={inv.created_at}>
                    {dateFmt.format(new Date(inv.created_at))}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
