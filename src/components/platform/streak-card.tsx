import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { earnedBadges, todayRo, weeklyStreak } from "@/lib/gamification";
import { createUserClient } from "@/lib/supabase/server";

// Weekly streak + badges. RLS returns activity only for the person themself and for PN mentors.
// `points` = grades + bonus of the current school year (PersonView already has them).
export async function StreakCard({ personId, points }: { personId: string; points: number }) {
  const db = createUserClient();
  const [weeksRes, mine] = await Promise.all([
    db.from("activity_weeks").select("week").eq("profile_id", personId),
    db.from("project_members").select("project_id").eq("profile_id", personId),
  ]);
  const weeks = (weeksRes.data ?? []).map((r) => r.week as string);
  const projectIds = (mine.data ?? []).map((r) => r.project_id as string);
  const { data: done } = projectIds.length
    ? await db.from("goals").select("id").in("project_id", projectIds).eq("progress", 100).limit(1)
    : { data: [] };

  const streak = weeklyStreak(weeks, todayRo());
  const badges = earnedBadges({ weeks, goalDone: (done ?? []).length > 0, points });

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Constanță</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex items-center gap-2 text-sm">
          <Flame className={streak > 0 ? "size-5 text-orange-500" : "size-5 text-muted-foreground"} aria-hidden />
          <span className="font-medium">{streak}</span> {streak === 1 ? "săptămână" : "săptămâni"} la rând
          <span className="text-muted-foreground">· bifează un goal sau adaugă un material ori o poză ca să o ții</span>
        </p>
        <ul className="flex flex-wrap gap-2">
          {badges.map((b) => (
            <li key={b.key}>
              <Badge variant={b.earned ? "default" : "outline"} title={b.hint} className={b.earned ? "" : "text-muted-foreground opacity-60"}>
                {b.label}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
