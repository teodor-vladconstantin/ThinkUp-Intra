import { redirect } from "next/navigation";
import { z } from "zod";
import { SectionLabel } from "@/components/section-label";
import { TaskForm } from "@/components/tasks/task-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { canMoveTask } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { loadTaskFormOptions } from "@/lib/tasks-server";
import { createTask } from "../actions";

// ?meeting=<id> creates a follow-up task linked to that meeting (from the meeting page).
export default async function NewTaskPage(props: PageProps<"/tasks/new">) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  const db = createUserClient();
  const { departments, people, pn } = await loadTaskFormOptions(db, profile);

  const meetingParam = z.uuid().safeParse((await props.searchParams).meeting);
  const meeting = meetingParam.success
    ? (await db.from("meetings").select("id, title, department_id").eq("id", meetingParam.data).maybeSingle()).data
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-3">
        <SectionLabel>Sarcini</SectionLabel>
        <h1 className="text-2xl font-semibold">Sarcină nouă</h1>
        {meeting && <p className="text-sm text-muted-foreground">Din ședința „{meeting.title}”</p>}
      </div>
      <Card>
        <CardContent>
          <TaskForm
            action={createTask}
            departments={departments}
            people={people}
            defaults={{
              departmentId: meeting?.department_id ?? profile.departmentId ?? departments[0]?.id ?? null,
              meetingId: meeting?.id,
            }}
            canChangeDepartment={canMoveTask(profile)}
            pn={pn}
            submitLabel="Creează sarcina"
          />
        </CardContent>
      </Card>
    </div>
  );
}
