"use client";

import { updateTaskStatus } from "@/app/(app)/tasks/actions";
import { STATUS_LABELS, STATUSES, type TaskStatus } from "@/lib/tasks";

// Status change from a card: a native <select> that submits its form on change.
// No drag-and-drop library; this also works with a keyboard and on phones.
export function StatusSelect({ taskId, status }: { taskId: string; status: TaskStatus }) {
  return (
    <form action={updateTaskStatus}>
      <input type="hidden" name="id" value={taskId} />
      <select
        name="status"
        defaultValue={status}
        aria-label="Status"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-7 rounded-full border border-input bg-card px-2 text-xs"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </form>
  );
}
