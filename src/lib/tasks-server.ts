import "server-only";
import { fillMissingNames, type Profile } from "@/lib/auth";
import { canMoveTask } from "@/lib/permissions";
import { DEFAULT_PAGE_SIZE, pageRange } from "@/lib/pagination";
import { createUserClient } from "@/lib/supabase/server";
import { sortTasks, TASK_SELECT, type Task } from "@/lib/tasks";

type Db = ReturnType<typeof createUserClient>;

// Departments the actor may create in / move to, the active people to assign, and
// (only for users with PN access) the schools / counties / zones a task can link to.
export async function loadTaskFormOptions(db: Db, actor: Profile) {
  const [departments, people, pn] = await Promise.all([
    db.from("departments").select("id, name").order("id"),
    db.from("profiles").select("clerk_id, full_name, department_id").eq("is_active", true).neq("role", "student").order("full_name"),
    actor.canAccessPn
      ? Promise.all([
          db.from("schools").select("id, name, county_code").order("name"),
          db.from("counties").select("code, name, zone_id").order("name"),
          db.from("zones").select("id, name").order("name"),
        ])
      : null,
  ]);
  if (people.data) await fillMissingNames(people.data);
  const all = departments.data ?? [];
  return {
    departments: canMoveTask(actor) ? all : all.filter((d) => d.id === actor.departmentId),
    people: people.data ?? [],
    pn: pn ? { schools: pn[0].data ?? [], counties: pn[1].data ?? [], zones: pn[2].data ?? [] } : null,
  };
}

const baseQuery = (db: Db) => db.from("tasks_with_alert").select(TASK_SELECT, { count: "exact" }).eq("archived", false);
export type TaskQuery = ReturnType<typeof baseQuery>;

// Non-archived tasks from the alert view, sorted overdue first. `narrow` adds filters.
export async function listTasks(
  db: Db,
  narrow: (q: TaskQuery) => TaskQuery = (q) => q,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const range = pageRange(page, pageSize);
  const { data, error, count } = await narrow(baseQuery(db))
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  if (error) throw new Error("Could not load tasks");
  return {
    tasks: sortTasks((data ?? []) as unknown as Task[]),
    total: count ?? 0,
  };
}

// Overdue / due-soon counts for the signed-in user's own tasks (layout banner, dashboard).
export async function myAlertCounts(db: Db, actor: Profile) {
  const { data } = await db
    .from("tasks_with_alert")
    .select("alert")
    .eq("assignee_id", actor.clerkId)
    .eq("archived", false)
    .not("alert", "is", null);
  const rows = data ?? [];
  return {
    overdue: rows.filter((r) => r.alert === "overdue").length,
    dueSoon: rows.filter((r) => r.alert === "due_soon").length,
  };
}
