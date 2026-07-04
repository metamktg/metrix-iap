// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Workspace State Helpers
// Data strategy: Bookster (ws_bookster) is the ONLY fully-populated
// workspace. All others show Onboarding state.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Returns true if the workspace should show the full IAP interface.
 * Currently only Bookster has populated data.
 */
export function workspaceHasData(workspaceId: string): boolean {
  return workspaceId === "ws_bookster";
}

/**
 * Returns true if the workspace needs onboarding.
 */
export function workspaceNeedsOnboarding(workspaceId: string): boolean {
  return !workspaceHasData(workspaceId);
}

export type OnboardingPath = "connect_account" | "upload_import" | null;
