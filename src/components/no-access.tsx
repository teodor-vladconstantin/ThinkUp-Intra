import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import type { NoAccessReason } from "@/lib/auth";
import { ALLOWED_EMAIL_HINT } from "@/lib/permissions";

// Deliberately vague: we never confirm whether an email has an invitation.
const HINTS: Record<NoAccessReason, string> = {
  inactive: "Contul tău a fost dezactivat.",
  "email-unverified": "Adresa de email nu este verificată.",
  domain: `Intranetul acceptă doar adrese ${ALLOWED_EMAIL_HINT}.`,
  student: "Platforma ambasadorilor nu este încă disponibilă.",
  "no-invitation": "Nu am găsit o invitație activă pentru contul tău.",
};

export function NoAccess({ reason }: { reason: NoAccessReason }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar p-4 text-sidebar-foreground">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Nu ai acces</h1>
        <p className="text-sm text-sidebar-foreground/70">
          {HINTS[reason]} Dacă crezi că e o greșeală, scrie-i coordonatorului tău.
        </p>
        <SignOutButton redirectUrl="/sign-in">
          <Button variant="outline">Deconectare</Button>
        </SignOutButton>
      </div>
    </main>
  );
}
