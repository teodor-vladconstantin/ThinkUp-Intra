import { redirect } from "next/navigation";
import { FormBuilder } from "@/components/reports/form-builder";
import { SectionLabel } from "@/components/section-label";
import { requireProfile } from "@/lib/auth";
import { canManageReports } from "@/lib/permissions";

export default async function NewReportFormPage() {
  const me = await requireProfile();
  if (!me) redirect("/sign-in");
  if (!canManageReports(me)) redirect("/reports");
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Rapoarte</SectionLabel>
        <h1 className="text-2xl font-semibold">Formular nou</h1>
      </div>
      <FormBuilder />
    </div>
  );
}
