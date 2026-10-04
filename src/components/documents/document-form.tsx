"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/components/tasks/task-form";
import { createDocument, type FormState } from "@/app/(app)/documents/actions";
import { VISIBILITIES, VISIBILITY_LABELS, type Visibility } from "@/lib/documents";

export function DocumentForm({ departments, defaultDepartmentId }: { departments: { id: number; name: string }[]; defaultDepartmentId: number | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createDocument, null);
  const [visibility, setVisibility] = useState<Visibility>("department");
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="doc-title">Titlu</Label>
          <Input id="doc-title" name="title" required maxLength={200} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="doc-url">Link Google Drive</Label>
          <Input id="doc-url" name="url" type="url" required placeholder="https://drive.google.com/…" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="doc-visibility">Cine vede linkul</Label>
          <select id="doc-visibility" name="visibility" className={selectClass} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="doc-dept">Departament</Label>
          <select id="doc-dept" name="departmentId" className={selectClass} defaultValue={defaultDepartmentId ?? ""} required={visibility === "department"}>
            <option value="">{visibility === "department" ? "Alege…" : "—"}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* PRD 5.5: the intranet only controls who sees the link. */}
      <p className="flex items-start gap-2 rounded-lg bg-accent/60 p-3 text-xs text-accent-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Intranetul controlează doar cine vede linkul. Cine poate deschide fișierul se setează din Google Drive (Partajare).
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Se salvează…" : "Adaugă document"}
        </Button>
        {state && <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-destructive"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
