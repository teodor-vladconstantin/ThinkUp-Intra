import { expect, test } from "bun:test";
import { dateInputValue, deadlineFromDate } from "./dates";

test("deadline is end of day in Bucharest, stored as UTC", () => {
  expect(deadlineFromDate("2026-01-15")).toBe("2026-01-15T21:59:59.000Z"); // winter, UTC+2
  expect(deadlineFromDate("2026-07-15")).toBe("2026-07-15T20:59:59.000Z"); // summer, UTC+3
});

test("DST switch days", () => {
  expect(deadlineFromDate("2026-03-29")).toBe("2026-03-29T20:59:59.000Z"); // switched to +3 that morning
  expect(deadlineFromDate("2026-10-25")).toBe("2026-10-25T21:59:59.000Z"); // switched to +2 that morning
});

test("round trip back to the picked date", () => {
  for (const d of ["2026-01-15", "2026-03-29", "2026-07-15", "2026-10-25", "2026-12-31"]) {
    expect(dateInputValue(deadlineFromDate(d))).toBe(d);
  }
});
