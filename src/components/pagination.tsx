import Link from "next/link";

export function Pagination({
  basePath,
  page,
  pageSize,
  total,
  params = {},
  label = "rezultate",
}: {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  params?: Record<string, string>;
  label?: string;
}) {
  const pages = Math.ceil(total / pageSize);
  if (total === 0) return null;

  const href = (targetPage: number) => {
    const search = new URLSearchParams(params);
    if (targetPage > 1) search.set("page", String(targetPage));
    else search.delete("page");
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Se afișează {first}–{last} din {total} {label} · pagina {page} din {pages}
      </p>
      {pages > 1 && (
        <nav className="flex items-center gap-4" aria-label="Paginare">
          {page > 1 ? (
            <Link href={href(page - 1)} className="text-primary hover:underline">
              ← Înapoi
            </Link>
          ) : (
            <span className="text-muted-foreground" aria-disabled="true">← Înapoi</span>
          )}
          {page < pages ? (
            <Link href={href(page + 1)} className="text-primary hover:underline">
              Înainte →
            </Link>
          ) : (
            <span className="text-muted-foreground" aria-disabled="true">Înainte →</span>
          )}
        </nav>
      )}
    </div>
  );
}
