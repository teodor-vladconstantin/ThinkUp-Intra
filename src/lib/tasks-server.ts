import "server-only";
import type { Profile } from "@/lib/auth";
import { canMoveTask } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { sortTasks, TASK_SELECT, type Task } from "@/lib/tasks";

type Db = ReturnType<typeof createUserClient>;

// Departments the actor may create in / move to, the active people to assign, and
// (only for users with PN access) the schools / counties / zones a task can link to.
export async function loadTaskFormOptions(db: Db, actor: Profile) {
  const [departments, people, pn] = await Promise.all([
    db.from("departments").select("id, name").order("id"),
    db.from("profiles").select("clerk_id, full_name, department_id").eq("is_active", true).order("full_name"),
    actor.canAccessPn
      ? Promise.all([
          db.from("schools").select("id, name").order("name"),
          db.from("counties").select("code, name").order("name"),
          db.from("zones").select("id, name").order("name"),
        ])
      : null,
  ]);
  const all = departments.data ?? [];
  return {
    departments: canMoveTask(actor) ? all : all.filter((d) => d.id === actor.departmentId),
    people: people.data ?? [],
    pn: pn ? { schools: pn[0].data ?? [], counties: pn[1].data ?? [], zones: pn[2].data ?? [] } : null,
  };
}

const baseQuery = (db: Db) => db.from("tasks_with_alert").select(TASK_SELECT).eq("archived", false);
export type TaskQuery = ReturnType<typeof baseQuery>;

// Non-archived tasks from the alert view, sorted overdue first. `narrow` adds filters.
export async function listTasks(db: Db, narrow: (q: TaskQuery) => TaskQuery = (q) => q) {
  const { data, error } = await narrow(baseQuery(db));
  if (error) throw new Error("Could not load tasks");
  // Without generated DB types supabase-js guesses embeds are arrays; to-one FKs come back as objects.
  return sortTasks((data ?? []) as unknown as Task[]);
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
