import { lazy, Suspense, type ComponentType } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MetrixDataProvider } from "@/contexts/MetrixDataContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LoginPage } from "@/pages/auth/LoginPage";
import { ChangePasswordPage } from "@/pages/auth/ChangePasswordPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";
import { AdminWaitlistPage } from "@/pages/admin/AdminWaitlistPage";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { TaskTrayProvider } from "@/contexts/TaskTrayContext";
import {
  RESET_PASSWORD_PATH,
  FORGOT_PASSWORD_PATH,
  ADMIN_PATH,
} from "@/navigation/preLoginRoutes";

// Seed-hydrated Metrix pages (manager → ad-account hierarchy)
import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { ConceptRegistryProvider } from "@/lib/concept-registry-context";

// ─── Code-split route views ────────────────────────────────────────────
// In-app views load as per-section chunks so the entry bundle stays small
// (pre-auth screens above remain eager — they ARE the entry surface).
// Views keep their named exports; only the router defers their chunks.
function lazyView<K extends string>(
  load: () => Promise<{ [P in K]: ComponentType }>,
  name: K,
) {
  return lazy(async () => ({ default: (await load())[name] }));
}

const Overview = lazyView(() => import("@/pages/metrix/Overview"), "Overview");
const SignalView = lazyView(() => import("@/pages/metrix/listen/SignalView"), "SignalView");
const AlertsView = lazyView(() => import("@/pages/metrix/listen/AlertsView"), "AlertsView");
const RecommendationsView = lazyView(() => import("@/pages/metrix/listen/RecommendationsView"), "RecommendationsView");
const AnalysisOverview = lazyView(() => import("@/pages/metrix/analysis/AnalysisOverview"), "AnalysisOverview");
const IapLibraryView = lazyView(() => import("@/pages/metrix/analysis/IapLibraryView"), "IapLibraryView");
const AudienceView = lazyView(() => import("@/pages/metrix/analysis/AudienceView"), "AudienceView");
const PlacementsView = lazyView(() => import("@/pages/metrix/analysis/PlacementsView"), "PlacementsView");
const BudgetView = lazyView(() => import("@/pages/metrix/analysis/BudgetView"), "BudgetView");
const StrategyOverview = lazyView(() => import("@/pages/metrix/strategy/StrategyOverview"), "StrategyOverview");
const StrategyMapView = lazyView(() => import("@/pages/metrix/strategy/StrategyMapView"), "StrategyMapView");
const AvatarsView = lazyView(() => import("@/pages/metrix/strategy/AvatarsView"), "AvatarsView");
const HypothesisQueueView = lazyView(() => import("@/pages/metrix/strategy/HypothesisQueueView"), "HypothesisQueueView");
const BriefBuilderView = lazyView(() => import("@/pages/metrix/briefs/BriefBuilderView"), "BriefBuilderView");
const BriefHistoryView = lazyView(() => import("@/pages/metrix/briefs/BriefHistoryView"), "BriefHistoryView");
const NewReportView = lazyView(() => import("@/pages/metrix/reports/NewReportView"), "NewReportView");
const ReportHistoryView = lazyView(() => import("@/pages/metrix/reports/ReportHistoryView"), "ReportHistoryView");
const ExportsView = lazyView(() => import("@/pages/metrix/reports/ExportsView"), "ExportsView");
const ReportSettingsView = lazyView(() => import("@/pages/metrix/reports/ReportSettingsView"), "ReportSettingsView");
const ConceptMapView = lazyView(() => import("@/pages/metrix/mst/ConceptMapView"), "ConceptMapView");
const MatrixBuilderView = lazyView(() => import("@/pages/metrix/mst/MatrixBuilderView"), "MatrixBuilderView");
const CreativeScanView = lazyView(() => import("@/pages/metrix/mst/CreativeScanView"), "CreativeScanView");
const CrossmapResultsView = lazyView(() => import("@/pages/metrix/mst/CrossmapResultsView"), "CrossmapResultsView");
const MetrixAgent = lazyView(() => import("@/pages/MetrixAgent"), "MetrixAgent");
const AccountSettingsView = lazyView(() => import("@/pages/metrix/settings/AccountSettingsView"), "AccountSettingsView");
const IntegrationsView = lazyView(() => import("@/pages/metrix/settings/IntegrationsView"), "IntegrationsView");
const TeamAccessView = lazyView(() => import("@/pages/metrix/settings/TeamAccessView"), "TeamAccessView");
const NotificationsView = lazyView(() => import("@/pages/metrix/settings/NotificationsView"), "NotificationsView");
const BillingView = lazyView(() => import("@/pages/metrix/settings/BillingView"), "BillingView");

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});

function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center py-24">
      <div className="text-center space-y-2">
        <h2 className="text-base font-semibold text-foreground">Page not found</h2>
        <p className="text-xs text-muted-foreground">This route does not exist.</p>
      </div>
    </div>
  );
}

