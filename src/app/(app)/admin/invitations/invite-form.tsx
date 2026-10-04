"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { needsDepartment, ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { createInvitation, type InviteState } from "./actions";


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
        <Select
          id="role"
          name="role"
          value={role}
          onValueChange={(v) => setRole(v as AppRole)}
          options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="departmentId">Departament</Label>
        {fixedDepartmentId !== null ? (
          <>
            <input type="hidden" name="departmentId" value={fixedDepartmentId} />
            <Input disabled value={departments.find((d) => d.id === fixedDepartmentId)?.name ?? ""} />
          </>
        ) : (
          <Select
            key={needsDepartment(role) ? "dept" : "no-dept"}
            id="departmentId"
            name="departmentId"
            disabled={!needsDepartment(role)}
            placeholder={needsDepartment(role) ? "Alege…" : "—"}
            options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
          />
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
