import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionLabel } from "@/components/section-label";
import { TaskCard } from "@/components/tasks/task-card";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { listTasks } from "@/lib/tasks-server";
import { cn } from "@/lib/utils";

// "My tasks", the default view for everyone (PRD 5.1).
// Mentors get a toggle: all department tasks (default) or only mine.
// ?alert=overdue is the target of the overdue banner in the layout.
export default async function TasksPage(props: PageProps<"/tasks">) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");
  const sp = await props.searchParams;

  const isMentor = profile.role === "mentor";
  const scope = isMentor && sp.scope !== "mine" ? "dept" : "mine";
  const overdueOnly = sp.alert === "overdue";

  const tasks = await listTasks(createUserClient(), (q) => {
    let query =
      scope === "dept" && profile.departmentId !== null
        ? q.or(`department_id.eq.${profile.departmentId},requesting_department_id.eq.${profile.departmentId}`)
        : q.eq("assignee_id", profile.clerkId);
    if (overdueOnly) query = query.eq("alert", "overdue");
    return query;
  });

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <SectionLabel>Sarcini</SectionLabel>
          <h1 className="text-2xl font-semibold">{overdueOnly ? "Sarcini întârziate" : "Sarcinile mele"}</h1>
        </div>
        <Button asChild>
          <Link href="/tasks/new">Sarcină nouă</Link>
        </Button>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filtre">
        {isMentor && (
          <>
            <FilterLink href="/tasks" active={scope === "dept" && !overdueOnly}>Tot departamentul</FilterLink>
            <FilterLink href="/tasks?scope=mine" active={scope === "mine" && !overdueOnly}>Doar ale mele</FilterLink>
          </>
        )}
        <FilterLink href={isMentor ? "/tasks?scope=mine&alert=overdue" : "/tasks?alert=overdue"} active={overdueOnly}>
          Întârziate
        </FilterLink>
        {overdueOnly && !isMentor && <FilterLink href="/tasks" active={false}>Toate</FilterLink>}
      </nav>

      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nicio sarcină deschisă.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {open.map((t) => (
            <TaskCard key={t.id} task={t} viewer={profile} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer py-1 text-sm font-medium max-md:py-2">Finalizate ({done.length})</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {done.map((t) => (
              <TaskCard key={t.id} task={t} viewer={profile} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
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
