import Link from "next/link";
import { redirect } from "next/navigation";
import { SchoolForm } from "@/components/pn/school-form";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireProfile } from "@/lib/auth";
import { isPnMember } from "@/lib/permissions";
import { SCHOOL_STATUS_LABELS, SCHOOL_STATUSES, type SchoolStatus } from "@/lib/pn";
import { createUserClient } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/utils";
import { createSchool } from "../actions";

type Row = { id: number; name: string; city: string | null; status: SchoolStatus; county: { code: string; name: string } | null };

export default async function SchoolsPage(props: PageProps<"/pn/schools">) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const county = typeof sp.county === "string" && /^[A-Z]{1,2}$/.test(sp.county) ? sp.county : "";
  const status = SCHOOL_STATUSES.find((s) => s === sp.status) ?? "";

  const db = createUserClient();
  let query = db.from("schools").select("id, name, city, status, county:counties(code, name)").order("name").limit(500);
  if (q) query = query.ilike("name", `%${escapeLike(q)}%`);
  if (county) query = query.eq("county_code", county);
  if (status) query = query.eq("status", status);
  const [{ data }, { data: counties }] = await Promise.all([query, db.from("counties").select("code, name").order("name")]);
  const schools = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Licee</h1>

      <form className="flex flex-wrap items-center gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Caută liceul" aria-label="Caută liceul" className="max-w-xs" />
        <Select
          name="county"
          defaultValue={county}
          aria-label="Județ"
          className="w-auto min-w-44"
          options={[{ value: "", label: "Toate județele" }, ...(counties ?? []).map((c) => ({ value: c.code, label: c.name }))]}
        />
        <Select
          name="status"
          defaultValue={status}
          aria-label="Status"
          className="w-auto min-w-40"
          options={[{ value: "", label: "Orice status" }, ...SCHOOL_STATUSES.map((s) => ({ value: s, label: SCHOOL_STATUS_LABELS[s] }))]}
        />
        <Button type="submit" variant="outline">Filtrează</Button>
      </form>

      {isPnMember(profile) && (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Adaugă un liceu</summary>
          <div className="mt-4">
            <SchoolForm action={createSchool} counties={counties ?? []} defaultCounty={county} />
          </div>
        </details>
      )}

      {schools.length === 0 ? (
        <p className="text-sm text-muted-foreground">Niciun liceu.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {schools.map((s) => (
            <li key={s.id}>
              <Link href={`/pn/schools/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-muted/50">
                <span className="min-w-0 flex-1 font-medium">{s.name}</span>
                <span className="text-sm text-muted-foreground">
                  {[s.city, s.county?.name].filter(Boolean).join(", ")}
                </span>
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">{SCHOOL_STATUS_LABELS[s.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
