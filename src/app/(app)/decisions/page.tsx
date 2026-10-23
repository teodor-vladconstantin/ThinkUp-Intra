import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionLabel } from "@/components/section-label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireProfile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { meetingLabel } from "@/lib/meetings";
import { createUserClient } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/utils";

type Row = {
  id: string;
  text: string;
  decided_at: string;
  author: { full_name: string | null } | null;
  meeting: { id: string; title: string; kind: "cd" | "department"; department: { name: string } | null };
};

// Decision registry (PRD 5.4): text, date, author, source meeting.
// Visibility is inherited from the meeting through RLS (decisions_read), so the
// search only ever covers decisions this user may see.
export default async function DecisionsPage(props: PageProps<"/decisions">) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const scope = sp.scope === "cd" || sp.scope === "department" ? sp.scope : "";

  // meetings!inner: an inner join, so filtering on meeting.kind drops non-matching decisions.
  let query = createUserClient()
    .from("decisions")
    .select("id, text, decided_at, author:profiles!author_id(full_name), meeting:meetings!inner(id, title, kind, department:departments(name))")
    .order("decided_at", { ascending: false })
    .limit(200);
  if (q) query = query.ilike("text", `%${escapeLike(q)}%`);
  if (scope) query = query.eq("meeting.kind", scope);
  const { data } = await query;
  const decisions = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Decizii</SectionLabel>
        <h1 className="text-2xl font-semibold">Registrul deciziilor</h1>
      </div>

      {/* Plain GET form: the filters live in the URL, so a search can be shared as a link. */}
      <form className="flex flex-wrap items-center gap-2" role="search" data-tour="decisions-search">
        <Input name="q" defaultValue={q} placeholder="Caută în decizii" aria-label="Caută în decizii" className="max-w-sm" />
        <Select
          name="scope"
          defaultValue={scope}
          aria-label="Ședințe"
          className="w-auto min-w-48"
          options={[
            { value: "", label: "Toate ședințele" },
            { value: "cd", label: "Consiliul Director" },
            { value: "department", label: "Departamente" },
          ]}
        />
        <Button type="submit" variant="outline">Caută</Button>
      </form>

      {decisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{q ? "Nicio decizie găsită." : "Nicio decizie încă."}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {decisions.map((d) => (
            <li key={d.id} className="space-y-1 p-4">
              <p className="text-sm">{d.text}</p>
              <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <time dateTime={d.decided_at}>{formatDate(d.decided_at)}</time>
                <span>·</span>
                <span>{d.author?.full_name ?? "—"}</span>
                <span>·</span>
                <Link href={`/meetings/${d.meeting.id}`} className="text-primary hover:underline">
                  {meetingLabel(d.meeting)}: {d.meeting.title}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
