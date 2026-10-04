import { createClient } from "@supabase/supabase-js";

// Browser client WITHOUT a user session. Used only to upload to a signed upload URL:
// the server already created that URL as the user (Storage RLS checked there).
export const browserStorage = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
