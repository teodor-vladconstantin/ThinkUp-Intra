"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useTransition } from "react";
import { moveCounty } from "@/app/(app)/pn/actions";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/dates";
import { NO_ZONE_COLOR, SCHOOL_STATUS_LABELS, type County, type SchoolSummary, type Zone, type ZoneMove } from "@/lib/pn";

// Leaflet touches `window`, so it can only load in the browser.
const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-xl bg-muted md:h-[560px]" />,
});

export function CountyMap({
  counties,
  zones,
  schools,
  ambassadorsByCounty,
  history,
  canManage,
}: {
  counties: County[];
  zones: Zone[];
  schools: SchoolSummary[];
  ambassadorsByCounty: Record<string, number>;
  history: ZoneMove[];
  canManage: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const zoneById = new Map(zones.map((z) => [z.id, z]));
  // The fill color of a county is its zone's color (PRD 6.1); no zone = gray.
  const colors = Object.fromEntries(counties.map((c) => [c.code, zoneById.get(c.zone_id ?? -1)?.color ?? NO_ZONE_COLOR]));

  const county = counties.find((c) => c.code === selected) ?? null;
  const zone = county?.zone_id ? zoneById.get(county.zone_id) : undefined;
  const countySchools = schools.filter((s) => s.county_code === selected);
  const countyHistory = history.filter((h) => h.county_code === selected);
  const zoneName = (id: number | null) => (id ? (zoneById.get(id)?.name ?? "—") : "fără zonă");

  function onMove(value: string) {
    if (!county) return;
    setError(null);
    startTransition(async () => {
      // The action revalidates /pn, so the map recolors with the new data right after.
      const result = await moveCounty(county.code, value ? Number(value) : null);
      if (result && !result.ok) setError(result.message);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <LeafletMap colors={colors} names={Object.fromEntries(counties.map((c) => [c.code, c.name]))} selected={selected} onSelect={setSelected} />
        <ul className="flex flex-wrap gap-3 text-xs" aria-label="Legendă zone">
          {zones.map((z) => (
            <li key={z.id} className="flex items-center gap-1.5">
              <span className="size-3 rounded-full" style={{ background: z.color }} aria-hidden />
              {z.name}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-full" style={{ background: NO_ZONE_COLOR }} aria-hidden />
            Fără zonă
          </li>
        </ul>
      </div>

      <aside className="space-y-4 rounded-xl border bg-card p-4" aria-live="polite">
        {/* Keyboard / phone alternative to clicking the map */}
        <Select
          aria-label="Alege județul"
          placeholder="Alege un județ…"
          value={selected ?? ""}
          onValueChange={(v) => setSelected(v || null)}
          options={[...counties].sort((a, b) => a.name.localeCompare(b.name, "ro")).map((c) => ({ value: c.code, label: c.name }))}
        />

        {!county ? (
          <p className="text-sm text-muted-foreground">Apasă pe un județ de pe hartă.</p>
        ) : (
          <>
            <div>
              <h2 className="text-lg font-semibold">{county.name}</h2>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="size-3 rounded-full" style={{ background: zone?.color ?? NO_ZONE_COLOR }} aria-hidden />
                {zone?.name ?? "Fără zonă"} · {ambassadorsByCounty[county.code] ?? 0} ambasadori
              </p>
            </div>

            {canManage && (
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Mută în zona</span>
                <Select
                  value={county.zone_id != null ? String(county.zone_id) : ""}
                  disabled={pending}
                  onValueChange={onMove}
                  options={[{ value: "", label: "Fără zonă" }, ...zones.map((z) => ({ value: String(z.id), label: z.name }))]}
                />
                {error && <span className="text-destructive">{error}</span>}
              </label>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Licee ({countySchools.length})</h3>
              {countySchools.length === 0 ? (
                <p className="text-sm text-muted-foreground">Niciun liceu.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {countySchools.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <Link href={`/pn/schools/${s.id}`} className="truncate hover:text-primary">
                        {s.name}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{SCHOOL_STATUS_LABELS[s.status]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {countyHistory.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Istoric zone</h3>
                <ol className="space-y-1 text-xs text-muted-foreground">
                  {countyHistory.map((h) => (
                    <li key={h.id}>
                      {formatDate(h.changed_at)}: {zoneName(h.from_zone)} → {zoneName(h.to_zone)} ({h.changer?.full_name ?? "—"})
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
