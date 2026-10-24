import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { FillForm } from "@/components/reports/fill-form";
import { SectionLabel } from "@/components/section-label";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { canFillReports, canManageReports } from "@/lib/permissions";
import { fieldsSchema, formatAnswer, type Answer } from "@/lib/reports";
import { createUserClient } from "@/lib/supabase/server";
import { setReportFormOpen } from "../actions";

export default async function ReportFormPage(props: PageProps<"/reports/[id]">) {
  const me = await requireProfile();
  if (!me) redirect("/sign-in");
  const id = z.uuid().safeParse((await props.params).id);
  if (!id.success) notFound();

  const db = createUserClient();
  const { data: form } = await db.from("report_forms").select("id, title, description, fields, is_open").eq("id", id.data).maybeSingle();
  const fields = fieldsSchema.safeParse(form?.fields);
  if (!form || !fields.success) notFound();
  const manage = canManageReports(me);

  const { data } = manage
    ? await db.from("report_responses").select("id, answers, created_at, author:profiles!submitted_by(full_name)").eq("form_id", form.id).order("created_at", { ascending: false })
    : { data: [] };
  const responses = (data ?? []) as unknown as { id: string; answers: Record<string, Answer>; created_at: string; author: { full_name: string | null } | null }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-3">
          <SectionLabel>Rapoarte</SectionLabel>
          <h1 className="text-2xl font-semibold">{form.title}</h1>
          {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
        </div>
        {manage && (
          <form action={setReportFormOpen}>
            <input type="hidden" name="id" value={form.id} />
            <input type="hidden" name="open" value={form.is_open ? "0" : "1"} />
            <Button type="submit" variant="outline">{form.is_open ? "Închide formularul" : "Redeschide formularul"}</Button>
          </form>
        )}
      </div>

      {canFillReports(me) && form.is_open && <FillForm formId={form.id} fields={fields.data} />}

      {manage && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Răspunsuri ({responses.length})</h2>
          {responses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Niciun răspuns încă.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Mentor</th>
                    <th className="p-2">Data</th>
                    {fields.data.map((f) => (
                      <th key={f.id} className="p-2">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r) => (
                    <tr key={r.id} className="border-b align-top last:border-0">
                      <td className="p-2 whitespace-nowrap">{r.author?.full_name ?? "—"}</td>
                      <td className="p-2 whitespace-nowrap">{formatDate(r.created_at)}</td>
                      {fields.data.map((f) => (
                        <td key={f.id} className="p-2 whitespace-pre-wrap">{formatAnswer(r.answers[f.id])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
