"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { FormState } from "@/app/platform/actions";
import { prepareUpload } from "@/app/platform/actions";
import { browserStorage } from "@/lib/supabase/browser";
import type { Bucket } from "@/lib/platform";
import { cn } from "@/lib/utils";

export const fieldClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Status({ state }: { state: FormState }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-destructive"}`}>
      {state.message}
    </p>
  );
}

// A form bound to a (prev, formData) server action. Resets itself after a success.
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  keep = false,
  autosave = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
  keep?: boolean; // keep values after success (edit forms)
  autosave?: boolean; // edit forms: saves ~1.5 s after the last change; the button still saves at once
}) {
  const [formState, formAction, formPending] = useActionState<FormState, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (formState?.ok && !keep) ref.current?.reset();
  }, [formState, keep]);

  // Autosave posts the FormData by hand instead of through <form action>: React resets an
  // uncontrolled form after an action, which would wipe what the person typed while saving.
  const [autoState, setAutoState] = useState<FormState>(null);
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const savingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function save() {
    const form = ref.current;
    if (!form || !form.reportValidity()) return;
    if (savingRef.current) return void (timer.current = setTimeout(save, 500)); // one save at a time
    savingRef.current = true;
    setSaving(true);
    setUnsaved(false);
    try {
      setAutoState(await action(null, new FormData(form)));
    } catch {
      setAutoState({ ok: false, message: "Nu s-a putut salva." });
      setUnsaved(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Native listener: the hidden inputs of Select/Checkbox only fire a plain DOM "input" event,
  // which React's onChange ignores for type=hidden.
  useEffect(() => {
    const form = ref.current;
    if (!autosave || !form) return;
    const changed = () => {
      setUnsaved(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(save, 1500);
    };
    form.addEventListener("input", changed);
    return () => form.removeEventListener("input", changed);
  });

  const state = autosave ? autoState : formState;
  const pending = autosave ? saving : formPending;
  return (
    <form
      ref={ref}
      {...(autosave
        ? {
            onSubmit: (e: React.FormEvent) => {
              e.preventDefault();
              clearTimeout(timer.current);
              void save();
            },
          }
        : { action: formAction })}
      className={cn("grid gap-2", className)}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="rounded-full">
          {pending ? "Se salvează…" : submitLabel}
        </Button>
        {autosave && unsaved && !pending ? <p className="text-sm text-muted-foreground">Modificări nesalvate…</p> : <Status state={state} />}
      </div>
    </form>
  );
}

// A button for a bound server action (delete, archive, move...).
export function ActionButton({
  action,
  children,
  confirmText,
  variant = "ghost",
  className,
}: {
  action: () => Promise<FormState>;
  children: React.ReactNode;
  confirmText?: string; // asks twice instead of a browser dialog
  variant?: "ghost" | "outline" | "destructive";
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<FormState>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={armed ? "destructive" : variant}
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirmText && !armed) return setArmed(true);
          setArmed(false);
          start(async () => setState(await action()));
        }}
      >
        {armed ? confirmText : children}
      </Button>
      {state && !state.ok && <Status state={state} />}
    </span>
  );
}

// 0-100 in steps of 10; saves on change.
export function ProgressSelect({ value, action, disabled }: { value: number; action: (v: number) => Promise<FormState>; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label="Progres"
      size="sm"
      defaultValue={String(value)}
      disabled={disabled || pending}
      onValueChange={(v) => start(async () => void (await action(Number(v))))}
      className="w-20"
      options={Array.from({ length: 11 }, (_, i) => ({ value: String(i * 10), label: `${i * 10}%` }))}
    />
  );
}

export type UploadedFile = { path: string; name: string; type?: string };

// Browser -> Storage directly: the server signs the upload as the user (RLS checked there),
// then `complete` records the row. Files never pass through a Vercel function (body limits).
export function FileUpload({
  bucket,
  folder,
  accept,
  label,
  complete,
}: {
  bucket: Bucket;
  folder: string;
  accept?: string;
  label: string;
  complete: (file: UploadedFile) => Promise<FormState>;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>(null);
  const input = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    start(async () => {
      const signed = await prepareUpload(bucket, folder, file.name);
      if (!signed.ok) return setState({ ok: false, message: signed.message });
      const { error } = await browserStorage().from(bucket).uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (error) return setState({ ok: false, message: "Încărcarea a eșuat (fișier prea mare sau tip nepermis)." });
      setState(await complete({ path: signed.path, name: file.name, type: file.type || undefined }));
      if (input.current) input.current.value = "";
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        id={`upload-${bucket}-${folder}-${label}`}
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <Button asChild size="sm" variant="outline" className="rounded-full" aria-disabled={pending}>
        <label htmlFor={`upload-${bucket}-${folder}-${label}`} className="cursor-pointer">
          {pending ? "Se încarcă…" : label}
        </label>
      </Button>
      <Status state={state} />
    </span>
  );
}
