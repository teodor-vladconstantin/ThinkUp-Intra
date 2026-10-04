import { redirect } from "next/navigation";
import { MeetingForm } from "@/components/meetings/meeting-form";
import { SectionLabel } from "@/components/section-label";
import { Card, CardContent } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { dateInputValue } from "@/lib/dates";
import { meetingTargets } from "@/lib/meetings";
import { createUserClient } from "@/lib/supabase/server";
import { createMeeting } from "../actions";

export default async function NewMeetingPage() {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");

  const db = createUserClient();
  const [{ data: departments }, { data: people }] = await Promise.all([
    db.from("departments").select("id, name").order("id"),
    db.from("profiles").select("clerk_id, full_name, department_id, role").eq("is_active", true).neq("role", "student").order("full_name"),
  ]);
  const targets = meetingTargets(profile, departments ?? []);
  if (targets.length === 0) redirect("/meetings");

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-3">
        <SectionLabel>Ședințe</SectionLabel>
        <h1 className="text-2xl font-semibold">Ședință nouă</h1>
      </div>
      <Card>
        <CardContent>
          <MeetingForm
            action={createMeeting}
            mode="create"
            targets={targets}
            people={people ?? []}
            defaults={{ heldAt: dateInputValue(new Date().toISOString()) }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
