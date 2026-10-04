import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Supabase client that acts AS the signed-in user: every request carries the Clerk
// session token, Supabase verifies it (third-party auth), and RLS policies read the
// user id from auth.jwt()->>'sub'. Use this for all normal reads and writes.
export function createUserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      async accessToken() {
        return (await auth()).getToken();
      },
    },
  );
}
