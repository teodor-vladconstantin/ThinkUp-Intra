"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDecision, type FormState } from "@/app/(app)/meetings/actions";

export function DecisionForm({ meetingId }: { meetingId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addDecision, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="meetingId" value={meetingId} />
      <Input name="text" required maxLength={1000} placeholder="Decizie nouă" aria-label="Decizie nouă" className="min-w-0 flex-1" />
      <Button type="submit" variant="outline" disabled={pending}>
        Adaugă
      </Button>
      {state && !state.ok && <p className="w-full text-sm text-destructive">{state.message}</p>}
    </form>
  );
}
