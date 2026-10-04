"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { FormState } from "@/app/(app)/pn/actions";
import { SCHOOL_STATUS_LABELS, SCHOOL_STATUSES, type SchoolStatus } from "@/lib/pn";

type School = {
  id: number;
  name: string;
  city: string | null;
  county_code: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: SchoolStatus;
};

export function SchoolForm({
  action,
  counties,
  school,
  defaultCounty,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  counties: { code: string; name: string }[];
  school?: School;
  defaultCounty?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="grid gap-4">
      {school && <input type="hidden" name="id" value={school.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nume liceu" id="name">
          <Input id="name" name="name" required maxLength={200} defaultValue={school?.name} />
        </Field>
        <Field label="Oraș" id="city">
          <Input id="city" name="city" maxLength={100} defaultValue={school?.city ?? ""} />
        </Field>
        <Field label="Județ" id="countyCode">
          <Select
            id="countyCode"
            name="countyCode"
            required
            defaultValue={school?.county_code ?? defaultCounty ?? ""}
            options={counties.map((c) => ({ value: c.code, label: c.name }))}
          />
        </Field>
        <Field label="Status relație" id="status">
          <Select
            id="status"
            name="status"
            defaultValue={school?.status ?? "contacted"}
            options={SCHOOL_STATUSES.map((s) => ({ value: s, label: SCHOOL_STATUS_LABELS[s] }))}
          />
        </Field>
        <Field label="Persoană de contact" id="contactName">
          <Input id="contactName" name="contactName" maxLength={150} defaultValue={school?.contact_name ?? ""} autoComplete="off" />
        </Field>
        <Field label="Email contact" id="contactEmail">
          <Input id="contactEmail" name="contactEmail" type="email" maxLength={200} defaultValue={school?.contact_email ?? ""} autoComplete="off" />
        </Field>
        <Field label="Telefon contact" id="contactPhone">
          <Input id="contactPhone" name="contactPhone" type="tel" maxLength={40} defaultValue={school?.contact_phone ?? ""} autoComplete="off" />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Se salvează…" : school ? "Salvează" : "Adaugă liceul"}
        </Button>
        {state && <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-destructive"}`}>{state.message}</p>}
      </div>
    </form>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
