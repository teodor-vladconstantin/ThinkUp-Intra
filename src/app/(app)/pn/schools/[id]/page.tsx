import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AmbassadorForm } from "@/components/pn/ambassador-form";
import { ContactLogForm } from "@/components/pn/contact-log-form";
import { SchoolForm } from "@/components/pn/school-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { isPnMember } from "@/lib/permissions";
import { SCHOOL_STATUS_LABELS, type SchoolStatus } from "@/lib/pn";
import { createUserClient } from "@/lib/supabase/server";
import { setAmbassadorActive, updateSchool } from "../../actions";

type School = {
  id: number;
  name: string;
  city: string | null;
  county_code: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: SchoolStatus;
  county: { name: string } | null;
};
type LogRow = { id: number; note: string; contacted_at: string; contacter: { full_name: string | null } | null };
type Ambassador = { id: number; full_name: string; platform_user_id: string | null; active: boolean };
type Contact = { ambassador_id: number; email: string | null; phone: string | null };

export default async function SchoolPage(props: PageProps<"/pn/schools/[id]">) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  const id = z.coerce.number().int().positive().safeParse((await props.params).id);
  if (!id.success) notFound();

  const db = createUserClient();
  const { data } = await db
    .from("schools")
    .select("id, name, city, county_code, contact_name, contact_email, contact_phone, status, county:counties(name)")
    .eq("id", id.data)
    .maybeSingle();
  if (!data) notFound();
  const school = data as unknown as School;

  const [log, ambassadors, counties] = await Promise.all([
    db.from("school_contact_log").select("id, note, contacted_at, contacter:profiles!contacted_by(full_name)").eq("school_id", school.id).order("contacted_at", { ascending: false }),
    db.from("ambassadors").select("id, full_name, platform_user_id, active").eq("school_id", school.id).order("full_name"),
    db.from("counties").select("code, name").order("name"),
  ]);
  const ambassadorRows = (ambassadors.data ?? []) as Ambassador[];

  // RLS returns contact rows only to the PN department (ambc_all); for everyone else this is empty.
  const { data: contactRows } = ambassadorRows.length
    ? await db.from("ambassador_contacts").select("ambassador_id, email, phone").in("ambassador_id", ambassadorRows.map((a) => a.id))
    : { data: [] };
  const contacts = new Map(((contactRows ?? []) as Contact[]).map((c) => [c.ambassador_id, c]));
  const pn = isPnMember(profile);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{school.name}</h1>
        <p className="text-sm text-muted-foreground">
          {[school.city, school.county?.name].filter(Boolean).join(", ")} · {SCHOOL_STATUS_LABELS[school.status]}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <Item label="Persoană">{school.contact_name}</Item>
                {/* Plain text, not mailto:/tel: links: contacts never go into URLs (PRD 10). */}
                <Item label="Email">{school.contact_email}</Item>
                <Item label="Telefon">{school.contact_phone}</Item>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jurnal de contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pn && <ContactLogForm schoolId={school.id} />}
              {(log.data as unknown as LogRow[] | null)?.length ? (
                <ol className="space-y-3">
                  {(log.data as unknown as LogRow[]).map((l) => (
                    <li key={l.id} className="rounded-lg bg-muted p-3 text-sm">
                      <p className="mb-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{l.contacter?.full_name ?? "—"}</span> · {formatDateTime(l.contacted_at)}
                      </p>
                      <p className="whitespace-pre-wrap">{l.note}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Niciun contact înregistrat.</p>
              )}
            </CardContent>
          </Card>

          {pn && (
            <Card>
              <CardHeader>
                <CardTitle>Editează liceul</CardTitle>
              </CardHeader>
              <CardContent>
                <SchoolForm action={updateSchool} counties={counties.data ?? []} school={school} />
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Ambasadori ({ambassadorRows.filter((a) => a.active).length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-3 text-sm">
              {ambassadorRows.map((a) => {
                const c = contacts.get(a.id);
                return (
                  <li key={a.id} className={a.active ? "" : "opacity-60"}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{a.full_name}</span>
                      {pn && (
                        <form action={setAmbassadorActive}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="active" value={String(!a.active)} />
                          <Button type="submit" variant="ghost" size="sm">
                            {a.active ? "Dezactivează" : "Reactivează"}
                          </Button>
                        </form>
                      )}
                    </div>
                    {c && <p className="text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>}
                  </li>
                );
              })}
              {ambassadorRows.length === 0 && <li className="text-muted-foreground">Niciun ambasador.</li>}
            </ul>
            {pn && <AmbassadorForm schoolId={school.id} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children || "—"}</dd>
    </div>
  );
}
