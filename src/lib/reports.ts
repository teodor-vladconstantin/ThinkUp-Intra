import { z } from "zod";

// Report form fields. The CD builds them; mentors' answers are stored by field id.
export const FIELD_TYPES = {
  text: "Text scurt",
  textarea: "Text lung",
  number: "Număr",
  date: "Dată",
  select: "Alegere unică",
  multiselect: "Alegere multiplă",
  yesno: "Da / Nu",
  scale: "Scală 1–5",
  url: "Link",
} as const;
export type FieldType = keyof typeof FIELD_TYPES;

const fieldSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]{4,20}$/),
    type: z.enum(Object.keys(FIELD_TYPES) as [FieldType, ...FieldType[]]),
    label: z.string().trim().min(1, "Fiecare câmp are nevoie de o etichetă").max(200, "Etichetă prea lungă"),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  })
  .refine((f) => !(f.type === "select" || f.type === "multiselect") || (f.options?.length ?? 0) >= 2, {
    message: "Alegerile au nevoie de cel puțin 2 opțiuni",
  });

export const fieldsSchema = z
  .array(fieldSchema)
  .min(1, "Adaugă cel puțin un câmp")
  .max(60, "Prea multe câmpuri")
  .refine((fs) => new Set(fs.map((f) => f.id)).size === fs.length, { message: "Câmpuri duplicate" });

export type ReportField = z.infer<typeof fieldSchema>;
export type Answer = string | number | boolean | string[];

const answerName = (id: string) => `f_${id}`;
export { answerName };

// Checks a submitted form against its fields. `get(name)` returns every posted value for a name.
export function parseAnswers(
  fields: ReportField[],
  get: (name: string) => string[],
): { ok: true; answers: Record<string, Answer> } | { ok: false; message: string } {
  const answers: Record<string, Answer> = {};
  for (const f of fields) {
    const raw = get(answerName(f.id)).map((v) => v.trim()).filter(Boolean);
    const bad = (why: string) => ({ ok: false as const, message: `„${f.label}”: ${why}` });
    if (raw.length === 0) {
      if (f.required) return bad("e obligatoriu.");
      continue;
    }
    const v = raw[0];
    switch (f.type) {
      case "text":
        if (v.length > 300) return bad("prea lung.");
        answers[f.id] = v;
        break;
      case "textarea":
        if (v.length > 5000) return bad("prea lung.");
        answers[f.id] = v;
        break;
      case "number":
        if (!Number.isFinite(Number(v))) return bad("număr invalid.");
        answers[f.id] = Number(v);
        break;
      case "date":
        if (!z.iso.date().safeParse(v).success) return bad("dată invalidă.");
        answers[f.id] = v;
        break;
      case "url":
        if (!/^https?:\/\/\S+$/i.test(v) || v.length > 500) return bad("link invalid (începe cu https://).");
        answers[f.id] = v;
        break;
      case "select":
        if (!f.options?.includes(v)) return bad("alegere invalidă.");
        answers[f.id] = v;
        break;
      case "multiselect":
        if (!raw.every((o) => f.options?.includes(o))) return bad("alegere invalidă.");
        answers[f.id] = [...new Set(raw)];
        break;
      case "yesno":
        if (v !== "yes" && v !== "no") return bad("alege Da sau Nu.");
        answers[f.id] = v === "yes";
        break;
      case "scale":
        if (!/^[1-5]$/.test(v)) return bad("alege între 1 și 5.");
        answers[f.id] = Number(v);
        break;
    }
  }
  return { ok: true, answers };
}

// Plain text for the results table.
export function formatAnswer(a: Answer | undefined): string {
  if (a === undefined) return "—";
  if (typeof a === "boolean") return a ? "Da" : "Nu";
  return Array.isArray(a) ? a.join(", ") : String(a);
}
