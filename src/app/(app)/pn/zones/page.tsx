import { redirect } from "next/navigation";
import { ZoneForm } from "@/components/pn/zone-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { canManageZones } from "@/lib/permissions";
import type { Zone } from "@/lib/pn";
import { createUserClient } from "@/lib/supabase/server";

export default async function ZonesPage() {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  const db = createUserClient();
  const [{ data: zones }, { data: counties }] = await Promise.all([
    db.from("zones").select("id, name, color, active").order("name"),
    db.from("counties").select("zone_id"),
  ]);
  const countByZone = new Map<number, number>();
  for (const c of counties ?? []) if (c.zone_id) countByZone.set(c.zone_id, (countByZone.get(c.zone_id) ?? 0) + 1);
  const canManage = canManageZones(profile);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Zone de dezvoltare</h1>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Zonă nouă</CardTitle>
          </CardHeader>
          <CardContent>
            <ZoneForm />
          </CardContent>
        </Card>
      )}

      {(zones ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nicio zonă încă. Județele apar gri pe hartă până primesc o zonă.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {(zones as Zone[]).map((z) => (
            <li key={z.id} className="flex flex-wrap items-center gap-3 p-4">
              {canManage ? (
                <ZoneForm zone={z} />
              ) : (
                <span className="flex items-center gap-2 font-medium">
                  <span className="size-3 rounded-full" style={{ background: z.color }} aria-hidden />
                  {z.name}
                </span>
              )}
              <span className="ml-auto text-sm text-muted-foreground">{countByZone.get(z.id) ?? 0} județe</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