// Shown in the content area (inside AppShell chrome) while a route chunk
// downloads — matches the app's standard spinner treatment.
function RouteFallback() {
  return (
    <div
      className="flex-1 flex items-center justify-center py-24"
      data-testid="route-loading"
    >
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Switch>
      {/* ── 01 Overview (adaptive: manager ↔ ad account) ──────────────── */}
      <Route path="/"               component={Overview} />
      <Route path="/app/account"    component={Overview} />

      {/* ── 02 Listen ─────────────────────────────────────────────────── */}
      <Route path="/app/listen/alerts"          component={AlertsView} />
      <Route path="/app/listen/signal"          component={SignalView} />
      <Route path="/app/listen/recommendations" component={RecommendationsView} />

      {/* ── 03 Analysis ───────────────────────────────────────────────── */}
      <Route path="/app/analysis/overview"   component={AnalysisOverview} />
      <Route path="/app/analysis/library"    component={IapLibraryView} />
      <Route path="/app/analysis/audience"   component={AudienceView} />
      <Route path="/app/analysis/placements" component={PlacementsView} />
      <Route path="/app/analysis/budget"     component={BudgetView} />

      {/* ── 04 Strategy ───────────────────────────────────────────────── */}
      <Route path="/app/strategy/overview"   component={StrategyOverview} />
      <Route path="/app/strategy/map"        component={StrategyMapView} />
      <Route path="/app/strategy/avatars"    component={AvatarsView} />
      <Route path="/app/strategy/hypotheses" component={HypothesisQueueView} />

      {/* ── 05 Creative Briefs ────────────────────────────────────────── */}
      <Route path="/app/briefs/builder" component={BriefBuilderView} />
      <Route path="/app/briefs/history" component={BriefHistoryView} />

      {/* ── 06 Report Builder ─────────────────────────────────────────── */}
      <Route path="/app/reports/new"     component={NewReportView} />
      <Route path="/app/reports/history" component={ReportHistoryView} />
      <Route path="/app/reports/exports" component={ExportsView} />
      <Route path="/app/reports/settings" component={ReportSettingsView} />

      {/* ── 07 MST ────────────────────────────────────────────────────── */}
      <Route path="/app/mst/concept-map"   component={ConceptMapView} />
      <Route path="/app/mst/matrix"        component={MatrixBuilderView} />
      <Route path="/app/mst/creative-scan" component={CreativeScanView} />
      <Route path="/app/mst/crossmap"      component={CrossmapResultsView} />

      {/* ── 08 Metrix Agent ───────────────────────────────────────────── */}
      <Route path="/app/agent" component={MetrixAgent} />

      {/* ── 09 Settings ───────────────────────────────────────────────── */}
      <Route path="/app/settings/account"       component={AccountSettingsView} />
      <Route path="/app/settings/integrations"  component={IntegrationsView} />
      <Route path="/app/settings/team"          component={TeamAccessView} />
      <Route path="/app/settings/notifications" component={NotificationsView} />
      <Route path="/app/settings/billing"       component={BillingView} />

      {/* ── Legacy route redirects (old IA → new IA, zero dead ends) ──── */}
      <Route path="/app/listen">{() => <Redirect to="/app/listen/alerts" replace />}</Route>
      <Route path="/app/analysis">{() => <Redirect to="/app/analysis/overview" replace />}</Route>
      <Route path="/app/analysis/concept-map">{() => <Redirect to="/app/mst/concept-map" replace />}</Route>
      <Route path="/app/strategy">{() => <Redirect to="/app/strategy/overview" replace />}</Route>
      <Route path="/app/strategy/brief-builder">{() => <Redirect to="/app/briefs/builder" replace />}</Route>
      <Route path="/app/briefs">{() => <Redirect to="/app/briefs/builder" replace />}</Route>
      <Route path="/app/report-builder">{() => <Redirect to="/app/reports/new" replace />}</Route>
      <Route path="/app/reports">{() => <Redirect to="/app/reports/new" replace />}</Route>
      <Route path="/app/mst">{() => <Redirect to="/app/mst/matrix" replace />}</Route>
      <Route path="/app/settings">{() => <Redirect to="/app/settings/account" replace />}</Route>

      {/* ── 404 ───────────────────────────────────────────────────────── */}
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

export function AuthGate() {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();

  // The emailed reset link must work regardless of session state.
  if (location === RESET_PASSWORD_PATH) {
    return <ResetPasswordPage onBackToLogin={() => navigate("/", { replace: true })} />;
  }

  // The admin console has its own password gate — independent of user auth.
  if (location === ADMIN_PATH) {
    return <AdminWaitlistPage />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    if (location === FORGOT_PASSWORD_PATH) {
      return <ForgotPasswordPage onBack={() => navigate("/", { replace: true })} />;
    }
    return <LoginPage />;
  }
  if (user.must_change_password) return <ChangePasswordPage />;

  // A signed-in user opening the forgot-password link (old email, bookmark)
  // has no use for that screen — send them to their account settings, where
  // the password can actually be changed, instead of the in-app 404. The
  // ?focus=password param (the app's focus deep-link convention) tells that
  // page to scroll to / highlight the password card.
  if (location === FORGOT_PASSWORD_PATH) {
    return <Redirect to="/app/settings/account?focus=password" replace />;
  }

  return (
    <MetrixDataProvider>
      <ConceptRegistryProvider>
        <AccountProvider>
          <DateRangeProvider>
            <TaskTrayProvider>
              <AppShell>
                <Router />
              </AppShell>
            </TaskTrayProvider>
          </DateRangeProvider>
        </AccountProvider>
      </ConceptRegistryProvider>
    </MetrixDataProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
