import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-6xl font-semibold tracking-tight text-primary">404</p>
      <h1 className="mt-4 text-2xl font-semibold">Pagina nu a fost găsită</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        Pagina platformei pe care o cauți nu există sau a fost mutată.
      </p>
      <Button className="mt-6" asChild>
        <Link href="/platform/projects">Mergi la proiecte</Link>
      </Button>
    </main>
  );
}
