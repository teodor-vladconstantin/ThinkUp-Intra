import "server-only";
import { createUserClient } from "@/lib/supabase/server";

export type Announcement = {
  id: string;
  title: string;
  body: string | null;
  important: boolean;
  author_id: string;
  starts_at: string;
  expires_at: string | null;
  author: { full_name: string | null } | null;
};

// Active = not archived, already started, not expired (PRD 5.6). Important ones first.
export async function activeAnnouncements(db: ReturnType<typeof createUserClient>) {
  const now = new Date().toISOString();
  const { data } = await db
    .from("announcements")
    .select("id, title, body, important, author_id, starts_at, expires_at, author:profiles!author_id(full_name)")
    .eq("archived", false)
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt."${now}"`) // quoted: the timestamp has ":" and "."
    .order("important", { ascending: false })
    .order("starts_at", { ascending: false });
  return (data ?? []) as unknown as Announcement[];
}
