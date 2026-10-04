import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { DocumentForm } from "@/components/documents/document-form";
import { SectionLabel } from "@/components/section-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { VISIBILITY_LABELS, type Visibility } from "@/lib/documents";
import { canCreateDocument, canManageOwn } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { archiveDocument } from "./actions";

type Doc = {
  id: string;
  title: string;
  url: string;
  visibility: Visibility;
  created_by: string | null;
  department: { name: string } | null;
  creator: { full_name: string | null } | null;
};

// RLS (docs_read) filters by visibility: department / cd / all.
export default async function DocumentsPage() {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  const db = createUserClient();
  const [{ data }, { data: departments }] = await Promise.all([
    db
      .from("documents")
      .select("id, title, url, visibility, created_by, department:departments(name), creator:profiles!created_by(full_name)")
      .eq("archived", false)
      .order("title"),
    db.from("departments").select("id, name").order("id"),
  ]);
  const docs = (data ?? []) as unknown as Doc[];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Documente</SectionLabel>
        <h1 className="text-2xl font-semibold">Documente</h1>
      </div>

      {canCreateDocument(profile) && (
        <Card>
          <CardHeader>
            <CardTitle>Adaugă un document</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentForm departments={departments ?? []} defaultDepartmentId={profile.departmentId} />
          </CardContent>
        </Card>
      )}

      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Niciun document.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              {/* noopener noreferrer: the Drive tab gets no handle back to the intranet */}
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-2 font-medium hover:text-primary">
                <span className="truncate">{d.title}</span>
                <ExternalLink className="size-3.5 shrink-0" aria-hidden />
              </a>
              <span className="text-xs text-muted-foreground">
                {VISIBILITY_LABELS[d.visibility]}
                {d.department ? ` · ${d.department.name}` : ""} · {d.creator?.full_name ?? "—"}
              </span>
              {canManageOwn(profile, d.created_by) && (
                <form action={archiveDocument}>
                  <input type="hidden" name="id" value={d.id} />
                  <Button type="submit" variant="ghost" size="sm">Arhivează</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
