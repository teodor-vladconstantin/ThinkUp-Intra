"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteAmbassador, type FormState } from "@/app/(app)/pn/actions";

// Platform account for one ambassador: links an existing account or sends an invitation.
export function AmbassadorInviteForm({ ambassadorId, defaultEmail }: { ambassadorId: number; defaultEmail: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteAmbassador, null);
  return (
    <form action={action} className="mt-1 flex flex-wrap items-center gap-2">
      <input type="hidden" name="ambassadorId" value={ambassadorId} />
      <Input
        name="email"
        type="email"
        required
        maxLength={200}
        defaultValue={defaultEmail}
        placeholder="nume@exemplu.ro"
        aria-label="Email pentru contul de platformă"
        className="h-8 max-w-64"
        autoComplete="off"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Se trimite…" : "Invită pe platformă"}
      </Button>
      {state && <p role="status" className={`text-xs ${state.ok ? "text-success" : "text-destructive"}`}>{state.message}</p>}
    </form>
  );
}
