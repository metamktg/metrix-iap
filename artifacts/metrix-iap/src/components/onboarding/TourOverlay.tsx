// ─── Onboarding tour overlay ─────────────────────────────────────────────
// Renders a spotlight (four dimmed strips around a real "hole" over the
// target element — never a box-shadow trick, which can't produce a true
// click-through hole) plus a floating card with the step's copy and
// Back/Next/Skip controls. Portaled to document.body so it always paints
// above the app shell, sidebar flyouts, and toasts.
//
// Cross-page steps: when a step declares a `route` different from the
// current location, this component navigates there itself — the tour, not
// the caller, owns getting the user to the right screen.
//
// Never gets stuck: if a step's target selector doesn't exist yet (still
// loading, wrong account scope, feature gated), the card falls back to a
// centered position instead of hanging — Back/Next/Skip always work.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { X } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  useGetLatestAnalysisRun,
  getGetLatestAnalysisRunQueryKey,
} from "@workspace/api-client-react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useOnboardingTour } from "@/contexts/OnboardingTourContext";
import type { TourStep } from "@/lib/onboarding/tourSteps";

const SPOTLIGHT_PADDING = 8;
const CARD_GAP = 14;
const VIEWPORT_MARGIN = 16;
const OVERLAY_Z = 9998;
const CARD_Z = 9999;

// ─── Target tracking ─────────────────────────────────────────────────────
// Polls via requestAnimationFrame instead of scroll/resize listeners so the
// spotlight tracks layout that shifts for reasons that don't fire either
// event — sidebar collapse/expand animations, async content loading in
// above the target, etc. Cost is negligible: one querySelector + rect read
// per frame, only while a tour is actually active.

function useTourTargetRect(selector: string | undefined, active: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const scrolledToRef = useRef<Element | null>(null);

  useEffect(() => {
    scrolledToRef.current = null;
    if (!active || !selector) {
      setRect(null);
      return;
    }
    let raf = 0;
    let cancelled = false;

    function measure() {
      if (cancelled) return;
      const el = selector ? document.querySelector(selector) : null;
      if (el) {
        if (scrolledToRef.current !== el) {
          scrolledToRef.current = el;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        const r = el.getBoundingClientRect();
        setRect((prev) =>
          prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
            ? prev
            : r
        );
      } else {
        scrolledToRef.current = null;
        setRect(null);
      }
      raf = requestAnimationFrame(measure);
    }
    raf = requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [selector, active]);

  return rect;
}

// ─── Spotlight mask ──────────────────────────────────────────────────────

function SpotlightMask({ rect }: { rect: DOMRect | null }) {
  if (!rect) {
    return <div className="fixed inset-0 bg-black/70" style={{ zIndex: OVERLAY_Z }} aria-hidden />;
  }
  const top = Math.max(rect.top - SPOTLIGHT_PADDING, 0);
  const left = Math.max(rect.left - SPOTLIGHT_PADDING, 0);
  const right = Math.min(rect.right + SPOTLIGHT_PADDING, window.innerWidth);
  const bottom = Math.min(rect.bottom + SPOTLIGHT_PADDING, window.innerHeight);
  const dim = "absolute bg-black/70 pointer-events-auto";
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: OVERLAY_Z }} aria-hidden>
      <div className={dim} style={{ top: 0, left: 0, right: 0, height: top }} />
      <div className={dim} style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div className={dim} style={{ top, left: 0, width: left, height: bottom - top }} />
      <div className={dim} style={{ top, left: right, right: 0, height: bottom - top }} />
      {/* Decorative ring only — pointer-events-none so clicks reach the real
          element underneath (this is what makes "click the real button
          mid-tour" work for the run-analysis step). */}
      <div
        className="absolute rounded-lg ring-2 ring-primary/70 transition-all duration-200 ease-out"
        style={{ top, left, width: right - left, height: bottom - top }}
      />
    </div>
  );
}

// ─── Card positioning ────────────────────────────────────────────────────

function computeCardPosition(
  rect: DOMRect | null,
  placement: TourStep["placement"],
  size: { width: number; height: number }
): { top: number; left: number } {
  if (!rect || placement === "center") {
    return {
      top: Math.max(VIEWPORT_MARGIN, window.innerHeight / 2 - size.height / 2),
      left: Math.max(VIEWPORT_MARGIN, window.innerWidth / 2 - size.width / 2),
    };
  }
  let top: number;
  let left: number;
  switch (placement) {
    case "top":
      top = rect.top - CARD_GAP - size.height;
      left = rect.left + rect.width / 2 - size.width / 2;
      break;
    case "left":
      top = rect.top + rect.height / 2 - size.height / 2;
      left = rect.left - CARD_GAP - size.width;
      break;
    case "right":
      top = rect.top + rect.height / 2 - size.height / 2;
      left = rect.right + CARD_GAP;
      break;
    case "bottom":
    default:
      top = rect.bottom + CARD_GAP;
      left = rect.left + rect.width / 2 - size.width / 2;
      break;
  }
  top = Math.min(Math.max(top, VIEWPORT_MARGIN), window.innerHeight - size.height - VIEWPORT_MARGIN);
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), window.innerWidth - size.width - VIEWPORT_MARGIN);
  return { top, left };
}

