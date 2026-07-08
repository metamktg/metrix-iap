// Shared memoryLocation render harness for navigation route tests.
// Test files must mock "@/contexts/MetrixDataContext" (see nav-routes.test.tsx)
// BEFORE importing this module, since it pulls in the real App Router.
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Router as AppRouter } from "@/App";

export const NOT_FOUND_TEXT = "This route does not exist.";
export const SESSION_KEY = "metrix_active_account_v1";

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
          <AccountProvider>
            <DateRangeProvider>
              <AppRouter />
            </DateRangeProvider>
          </AccountProvider>
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
  return { ...result, location };
}
