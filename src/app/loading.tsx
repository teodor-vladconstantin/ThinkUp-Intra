export default function Loading() {
  return (
    <main
      aria-label="Se încarcă pagina"
      aria-busy="true"
      className="mx-auto min-h-[70vh] w-full max-w-6xl space-y-6 p-4 md:p-8"
    >
      <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-xl border bg-card"
          />
        ))}
      </div>
      <span className="sr-only">Se încarcă...</span>
    </main>
  );
}
