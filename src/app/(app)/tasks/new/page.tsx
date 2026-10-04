import { redirect } from "next/navigation";
import { SectionLabel } from "@/components/section-label";
import { TaskForm } from "@/components/tasks/task-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { canMoveTask } from "@/lib/permissions";
import { createUserClient } from "@/lib/supabase/server";
import { loadTaskFormOptions } from "@/lib/tasks-server";
import { createTask } from "../actions";

export default async function NewTaskPage() {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  const { departments, people } = await loadTaskFormOptions(createUserClient(), profile);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-3">
        <SectionLabel>Sarcini</SectionLabel>
        <h1 className="text-2xl font-semibold">Sarcină nouă</h1>
      </div>
      <Card>
        <CardContent>
          <TaskForm
            action={createTask}
            departments={departments}
            people={people}
            defaults={{ departmentId: profile.departmentId ?? departments[0]?.id ?? null }}
            canChangeDepartment={canMoveTask(profile)}
            submitLabel="Creează sarcina"
          />
        </CardContent>
      </Card>
    </div>
  );
}
