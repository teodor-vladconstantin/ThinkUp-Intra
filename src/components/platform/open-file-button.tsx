"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { openOpenSchoolFile } from "@/app/platform/actions";

// Counts a view and opens a fresh signed link (links expire, so they are not pre-rendered).
export function OpenFileButton({ fileId, children }: { fileId: string; children: React.ReactNode }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="link"
      className="h-auto p-0 text-left font-medium"
      disabled={pending}
      onClick={() => {
        // Open the tab synchronously (popup blockers), then point it at the signed URL.
        const tab = window.open("about:blank", "_blank");
        start(async () => {
          const { url } = await openOpenSchoolFile(fileId);
          if (url && tab) tab.location.href = url;
          else tab?.close();
        });
      }}
    >
      {children}
    </Button>
  );
}
