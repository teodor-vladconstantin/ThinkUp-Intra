"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold tracking-widest text-primary uppercase">Eroare</p>
      <h1 className="mt-3 text-2xl font-semibold">Ceva nu a funcționat</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        A apărut o problemă la încărcarea platformei. Încearcă din nou sau revino la proiecte.
      </p>
      {error.digest && <p className="mt-3 text-xs text-muted-foreground">Cod eroare: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={retry}>Încearcă din nou</Button>
        <Button variant="outline" asChild>
          <Link href="/platform/projects">Mergi la proiecte</Link>
        </Button>
      </div>
    </main>
  );
}
