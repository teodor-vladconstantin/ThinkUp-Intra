// One-time build of public/data/ro-counties.geojson (run again only to refresh the source).
//
// Source: geoBoundaries gbOpen ROU ADM1, simplified, commit 9469f09 (World Bank, CC BY 4.0).
//   https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/ROU/ADM1/geoBoundaries-ROU-ADM1_simplified.geojson
//
// What this does, and why:
//   - keeps only { code, name }: code is shapeISO without "RO-" so it matches counties.code
//   - rounds coordinates to 3 decimals (~100 m), plenty for a county-level map
//   - drops consecutive points that became identical after rounding
// Usage: bun scripts/build-counties-geojson.ts <path-to-downloaded-source.geojson>

type Ring = number[][];
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
type Feature = { type: "Feature"; properties: Record<string, string>; geometry: Geometry };

const source = process.argv[2];
if (!source) {
  console.error("Usage: bun scripts/build-counties-geojson.ts <source.geojson>");
  process.exit(1);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function ring(points: Ring): Ring {
  const out: Ring = [];
  for (const [x, y] of points) {
    const p = [round(x), round(y)];
    const last = out.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

const input = (await Bun.file(source).json()) as { features: Feature[] };
const features = input.features.map((f) => ({
  type: "Feature",
  properties: { code: f.properties.shapeISO.replace(/^RO-/, ""), name: f.properties.shapeName },
  geometry:
    f.geometry.type === "Polygon"
      ? { type: "Polygon", coordinates: f.geometry.coordinates.map(ring) }
      : { type: "MultiPolygon", coordinates: f.geometry.coordinates.map((poly) => poly.map(ring)) },
}));

const out = { type: "FeatureCollection", features };
await Bun.write("public/data/ro-counties.geojson", JSON.stringify(out));
console.log(`wrote ${features.length} counties, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);

export {}; // top-level await needs a module
