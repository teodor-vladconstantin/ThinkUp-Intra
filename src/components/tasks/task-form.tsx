"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/app/(app)/tasks/actions";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/tasks";

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export type Person = { clerk_id: string; full_name: string | null; department_id: number | null };

type Defaults = {
  id?: string;
  title?: string;
  description?: string | null;
  priority?: number;
  deadline?: string; // YYYY-MM-DD
  assigneeId?: string | null;
  departmentId?: number | null;
  meetingId?: string;
};

// One form for create and edit. Department choices are already filtered on the server
// (a mentor only gets their own); the assignee list follows the chosen department and
// always includes people without a department (CEO, President, Secretary).
export function TaskForm({
  action,
  departments,
  people,
  defaults = {},
  canChangeDepartment,
  submitLabel,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  departments: { id: number; name: string }[];
  people: Person[];
  defaults?: Defaults;
  canChangeDepartment: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [departmentId, setDepartmentId] = useState<number | null>(defaults.departmentId ?? departments[0]?.id ?? null);
  const assignable = people.filter((p) => p.department_id === departmentId || p.department_id === null);

  return (
    <form action={formAction} className="grid gap-4">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.meetingId && <input type="hidden" name="meetingId" value={defaults.meetingId} />}

      <div className="grid gap-1.5">
        <Label htmlFor="title">Titlu</Label>
        <Input id="title" name="title" required maxLength={200} defaultValue={defaults.title} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="description">Descriere</Label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={5000}
          defaultValue={defaults.description ?? ""}
          className="rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="departmentId">Departament executant</Label>
          {canChangeDepartment ? (
            <select
              id="departmentId"
              name="departmentId"
              className={selectClass}
              value={departmentId ?? ""}
              onChange={(e) => setDepartmentId(Number(e.target.value))}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="departmentId" value={departmentId ?? ""} />
              <Input disabled value={departments.find((d) => d.id === departmentId)?.name ?? ""} />
            </>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="assigneeId">Responsabil</Label>
          <select id="assigneeId" name="assigneeId" className={selectClass} defaultValue={defaults.assigneeId ?? ""} key={departmentId}>
            <option value="">Nealocat</option>
            {assignable.map((p) => (
              <option key={p.clerk_id} value={p.clerk_id}>
                {p.full_name ?? p.clerk_id}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="deadline">Termen</Label>
          <Input id="deadline" name="deadline" type="date" defaultValue={defaults.deadline} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="priority">Prioritate</Label>
          <select id="priority" name="priority" className={selectClass} defaultValue={defaults.priority ?? 2}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Se salvează…" : submitLabel}
        </Button>
        {state && (
          <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-destructive"}`}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
