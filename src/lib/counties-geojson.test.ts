// PRD 6.1: every GeoJSON polygon must match exactly one county code from the seed.
// Reads both files from disk, so a changed seed or a refreshed GeoJSON fails here.
import { expect, test } from "bun:test";

const geo = (await Bun.file("public/data/ro-counties.geojson").json()) as {
  features: { properties: { code: string } }[];
};
const schema = await Bun.file("supabase/migrations/20261004000000_intranet_schema.sql").text();

// The seed is the "insert into counties (code, name) values ('AB','Alba'),..." block.
const seedBlock = schema.slice(schema.indexOf("insert into counties"));
const seedCodes = [...seedBlock.matchAll(/\('([A-Z]{1,2})','/g)].map((m) => m[1]);
const geoCodes = geo.features.map((f) => f.properties.code);

test("42 counties on both sides, no duplicates", () => {
  expect(seedCodes.length).toBe(42);
  expect(new Set(seedCodes).size).toBe(42);
  expect(geoCodes.length).toBe(42);
  expect(new Set(geoCodes).size).toBe(42);
});

test("GeoJSON codes match the seed 1:1", () => {
  expect([...geoCodes].sort()).toEqual([...seedCodes].sort());
});

test("Bucharest and Ilfov are separate polygons with the seed's codes", () => {
  expect(geoCodes).toContain("B");
  expect(geoCodes).toContain("IF");
});
