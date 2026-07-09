// Shared memoryLocation render harness for navigation route tests.
// Test files must mock "@/contexts/MetrixDataContext" (see nav-routes.test.tsx)
// BEFORE importing this module, since it pulls in the real App Router.
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getAuthMeQueryKey, type AuthUser } from "@workspace/api-client-react";

import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Router as AppRouter, AuthGate } from "@/App";
import { PRE_LOGIN_ROUTE_PATHS } from "@/navigation/preLoginRoutes";

export const NOT_FOUND_TEXT = "This route does not exist.";
export const SESSION_KEY = "metrix_active_account_v1";

// Routes handled by AuthGate *outside* the authenticated app Router
// (App.tsx renders these before mounting <Router />). Rendering them
// through AppRouter would falsely land on the 404 view, so the harness
// mounts the real AuthGate instead — with the auth query disabled the
// gate resolves to the unauthenticated branch, exactly like a logged-out
// visitor hitting the link. The path list is the shared constant from
// src/navigation/preLoginRoutes.ts — the same one AuthGate consumes —
// so a new pre-login route added there is picked up here automatically.
export const AUTH_GATE_PATHS = PRE_LOGIN_ROUTE_PATHS;

export function seedAccountSession() {
  sessionStorage.clear();
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
  window.history.replaceState({}, "", "/");
}

export function renderAt(initialPath: string) {
  const location = memoryLocation({ path: initialPath, record: true });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <WouterRouter hook={location.hook}>
        <AuthProvider>
          {AUTH_GATE_PATHS.has(initialPath) ? (
            <AuthGate />
          ) : (
            <AccountProvider>
              <DateRangeProvider>
                <AppRouter />
              </DateRangeProvider>
            </AccountProvider>
          )}
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
  return { ...result, location };
}

// Mounts AuthGate with a *signed-in* user: the auth/me query cache is
// pre-seeded so AuthProvider resolves to an authenticated session without
// any network. This simulates a logged-in visitor opening a pre-login link
// (e.g. /forgot-password from an old email) — AuthGate must route them to
// a sensible in-app destination, never the 404 page.
export function renderAuthedAt(
  initialPath: string,
  user: AuthUser = { email: "user@example.com", must_change_password: false }
) {
  const location = memoryLocation({ path: initialPath, record: true });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  queryClient.setQueryData(getAuthMeQueryKey(), user);
  const result = render(
    <QueryClientProvider client={queryClient}>
      <WouterRouter hook={location.hook}>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
  return { ...result, location };
}

// Always mounts AuthGate at the given path, regardless of whether the path
// is in AUTH_GATE_PATHS — exactly what a logged-out visitor experiences.
// Used to verify each PRE_LOGIN_ROUTE_PATHS entry is actually wired to a
// dedicated screen: an unwired path falls through to the plain login page,
// which this helper lets tests detect by comparing against a login baseline.
export function renderAuthGateAt(initialPath: string) {
  const location = memoryLocation({ path: initialPath, record: true });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <WouterRouter hook={location.hook}>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
  return { ...result, location };
}
