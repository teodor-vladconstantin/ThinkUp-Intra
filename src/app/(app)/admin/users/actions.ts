"use server";

import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

// PRD 4: deactivating ends access immediately.
// 1. Database first: set_user_active() checks the permission itself and flips is_active,
//    so every RLS helper stops recognising the user on their very next request.
// 2. Then Clerk: ban (or unban) so existing sessions end and they cannot sign in again.
// If step 2 fails the user is already locked out of all data; we report it so it can be retried.
export async function setUserActive(clerkId: string, active: boolean): Promise<ActionResult> {
  const actor = await requireProfile();
  if (!actor) return { ok: false, message: "Nu ești autentificat." };
  if (!z.string().min(1).max(100).safeParse(clerkId).success) return { ok: false, message: "Utilizator invalid." };

  const { error } = await createUserClient().rpc("set_user_active", { p_clerk_id: clerkId, p_active: active });
  if (error) return { ok: false, message: "Nu ai dreptul să modifici acest cont." };

  revalidatePath("/admin/users");
  try {
    const clerk = await clerkClient();
    if (active) await clerk.users.unbanUser(clerkId);
    else await clerk.users.banUser(clerkId);
  } catch {
    return {
      ok: false,
      message: active
        ? "Contul e reactivat în intranet, dar Clerk nu a ridicat blocarea. Încearcă din nou."
        : "Accesul la date e oprit, dar sesiunea Clerk nu a putut fi închisă. Încearcă din nou.",
    };
  }
  return { ok: true, message: active ? "Cont reactivat." : "Cont dezactivat." };
}
