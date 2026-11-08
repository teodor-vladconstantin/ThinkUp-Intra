"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type FormActionState = { ok: boolean; message: string } | null;

export function FormActionButton({
  action,
  id,
  label,
  variant = "ghost",
}: {
  action: (prev: FormActionState, formData: FormData) => Promise<FormActionState>;
  id: string;
  label: string;
  variant?: "ghost" | "outline";
}) {
  const [state, formAction, pending] = useActionState<FormActionState, FormData>(action, null);

  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {pending ? "Se procesează…" : label}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
