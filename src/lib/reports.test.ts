import { expect, test } from "bun:test";
import { fieldsSchema, formatAnswer, parseAnswers, type ReportField } from "./reports";

const fields: ReportField[] = [
  { id: "aaaa", type: "text", label: "Rezumat", required: true },
  { id: "bbbb", type: "scale", label: "Nota", required: false },
  { id: "cccc", type: "multiselect", label: "Teme", required: false, options: ["a", "b"] },
  { id: "dddd", type: "yesno", label: "Întâlnire", required: false },
];
const post = (o: Record<string, string[]>) => (n: string) => o[n] ?? [];

test("valid answers are typed", () => {
  const r = parseAnswers(fields, post({ f_aaaa: ["ok"], f_bbbb: ["4"], f_cccc: ["a", "b"], f_dddd: ["yes"] }));
  expect(r).toEqual({ ok: true, answers: { aaaa: "ok", bbbb: 4, cccc: ["a", "b"], dddd: true } });
});

test("required, range and option checks", () => {
  expect(parseAnswers(fields, post({})).ok).toBe(false);
  expect(parseAnswers(fields, post({ f_aaaa: ["x"], f_bbbb: ["9"] })).ok).toBe(false);
  expect(parseAnswers(fields, post({ f_aaaa: ["x"], f_cccc: ["zzz"] })).ok).toBe(false);
});

test("builder rules", () => {
  expect(fieldsSchema.safeParse([]).success).toBe(false);
  expect(fieldsSchema.safeParse([{ id: "eeee", type: "select", label: "x", required: false, options: ["a"] }]).success).toBe(false);
  expect(fieldsSchema.safeParse(fields).success).toBe(true);
  expect(formatAnswer(false)).toBe("Nu");
});
