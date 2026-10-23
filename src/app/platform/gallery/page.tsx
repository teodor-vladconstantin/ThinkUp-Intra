import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SectionLabel } from "@/components/section-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { requireProfile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { isCd } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

const PAGE_SIZE = 24;

type Source = { project_id: string; project_name: string; challenge_id: string | null; challenge_name: string | null; photos: number };
type Photo = {
  photo_id: string;
  storage_path: string;
  taken_at: string;
  project_id: string;
  project_name: string;
  project_archived: boolean;
  challenge_id: string | null;
  challenge_name: string | null;
  team: string[] | null;
  total: number;
};

// Every photo of every project, across all challenges, for the board only:
// CEO, President, Secretary, every VP and the superadmin (is_cd). Access is checked here AND in the
// database (gallery_photos / gallery_sources return nothing to anyone else). VP Tech and VP MK are
// not on the platform, so they get this view only; the team's names are hidden from them.
export default async function GalleryPage(props: PageProps<"/platform/gallery">) {
  const me = await requireProfile();
  if (!me || !isCd(me)) redirect("/dashboard");

  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const challengeParam = one(sp.challenge);
  const projectParam = one(sp.project);
  const noChallenge = challengeParam === "none";
  const challengeId = z.uuid().safeParse(challengeParam).success ? challengeParam : null;
  const projectId = z.uuid().safeParse(projectParam).success ? projectParam : null;
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);

  const db = createUserClient();
  const [sourcesRes, photosRes] = await Promise.all([
    db.rpc("gallery_sources"),
    db.rpc("gallery_photos", {
      p_challenge: challengeId,
      p_project: projectId,
      p_no_challenge: noChallenge,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  const sources = (sourcesRes.data ?? []) as Source[];
  const photos = (photosRes.data ?? []) as Photo[];
  const total = photos[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // The database already confirmed the caller is allowed; only now are the files signed (service role,
  // because Storage reads follow the platform rule and VP Tech / VP MK are not on the platform).
  const urls = new Map<string, string>();
  if (photos.length) {
    const { data } = await createAdminClient()
      .storage.from("project-files")
      .createSignedUrls(photos.map((p) => p.storage_path), 60 * 60);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }

  // Filter options come from what actually has photos.
  const challenges = new Map<string, string>();
  for (const s of sources) if (s.challenge_id && s.challenge_name) challenges.set(s.challenge_id, s.challenge_name);
  const hasNoChallenge = sources.some((s) => !s.challenge_id);
  const projectOptions = sources.filter((s) => (noChallenge ? !s.challenge_id : challengeId ? s.challenge_id === challengeId : true));

  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ ...(challengeParam ? { challenge: challengeParam } : {}), ...(projectId ? { project: projectId } : {}), ...extra });
    return `/platform/gallery?${q}`;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Platforma ambasadorilor</SectionLabel>
        <h1 className="text-2xl font-semibold">Galerie</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Toate pozele din toate proiectele, din toate challenge-urile. Sub fiecare poză vezi de unde vine: proiectul și challenge-ul.
        </p>
      </div>

      {/* Plain GET form: the filters live in the URL, so a view can be shared as a link. */}
      <form className="flex flex-wrap items-center gap-2" action="/platform/gallery" role="search" data-tour="gallery-search">
        <Select
          name="challenge"
          defaultValue={challengeParam}
          aria-label="Challenge"
          className="w-auto min-w-52"
          options={[
            { value: "", label: "Toate challenge-urile" },
            ...(hasNoChallenge ? [{ value: "none", label: "Fără challenge" }] : []),
            ...[...challenges].map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
        <Select
          name="project"
          defaultValue={projectId ?? ""}
          aria-label="Proiect"
          className="w-auto min-w-52"
          options={[{ value: "", label: "Toate proiectele" }, ...projectOptions.map((s) => ({ value: s.project_id, label: s.project_name }))]}
        />
        <Button type="submit" variant="outline">
          Filtrează
        </Button>
        {(challengeParam || projectId) && (
          <Link href="/platform/gallery" className="text-sm text-primary hover:underline">
            Șterge filtrele
          </Link>
        )}
      </form>

      <p className="text-sm text-muted-foreground">
        {total} {total === 1 ? "poză" : "poze"}
        {pages > 1 && ` · pagina ${page} din ${pages}`}
      </p>

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nicio poză{challengeParam || projectId ? " pentru filtrele alese" : " încă"}.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {photos.map((p) => {
            const url = urls.get(p.storage_path);
            return (
              <li key={p.photo_id} className="overflow-hidden rounded-xl border bg-card">
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Deschide poza din proiectul ${p.project_name}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, expires */}
                    <img src={url} alt={`Poză din proiectul ${p.project_name}`} loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
                  </a>
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-accent text-xs text-muted-foreground">Indisponibilă</div>
                )}
                <div className="space-y-1.5 p-3 text-sm">
                  <p className="font-medium leading-tight">
                    {me.canAccessPlatform ? (
                      <Link href={`/platform/projects/${p.project_id}`} className="hover:text-primary hover:underline">
                        {p.project_name}
                      </Link>
                    ) : (
                      p.project_name
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant={p.challenge_name ? "default" : "secondary"}>{p.challenge_name ?? "Fără challenge"}</Badge>
                    {p.project_archived && <Badge variant="secondary">Proiect arhivat</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.taken_at)}
                    {p.team && p.team.length > 0 && ` · ${p.team.join(", ")}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginare">
          {page > 1 ? (
            <Link href={href({ page: String(page - 1) })} className="text-primary hover:underline">
              ← Mai noi
            </Link>
          ) : (
            <span />
          )}
          {page < pages && (
            <Link href={href({ page: String(page + 1) })} className="text-primary hover:underline">
              Mai vechi →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
