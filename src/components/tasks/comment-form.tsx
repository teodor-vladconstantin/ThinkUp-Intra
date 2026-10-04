"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { addComment, type FormState } from "@/app/(app)/tasks/actions";

export function CommentForm({ taskId }: { taskId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addComment, null);
  const ref = useRef<HTMLFormElement>(null);

  // Clear the textarea after a successful post.
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <label htmlFor="body" className="sr-only">
        Comentariu
      </label>
      <textarea
        id="body"
        name="body"
        rows={3}
        required
        maxLength={2000}
        placeholder="Scrie un comentariu…"
        className="rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Se trimite…" : "Comentează"}
        </Button>
        {state && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
      </div>
    </form>
  );
}
