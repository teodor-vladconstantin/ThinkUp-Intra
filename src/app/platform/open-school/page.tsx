import Link from "next/link";
import { SectionLabel } from "@/components/section-label";
import { Pagination } from "@/components/pagination";
import { OpenFileButton } from "@/components/platform/open-file-button";
import { ActionButton, FileUpload } from "@/components/platform/controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { isPlatformMentor, requirePlatformProfile } from "@/lib/platform";
import { DEFAULT_PAGE_SIZE, pageRange, parsePage } from "@/lib/pagination";
import { createUserClient } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/utils";
import { addOpenSchoolFile, deleteOpenSchoolFile, toggleFavorite } from "../actions";

type FileRow = { id: string; name: string; description: string | null; file_type: string | null; views: number; created_at: string };

// Shared library. Read by the platform, managed by PN (RLS os_* and Storage open-school policies).
export default async function OpenSchoolPage(props: PageProps<"/platform/open-school">) {
  const me = await requirePlatformProfile();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const sort = sp.sort === "popular" ? "popular" : "recent";
  const favOnly = sp.fav === "1";
  const page = parsePage(sp.page);
  const range = pageRange(page, DEFAULT_PAGE_SIZE);
  const mentor = isPlatformMentor(me);

  const db = createUserClient();
  const { data: favoriteRows, error: favoriteError } = await db.from("open_school_favorites").select("file_id");
  if (favoriteError) throw new Error("Could not load Open School favorites");
  const favorites = new Set((favoriteRows ?? []).map((f) => f.file_id as string));
  let files: FileRow[] = [];
  let total = 0;
  if (!favOnly || favorites.size > 0) {
    let query = db
      .from("open_school_files")
      .select("id, name, description, file_type, views, created_at", { count: "exact" })
      .order(sort === "popular" ? "views" : "created_at", { ascending: false });
    if (q) query = query.ilike("name", `%${escapeLike(q)}%`);
    if (favOnly) query = query.in("id", [...favorites]);
    const result = await query.range(range.from, range.to);
    if (result.error) throw new Error("Could not load Open School files");
    files = (result.data ?? []) as FileRow[];
    total = result.count ?? 0;
  }

  const link = (label: string, params: Record<string, string>, active: boolean) => (
    <Link
      href={`/platform/open-school?${new URLSearchParams({ ...(q ? { q } : {}), ...params })}`}
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
        <h1 className="text-2xl font-semibold">Open School</h1>
        <form className="flex max-w-md gap-2" action="/platform/open-school" data-tour="os-search">
          <Input name="q" defaultValue={q} maxLength={100} placeholder="Caută după nume" aria-label="Caută" />
          <Button type="submit" variant="outline">
            Caută
          </Button>
        </form>
        <nav className="flex flex-wrap gap-2" aria-label="Sortare">
          {link("Recente", {}, sort === "recent" && !favOnly)}
          {link("Populare", { sort: "popular" }, sort === "popular" && !favOnly)}
          {link("Favorite", { fav: "1" }, favOnly)}
        </nav>
      </div>

      {mentor && (
        <Card data-tour="os-add">
          <CardHeader>
            <CardTitle>Adaugă în bibliotecă</CardTitle>
          </CardHeader>
          <CardContent>
            <FileUpload bucket="open-school" folder="files" label="Încarcă fișier" complete={addOpenSchoolFile} />
          </CardContent>
        </Card>
      )}

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Niciun fișier.</p>
      ) : (
        <>
          <Pagination
            basePath="/platform/open-school"
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={total}
            params={{ ...(q ? { q } : {}), ...(sort === "popular" ? { sort } : {}), ...(favOnly ? { fav: "1" } : {}) }}
            label="fișiere"
          />
          <ul className="divide-y rounded-xl border bg-card">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="space-y-0.5">
                  <OpenFileButton fileId={f.id}>{f.name}</OpenFileButton>
                  <span className="block text-xs text-muted-foreground">
                    {f.file_type ?? "fișier"} · {formatDate(f.created_at)} · {f.views} {f.views === 1 ? "vizualizare" : "vizualizări"}
                  </span>
                  {f.description && <span className="block text-sm text-muted-foreground">{f.description}</span>}
                </span>
                <span className="flex items-center gap-1">
                  <ActionButton action={toggleFavorite.bind(null, f.id, !favorites.has(f.id))}>
                    <span aria-label={favorites.has(f.id) ? "Scoate de la favorite" : "Adaugă la favorite"}>{favorites.has(f.id) ? "★" : "☆"}</span>
                  </ActionButton>
                  {mentor && (
                    <ActionButton action={deleteOpenSchoolFile.bind(null, f.id)} confirmText="Ștergi?">
                      Șterge
                    </ActionButton>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <Pagination
            basePath="/platform/open-school"
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={total}
            params={{ ...(q ? { q } : {}), ...(sort === "popular" ? { sort } : {}), ...(favOnly ? { fav: "1" } : {}) }}
            label="fișiere"
          />
        </>
      )}
    </div>
  );
}
