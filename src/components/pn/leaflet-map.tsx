"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import type { Layer, PathOptions } from "leaflet";
import { GeoJSON, MapContainer, useMap } from "react-leaflet";

// Boundaries: geoBoundaries ROU ADM1 (World Bank), CC BY 4.0. Stored in public/data,
// so the map makes no external request at runtime and needs no tile server or API key.
const ATTRIBUTION = 'Granițe: <a href="https://www.geoboundaries.org" target="_blank" rel="noopener noreferrer">geoBoundaries</a> (World Bank), CC BY 4.0';

type Props = {
  colors: Record<string, string>; // county code -> fill color (from its zone)
  names: Record<string, string>; // county code -> name from the seed (with diacritics)
  selected: string | null;
  onSelect: (code: string) => void;
};

function FitToData({ data }: { data: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    import("leaflet").then((L) => map.fitBounds(L.geoJSON(data).getBounds(), { padding: [8, 8] }));
  }, [map, data]);
  return null;
}

export default function LeafletMap({ colors, names, selected, onSelect }: Props) {
  const [data, setData] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/data/ro-counties.geojson")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const style = (feature?: GeoJSON.Feature): PathOptions => {
    const code = feature?.properties?.code as string;
    return {
      fillColor: colors[code],
      fillOpacity: code === selected ? 0.95 : 0.75,
      color: "#ffffff", // white borders between counties
      weight: code === selected ? 3 : 1,
    };
  };

  const onEachFeature = (feature: GeoJSON.Feature, layer: Layer) => {
    const code = feature.properties?.code as string;
    layer.on("click", () => onSelect(code));
    layer.bindTooltip(names[code] ?? code, { sticky: true });
  };

  return (
    <MapContainer
      center={[45.9, 24.9]}
      zoom={6}
      zoomSnap={0.25}
      scrollWheelZoom={false}
      attributionControl
      className="h-[420px] w-full rounded-xl bg-muted md:h-[560px]"
    >
      {data && (
        <>
          {/* Remount when colors or selection change: Leaflet does not restyle on prop change. */}
          <GeoJSON
            key={`${selected}-${JSON.stringify(colors)}`}
            data={data}
            style={style}
            onEachFeature={onEachFeature}
            attribution={ATTRIBUTION}
          />
          <FitToData data={data} />
        </>
      )}
    </MapContainer>
  );
}
