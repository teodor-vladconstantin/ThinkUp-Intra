"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateAmbassadorContacts, type FormState } from "@/app/(app)/pn/actions";

export function AmbassadorContactForm({ id, email, phone }: { id: number; email: string | null; phone: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateAmbassadorContacts, null);

  return (
    <details className="text-xs">
      <summary className="cursor-pointer py-1 text-primary max-md:py-2.5">Editează contactul</summary>
      <form action={action} className="mt-2 grid gap-2">
        <input type="hidden" name="id" value={id} />
        <Input name="email" type="email" required maxLength={200} defaultValue={email ?? ""} placeholder="Email de contact" aria-label="Email de contact" autoComplete="off" />
        <Input name="phone" type="tel" required maxLength={40} defaultValue={phone ?? ""} placeholder="Telefon" aria-label="Telefon" autoComplete="off" />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            Salvează
          </Button>
          {state && <span role="status" className={state.ok ? "text-success" : "text-destructive"}>{state.message}</span>}
        </div>
      </form>
    </details>
  );
}
