"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { logSchoolContact, type FormState } from "@/app/(app)/pn/actions";

export function ContactLogForm({ schoolId }: { schoolId: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(logSchoolContact, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <label htmlFor="note" className="sr-only">
        Notă de contact
      </label>
      <textarea
        id="note"
        name="note"
        rows={2}
        required
        maxLength={2000}
        placeholder="Ce s-a discutat?"
        className="rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          Adaugă în jurnal
        </Button>
        {state && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
      </div>
    </form>
  );
}
