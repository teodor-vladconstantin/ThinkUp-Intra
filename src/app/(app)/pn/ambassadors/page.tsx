import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isPnMember } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { AmbassadorCsvImport } from "@/components/pn/ambassador-csv-import";

type Row = {
  id: number;
  full_name: string;
  active: boolean;
  school: { id: number; name: string; county: { name: string } | null } | null;
};
type Contact = { ambassador_id: number; email: string | null; phone: string | null };

// Everyone with PN access sees the list; only the PN department sees contacts (RLS ambc_all).
export default async function AmbassadorsPage(props: PageProps<"/pn/ambassadors">) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");
  const showInactive = (await props.searchParams).inactive === "1";

  const db = createUserClient();
  let query = db.from("ambassadors").select("id, full_name, active, school:schools(id, name, county:counties(name))").order("full_name").limit(1000);
  if (!showInactive) query = query.eq("active", true);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const pn = isPnMember(profile);
  const { data: contactRows } = pn ? await db.from("ambassador_contacts").select("ambassador_id, email, phone") : { data: [] };
  const contacts = new Map(((contactRows ?? []) as Contact[]).map((c) => [c.ambassador_id, c]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Ambasadori</h1>
        <Link href={showInactive ? "/pn/ambassadors" : "/pn/ambassadors?inactive=1"} className="text-sm text-primary hover:underline">
          {showInactive ? "Doar activi" : "Arată și inactivii"}
        </Link>
      </div>

      {pn && <AmbassadorCsvImport />}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Niciun ambasador. Se adaugă din pagina liceului.</p>
      ) : (
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
      )}
    </div>
  );
}
