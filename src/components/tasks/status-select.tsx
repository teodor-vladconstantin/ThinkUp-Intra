"use client";

import { useRef } from "react";
import { updateTaskStatus } from "@/app/(app)/tasks/actions";
import { Select } from "@/components/ui/select";
import { STATUS_LABELS, STATUSES, type TaskStatus } from "@/lib/tasks";

// Status change from a card: a themed select that submits its form on change.
// No drag-and-drop library; this also works with a keyboard and on phones.
export function StatusSelect({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={updateTaskStatus}>
      <input type="hidden" name="id" value={taskId} />
      <Select
        name="status"
        defaultValue={status}
        aria-label="Status"
        size="sm"
        // the hidden input updates on the next render; submit after it
        onValueChange={() => setTimeout(() => form.current?.requestSubmit(), 0)}
        className="h-7 w-auto rounded-full px-2.5 text-xs"
        options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
      />
    </form>
  );
}
