"use client";

import { ActionForm, FileUpload, fieldClass } from "@/components/platform/controls";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addStudentSheetPhoto, saveStudentSheet, saveStudentSheetEvaluation } from "@/app/platform/actions";

export type StudentSheetRecord = {
  id: string;
  project_id: string;
  student_id: string;
  student_name: string;
  school_name: string;
  zone_county: string;
  challenge_title: string;
  activity_date: string;
  participants_count: number;
  activity_description: string;
  special_activity: string;
  participant_feedback: string;
  guest_name: string | null;
  guest_occupation: string | null;
  guest_reason: string | null;
  guest_topics: string | null;
  improvements: string;
  planning_timeline: string;
  materials_timeline: string;
  promotion_timeline: string;
  activity_timeline: string;
  feedback_timeline: string;
  updated_at: string;
};

type Photo = { id: string; category: PhotoCategory; name: string; url: string };
type PhotoCategory = "preparation" | "activity" | "participants";

const categories: { key: PhotoCategory; label: string }[] = [
  { key: "preparation", label: "Din timpul pregătirii" },
  { key: "activity", label: "Din timpul activității" },
  { key: "participants", label: "Cu participanții" },
];

const criteria = [
  { key: "innovation", label: "Inovație" },
  { key: "impact", label: "Impact" },
  { key: "feedback_score", label: "Feedback" },
  { key: "efficiency", label: "Eficiență" },
] as const;

const ratingOptions = [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }));

