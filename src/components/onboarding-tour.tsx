"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { completeOnboarding } from "@/app/onboarding-actions";
import { NAV, PLATFORM_NAV, type SidebarUser } from "@/components/app-sidebar";
import { useSidebar } from "@/components/ui/sidebar";
import { ONBOARDING_VERSION } from "@/lib/onboarding";

type Step = {
  path?: string; // the page this step lives on; the tour navigates there
  selector?: string; // no selector: centered popover
  sidebar?: boolean; // a sidebar link: on a phone the sidebar is a closed sheet, so the step is centered
  title: string;
  text: string;
};

const KEY = "thinkup-tour-step"; // survives the intranet <-> platform layout switch (the tour remounts)

// Key buttons of a section, shown right after its sidebar link. A step whose element is
// missing for this role (e.g. only mentors see "Challenge nou") is skipped.
const PAGE_STEPS: Record<string, Omit<Step, "path">> = {
  "/tasks": { selector: '[data-tour="new-task"]', title: "Sarcină nouă", text: "De aici creezi o sarcină: titlu, responsabil și termen." },
  "/platform/projects": { selector: '[data-tour="new-project"]', title: "Proiect nou", text: "Aici creezi un proiect. După ce îl deschizi, textul din Setări se salvează doar cu butonul Salvează." },
  "/platform/challenges": { selector: '[data-tour="new-challenge"]', title: "Challenge nou", text: "Mentorii creează aici challenge-uri, apoi notează proiectele care participă." },
};

function buildSteps(user: SidebarUser): Step[] {
  const steps: Step[] = [{ title: "Bine ai venit în ThinkUp Intranet", text: "Facem un tur scurt al secțiunilor tale și al butoanelor importante. Îl poți închide oricând și îl reiei din „Tur ghidat”, jos în meniu." }];
  for (const item of [...NAV, ...PLATFORM_NAV].filter((i) => i.visible(user))) {
    steps.push({ path: item.href, selector: `[data-tour="${item.href}"]`, sidebar: true, title: item.label, text: item.hint });
    const page = PAGE_STEPS[item.href];
    if (page) steps.push({ ...page, path: item.href });
  }
  steps.push({ selector: '[data-tour="user"]', title: "Contul tău", text: "De aici îți gestionezi contul și te deconectezi. Asta a fost tot, spor la treabă!" });
  return steps;
}

async function present(selector: string) {
  for (let n = 0; n < 50; n++) {
    if (document.querySelector(selector)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

const store = {
  get: () => { try { return Number(sessionStorage.getItem(KEY)) || 0; } catch { return 0; } },
  set: (i: number) => { try { sessionStorage.setItem(KEY, String(i)); } catch { /* private mode: tour restarts from the top */ } },
  clear: () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } },
};

// Guided tour for every user: starts when the profile's onboarding_version is behind
// ONBOARDING_VERSION (so also for existing users), walks through the sections the user can
// see, navigating to each one. Closing it counts as done; "Tur ghidat" in the sidebar replays it.
export function OnboardingTour({ user, version }: { user: SidebarUser; version: number }) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const live = useRef({ router, isMobile, user });
  useEffect(() => {
    live.current = { router, isMobile, user };
  });

  useEffect(() => {
    let d: Driver | null = null;
    let dead = false; // unmounted: stop quietly, the next mount resumes from KEY

    const teardown = () => {
      d?.destroy();
      d = null;
    };
    async function finish() {
      teardown();
      store.clear();
      await completeOnboarding();
    }
    async function show(i: number, dir: 1 | -1): Promise<void> {
      const { router, isMobile, user } = live.current;
      const steps = buildSteps(user);
      if (dead) return;
      if (i >= steps.length) return finish();
      i = Math.max(i, 0);
      const s = steps[i];
      store.set(i);
      teardown();
      if (s.path && s.path !== location.pathname) router.push(s.path);
      const selector = s.sidebar && isMobile ? undefined : s.selector;
      if (selector && !(await present(selector))) return show(i + dir, dir);
      if (dead) return;
      d = driver({ overlayClickBehavior: () => {}, allowClose: true });
      d.highlight({
        element: selector,
        popover: {
          title: s.title,
          description: s.text,
          showButtons: i === 0 ? ["next", "close"] : ["previous", "next", "close"],
          showProgress: true,
          progressText: `${i + 1} din ${steps.length}`,
          nextBtnText: i === steps.length - 1 ? "Gata" : "Înainte",
          prevBtnText: "Înapoi",
          onNextClick: () => void show(i + 1, 1),
          onPrevClick: () => void show(i - 1, -1),
          onCloseClick: () => void finish(),
        },
      });
    }

    const replay = () => void show(0, 1);
    window.addEventListener("thinkup:tour", replay);
    const timer = version < ONBOARDING_VERSION ? setTimeout(() => void show(store.get(), 1), 600) : undefined;
    return () => {
      dead = true;
      clearTimeout(timer);
      window.removeEventListener("thinkup:tour", replay);
      teardown();
    };
  }, [version]);

  return null;
}
