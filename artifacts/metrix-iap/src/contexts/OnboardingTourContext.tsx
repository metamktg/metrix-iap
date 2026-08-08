// ─── Onboarding tour context ────────────────────────────────────────────
// Tracks which tour (if any) is active and which step it's on. Completion
// and skip are persisted per-user (keyed by email, the only stable
// identifier AuthUser exposes) so a finished or dismissed tour never
// resurfaces on its own — the same per-browser-preference pattern used by
// TaskTrayContext/sidebar-collapse, just keyed per user instead of global.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { TOURS, type TourStep } from "@/lib/onboarding/tourSteps";

const STORAGE_PREFIX = "metrix_tour_v1";

type TourOutcome = "completed" | "skipped";

function storageKey(tourId: string, userKey: string): string {
  return `${STORAGE_PREFIX}:${tourId}:${userKey}`;
}

function readOutcome(tourId: string, userKey: string): TourOutcome | null {
  try {
    const v = localStorage.getItem(storageKey(tourId, userKey));
    return v === "completed" || v === "skipped" ? v : null;
  } catch {
    return null;
  }
}

function writeOutcome(tourId: string, userKey: string, outcome: TourOutcome): void {
  try {
    localStorage.setItem(storageKey(tourId, userKey), outcome);
  } catch {
    /* ignore — persistence is a nicety, not a requirement */
  }
}

interface ActiveTour {
  id: string;
  steps: TourStep[];
  stepIndex: number;
}

interface OnboardingTourContextValue {
  currentStep: TourStep | null;
  stepNumber: number;
  totalSteps: number;
  /** Starts a tour. No-ops if the tour is unknown, or already completed/skipped for
   *  this user — pass `force: true` to relaunch regardless (manual "take the tour" entry points). */
  start: (tourId: string, opts?: { force?: boolean }) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  hasResolved: (tourId: string) => boolean;
}

const OnboardingTourContext = createContext<OnboardingTourContextValue | null>(null);

export function OnboardingTourProvider({
  children,
  userKey,
}: {
  children: ReactNode;
  /** Stable per-user key (e.g. email). Falls back to a shared anonymous bucket when null. */
  userKey: string | null;
}) {
  const [active, setActive] = useState<ActiveTour | null>(null);
  const key = userKey ?? "anon";

  const start = useCallback(
    (tourId: string, opts?: { force?: boolean }) => {
      const steps = TOURS[tourId];
      if (!steps || steps.length === 0) return;
      if (!opts?.force && readOutcome(tourId, key) != null) return;
      setActive({ id: tourId, steps, stepIndex: 0 });
    },
    [key]
  );

  const next = useCallback(() => {
    setActive((prev) => {
      if (!prev) return prev;
      const nextIndex = prev.stepIndex + 1;
      if (nextIndex >= prev.steps.length) {
        writeOutcome(prev.id, key, "completed");
        return null;
      }
      return { ...prev, stepIndex: nextIndex };
    });
  }, [key]);

  const back = useCallback(() => {
    setActive((prev) => (prev && prev.stepIndex > 0 ? { ...prev, stepIndex: prev.stepIndex - 1 } : prev));
  }, []);

  const skip = useCallback(() => {
    setActive((prev) => {
      if (prev) writeOutcome(prev.id, key, "skipped");
      return null;
    });
  }, [key]);

  const hasResolved = useCallback((tourId: string) => readOutcome(tourId, key) != null, [key]);

  const currentStep = active ? active.steps[active.stepIndex] ?? null : null;

  const value = useMemo<OnboardingTourContextValue>(
    () => ({
      currentStep,
      stepNumber: active ? active.stepIndex + 1 : 0,
      totalSteps: active ? active.steps.length : 0,
      start,
      next,
      back,
      skip,
      hasResolved,
    }),
    [active, currentStep, start, next, back, skip, hasResolved]
  );

  return <OnboardingTourContext.Provider value={value}>{children}</OnboardingTourContext.Provider>;
}

export function useOnboardingTour(): OnboardingTourContextValue {
  const ctx = useContext(OnboardingTourContext);
  if (!ctx) throw new Error("useOnboardingTour must be used within an OnboardingTourProvider");
  return ctx;
}
