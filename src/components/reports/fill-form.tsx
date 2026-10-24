import { ActionForm, fieldClass } from "@/components/platform/controls";
import { Input } from "@/components/ui/input";
import { submitReport } from "@/app/(app)/reports/actions";
import { answerName, type ReportField } from "@/lib/reports";

// Server-rendered inputs named f_<fieldId>; the server action checks them against the fields.
export function FillForm({ formId, fields }: { formId: string; fields: ReportField[] }) {
  return (
    <ActionForm action={submitReport} submitLabel="Trimite raportul" className="space-y-4">
      <input type="hidden" name="formId" value={formId} />
      {fields.map((f) => {
        const name = answerName(f.id);
        return (
          <fieldset key={f.id} className="space-y-1.5">
            <legend className="text-sm font-medium">
              {f.label}
              {f.required && <span className="text-destructive"> *</span>}
            </legend>
            {f.type === "text" && <Input name={name} maxLength={300} required={f.required} />}
            {f.type === "textarea" && <textarea name={name} rows={4} maxLength={5000} required={f.required} className={fieldClass} />}
            {f.type === "number" && <Input name={name} type="number" step="any" required={f.required} />}
            {f.type === "date" && <Input name={name} type="date" required={f.required} />}
            {f.type === "url" && <Input name={name} type="url" placeholder="https://" maxLength={500} required={f.required} />}
            {f.type === "select" && (
              <select name={name} required={f.required} defaultValue="" className={fieldClass}>
                <option value="">Alege…</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            )}
            {f.type === "multiselect" &&
              f.options?.map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={name} value={o} /> {o}
                </label>
              ))}
            {f.type === "yesno" &&
              (["yes", "no"] as const).map((v, i) => (
                <label key={v} className="mr-4 inline-flex items-center gap-2 text-sm">
                  <input type="radio" name={name} value={v} required={f.required && i === 0} /> {v === "yes" ? "Da" : "Nu"}
                </label>
              ))}
            {f.type === "scale" &&
              [1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="mr-4 inline-flex items-center gap-1.5 text-sm">
                  <input type="radio" name={name} value={n} required={f.required && n === 1} /> {n}
                </label>
              ))}
          </fieldset>
        );
      })}
    </ActionForm>
  );
}