// ─── Card ────────────────────────────────────────────────────────────────

function TourCard({
  step,
  rect,
  stepNumber,
  totalSteps,
  canBack,
  onNext,
  onBack,
  onSkip,
  onGoToStrategy,
}: {
  step: TourStep;
  rect: DOMRect | null;
  stepNumber: number;
  totalSteps: number;
  canBack: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onGoToStrategy: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    setPos(computeCardPosition(rect, step.placement, size));
  }, [rect?.top, rect?.left, rect?.width, rect?.height, step.placement, step.id]);

  useEffect(() => {
    setVisible(false);
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, [step.id]);

  const isLastStep = stepNumber === totalSteps;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
      className={cn(
        "fixed w-[336px] max-w-[calc(100vw-32px)] rounded-2xl border border-border/60",
        "bg-surface-sidebar shadow-2xl p-5 transition-all duration-200 ease-out"
      )}
      style={{
        zIndex: CARD_Z,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        opacity: pos && visible ? 1 : 0,
        transform: pos && visible ? "scale(1)" : "scale(0.97)",
      }}
    >
      <button
        type="button"
        aria-label="Close tour"
        onClick={onSkip}
        className="absolute top-3 right-3 w-6 h-6 rounded flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.06] transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="text-[10px] font-semibold uppercase tracking-widest text-interactive/80 mb-1.5">
        Step {stepNumber} of {totalSteps}
      </div>
      <h3 className="text-[14px] font-bold text-foreground leading-snug pr-5">{step.title}</h3>
      <p className="text-[12px] text-muted-foreground/85 leading-relaxed mt-1.5">{step.body}</p>

      {/* Progress dots */}
      <div className="flex items-center gap-1 mt-4 mb-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-200",
              i + 1 === stepNumber ? "w-4 bg-primary" : "w-1.5 bg-white/15"
            )}
          />
        ))}
      </div>

      {isLastStep && (
        <button
          type="button"
          onClick={onGoToStrategy}
          className="w-full mt-3 h-8 rounded-lg text-[12px] font-semibold bg-primary/12 border border-primary/30 text-interactive hover:bg-primary/20 transition-colors"
        >
          Go to Strategy now →
        </button>
      )}

      <div className="flex items-center justify-between gap-2 mt-4">
        <button
          type="button"
          onClick={onSkip}
          className="text-[11px] font-medium text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Skip tour
        </button>
        <div className="flex items-center gap-2">
          {canBack && (
            <button
              type="button"
              onClick={onBack}
              className="h-7 px-2.5 rounded-md text-[12px] font-medium text-muted-foreground/80 hover:text-foreground hover:bg-white/[0.05] transition-colors"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            className="h-7 px-3 rounded-md text-[12px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {step.primaryLabel ?? (isLastStep ? "Finish tour" : "Next")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────

export function TourOverlay() {
  const { currentStep, stepNumber, totalSteps, next, back, skip } = useOnboardingTour();
  const [location, navigate] = useLocation();
  const accountId = useScopedAdAccountId();

  const isActive = !!currentStep;

  // Navigate to the step's declared route once per step entry.
  useEffect(() => {
    if (!currentStep?.route) return;
    if (location === currentStep.route) return;
    navigate(currentStep.route);
    // Only re-run when the step itself changes — not on every location change,
    // otherwise a user manually navigating away mid-step would get yanked back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.id]);

  // Esc dismisses the tour, same as clicking Skip / the close button.
  useEffect(() => {
    if (!isActive) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") skip();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isActive, skip]);

  const rect = useTourTargetRect(currentStep?.selector, isActive);

  // Auto-advance the instant a NEW analysis run starts while the
  // "run-analysis" step is showing — the whole point is that clicking the
  // real Run analysis button (reachable through the spotlight's click-through
  // hole) seamlessly carries the user into the next step, no extra click.
  const watchRunStart = isActive && currentStep?.id === "run-analysis" && !!accountId;
  const { data: latestRun } = useGetLatestAnalysisRun(accountId ?? "", {
    query: {
      queryKey: getGetLatestAnalysisRunQueryKey(accountId ?? ""),
      enabled: watchRunStart,
      refetchInterval: watchRunStart ? 1200 : false,
    },
  });
  const baselineStatusRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!watchRunStart) {
      baselineStatusRef.current = undefined;
      return;
    }
    const status = latestRun?.run?.status ?? null;
    if (baselineStatusRef.current === undefined) {
      // First read after entering this step — capture as baseline so an
      // already-running run (e.g. re-opened tour) doesn't false-trigger.
      baselineStatusRef.current = status;
      return;
    }
    if (status === "running" && baselineStatusRef.current !== "running") {
      next();
    }
    baselineStatusRef.current = status;
  }, [watchRunStart, latestRun?.run?.status, next]);

  if (!currentStep) return null;

  return createPortal(
    <>
      <SpotlightMask rect={rect} />
      <TourCard
        step={currentStep}
        rect={rect}
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        canBack={stepNumber > 1}
        onNext={next}
        onBack={back}
        onSkip={skip}
        onGoToStrategy={() => {
          navigate("/app/strategy");
          next();
        }}
      />
    </>,
    document.body
  );
}
