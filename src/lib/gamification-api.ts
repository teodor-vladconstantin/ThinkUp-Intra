// Single import point for the frontend.
import "server-only";
import { createUserClient } from "@/lib/supabase/server";
import type { GetAggregate, GetLeaderboard, GetMyProgress } from "./gamification-types";

export const getLeaderboard: GetLeaderboard = async (scope, period, limit) => {
  const { data, error } = await createUserClient().rpc("gamification_leaderboard", {
    p_scope: scope,
    p_period: period,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((row: {
    rank: number;
    profile_id: string;
    full_name: string;
    xp: number;
    school_name: string;
    is_me: boolean;
  }) => ({
    rank: Number(row.rank),
    profileId: row.profile_id,
    fullName: row.full_name,
    xp: Number(row.xp),
    schoolName: row.school_name,
    isMe: row.is_me,
  }));
};

export const getAggregate: GetAggregate = async (scope, period) => {
  const { data, error } = await createUserClient().rpc("gamification_aggregate", {
    p_scope: scope,
    p_period: period,
  });
  if (error) throw error;
  return (data ?? []).map((row: {
    rank: number;
    id: string;
    name: string;
    avg_xp: number;
    active_students: number;
  }) => ({
    rank: Number(row.rank),
    id: row.id,
    name: row.name,
    avgXp: Number(row.avg_xp),
    activeStudents: Number(row.active_students),
  }));
};

export const getMyProgress: GetMyProgress = async () => {
  const { data, error } = await createUserClient().rpc("gamification_my_progress");
  if (error) throw error;
  if (!data) {
    throw new Error("Could not load gamification progress");
  }
  return data as Awaited<ReturnType<GetMyProgress>>;
};
