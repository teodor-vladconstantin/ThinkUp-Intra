"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveZone, type FormState } from "@/app/(app)/pn/actions";
import { ColorPicker } from "@/components/ui/color-picker";

// Create (no zone) or edit (zone given). The picker always yields "#RRGGBB",
// which is exactly what the zone_color_hex constraint accepts.
export function ZoneForm({ zone }: { zone?: { id: number; name: string; color: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveZone, null);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {zone && <input type="hidden" name="id" value={zone.id} />}
      <ColorPicker name="color" defaultValue={zone?.color ?? "#7C3AED"} aria-label="Culoare" />
      <Input name="name" required maxLength={80} defaultValue={zone?.name} placeholder="Nume zonă" aria-label="Nume zonă" className="w-56" />
      <Button type="submit" disabled={pending}>
        {zone ? "Salvează" : "Adaugă zona"}
      </Button>
      {state && <span role="status" className={`text-sm ${state.ok ? "text-success" : "text-destructive"}`}>{state.message}</span>}
    </form>
  );
}
