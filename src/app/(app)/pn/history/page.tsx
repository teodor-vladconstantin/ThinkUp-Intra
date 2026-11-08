import { redirect } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { requireProfile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { DEFAULT_PAGE_SIZE, pageRange, parsePage } from "@/lib/pagination";
import { createUserClient } from "@/lib/supabase/server";

type HistoryRow = {
  id: number;
  county_code: string;
  from_zone: number | null;
  to_zone: number | null;
  changed_at: string;
  changer: { full_name: string | null } | null;
  county: { name: string } | null;
};

export default async function ZoneHistoryPage(props: PageProps<"/pn/history">) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  const sp = await props.searchParams;
  const page = parsePage(sp.page);
  const county = typeof sp.county === "string" && /^[A-Z]{1,2}$/.test(sp.county) ? sp.county : "";
  const range = pageRange(page, DEFAULT_PAGE_SIZE);
  const db = createUserClient();
  let query = db
    .from("county_zone_history")
    .select("id, county_code, from_zone, to_zone, changed_at, changer:profiles!changed_by(full_name), county:counties(name)", { count: "exact" })
    .order("changed_at", { ascending: false });
  if (county) query = query.eq("county_code", county);

  const [{ data, count, error }, { data: counties }, { data: zones }] = await Promise.all([
    query.range(range.from, range.to),
    db.from("counties").select("code, name").order("name"),
    db.from("zones").select("id, name"),
  ]);
  if (error) throw new Error("Could not load zone history");
  const zoneNames = new Map((zones ?? []).map((zone) => [zone.id, zone.name]));
  const zoneName = (id: number | null) => (id === null ? "Fără zonă" : zoneNames.get(id) ?? "—");
  const history = (data ?? []) as unknown as HistoryRow[];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm text-primary">Program Național</p>
        <h1 className="text-2xl font-semibold">Istoric zone</h1>
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search">
        <Select
          name="county"
          defaultValue={county}
          aria-label="Județ"
          className="w-auto min-w-48"
          options={[{ value: "", label: "Toate județele" }, ...(counties ?? []).map((item) => ({ value: item.code, label: item.name }))]}
        />
        <Button type="submit" variant="outline">Filtrează</Button>
      </form>

      <Pagination
        basePath="/pn/history"
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={count ?? 0}
        params={county ? { county } : {}}
        label="modificări"
      />

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nicio modificare în istoric.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {history.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
              <span className="min-w-36 flex-1 font-medium">{item.county?.name ?? item.county_code}</span>
              <span>{zoneName(item.from_zone)} → {zoneName(item.to_zone)}</span>
              <span className="text-muted-foreground">{item.changer?.full_name ?? "—"}</span>
              <time className="text-xs text-muted-foreground" dateTime={item.changed_at}>{formatDate(item.changed_at)}</time>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        basePath="/pn/history"
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={count ?? 0}
        params={county ? { county } : {}}
        label="modificări"
      />
    </div>
  );
}
