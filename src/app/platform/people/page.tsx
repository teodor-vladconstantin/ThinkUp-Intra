import Link from "next/link";
import { SectionLabel } from "@/components/section-label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { platformPeople, requirePlatformProfile } from "@/lib/platform";
import { createUserClient } from "@/lib/supabase/server";

const SOCIAL_LABELS: Record<string, string> = { github: "GitHub", linkedin: "LinkedIn", instagram: "Instagram", website: "Site" };

// Everyone on the platform, with the links they put on their profile (platform_profiles is readable platform-wide).
export default async function PeoplePage() {
  await requirePlatformProfile();
  const db = createUserClient();
  const [people, { data }] = await Promise.all([platformPeople(db), db.from("platform_profiles").select("profile_id, social")]);
  const social = new Map((data ?? []).map((r) => [r.profile_id as string, (r.social ?? {}) as Record<string, string>]));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SectionLabel>Comunitate</SectionLabel>
        <h1 className="text-2xl font-semibold">Ambasadori</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {people.list.map((p) => (
          <Card key={p.clerk_id}>
            <CardContent className="space-y-2 pt-6">
              <Link href={`/platform/people/${p.clerk_id}`} className="font-medium text-primary hover:underline">
                {p.full_name ?? "—"}
              </Link>{" "}
              {p.is_mentor && <Badge>Mentor</Badge>}
              <div className="flex flex-wrap gap-3 text-sm">
                {Object.entries(social.get(p.clerk_id) ?? {}).map(([k, v]) => (
                  <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {SOCIAL_LABELS[k] ?? k}
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
