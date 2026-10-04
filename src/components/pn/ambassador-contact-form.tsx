"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateAmbassadorContacts, type FormState } from "@/app/(app)/pn/actions";

export function AmbassadorContactForm({ id, email, phone }: { id: number; email: string | null; phone: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateAmbassadorContacts, null);

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-primary">Editează contactul</summary>
      <form action={action} className="mt-2 grid gap-2">
        <input type="hidden" name="id" value={id} />
        <Input name="email" type="email" maxLength={200} defaultValue={email ?? ""} placeholder="Email" aria-label="Email" autoComplete="off" />
        <Input name="phone" type="tel" maxLength={40} defaultValue={phone ?? ""} placeholder="Telefon" aria-label="Telefon" autoComplete="off" />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Salvează
          </Button>
          {state && <span role="status" className={state.ok ? "text-success" : "text-destructive"}>{state.message}</span>}
        </div>
      </form>
    </details>
  );
}
