"use client";

import { useState, useTransition } from "react";
import { setUserActive } from "@/app/(app)/admin/users/actions";
import { Button } from "@/components/ui/button";

// Deactivation is a two-click action: the first click asks for confirmation inline
// (no browser confirm() dialog), the second one acts.
export function UserActiveButton({ clerkId, active, name }: { clerkId: string; active: boolean; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const r = await setUserActive(clerkId, !active);
      setMessage({ ok: r.ok, text: r.message });
      setConfirming(false);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {active && confirming ? (
        <>
          <span className="text-xs">Dezactivezi contul lui {name}?</span>
          <Button size="sm" variant="destructive" disabled={pending} onClick={run}>
            Da, dezactivează
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Anulează
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => (active ? setConfirming(true) : run())}>
          {active ? "Dezactivează" : "Reactivează"}
        </Button>
      )}
      {message && <span role="status" className={`w-full text-right text-xs ${message.ok ? "text-success" : "text-destructive"}`}>{message.text}</span>}
    </div>
  );
}
