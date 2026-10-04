"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { FormState } from "@/app/(app)/tasks/actions";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/tasks";
import { DatePicker } from "@/components/ui/date-picker";

export type Person = { clerk_id: string; full_name: string | null; department_id: number | null };
export type PnOptions = {
  schools: { id: number; name: string; county_code: string }[];
  counties: { code: string; name: string; zone_id: number | null }[];
  zones: { id: number; name: string }[];
};

type Defaults = {
  id?: string;
  title?: string;
  description?: string | null;
  priority?: number;
  deadline?: string; // YYYY-MM-DD
  assigneeId?: string | null;
  departmentId?: number | null;
  meetingId?: string;
  schoolId?: number | null;
  countyCode?: string | null;
  zoneId?: number | null;
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
  pn = null,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  departments: { id: number; name: string }[];
  people: Person[];
  defaults?: Defaults;
  canChangeDepartment: boolean;
  submitLabel: string;
  pn?: PnOptions | null; // only for users with PN access
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
            <Select
              id="departmentId"
              name="departmentId"
              value={departmentId != null ? String(departmentId) : ""}
              onValueChange={(v) => setDepartmentId(Number(v))}
              options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
            />
          ) : (
            <>
              <input type="hidden" name="departmentId" value={departmentId ?? ""} />
              <Input disabled value={departments.find((d) => d.id === departmentId)?.name ?? ""} />
            </>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="assigneeId">Responsabil</Label>
          <Select
            id="assigneeId"
            name="assigneeId"
            key={departmentId}
            defaultValue={defaults.assigneeId ?? ""}
            options={[{ value: "", label: "Nealocat" }, ...assignable.map((p) => ({ value: p.clerk_id, label: p.full_name ?? p.clerk_id }))]}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="deadline">Termen</Label>
          <DatePicker id="deadline" name="deadline" placeholder="Fără termen" defaultValue={defaults.deadline} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="priority">Prioritate</Label>
          <Select
            id="priority"
            name="priority"
            defaultValue={String(defaults.priority ?? 2)}
            options={PRIORITIES.map((p) => ({ value: String(p), label: PRIORITY_LABELS[p] }))}
          />
        </div>
      </div>

      {pn && (
        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-medium">Legătură Program Național (opțional)</legend>
          {/* Marker: tells the action this form sends PN links, so it may change them. */}
          <input type="hidden" name="pnLinks" value="1" />
          <PnLinkFields pn={pn} defaults={defaults} />
        </fieldset>
      )}

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

// School -> county -> zone, restrictive on purpose (no impossible combinations):
//  - a school decides its county and zone (both locked, filled in automatically);
//  - a county decides its zone (locked);
//  - picking a zone or a county first narrows the lists below it.
// The server derives the same way, so a hand-made request cannot break it either.
function PnLinkFields({ pn, defaults }: { pn: PnOptions; defaults: Defaults }) {
  const [schoolId, setSchoolId] = useState(defaults.schoolId != null ? String(defaults.schoolId) : "");
  const [countyCode, setCountyCode] = useState(defaults.countyCode ?? "");
  const [zoneId, setZoneId] = useState(defaults.zoneId != null ? String(defaults.zoneId) : "");

  const zoneOf = (code: string) => {
    const z = pn.counties.find((c) => c.code === code)?.zone_id;
    return z != null ? String(z) : "";
  };

  function pickSchool(v: string) {
    setSchoolId(v)
    const school = pn.schools.find((s) => String(s.id) === v)
    if (school) {
      setCountyCode(school.county_code)
      setZoneId(zoneOf(school.county_code))
    }
  }
  function pickCounty(v: string) {
    setCountyCode(v)
    setZoneId(v ? zoneOf(v) : "")
    const school = pn.schools.find((s) => String(s.id) === schoolId)
    if (school && school.county_code !== v) setSchoolId("")
  }

  const countiesInZone = (zone: string) => pn.counties.filter((c) => zone === "" || zoneOf(c.code) === zone)
  const countyOptions = countiesInZone(zoneId)
  const schoolOptions = pn.schools.filter((s) => {
    if (countyCode) return s.county_code === countyCode
    if (zoneId) return countiesInZone(zoneId).some((c) => c.code === s.county_code)
    return true
  })

  const schoolPicked = schoolId !== ""
  const hint = schoolPicked
    ? "Județul și zona se completează automat din liceu."
    : countyCode
      ? "Zona se completează automat din județ."
      : "Alege liceul (sau județul / zona, ca să restrângi lista).";

  return (
    <>
      <Select
        name="schoolId"
        aria-label="Liceu"
        value={schoolId}
        onValueChange={pickSchool}
        options={[{ value: "", label: "Fără liceu" }, ...schoolOptions.map((s) => ({ value: String(s.id), label: s.name }))]}
      />
      <Select
        name="countyCode"
        aria-label="Județ"
        value={countyCode}
        disabled={schoolPicked}
        onValueChange={pickCounty}
        options={[{ value: "", label: "Fără județ" }, ...countyOptions.map((c) => ({ value: c.code, label: c.name }))]}
      />
      <Select
        name="zoneId"
        aria-label="Zonă"
        value={zoneId}
        disabled={schoolPicked || countyCode !== ""}
        onValueChange={setZoneId}
        options={[{ value: "", label: "Fără zonă" }, ...pn.zones.map((z) => ({ value: String(z.id), label: z.name }))]}
      />
      <p className="text-xs text-muted-foreground sm:col-span-3">{hint}</p>
    </>
  );
}
