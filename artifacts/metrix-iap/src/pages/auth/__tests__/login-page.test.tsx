// ─── Login page regression tests ───────────────────────────────────────
// Guards the "no account?" path: the login page must link out to the
// marketing site's Request Access form (/www/#request-access) and must
// NOT reintroduce the old inline email-only waitlist form.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    login: vi.fn(),
  }),
}));

import { LoginPage } from "../LoginPage";

beforeEach(() => {
  cleanup();
});

describe("LoginPage", () => {
  it("links 'Request access' to the marketing sign-up form anchor", () => {
    render(<LoginPage />);
    const link = screen.getByTestId("link-request-access");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/www/#request-access");
  });

  it("does not render the old inline waitlist email form", () => {
    render(<LoginPage />);
    expect(screen.queryByTestId("form-waitlist")).toBeNull();
    expect(screen.queryByTestId("input-waitlist-email")).toBeNull();
    expect(screen.queryByTestId("button-join-waitlist")).toBeNull();
  });

  it("still renders the sign-in form and marketing site link", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("button-login")).toBeTruthy();
    expect(screen.getByTestId("link-marketing-site").getAttribute("href")).toBe(
      "/www/",
    );
  });
});
