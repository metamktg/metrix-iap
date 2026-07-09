// Single source of truth for pre-login route paths handled by AuthGate
// (App.tsx) *outside* the authenticated app <Router />.
//
// Both AuthGate and the navigation-test harness consume these constants,
// so adding a new pre-login page (e.g. an email-verification screen) here
// keeps the in-app link check green automatically — no hand-maintained
// duplicate list in the test harness.

// The emailed reset link must work regardless of session state.
export const RESET_PASSWORD_PATH = "/reset-password";

// Shown only to logged-out visitors (authenticated users see the app).
export const FORGOT_PASSWORD_PATH = "/forgot-password";

// The admin console has its own password gate — independent of user auth.
export const ADMIN_PATH = "/admin";

// Every route AuthGate renders before mounting the authenticated Router.
export const PRE_LOGIN_ROUTE_PATHS: ReadonlySet<string> = new Set([
  RESET_PASSWORD_PATH,
  FORGOT_PASSWORD_PATH,
  ADMIN_PATH,
]);
