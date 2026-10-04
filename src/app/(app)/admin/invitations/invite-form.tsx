"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { needsDepartment, ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { createInvitation, type InviteState } from "./actions";

// Native <select> on purpose: it posts with the form, works without extra JS state
// and is accessible out of the box.
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function InviteForm({
  roles,
  departments,
  fixedDepartmentId,
}: {
  roles: AppRole[];
  departments: { id: number; name: string }[];
  fixedDepartmentId: number | null; // set for a VP: they can only invite into their own department
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvitation, null);
  const [role, setRole] = useState<AppRole>(roles[roles.length - 1]);

  return (
    <form action={action} className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required placeholder="nume@think-up.academy" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="role">Rol</Label>
        <select id="role" name="role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="departmentId">Departament</Label>
        {fixedDepartmentId !== null ? (
          <>
            <input type="hidden" name="departmentId" value={fixedDepartmentId} />
            <Input disabled value={departments.find((d) => d.id === fixedDepartmentId)?.name ?? ""} />
          </>
        ) : (
          <select id="departmentId" name="departmentId" className={selectClass} disabled={!needsDepartment(role)} defaultValue="">
            <option value="">{needsDepartment(role) ? "Alege…" : "—"}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <Button type="submit" disabled={pending} className="rounded-full">
        {pending ? "Se trimite…" : "Trimite invitația"}
      </Button>

      {state && (
        <p role="status" className={`text-sm md:col-span-4 ${state.ok ? "text-success" : "text-destructive"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
