import { redirect } from "next/navigation";
import { PnNav } from "@/components/pn/pn-nav";
import { SectionLabel } from "@/components/section-label";
import { requireProfile } from "@/lib/auth";

// PRD 3: the PN module is visible to the PN department, CEO, President, Secretary and
// superadmin (can_access_pn). Every page below also reads through RLS with the same rule.
export default async function PnLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.canAccessPn) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Program Național</SectionLabel>
        <PnNav />
      </div>
      {children}
    </div>
  );
}
