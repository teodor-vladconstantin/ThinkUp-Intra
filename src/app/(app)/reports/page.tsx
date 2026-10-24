import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionLabel } from "@/components/section-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { canFillReports, canManageReports } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";

export default async function ReportsPage() {
  const me = await requireProfile();
  if (!me) redirect("/sign-in");
  const manage = canManageReports(me);
  if (!manage && !canFillReports(me)) redirect("/dashboard");

  // RLS: the CD sees every form, a mentor only the open ones.
  const { data } = await createUserClient()
    .from("report_forms")
    .select("id, title, description, is_open, created_at, report_responses(count)")
    .order("created_at", { ascending: false });
  const forms = (data ?? []) as unknown as { id: string; title: string; description: string | null; is_open: boolean; created_at: string; report_responses: { count: number }[] }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-3">
          <SectionLabel>Rapoarte</SectionLabel>
          <h1 className="text-2xl font-semibold">Rapoarte</h1>
        </div>
        {manage && (
          <Button asChild>
            <Link href="/reports/new">Formular nou</Link>
          </Button>
        )}
      </div>
      {forms.length === 0 ? (
        <p className="text-sm text-muted-foreground">{manage ? "Niciun formular încă." : "Niciun formular deschis acum."}</p>
      ) : (
        <ul className="grid gap-3">
          {forms.map((f) => (
            <li key={f.id} className="rounded-xl border bg-card p-4">
              <Link href={`/reports/${f.id}`} className="font-semibold text-primary hover:underline">{f.title}</Link>{" "}
              {!f.is_open && <Badge variant="secondary">Închis</Badge>}
              {f.description && <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                {formatDate(f.created_at)}
                {manage && ` · ${f.report_responses[0]?.count ?? 0} răspunsuri`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
