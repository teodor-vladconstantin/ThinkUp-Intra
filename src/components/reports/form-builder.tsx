"use client";

import { useState } from "react";
import { ActionForm, fieldClass } from "@/components/platform/controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createReportForm } from "@/app/(app)/reports/actions";
import { FIELD_TYPES, type FieldType, type ReportField } from "@/lib/reports";

type Draft = { id: string; type: FieldType; label: string; required: boolean; options: string };
const blank = (): Draft => ({ id: Math.random().toString(36).slice(2, 10).padEnd(4, "0"), type: "text", label: "", required: false, options: "" });

// The CD builds a form here. Fields are sent as one JSON value; the server validates it again.
export function FormBuilder() {
  const [fields, setFields] = useState<Draft[]>([blank()]);
  const set = (i: number, patch: Partial<Draft>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) =>
    setFields((fs) => {
      const j = i + d;
      if (j < 0 || j >= fs.length) return fs;
      const c = [...fs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const json = JSON.stringify(
    fields.map<ReportField>((f) => ({
      id: f.id,
      type: f.type,
      label: f.label,
      required: f.required,
      ...(f.type === "select" || f.type === "multiselect" ? { options: f.options.split("\n").map((o) => o.trim()).filter(Boolean) } : {}),
    })),
  );

  return (
    <ActionForm action={createReportForm} submitLabel="Creează formularul" className="space-y-4">
      <Input name="title" required maxLength={200} placeholder="Titlul formularului (ex. Raport lunar)" aria-label="Titlu" />
      <textarea name="description" rows={2} maxLength={2000} placeholder="Descriere (opțional)" aria-label="Descriere" className={fieldClass} />
      <input type="hidden" name="fields" value={json} />
      <ol className="space-y-3">
        {fields.map((f, i) => (
          <li key={f.id} className="space-y-2 rounded-lg border p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
              <Input value={f.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Întrebarea" aria-label={`Întrebarea ${i + 1}`} maxLength={200} />
              <select value={f.type} onChange={(e) => set(i, { type: e.target.value as FieldType })} aria-label="Tip câmp" className={fieldClass}>
                {Object.entries(FIELD_TYPES).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
            {(f.type === "select" || f.type === "multiselect") && (
              <textarea value={f.options} onChange={(e) => set(i, { options: e.target.value })} rows={3} placeholder="O opțiune pe rând (minim 2)" aria-label="Opțiuni" className={fieldClass} />
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={f.required} onChange={(e) => set(i, { required: e.target.checked })} /> Obligatoriu
              </label>
              <span className="ml-auto flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === fields.length - 1}>↓</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} disabled={fields.length === 1}>Șterge</Button>
              </span>
            </div>
          </li>
        ))}
      </ol>
      <Button type="button" variant="outline" onClick={() => setFields((fs) => [...fs, blank()])}>+ Adaugă câmp</Button>
    </ActionForm>
  );
}
