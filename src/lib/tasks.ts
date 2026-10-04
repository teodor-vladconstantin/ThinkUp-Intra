// Shared task types, labels and the one select used by every task list.
// Lists read the tasks_with_alert view (security_invoker = true, so RLS of tasks applies)
// because the overdue / due_soon state is computed there at read time, never stored.

export const STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export type TaskStatus = (typeof STATUSES)[number];
export type TaskAlert = "overdue" | "due_soon" | null;

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "De făcut",
  in_progress: "În lucru",
  blocked: "Blocat",
  done: "Gata",
};

export const PRIORITIES = [1, 2, 3] as const;
export const PRIORITY_LABELS: Record<number, string> = { 1: "Mare", 2: "Normală", 3: "Mică" };

// PostgREST embeds through the view's foreign keys. "!assignee_id" picks which FK to
// follow, since tasks points at profiles (and departments) more than once.
export const TASK_SELECT = `
  id, title, description, status, priority, deadline, alert, archived, completed_at, created_at,
  creator_id, assignee_id, department_id, requesting_department_id, meeting_id,
  assignee:profiles!assignee_id(full_name, is_active),
  creator:profiles!creator_id(full_name),
  department:departments!department_id(name),
  requesting:departments!requesting_department_id(name),
  meeting:meetings(id, title)
`;

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  deadline: string | null;
  alert: TaskAlert;
  archived: boolean;
  completed_at: string | null;
  created_at: string;
  creator_id: string;
  assignee_id: string | null;
  department_id: number | null;
  requesting_department_id: number | null;
  meeting_id: string | null;
  assignee: { full_name: string | null; is_active: boolean } | null;
  creator: { full_name: string | null } | null;
  department: { name: string } | null;
  requesting: { name: string } | null;
  // null while meeting_id is set = the meeting exists but RLS hides it from this viewer
  meeting: { id: string; title: string } | null;
};

// PRD 4: a deactivated user's open tasks show as unassigned.
export function assigneeName(t: Task) {
  if (!t.assignee || !t.assignee.is_active) return null;
  return t.assignee.full_name ?? "—";
}

// Overdue first, then due soon, then by deadline (no deadline last).
export function sortTasks(tasks: Task[]) {
  const rank = (a: TaskAlert) => (a === "overdue" ? 0 : a === "due_soon" ? 1 : 2);
  return [...tasks].sort(
    (a, b) =>
      rank(a.alert) - rank(b.alert) ||
      (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
      a.priority - b.priority,
  );
}

export function toTaskRef(t: Task) {
  return {
    creatorId: t.creator_id,
    assigneeId: t.assignee_id,
    departmentId: t.department_id,
    requestingDepartmentId: t.requesting_department_id,
  };
}