export function StudentSheetForm({
  projectId,
  studentName,
  challengeTitle,
  sheet,
  photos,
}: {
  projectId: string;
  studentName: string;
  challengeTitle: string;
  sheet: StudentSheetRecord | null;
  photos: Photo[];
}) {
  const photoByCategory = new Map<PhotoCategory, Photo[]>();
  for (const photo of photos) photoByCategory.set(photo.category, [...(photoByCategory.get(photo.category) ?? []), photo]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Completează fișa direct aici. Răspunsurile se salvează în proiect și pot fi actualizate ulterior.
      </p>
      <ActionForm action={saveStudentSheet} submitLabel={sheet ? "Salvează fișa" : "Trimite fișa"} keep>
        <input type="hidden" name="projectId" value={projectId} />

        <Section title="Informații generale">
          <div className="grid gap-3 sm:grid-cols-2">
            <InputField name="studentName" label="Nume" defaultValue={sheet?.student_name ?? studentName} required maxLength={150} />
            <InputField name="schoolName" label="Liceu" defaultValue={sheet?.school_name ?? ""} required maxLength={200} />
            <InputField name="zoneCounty" label="Zonă / județ" defaultValue={sheet?.zone_county ?? ""} required maxLength={120} />
            <InputField name="challengeTitle" label="Titlu challenge" defaultValue={sheet?.challenge_title ?? challengeTitle} required maxLength={200} />
            <InputField name="activityDate" label="Data activității" type="date" defaultValue={sheet?.activity_date ?? ""} required />
            <InputField
              name="participantsCount"
              label="Număr aproximativ de participanți"
              type="number"
              min={0}
              max={100000}
              defaultValue={sheet ? String(sheet.participants_count) : ""}
              required
            />
          </div>
        </Section>

        <Section title="1. Descrierea activității">
          <p className="text-xs text-muted-foreground">Povestește pe scurt activitatea: tipul, scopul și cum s-a desfășurat.</p>
          <TextAreaField
            name="activityDescription"
            label="Descriere"
            defaultValue={sheet?.activity_description ?? ""}
            required
            maxLength={4000}
          />
        </Section>

        <Section title="2. Ce a avut special activitatea ta?">
          <p className="text-xs text-muted-foreground">
            Spune ce a fost diferit sau interesant: o idee creativă, o metodă interactivă sau o activitate care i-a implicat pe participanți.
          </p>
          <TextAreaField name="specialActivity" label="Ce a fost special?" defaultValue={sheet?.special_activity ?? ""} required maxLength={3000} />
        </Section>

        <Section title="3. Ce le-a plăcut cel mai mult participanților?">
          <p className="text-xs text-muted-foreground">Pe baza feedbackului primit, notează ce moment le-a plăcut, ce i-a surprins, ce i-a ajutat și părerea lor despre activitate.</p>
          <TextAreaField name="participantFeedback" label="Feedbackul participanților" defaultValue={sheet?.participant_feedback ?? ""} required maxLength={4000} />
        </Section>

        <Section title="4. Invitatul activității">
          <div className="grid gap-3 sm:grid-cols-2">
            <InputField name="guestName" label="Numele invitatului" defaultValue={sheet?.guest_name ?? ""} maxLength={150} />
            <InputField name="guestOccupation" label="Ce face / cu ce se ocupă?" defaultValue={sheet?.guest_occupation ?? ""} maxLength={300} />
          </div>
          <TextAreaField name="guestReason" label="De ce l-ați ales ca invitat?" defaultValue={sheet?.guest_reason ?? ""} maxLength={2000} />
          <TextAreaField name="guestTopics" label="Ce subiecte ați discutat împreună?" defaultValue={sheet?.guest_topics ?? ""} maxLength={2000} />
        </Section>

        <Section title="5. Ce ai îmbunătăți?">
          <p className="text-xs text-muted-foreground">Gândește-te la ce ar putea merge mai bine: organizarea, timpul, activitățile sau participarea elevilor.</p>
          <TextAreaField name="improvements" label="Idei de îmbunătățire" defaultValue={sheet?.improvements ?? ""} required maxLength={3000} />
        </Section>

        <Section title="6. Cum s-a desfășurat organizarea (timeline)">
          <p className="text-xs text-muted-foreground">Scrie câteva etape importante ale procesului.</p>
          <TextAreaField name="planningTimeline" label="Planificarea activității" defaultValue={sheet?.planning_timeline ?? ""} required maxLength={1500} />
          <TextAreaField name="materialsTimeline" label="Pregătirea materialelor" defaultValue={sheet?.materials_timeline ?? ""} required maxLength={1500} />
          <TextAreaField name="promotionTimeline" label="Promovarea activității" defaultValue={sheet?.promotion_timeline ?? ""} required maxLength={1500} />
          <TextAreaField name="activityTimeline" label="Desfășurarea evenimentului" defaultValue={sheet?.activity_timeline ?? ""} required maxLength={1500} />
          <TextAreaField name="feedbackTimeline" label="Colectarea feedbackului" defaultValue={sheet?.feedback_timeline ?? ""} required maxLength={1500} />
        </Section>

        <Section title="7. Poze">
          <p className="text-xs text-muted-foreground">Poți încărca mai multe fotografii pentru fiecare etapă. Sunt acceptate imagini JPEG, PNG, WebP și GIF.</p>
          {sheet ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {categories.map((category) => (
                <div key={category.key} className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">{category.label}</p>
                  <FileUpload
                    bucket="project-files"
                    folder={projectId}
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    label="Încarcă fotografie"
                    complete={addStudentSheetPhoto.bind(null, projectId, category.key)}
                  />
                  <ul className="space-y-1 text-xs">
                    {(photoByCategory.get(category.key) ?? []).map((photo) => (
                      <li key={photo.id}>
                        <a href={photo.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                          {photo.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Salvează fișa pentru a putea adăuga fotografii.</p>
          )}
        </Section>
      </ActionForm>
    </div>
  );
}

export function SheetEvaluationForm({
  sheetId,
  evaluation,
}: {
  sheetId: string;
  evaluation: { innovation: number; impact: number; feedback_score: number; efficiency: number } | null;
}) {
  return (
    <ActionForm action={saveStudentSheetEvaluation} submitLabel={evaluation ? "Actualizează" : "Evaluează"}>
      <input type="hidden" name="sheetId" value={sheetId} />
      {criteria.map((criterion) => (
        <label key={criterion.key} className="grid gap-1 text-xs">
          <span>{criterion.label}</span>
          <Select
            name={criterion.key}
            required
            defaultValue={evaluation ? String(evaluation[criterion.key]) : ""}
            placeholder="1–5"
            aria-label={criterion.label}
            options={ratingOptions}
          />
        </label>
      ))}
    </ActionForm>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function InputField({
  name,
  label,
  defaultValue,
  required = false,
  maxLength,
  type = "text",
  min,
  max,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
  maxLength?: number;
  type?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <Input name={name} type={type} required={required} maxLength={maxLength} min={min} max={max} defaultValue={defaultValue} />
    </label>
  );
}

function TextAreaField({
  name,
  label,
  defaultValue,
  required = false,
  maxLength,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
  maxLength: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <textarea name={name} rows={3} required={required} maxLength={maxLength} defaultValue={defaultValue} className={`${fieldClass} font-normal`} />
    </label>
  );
}
