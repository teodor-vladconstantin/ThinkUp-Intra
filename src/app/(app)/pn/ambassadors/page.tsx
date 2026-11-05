import Link from "next/link";
import { redirect } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { requireProfile } from "@/lib/auth";
import { isPnMember } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { DEFAULT_PAGE_SIZE, pageRange, parsePage } from "@/lib/pagination";

type Row = {
  id: number;
  full_name: string;
  active: boolean;
  school: { id: number; name: string; county: { name: string } | null } | null;
};
type Contact = { ambassador_id: number; email: string | null; phone: string | null };

// Everyone with PN access sees the list; only the PN department sees contacts (RLS ambc_all).
// New ambassadors are added from the school page (the CSV import comes later).
export default async function AmbassadorsPage(props: PageProps<"/pn/ambassadors">) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");
  const sp = await props.searchParams;
  const showInactive = sp.inactive === "1";
  const page = parsePage(sp.page);
  const range = pageRange(page, DEFAULT_PAGE_SIZE);

  const db = createUserClient();
  let query = db
    .from("ambassadors")
    .select("id, full_name, active, school:schools(id, name, county:counties(name))", { count: "exact" })
    .order("full_name");
  if (!showInactive) query = query.eq("active", true);
  const { data, count, error } = await query.range(range.from, range.to);
  if (error) throw new Error("Could not load ambassadors");
  const rows = (data ?? []) as unknown as Row[];

  const pn = isPnMember(profile);
  const { data: contactRows } = pn && rows.length
    ? await db.from("ambassador_contacts").select("ambassador_id, email, phone").in("ambassador_id", rows.map((row) => row.id))
    : { data: [] };
  const contacts = new Map(((contactRows ?? []) as Contact[]).map((c) => [c.ambassador_id, c]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Ambasadori</h1>
        <Link href={showInactive ? "/pn/ambassadors" : "/pn/ambassadors?inactive=1"} className="text-sm text-primary hover:underline">
          {showInactive ? "Doar activi" : "Arată și inactivii"}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Niciun ambasador. Se adaugă din pagina liceului.</p>
      ) : (
        <>
          <Pagination
            basePath="/pn/ambassadors"
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={count ?? 0}
            params={showInactive ? { inactive: "1" } : {}}
            label="ambasadori"
          />
          <div className="relative overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="p-3 font-medium">Nume</th>
                  <th className="p-3 font-medium">Liceu</th>
                  <th className="p-3 font-medium">Județ</th>
                  {pn && <th className="p-3 font-medium">Contact</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const c = contacts.get(a.id);
                  return (
                    <tr key={a.id} className={`border-b last:border-0 ${a.active ? "" : "opacity-60"}`}>
                      <td className="p-3 font-medium">{a.full_name}</td>
                      <td className="p-3">
                        {a.school && (
                          <Link href={`/pn/schools/${a.school.id}`} className="hover:text-primary">
                            {a.school.name}
                          </Link>
                        )}
                      </td>
                      <td className="p-3">{a.school?.county?.name ?? "—"}</td>
                      {pn && <td className="p-3 text-muted-foreground">{c ? [c.email, c.phone].filter(Boolean).join(" · ") : "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            basePath="/pn/ambassadors"
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={count ?? 0}
            params={showInactive ? { inactive: "1" } : {}}
            label="ambasadori"
          />
        </>
      )}
    </div>
  );
}
