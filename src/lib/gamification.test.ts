import { expect, test } from "bun:test";
import { bestStreak, earnedBadges, weeklyStreak } from "./gamification";

// Mondays: Sep 7, 14, 21, 28 and Oct 5, 12 of 2026.
test("no activity, no streak", () => {
  expect(weeklyStreak([], "2026-10-05")).toBe(0);
});

test("consecutive weeks count; any weekday of the current week works", () => {
  expect(weeklyStreak(["2026-09-21", "2026-09-28", "2026-10-05"], "2026-10-05")).toBe(3);
  expect(weeklyStreak(["2026-09-21", "2026-09-28", "2026-10-05"], "2026-10-11")).toBe(3); // Sunday
});

test("the running week without activity does not break the streak", () => {
  expect(weeklyStreak(["2026-09-21", "2026-09-28"], "2026-10-07")).toBe(2);
});

test("one empty week per month is forgiven, not counted", () => {
  expect(weeklyStreak(["2026-09-07", "2026-09-21", "2026-09-28", "2026-10-05"], "2026-10-05")).toBe(4);
});

test("a second empty week in the same month ends the streak", () => {
  expect(weeklyStreak(["2026-09-07", "2026-09-28", "2026-10-05"], "2026-10-05")).toBe(2);
});

test("long inactivity resets to 0", () => {
  expect(weeklyStreak(["2026-09-07", "2026-09-14"], "2026-11-30")).toBe(0);
});

test("best streak survives a break; badges follow it", () => {
  const weeks = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];
  expect(bestStreak(weeks)).toBe(4);
  const b = Object.fromEntries(earnedBadges({ weeks, goalDone: false, points: 49 }).map((x) => [x.key, x.earned]));
  expect(b).toEqual({ first: true, steady: true, unstoppable: false, goal: false, points: false });
  expect(earnedBadges({ weeks: [], goalDone: true, points: 50 }).filter((x) => x.earned).map((x) => x.key)).toEqual(["goal", "points"]);
});
