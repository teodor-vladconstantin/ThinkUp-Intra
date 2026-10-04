"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addAmbassador, type FormState } from "@/app/(app)/pn/actions";

// Manual add (the CSV import comes later). Ambassadors are likely minors: only the
// fields the program needs, contacts optional.
export function AmbassadorForm({ schoolId }: { schoolId: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addAmbassador, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <Input name="fullName" required maxLength={150} placeholder="Nume și prenume" aria-label="Nume și prenume" autoComplete="off" />
      <Input name="platformUserId" maxLength={100} placeholder="ID pe platforma ambasadorilor (opțional)" aria-label="ID platformă" autoComplete="off" />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="email" type="email" maxLength={200} placeholder="Email (opțional)" aria-label="Email" autoComplete="off" />
        <Input name="phone" type="tel" maxLength={40} placeholder="Telefon (opțional)" aria-label="Telefon" autoComplete="off" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          Adaugă ambasador
        </Button>
        {state && <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-destructive"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
