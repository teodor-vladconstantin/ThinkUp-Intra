"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAnnouncement, type FormState } from "@/app/(app)/announcements/actions";

export function AnnouncementForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createAnnouncement, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="ann-title">Titlu</Label>
        <Input id="ann-title" name="title" required maxLength={200} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ann-body">Text</Label>
        <textarea
          id="ann-body"
          name="body"
          rows={3}
          maxLength={5000}
          className="rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <div className="grid gap-1.5">
          <Label htmlFor="ann-expires">Expiră pe (opțional)</Label>
          <Input id="ann-expires" name="expiresAt" type="date" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="important" className="size-4 accent-primary" />
          Important
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Se publică…" : "Publică anunțul"}
        </Button>
        {state && <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-destructive"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
