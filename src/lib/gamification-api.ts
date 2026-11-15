// Single import point for the frontend. Backend: replace each export with the real Supabase call,
// keeping the signature from gamification-types.ts. Frontend: import only from here.
import { fixtureAggregate, fixtureLeaderboard, fixtureMyProgress } from "./gamification-fixtures";
import type { GetAggregate, GetLeaderboard, GetMyProgress } from "./gamification-types";

export const getLeaderboard: GetLeaderboard = fixtureLeaderboard;
export const getAggregate: GetAggregate = fixtureAggregate;
export const getMyProgress: GetMyProgress = fixtureMyProgress;
