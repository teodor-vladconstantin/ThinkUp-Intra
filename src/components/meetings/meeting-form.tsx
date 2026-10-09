"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { FormState } from "@/app/(app)/meetings/actions";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";

export type MeetingPerson = { clerk_id: string; full_name: string | null; department_id: number | null; role: string };
// One choice in "Tip ședință": a CD meeting, or a department meeting for one department.
export type MeetingTarget = { value: string; label: string; kind: "cd" | "department"; departmentId: number | null };
type FollowUp = { title: string; assigneeId: string; deadline: string };

const textareaClass =
  "rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// The minutes template from PRD 5.4: attendees, minutes, decisions, follow-up tasks.
// In edit mode the type is fixed (it decides who can read the minutes) and decisions /
// tasks are added from the meeting page instead.
export function MeetingForm({
  action,
  targets,
  people,
  mode,
  defaults = {},
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  targets: MeetingTarget[];
  people: MeetingPerson[];
  mode: "create" | "edit";
  defaults?: { id?: string; title?: string; heldAt?: string; minutes?: string | null; attendees?: string[]; target?: string };
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [targetValue, setTargetValue] = useState(defaults.target ?? targets[0]?.value ?? "");
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const target = targets.find((t) => t.value === targetValue) ?? targets[0];
  const attendees = new Set(defaults.attendees ?? []);

  // Who can attend: CD members for a CD meeting, the department for a department meeting.
  // People already marked present stay listed even if they changed role since.
  const present = people.filter((p) =>
    target?.kind === "cd" ? p.role !== "mentor" || attendees.has(p.clerk_id) : p.department_id === target?.departmentId || attendees.has(p.clerk_id),
  );
  const assignable = target?.kind === "cd" ? people : people.filter((p) => p.department_id === target?.departmentId || p.department_id === null);

  const updateRow = (i: number, patch: Partial<FollowUp>) =>
    setFollowUps((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form action={formAction} className="grid gap-5">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <input type="hidden" name="kind" value={target?.kind ?? ""} />
      <input type="hidden" name="departmentId" value={target?.departmentId ?? ""} />

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="title">Titlu</Label>
          <Input id="title" name="title" required maxLength={200} defaultValue={defaults.title} placeholder="Ședința săptămânală" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="target">Tip</Label>
          <Select
            id="target"
            value={targetValue}
            disabled={mode === "edit"}
            onValueChange={setTargetValue}
            options={targets.map((t) => ({ value: t.value, label: t.label }))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="heldAt">Data</Label>
          <DatePicker id="heldAt" name="heldAt" required defaultValue={defaults.heldAt} />
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Participanți</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {present.map((p) => (
            <label key={p.clerk_id} className="flex items-center gap-2 text-sm">
              <Checkbox name="attendees" value={p.clerk_id} defaultChecked={attendees.has(p.clerk_id)} />
              {p.full_name ?? "—"}
            </label>
          ))}
          {present.length === 0 && <p className="text-sm text-muted-foreground">Nicio persoană în acest departament.</p>}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="minutes">Minuta</Label>
        <textarea id="minutes" name="minutes" rows={8} maxLength={20000} defaultValue={defaults.minutes ?? ""} className={textareaClass} />
      </div>

      {mode === "create" && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="decisions">Decizii</Label>
            <textarea id="decisions" name="decisions" rows={4} className={textareaClass} placeholder="O decizie pe rând" />
            <p className="text-xs text-muted-foreground">Fiecare rând devine o decizie în registru.</p>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Sarcini de urmat</legend>
            <input type="hidden" name="tasks" value={JSON.stringify(followUps.filter((r) => r.title.trim()))} />
            {followUps.map((row, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto_auto] sm:items-center">
                <Input aria-label="Titlu sarcină" value={row.title} maxLength={200} onChange={(e) => updateRow(i, { title: e.target.value })} placeholder="Ce trebuie făcut" />
                <Select
                  aria-label="Responsabil"
                  value={row.assigneeId}
                  onValueChange={(v) => updateRow(i, { assigneeId: v })}
                  options={[{ value: "", label: "Nealocat" }, ...assignable.map((p) => ({ value: p.clerk_id, label: p.full_name ?? "—" }))]}
                />
                <DatePicker aria-label="Termen" placeholder="Termen" value={row.deadline} onValueChange={(v) => updateRow(i, { deadline: v })} />
                <Button type="button" variant="ghost" size="icon" aria-label="Șterge rândul" onClick={() => setFollowUps((rows) => rows.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => setFollowUps((rows) => [...rows, { title: "", assigneeId: "", deadline: "" }])}
            >
              <Plus /> Adaugă sarcină
            </Button>
          </fieldset>
        </>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Se salvează…" : mode === "create" ? "Salvează ședința" : "Salvează"}
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
