// ─── CreateAccountPage unit tests ──────────────────────────────────────────
// Guards client-side validation (password length, mismatch), the 409
// duplicate-email error message, and submit-button gating.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// ── Hoisted stubs (defined before vi.mock hoisting) ────────────────────────

const { MockApiError, mockAuthRegister, mockSetUser } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  const mockAuthRegister = vi.fn();
  const mockSetUser = vi.fn();
  return { MockApiError, mockAuthRegister, mockSetUser };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ setUser: mockSetUser }),
}));

vi.mock("@workspace/api-client-react", () => ({
  authRegister: (...args: unknown[]) => mockAuthRegister(...args),
  ApiError: MockApiError,
}));

import { CreateAccountPage } from "../CreateAccountPage";

// ── Per-test setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  mockSetUser.mockReset();
  mockAuthRegister.mockReset();
});

// ── Helpers ────────────────────────────────────────────────────────────────

function renderPage() {
  const onBack = vi.fn();
  render(<CreateAccountPage onBack={onBack} />);
  return { onBack };
}

function emailInput() {
  return screen.getByTestId("input-register-email") as HTMLInputElement;
}
function passwordInput() {
  return screen.getByTestId("input-register-password") as HTMLInputElement;
}
function confirmInput() {
  return screen.getByTestId("input-register-confirm") as HTMLInputElement;
}
function submitButton() {
  return screen.getByTestId("button-create-account-submit") as HTMLButtonElement;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("CreateAccountPage – submit-button gating", () => {
  it("submit button is disabled when all fields are empty", () => {
    renderPage();
    expect(submitButton().disabled).toBe(true);
  });

  it("submit button is disabled when the email is invalid", () => {
    renderPage();
    fireEvent.change(emailInput(), { target: { value: "not-an-email" } });
    fireEvent.change(passwordInput(), { target: { value: "securepass1" } });
    fireEvent.change(confirmInput(), { target: { value: "securepass1" } });
    expect(submitButton().disabled).toBe(true);
  });

  it("submit button is disabled when password is shorter than 8 characters", () => {
    renderPage();
    fireEvent.change(emailInput(), { target: { value: "user@example.com" } });
    fireEvent.change(passwordInput(), { target: { value: "abc" } });
    fireEvent.change(confirmInput(), { target: { value: "abc" } });
    expect(submitButton().disabled).toBe(true);
  });

  it("submit button is disabled when passwords do not match", () => {
    renderPage();
    fireEvent.change(emailInput(), { target: { value: "user@example.com" } });
    fireEvent.change(passwordInput(), { target: { value: "securepass1" } });
    fireEvent.change(confirmInput(), { target: { value: "differentpass" } });
    expect(submitButton().disabled).toBe(true);
  });

  it("submit button is enabled when all fields are valid and passwords match", () => {
    renderPage();
    fireEvent.change(emailInput(), { target: { value: "user@example.com" } });
    fireEvent.change(passwordInput(), { target: { value: "securepass1" } });
    fireEvent.change(confirmInput(), { target: { value: "securepass1" } });
    expect(submitButton().disabled).toBe(false);
  });
});

describe("CreateAccountPage – inline validation warnings", () => {
  it("shows a short-password warning when password is between 1 and 7 characters", () => {
    renderPage();
    fireEvent.change(passwordInput(), { target: { value: "short" } });
    expect(screen.getByText(/at least 8 characters/i)).toBeTruthy();
  });

  it("does not show the short-password warning when password is empty", () => {
    renderPage();
    expect(screen.queryByText(/at least 8 characters/i)).toBeNull();
  });

  it("shows a passwords-don't-match warning when confirm differs from password", () => {
    renderPage();
    fireEvent.change(passwordInput(), { target: { value: "securepass1" } });
    fireEvent.change(confirmInput(), { target: { value: "other" } });
    expect(screen.getByText(/don't match/i)).toBeTruthy();
  });

  it("hides the mismatch warning once the passwords agree", () => {
    renderPage();
    fireEvent.change(passwordInput(), { target: { value: "securepass1" } });
    fireEvent.change(confirmInput(), { target: { value: "other" } });
    expect(screen.getByText(/don't match/i)).toBeTruthy();
    fireEvent.change(confirmInput(), { target: { value: "securepass1" } });
    expect(screen.queryByText(/don't match/i)).toBeNull();
  });
});

describe("CreateAccountPage – API error handling", () => {
  it("shows the 409 duplicate-email message when the API returns 409", async () => {
    mockAuthRegister.mockRejectedValueOnce(
      new MockApiError(409, "An account with that email already exists."),
    );
    renderPage();
    fireEvent.change(emailInput(), { target: { value: "dup@example.com" } });
    fireEvent.change(passwordInput(), { target: { value: "securepass1" } });
    fireEvent.change(confirmInput(), { target: { value: "securepass1" } });
    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByTestId("text-register-error")).toBeTruthy();
    });
    expect(screen.getByTestId("text-register-error").textContent).toMatch(
      /already exists/i,
    );
  });

  it("shows a generic error message on unexpected API failures", async () => {
    mockAuthRegister.mockRejectedValueOnce(new Error("Network error"));
    renderPage();
    fireEvent.change(emailInput(), { target: { value: "user@example.com" } });
    fireEvent.change(passwordInput(), { target: { value: "securepass1" } });
    fireEvent.change(confirmInput(), { target: { value: "securepass1" } });
    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByTestId("text-register-error")).toBeTruthy();
    });
    expect(screen.getByTestId("text-register-error").textContent).toMatch(
      /something went wrong/i,
    );
  });
});

describe("CreateAccountPage – back navigation", () => {
  it("calls onBack when the back-to-sign-in button is clicked", () => {
    const { onBack } = renderPage();
    fireEvent.click(screen.getByTestId("button-back-to-login"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
