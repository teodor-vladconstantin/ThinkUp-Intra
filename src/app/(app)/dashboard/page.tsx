import { SectionLabel } from "@/components/section-label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";

export default async function DashboardPage() {
  const profile = await requireProfile(); // layout already guarantees it; cached, no extra query
  const firstName = profile?.fullName?.split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <SectionLabel>Panou</SectionLabel>
        <h1 className="font-display text-4xl italic">Bună{firstName ? `, ${firstName}` : ""}!</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sarcinile mele</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Nicio sarcină încă.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Anunțuri</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Niciun anunț activ.</CardContent>
        </Card>
      </div>
    </div>
  );
}
