import "server-only";
import { redirect } from "next/navigation";
import { requireProfile, type Profile } from "@/lib/auth";
import { isPnMember } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";

type Db = ReturnType<typeof createUserClient>;

export const BUCKETS = ["project-files", "avatars", "open-school"] as const;
export type Bucket = (typeof BUCKETS)[number];

// Mirrors is_pn_dept(): the platform mentors (grade, warn, feedback, challenges, Open School).
export const isPlatformMentor = (p: Profile) => isPnMember(p);

// For platform pages: the profile, or a redirect. RLS (can_access_platform) re-checks every read.
export async function requirePlatformProfile(): Promise<Profile> {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.canAccessPlatform) redirect("/dashboard");
  return profile;
}

// clerk_id -> name, for platform people only (the platform_people view; no emails, no PN data).
export async function platformPeople(db: Db) {
  const { data } = await db.from("platform_people").select("clerk_id, full_name, is_mentor").order("full_name");
  const rows = (data ?? []) as { clerk_id: string; full_name: string | null; is_mentor: boolean }[];
  return { list: rows, name: (id: string | null) => rows.find((r) => r.clerk_id === id)?.full_name ?? "—" };
}

// Short-lived read links, created as the user: Storage RLS decides who gets one.
export async function signedUrls(db: Db, bucket: Bucket, paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await db.storage.from(bucket).createSignedUrls(unique, 60 * 60);
  return new Map((data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : [])));
}

// Safe object name: keep letters, digits, dot, dash; prefix with a random id so names never collide.
export function storageName(fileName: string) {
  const clean = fileName.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-80) || "file";
  return `${crypto.randomUUID()}-${clean}`;
}

// Grading: four criteria, 1-5 each -> 20 per challenge (submissions.score is their sum).
export const CRITERIA = [
  { key: "innovation", label: "Inovație" },
  { key: "impact", label: "Impact" },
  { key: "feedback_score", label: "Feedback" },
  { key: "efficiency", label: "Eficiență" },
] as const;
export const MAX_CHALLENGE_SCORE = 20;

// School year (Sep-Aug) of a date, as its starting year: 2026-10-04 -> 2026, 2027-03-01 -> 2026.
export function schoolYear(iso: string): number {
  const d = new Date(iso);
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}
