import Link from "next/link";
import { AlertBadge } from "@/components/tasks/alert-badge";
import { StatusSelect } from "@/components/tasks/status-select";
import type { Profile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { canEditTask } from "@/lib/permissions";
import { assigneeName, PRIORITY_LABELS, STATUS_LABELS, toTaskRef, type Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export function TaskCard({ task, viewer }: { task: Task; viewer: Profile }) {
  const editable = canEditTask(viewer, toTaskRef(task));
  const assignee = assigneeName(task);

  return (
    <article
      className={cn(
        "space-y-2 rounded-xl border bg-card p-3 shadow-sm",
        task.alert === "overdue" && "border-destructive/60",
        task.alert === "due_soon" && "border-warning/70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/tasks/${task.id}`} className="font-medium leading-snug hover:text-primary">
          {task.title}
        </Link>
        <AlertBadge alert={task.alert} />
      </div>

      <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <div>
          <dt className="sr-only">Responsabil</dt>
          <dd>{assignee ?? "Nealocat"}</dd>
        </div>
        {task.deadline && (
          <div>
            <dt className="sr-only">Termen</dt>
            <dd>{formatDate(task.deadline)}</dd>
          </div>
        )}
        <div>
          <dt className="sr-only">Departament</dt>
          <dd>
            {task.department?.name ?? "—"}
            {task.requesting ? ` · cerut de ${task.requesting.name}` : ""}
          </dd>
        </div>
        {task.priority === 1 && <dd className="font-semibold text-destructive">Prioritate {PRIORITY_LABELS[1].toLowerCase()}</dd>}
      </dl>

      {editable ? (
        <StatusSelect taskId={task.id} status={task.status} />
      ) : (
        <p className="text-xs text-muted-foreground">{STATUS_LABELS[task.status]}</p>
      )}
    </article>
  );
}
