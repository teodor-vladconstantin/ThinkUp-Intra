import { describe, expect, test } from "bun:test";
import { normalizeImportKey, parseAmbassadorCsv } from "./ambassador-csv";

describe("parseAmbassadorCsv", () => {
  test("reads quoted commas, escaped quotes, reordered headers, and a BOM", () => {
    expect(parseAmbassadorCsv('\uFEFFschool_name,full_name,email,phone\r\n"Liceu, nr. 1","Ana ""Mia"" Pop",ana@example.test,+40123456789')).toEqual([
      {
        schoolName: "Liceu, nr. 1",
        fullName: 'Ana "Mia" Pop',
        email: "ana@example.test",
        phone: "+40123456789",
        rowNumber: 2,
      },
    ]);
  });

  test("rejects malformed, missing, and oversized imports", () => {
    expect(() => parseAmbassadorCsv("full_name,school_name,email,phone")).toThrow("cel puțin un ambasador");
    expect(() => parseAmbassadorCsv('full_name,school_name,email,phone\n"Ana,Liceu,a@b.test,123')).toThrow("nu este închis");
    expect(() => parseAmbassadorCsv("full_name,school_name,email\nAna,Liceu,a@b.test")).toThrow("Antet CSV invalid");
    expect(() => parseAmbassadorCsv(`full_name,school_name,email,phone\n${"Ana,Liceu,a@b.test,123\n".repeat(501)}`)).toThrow("cel mult 500");
  });
});

test("normalizeImportKey ignores Unicode normalization and case differences", () => {
  expect(normalizeImportKey("  ȘCOALA Nr. 1 ")).toBe(normalizeImportKey("școala nr. 1"));
});
