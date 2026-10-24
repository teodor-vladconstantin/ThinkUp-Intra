import { ActionForm, fieldClass } from "@/components/platform/controls";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
            {f.type === "date" && <DatePicker name={name} required={f.required} aria-label={f.label} />}
            {f.type === "url" && <Input name={name} type="url" placeholder="https://" maxLength={500} required={f.required} />}
            {f.type === "select" && <Select name={name} required={f.required} aria-label={f.label} options={(f.options ?? []).map((o) => ({ value: o, label: o }))} />}
            {f.type === "multiselect" &&
              f.options?.map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <Checkbox name={name} value={o} /> {o}
                </label>
              ))}
            {f.type === "yesno" && (
              <Select name={name} required={f.required} aria-label={f.label} options={[{ value: "yes", label: "Da" }, { value: "no", label: "Nu" }]} />
            )}
            {f.type === "scale" && (
              <Select name={name} required={f.required} aria-label={f.label} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
            )}
          </fieldset>
        );
      })}
    </ActionForm>
  );
}
