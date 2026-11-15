// Gamification contract between backend and frontend. Change only in a small, separate PR.
// Only students linked to an ambassador appear in leaderboards (school -> county -> zone -> country).

export type Period = "week" | "month" | "year"; // year = school year
export type Scope = "school" | "county" | "zone" | "country";
export type AggregateScope = "county" | "zone" | "country"; // what the rows are: counties, zones, or (country) zones ranked nationally

export type Badge = {
  key: string;
  label: string;
  hint: string;
  earned: boolean;
  earnedAt: string | null; // ISO, null while not earned (needs user_badges)
  progress: number | null; // 0..1 toward the badge, null if it has no meter
};

export type LeaderboardRow = {
  rank: number; // 1-based, over the whole scope (not the window)
  profileId: string;
  fullName: string;
  xp: number; // XP earned inside `period`
  schoolName: string;
  isMe: boolean;
};

// Average XP per active student (>= 1 xp event in the period). Not a sum.
export type AggregateRow = {
  rank: number;
  id: string; // county code, zone id, ...
  name: string;
  avgXp: number;
  activeStudents: number;
};

export type MyProgress = {
  xp: number; // all-time
  level: number;
  levelXp: number; // XP at the start of the current level
  nextLevelXp: number; // XP needed for the next level
  streak: number; // weeks
  badges: Badge[];
  // null = not in leaderboards (student without ambassador link) or no activity in the period
  ranks: Record<Scope, number | null>;
};

// Leaderboard window: the top `limit` rows, plus the caller's row and 3 neighbours on each side
// when the caller is outside the top (rows stay sorted by rank). Empty array = student not in leaderboards / empty scope.
export type GetLeaderboard = (scope: Scope, period: Period, limit: number) => Promise<LeaderboardRow[]>;
export type GetAggregate = (scope: AggregateScope, period: Period) => Promise<AggregateRow[]>;
export type GetMyProgress = () => Promise<MyProgress>;
