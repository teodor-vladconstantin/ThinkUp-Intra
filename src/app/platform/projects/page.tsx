import Link from "next/link";
import { SectionLabel } from "@/components/section-label";
import { ActionForm, fieldClass } from "@/components/platform/controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { platformPeople, requirePlatformProfile, signedUrls } from "@/lib/platform";
import { createUserClient } from "@/lib/supabase/server";
import { createProject } from "../actions";
import { Checkbox } from "@/components/ui/checkbox";

type Row = {
  id: string;
  name: string;
  description: string | null;
  thumbnail_path: string | null;
  archived: boolean;
  challenge: { name: string } | null;
  members: { profile_id: string }[];
};

// Shared gallery: everyone on the platform sees every project (RLS proj_read).
export default async function ProjectsPage(props: PageProps<"/platform/projects">) {
  const me = await requirePlatformProfile();
  const sp = await props.searchParams;
  const mine = sp.mine === "1";
  const archived = sp.archived === "1";

  const db = createUserClient();
  const [{ data }, challenges, people] = await Promise.all([
    db
      .from("projects")
      .select("id, name, description, thumbnail_path, archived, challenge:challenges(name), members:project_members(profile_id)")
      .eq("archived", archived)
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("challenges").select("id, name").eq("archived", false).order("created_at", { ascending: false }),
    platformPeople(db),
  ]);
  let projects = (data ?? []) as unknown as Row[];
  if (mine) projects = projects.filter((p) => p.members.some((m) => m.profile_id === me.clerkId));
  const thumbs = await signedUrls(db, "project-files", projects.map((p) => p.thumbnail_path ?? ""));

  const tab = (label: string, href: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1 text-sm max-md:py-2 ${active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Platforma ambasadorilor</SectionLabel>
        <h1 className="text-2xl font-semibold">Proiecte</h1>
        <nav className="flex flex-wrap gap-2" aria-label="Filtru proiecte">
          {tab("Toate", "/platform/projects", !mine && !archived)}
          {tab("Ale mele", "/platform/projects?mine=1", mine)}
          {tab("Arhivate", "/platform/projects?archived=1", archived)}
        </nav>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Proiect nou</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createProject} submitLabel="Creează proiectul">
            <Input name="name" required maxLength={150} placeholder="Numele proiectului" aria-label="Numele proiectului" />
            <textarea name="description" rows={3} maxLength={5000} placeholder="Descriere (opțional)" aria-label="Descriere" className={fieldClass} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                name="challengeId"
                aria-label="Challenge"
                options={[{ value: "", label: "Fără challenge" }, ...(challenges.data ?? []).map((c) => ({ value: c.id as string, label: c.name as string }))]}
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="acceptReviews" defaultChecked /> Acceptă feedback de la colegi
              </label>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Niciun proiect aici încă.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const thumb = p.thumbnail_path ? thumbs.get(p.thumbnail_path) : undefined;
            return (
              <li key={p.id}>
                <Link href={`/platform/projects/${p.id}`} className="block h-full overflow-hidden rounded-xl border bg-card transition hover:border-primary">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, expires; next/image would cache it
                    <img src={thumb} alt="" className="aspect-video w-full object-cover" />
                  ) : (
                    <div className="aspect-video w-full bg-accent" aria-hidden />
                  )}
                  <div className="space-y-2 p-4">
                    <p className="font-medium">{p.name}</p>
                    {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {p.challenge && <Badge variant="secondary">{p.challenge.name}</Badge>}
                      <span>{p.members.map((m) => people.name(m.profile_id)).join(", ")}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
