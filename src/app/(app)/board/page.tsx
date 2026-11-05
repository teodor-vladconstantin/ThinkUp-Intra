import Link from "next/link";
import { redirect } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { SectionLabel } from "@/components/section-label";
import { AlertBadge, AlertBanner } from "@/components/tasks/alert-badge";
import { TaskCard } from "@/components/tasks/task-card";
import { requireProfile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { isCd } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { assigneeName, STATUS_LABELS, STATUSES } from "@/lib/tasks";
import { listTasks } from "@/lib/tasks-server";
import { cn } from "@/lib/utils";

// Department board (PRD 5.1): kanban by status, or a list (?view=list).
// Shows tasks the department executes AND tasks it requested from others.
// CD members pick the department (?dept=); everyone else sees their own.
export default async function BoardPage(props: PageProps<"/board">) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");
  const sp = await props.searchParams;
  const page = parsePage(sp.page);

  const db = createUserClient();
  const { data: departments } = await db.from("departments").select("id, name").order("id");
  const allowed = isCd(profile) ? (departments ?? []) : (departments ?? []).filter((d) => d.id === profile.departmentId);

  const requested = Number(sp.dept);
  const dept = allowed.find((d) => d.id === requested) ?? allowed.find((d) => d.id === profile.departmentId) ?? allowed[0];
  if (!dept) return <p className="text-sm text-muted-foreground">Nu faci parte dintr-un departament.</p>;

  const view = sp.view === "list" ? "list" : "kanban";
  const departmentFilter = `department_id.eq.${dept.id},requesting_department_id.eq.${dept.id}`;
  const [taskPage, overdue, dueSoon] = await Promise.all([
    listTasks(db, (q) => q.or(departmentFilter), page),
    db
      .from("tasks_with_alert")
      .select("id", { count: "exact", head: true })
      .eq("archived", false)
      .eq("alert", "overdue")
      .or(departmentFilter),
    db
      .from("tasks_with_alert")
      .select("id", { count: "exact", head: true })
      .eq("archived", false)
      .eq("alert", "due_soon")
      .or(departmentFilter),
  ]);
  if (overdue.error || dueSoon.error) throw new Error("Could not load task alert counts");
  const { tasks, total } = taskPage;
  const href = (params: { dept?: number; view?: string }) =>
    `/board?dept=${params.dept ?? dept.id}${(params.view ?? view) === "list" ? "&view=list" : ""}`;
  const pageParams = { dept: String(dept.id), ...(view === "list" ? { view } : {}) };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Board</SectionLabel>
        <h1 className="text-2xl font-semibold">Departamentul {dept.name}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm" data-tour="board-views">
        {allowed.length > 1 &&
          allowed.map((d) => (
            <Pill key={d.id} href={href({ dept: d.id })} active={d.id === dept.id}>
              {d.name}
            </Pill>
          ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Pill href={href({ view: "kanban" })} active={view === "kanban"}>Kanban</Pill>
        <Pill href={href({ view: "list" })} active={view === "list"}>Listă</Pill>
      </div>

      <Pagination basePath="/board" page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} params={pageParams} label="sarcini" />

      {/* PRD 5.2: the VP sees the department's alerts on the department board */}
      <AlertBanner
        overdue={overdue.count ?? 0}
        dueSoon={dueSoon.count ?? 0}
      />

      {view === "kanban" ? (
        // Horizontal scroll on phones, four columns on wide screens. "relative": the scroller must be
        // the containing block of the cards' hidden (absolute) elements, or they escape the clipping
        // and widen the whole page.
        <div className="relative -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" data-tour="board-columns">
          <div className="grid min-w-[56rem] grid-cols-4 gap-4">
            {STATUSES.map((s) => {
              const column = tasks.filter((t) => t.status === s);
              return (
                <section key={s} className="space-y-3 rounded-xl bg-muted/60 p-3" aria-label={STATUS_LABELS[s]}>
                  <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {STATUS_LABELS[s]} · {column.length}
                  </h2>
                  {column.map((t) => (
                    <TaskCard key={t.id} task={t} viewer={profile} />
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="p-3 font-medium">Sarcină</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Responsabil</th>
                <th className="p-3 font-medium">Termen</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="p-3">
                    <Link href={`/tasks/${t.id}`} className="font-medium hover:text-primary">
                      {t.title}
                    </Link>
                    {t.department_id !== dept.id && <span className="ml-2 text-xs text-muted-foreground">→ {t.department?.name}</span>}
                  </td>
                  <td className="p-3">{STATUS_LABELS[t.status]}</td>
                  <td className="p-3">{assigneeName(t) ?? "Nealocat"}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {t.deadline ? formatDate(t.deadline) : "—"}
                      <AlertBadge alert={t.alert} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nicio sarcină.</p>}
        </div>
      )}
      <Pagination basePath="/board" page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} params={pageParams} label="sarcini" />
    </div>
  );
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 max-md:py-2",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary",
      )}
    >
      {children}
    </Link>
  );
}
