import { redirect } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { SectionLabel } from "@/components/section-label";
import { TaskCard } from "@/components/tasks/task-card";
import { requireProfile } from "@/lib/auth";
import { isCd } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { listTasks } from "@/lib/tasks-server";

// Leadership view for CD (PRD 5.1): every overdue task, grouped by executing department.
export default async function LeadershipPage(props: PageProps<"/leadership">) {
  const profile = await requireProfile();
  if (!profile || !isCd(profile)) redirect("/dashboard");

  const page = parsePage((await props.searchParams).page);
  const { tasks, total } = await listTasks(createUserClient(), (q) => q.eq("alert", "overdue"), page);
  const groups = Map.groupBy(tasks, (t) => t.department?.name ?? "Fără departament");

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Conducere</SectionLabel>
        <h1 className="text-2xl font-semibold">Sarcini întârziate</h1>
        <p className="text-sm text-muted-foreground">
          {tasks.length === 0 ? "Nicio sarcină întârziată." : `${tasks.length} în total, pe departamente.`}
        </p>
      </div>

      <Pagination basePath="/leadership" page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} label="sarcini" />

      {[...groups].map(([department, items]) => (
        <section key={department} className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            {department} · {items.length}
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((t) => (
              <TaskCard key={t.id} task={t} viewer={profile} />
            ))}
          </div>
        </section>
      ))}
      <Pagination basePath="/leadership" page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} label="sarcini" />
    </div>
  );
}
