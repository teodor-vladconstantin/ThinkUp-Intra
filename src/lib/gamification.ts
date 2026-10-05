// Weekly streak + badges. Pure: no DB, no server-only. Weeks are Monday dates, "YYYY-MM-DD".

const DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => ymd(Date.parse(d) + n * DAY);
const mondayOf = (d: string) => addDays(d, -((new Date(d).getUTCDay() + 6) % 7));

// Today's calendar date in Romania ("YYYY-MM-DD").
export const todayRo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());

// Consecutive active weeks ending at `today`'s week. The running week never breaks the streak;
// each calendar month forgives one empty week (no +1, no break); a second one ends it.
export function weeklyStreak(weeks: string[], today: string): number {
  const active = new Set(weeks);
  if (active.size === 0) return 0;
  const earliest = [...active].sort()[0];
  const forgiven = new Set<string>();
  let streak = 0;
  for (let w = mondayOf(today), running = true; w >= earliest; w = addDays(w, -7), running = false) {
    if (active.has(w)) streak++;
    else if (running) continue;
    else if (forgiven.has(w.slice(0, 7))) break;
    else forgiven.add(w.slice(0, 7));
  }
  return streak;
}

// Longest streak ever: the streak as of each active week. Badges use it so they never disappear.
export const bestStreak = (weeks: string[]) => Math.max(0, ...weeks.map((w) => weeklyStreak(weeks, w)));

export type BadgeInput = { weeks: string[]; goalDone: boolean; points: number };

export const BADGES: { key: string; label: string; hint: string; earned: (i: BadgeInput & { best: number }) => boolean }[] = [
  { key: "first", label: "Primul pas", hint: "Prima activitate în platformă", earned: (i) => i.weeks.length > 0 },
  { key: "steady", label: "Constant", hint: "4 săptămâni la rând", earned: (i) => i.best >= 4 },
  { key: "unstoppable", label: "De neoprit", hint: "12 săptămâni la rând", earned: (i) => i.best >= 12 },
  { key: "goal", label: "Obiectiv atins", hint: "Un goal la 100%", earned: (i) => i.goalDone },
  { key: "points", label: "Punctaj", hint: "50 de puncte în anul școlar", earned: (i) => i.points >= 50 },
];

export const earnedBadges = (i: BadgeInput) => {
  const full = { ...i, best: bestStreak(i.weeks) };
  return BADGES.map((b) => ({ key: b.key, label: b.label, hint: b.hint, earned: b.earned(full) }));
};
