import { expect, test } from "bun:test";
import { XP_DAILY_CAPS, XP_WEIGHTS, bestStreak, earnedBadges, levelForXp, weeklyStreak } from "./gamification";

test("gamification XP weights and daily caps are bounded", () => {
  expect(XP_WEIGHTS.goal_progress).toBe(10);
  expect(XP_WEIGHTS.material).toBe(5);
  expect(XP_WEIGHTS.photo).toBe(5);
  expect(XP_DAILY_CAPS.goal_progress).toBe(30);
  expect(XP_DAILY_CAPS.material).toBe(20);
  expect(XP_DAILY_CAPS.photo).toBe(15);
});

test("level formula follows 100 * level squared thresholds", () => {
  expect(levelForXp(0)).toEqual({ level: 1, levelXp: 0, nextLevelXp: 100 });
  expect(levelForXp(99)).toEqual({ level: 1, levelXp: 0, nextLevelXp: 100 });
  expect(levelForXp(100)).toEqual({ level: 2, levelXp: 100, nextLevelXp: 400 });
});

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
