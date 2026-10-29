"use client";

import { useActionState } from "react";
import { importAmbassadorsCsv, type FormState } from "@/app/(app)/pn/actions";
import { Button } from "@/components/ui/button";

export function AmbassadorCsvImport() {
  const [state, action, pending] = useActionState<FormState, FormData>(importAmbassadorsCsv, null);

  return (
    <form action={action} className="grid gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-medium">Importă ambasadori din CSV</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Coloane: <code>full_name,school_name,email,phone</code>. Emailul și telefonul pot fi goale. Liceul trebuie să
          corespundă unui singur liceu existent (fără diferențe de majuscule); rândurile duplicate sunt refuzate. Maximum 500 de rânduri / 500 KB.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Exemplu: <code>Ana Pop,Liceul Exemplu,ana@example.test,+40700000000</code>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          aria-label="Fișier CSV cu ambasadori"
          className="max-w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-2"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Se importă…" : "Importă CSV"}
        </Button>
      </div>
      {state && <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-destructive"}`}>{state.message}</p>}
    </form>
  );
}
