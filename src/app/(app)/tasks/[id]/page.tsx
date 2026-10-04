import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { SectionLabel } from "@/components/section-label";
import { AlertBadge } from "@/components/tasks/alert-badge";
import { CommentForm } from "@/components/tasks/comment-form";
import { StatusSelect } from "@/components/tasks/status-select";
import { TaskForm } from "@/components/tasks/task-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { dateInputValue, formatDate, formatDateTime } from "@/lib/dates";
import { canEditTask, canMoveTask } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { describeChanges } from "@/lib/task-history";
import { assigneeName, PRIORITY_LABELS, STATUS_LABELS, TASK_SELECT, toTaskRef, type Task } from "@/lib/tasks";
import { loadTaskFormOptions } from "@/lib/tasks-server";
import { archiveTask, updateTask } from "../actions";

type Comment = { id: string; body: string; created_at: string; author: { full_name: string | null } | null };
type LogRow = { id: number; actor_id: string | null; action: string; diff: Record<string, unknown> | null; created_at: string };

export default async function TaskPage(props: PageProps<"/tasks/[id]">) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();

  // All reads use the user client: if RLS hides the task, it simply does not exist here.
  const db = createUserClient();
  const { data } = await db.from("tasks_with_alert").select(TASK_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const task = data as unknown as Task;

  const [comments, log, options, departments, people] = await Promise.all([
    db.from("task_comments").select("id, body, created_at, author:profiles!author_id(full_name)").eq("task_id", id).order("created_at"),
    db.from("activity_log").select("id, actor_id, action, diff, created_at").eq("entity", "tasks").eq("entity_id", id).order("created_at", { ascending: false }),
    loadTaskFormOptions(db, profile),
    // History needs names for every person / department that appears in old or new values.
    db.from("departments").select("id, name"),
    db.from("profiles").select("clerk_id, full_name"),
  ]);
  const personName = (v: unknown) => people.data?.find((p) => p.clerk_id === v)?.full_name ?? (v ? "—" : "Nealocat");
  const departmentName = (v: unknown) => departments.data?.find((d) => d.id === v)?.name ?? "—";

  const editable = canEditTask(profile, toTaskRef(task));
  const assignee = assigneeName(task);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Sarcină</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{task.title}</h1>
          <AlertBadge alert={task.alert} />
          {task.archived && <span className="rounded-full border px-2 py-0.5 text-xs">Arhivată</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4">
              {task.description ? (
                <p className="whitespace-pre-wrap text-sm">{task.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Fără descriere.</p>
              )}
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <Field label="Status">{editable ? <StatusSelect taskId={task.id} status={task.status} /> : STATUS_LABELS[task.status]}</Field>
                <Field label="Responsabil">{assignee ?? "Nealocat"}</Field>
                <Field label="Termen">{task.deadline ? formatDate(task.deadline) : "—"}</Field>
                <Field label="Prioritate">{PRIORITY_LABELS[task.priority]}</Field>
                <Field label="Departament">{task.department?.name ?? "—"}</Field>
                <Field label="Cerut de">{task.requesting?.name ?? "—"}</Field>
                <Field label="Creată de">{task.creator?.full_name ?? "—"}</Field>
                {task.completed_at && <Field label="Finalizată">{formatDate(task.completed_at)}</Field>}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comentarii</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(comments.data as unknown as Comment[] | null)?.map((c) => (
                <div key={c.id} className="rounded-lg bg-muted p-3 text-sm">
                  <p className="mb-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.author?.full_name ?? "—"}</span> · {formatDateTime(c.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              {!task.archived && <CommentForm taskId={task.id} />}
            </CardContent>
          </Card>

          {editable && !task.archived && (
            <Card>
              <CardHeader>
                <CardTitle>Editează</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <TaskForm
                  action={updateTask}
                  departments={options.departments}
                  people={options.people}
                  canChangeDepartment={canMoveTask(profile)}
                  submitLabel="Salvează"
                  defaults={{
                    id: task.id,
                    title: task.title,
                    description: task.description,
                    priority: task.priority,
                    deadline: task.deadline ? dateInputValue(task.deadline) : undefined,
                    assigneeId: task.assignee_id,
                    departmentId: task.department_id,
                  }}
                />
                <form action={archiveTask} className="border-t pt-4">
                  <input type="hidden" name="id" value={task.id} />
                  <Button type="submit" variant="outline">Arhivează sarcina</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Istoric</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {(log.data as LogRow[] | null)?.flatMap((entry) =>
                describeChanges(entry, { person: personName, department: departmentName }).map((line, i) => (
                  <li key={`${entry.id}-${i}`}>
                    <span className="font-medium">{personName(entry.actor_id)}</span> {line}
                    <time className="block text-xs text-muted-foreground" dateTime={entry.created_at}>
                      {formatDateTime(entry.created_at)}
                    </time>
                  </li>
                )),
              )}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
