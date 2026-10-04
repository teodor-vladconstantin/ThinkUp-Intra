import type { TaskAlert } from "@/lib/tasks";

// Red for overdue, amber for due within 48h (PRD 5.2). The state comes from tasks_with_alert.
export function AlertBadge({ alert }: { alert: TaskAlert }) {
  if (alert === "overdue") {
    return <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground">Întârziată</span>;
  }
  if (alert === "due_soon") {
    return <span className="rounded-full bg-warning px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">Termen în 48h</span>;
  }
  return null;
}

// Full-width banner with a count, used on dashboards and boards.
export function AlertBanner({ overdue, dueSoon }: { overdue: number; dueSoon: number }) {
  if (!overdue && !dueSoon) return null;
  return (
    <div className="grid gap-2">
      {overdue > 0 && (
        <div role="alert" className="rounded-xl bg-destructive px-4 py-3 text-sm font-medium text-destructive-foreground">
          {overdue === 1 ? "O sarcină a depășit termenul." : `${overdue} sarcini au depășit termenul.`}
        </div>
      )}
      {dueSoon > 0 && (
        <div role="status" className="rounded-xl bg-warning px-4 py-3 text-sm font-medium text-warning-foreground">
          {dueSoon === 1 ? "O sarcină are termenul în următoarele 48 de ore." : `${dueSoon} sarcini au termenul în următoarele 48 de ore.`}
        </div>
      )}
    </div>
  );
}
