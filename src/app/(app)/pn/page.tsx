import { redirect } from "next/navigation";
import { CountyMap } from "@/components/pn/county-map";
import { requireProfile } from "@/lib/auth";
import { canManageZones } from "@/lib/permissions";
import type { County, SchoolSummary, Zone, ZoneMove } from "@/lib/pn";
import { createUserClient } from "@/lib/supabase/server";

export default async function PnMapPage() {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  // Small tables (42 counties, a few zones, hundreds of schools): load once, the panel is client-side.
  const db = createUserClient();
  const [counties, zones, schools, ambassadors, history] = await Promise.all([
    db.from("counties").select("code, name, zone_id").order("name"),
    db.from("zones").select("id, name, color, active").order("name"),
    db.from("schools").select("id, name, city, county_code, status").order("name"),
    db.from("ambassadors").select("school_id").eq("active", true),
    db
      .from("county_zone_history")
      .select("id, county_code, from_zone, to_zone, changed_at, changer:profiles!changed_by(full_name)")
      .order("changed_at", { ascending: false })
      .limit(500),
  ]);

  const schoolCounty = new Map((schools.data ?? []).map((s) => [s.id, s.county_code]));
  const ambassadorsByCounty: Record<string, number> = {};
  for (const a of ambassadors.data ?? []) {
    const code = schoolCounty.get(a.school_id);
    if (code) ambassadorsByCounty[code] = (ambassadorsByCounty[code] ?? 0) + 1;
  }

  return (
    <CountyMap
      counties={(counties.data ?? []) as County[]}
      zones={(zones.data ?? []) as Zone[]}
      schools={(schools.data ?? []) as SchoolSummary[]}
      ambassadorsByCounty={ambassadorsByCounty}
      history={(history.data ?? []) as unknown as ZoneMove[]}
      canManage={canManageZones(profile)}
    />
  );
}
