// Fixtures for the gamification contract. Frontend builds against these; backend replaces the
// bodies in gamification-api.ts. Not imported in production code paths once the API is real.
import type { AggregateRow, Badge, GetAggregate, GetLeaderboard, GetMyProgress, LeaderboardRow, MyProgress } from "./gamification-types";

const NAMES = [
  "Andrei Popescu", "Maria Ionescu", "Alexandru Dumitru", "Elena Stoica", "Mihai Georgescu", "Ioana Radu",
  "Teodor Constantin", "Ana Marin", "Stefan Matei", "Daria Ene", "Vlad Dobre", "Sofia Barbu",
  "Radu Munteanu", "Irina Toma", "Luca Preda", "Bianca Sandu", "Darius Neagu", "Teodora Lazar",
];
const SCHOOLS = ["Colegiul Național Gheorghe Lazăr", "Liceul Teoretic Mihai Eminescu", "Colegiul Tehnic Anghel Saligny"];
export const FIXTURE_ME_RANK = 7;

// Rows 1..n sorted by xp desc; the caller sits at FIXTURE_ME_RANK.
const rows = (n: number): LeaderboardRow[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1,
    profileId: `user_${i + 1}`,
    fullName: NAMES[i % NAMES.length],
    xp: Math.max(10, 1200 - i * 55),
    schoolName: SCHOOLS[i % SCHOOLS.length],
    isMe: i + 1 === FIXTURE_ME_RANK,
  }));

export const fixtureLeaderboard: GetLeaderboard = async (_scope, _period, limit) => rows(Math.min(limit, 18));

const aggregate = (names: string[]): AggregateRow[] =>
  names.map((name, i) => ({ rank: i + 1, id: String(i + 1), name, avgXp: 480 - i * 37, activeStudents: 40 - i * 3 }));

export const fixtureAggregate: GetAggregate = async (scope) =>
  scope === "county"
    ? aggregate(["Cluj", "Iași", "Timiș", "Brașov", "Constanța", "Sibiu"])
    : aggregate(["Nord-Vest", "Nord-Est", "Vest", "Centru", "Sud-Est"]);

const badge = (key: string, label: string, hint: string, earned: boolean, progress: number | null): Badge => ({
  key, label, hint, earned, earnedAt: earned ? "2026-10-12T09:30:00.000Z" : null, progress: earned ? 1 : progress,
});

export const FIXTURE_BADGES: Badge[] = [
  badge("first", "Primul pas", "Prima activitate în platformă", true, null),
  badge("steady", "Constant", "4 săptămâni la rând", true, 1),
  badge("unstoppable", "De neoprit", "12 săptămâni la rând", false, 5 / 12),
  badge("goal", "Obiectiv atins", "Un goal la 100%", true, null),
  badge("points", "Punctaj", "50 de puncte în anul școlar", false, 0.64),
  badge("county-top", "Nr. 1 în județ", "Primul loc în județ într-o lună", false, null),
];

export const FIXTURE_PROGRESS: MyProgress = {
  xp: 740,
  level: 4,
  levelXp: 600,
  nextLevelXp: 900,
  streak: 5,
  badges: FIXTURE_BADGES,
  ranks: { school: 2, county: 7, zone: 31, country: 212 },
};

export const fixtureMyProgress: GetMyProgress = async () => FIXTURE_PROGRESS;

// Edge cases the UI must handle: student without ambassador link (not in leaderboards).
export const FIXTURE_UNRANKED: MyProgress = {
  ...FIXTURE_PROGRESS,
  ranks: { school: null, county: null, zone: null, country: null },
};
