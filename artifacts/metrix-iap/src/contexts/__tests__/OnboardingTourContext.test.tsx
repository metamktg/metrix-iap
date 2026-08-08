// ─── OnboardingTourContext tests ────────────────────────────────────────
// Covers the state machine (start/next/back/skip) and the per-user
// completed/skipped persistence that keeps a resolved tour from
// resurfacing on its own — mirrors TaskTrayContext's persistence tests.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OnboardingTourProvider, useOnboardingTour } from "../OnboardingTourContext";

const TOUR_ID = "first-analysis-v1";

function Probe({ userKey = "user@example.com" }: { userKey?: string | null }) {
  const { currentStep, stepNumber, totalSteps, start, next, back, skip, hasResolved } = useOnboardingTour();
  return (
    <div>
      <span data-testid="step-id">{currentStep?.id ?? "none"}</span>
      <span data-testid="step-number">{stepNumber}</span>
      <span data-testid="total-steps">{totalSteps}</span>
      <span data-testid="resolved">{hasResolved(TOUR_ID) ? "yes" : "no"}</span>
      <button onClick={() => start(TOUR_ID)}>start</button>
      <button onClick={() => start(TOUR_ID, { force: true })}>force-start</button>
      <button onClick={next}>next</button>
      <button onClick={back}>back</button>
      <button onClick={skip}>skip</button>
      {/* Silence the "unused prop" concern while keeping the signature realistic. */}
      <span data-testid="user-key">{userKey}</span>
    </div>
  );
}

function renderProbe(userKey: string | null = "user@example.com") {
  return render(
    <OnboardingTourProvider userKey={userKey}>
      <Probe userKey={userKey} />
    </OnboardingTourProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("OnboardingTourContext: step progression", () => {
  it("has no active step until started", () => {
    renderProbe();
    expect(screen.getByTestId("step-id").textContent).toBe("none");
  });

  it("start() activates the first step", () => {
    renderProbe();
    fireEvent.click(screen.getByText("start"));
    expect(screen.getByTestId("step-id").textContent).toBe("welcome");
    expect(screen.getByTestId("step-number").textContent).toBe("1");
    expect(Number(screen.getByTestId("total-steps").textContent)).toBeGreaterThan(1);
  });

  it("next() advances through steps and back() reverses", () => {
    renderProbe();
    fireEvent.click(screen.getByText("start"));
    fireEvent.click(screen.getByText("next"));
    expect(screen.getByTestId("step-id").textContent).toBe("run-analysis");
    fireEvent.click(screen.getByText("back"));
    expect(screen.getByTestId("step-id").textContent).toBe("welcome");
  });

  it("back() on the first step is a no-op", () => {
    renderProbe();
    fireEvent.click(screen.getByText("start"));
    fireEvent.click(screen.getByText("back"));
    expect(screen.getByTestId("step-id").textContent).toBe("welcome");
  });

  it("next() past the last step ends the tour and marks it completed", () => {
    renderProbe();
    fireEvent.click(screen.getByText("start"));
    const total = Number(screen.getByTestId("total-steps").textContent);
    for (let i = 0; i < total; i++) {
      fireEvent.click(screen.getByText("next"));
    }
    expect(screen.getByTestId("step-id").textContent).toBe("none");
    expect(screen.getByTestId("resolved").textContent).toBe("yes");
  });

  it("skip() ends the tour immediately and marks it resolved", () => {
    renderProbe();
    fireEvent.click(screen.getByText("start"));
    fireEvent.click(screen.getByText("skip"));
    expect(screen.getByTestId("step-id").textContent).toBe("none");
    expect(screen.getByTestId("resolved").textContent).toBe("yes");
  });
});

describe("OnboardingTourContext: per-user persistence", () => {
  it("start() is a no-op once the tour was already skipped for this user", () => {
    renderProbe();
    fireEvent.click(screen.getByText("start"));
    fireEvent.click(screen.getByText("skip"));
    fireEvent.click(screen.getByText("start"));
    expect(screen.getByTestId("step-id").textContent).toBe("none");
  });

  it("start({ force: true }) relaunches even after completion", () => {
    renderProbe();
    fireEvent.click(screen.getByText("start"));
    fireEvent.click(screen.getByText("skip"));
    fireEvent.click(screen.getByText("force-start"));
    expect(screen.getByTestId("step-id").textContent).toBe("welcome");
  });

  it("scopes completion per user — a different user still sees the tour", () => {
    const { unmount } = renderProbe("user-a@example.com");
    fireEvent.click(screen.getByText("start"));
    fireEvent.click(screen.getByText("skip"));
    unmount();

    renderProbe("user-b@example.com");
    fireEvent.click(screen.getByText("start"));
    expect(screen.getByTestId("step-id").textContent).toBe("welcome");
  });

  it("falls back to a shared bucket when userKey is null", () => {
    renderProbe(null);
    fireEvent.click(screen.getByText("start"));
    expect(screen.getByTestId("step-id").textContent).toBe("welcome");
  });
});
