import "server-only";
import { createClient } from "@supabase/supabase-js";

// Secret-key client: BYPASSES RLS. The "server-only" import makes the build fail if
// this module is ever imported from client code, so the key cannot reach the browser.
// Allowed uses: reading/creating the caller's own profile on first sign-in, and
// cleaning up an invitation row the server itself just created. Nothing else.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
