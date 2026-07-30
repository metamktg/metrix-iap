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
import { CreateAccountPage } from "@/pages/auth/CreateAccountPage";
import { AdminWaitlistPage } from "@/pages/admin/AdminWaitlistPage";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { TaskTrayProvider } from "@/contexts/TaskTrayContext";
import {
  RESET_PASSWORD_PATH,
  FORGOT_PASSWORD_PATH,
  ADMIN_PATH,
  CREATE_ACCOUNT_PATH,
} from "@/navigation/preLoginRoutes";

// Seed-hydrated Metrix pages (manager → ad-account hierarchy)
import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { ConceptRegistryProvider } from "@/lib/concept-registry-context";
import { Overview } from "@/pages/metrix/Overview";
import { SignalView } from "@/pages/metrix/listen/SignalView";
import { AlertsView } from "@/pages/metrix/listen/AlertsView";
import { RecommendationsView } from "@/pages/metrix/listen/RecommendationsView";
import { AnalysisHub } from "@/pages/metrix/analysis/AnalysisHub";
import { AnalysisOverview } from "@/pages/metrix/analysis/AnalysisOverview";
import { IapLibraryView } from "@/pages/metrix/analysis/IapLibraryView";
import { AudienceView } from "@/pages/metrix/analysis/AudienceView";
import { PlacementsView } from "@/pages/metrix/analysis/PlacementsView";
import { BudgetView } from "@/pages/metrix/analysis/BudgetView";
import { StrategyHub } from "@/pages/metrix/strategy/StrategyHub";
import { StrategyOverview } from "@/pages/metrix/strategy/StrategyOverview";
import { StrategyMapView } from "@/pages/metrix/strategy/StrategyMapView";
import { AvatarsView } from "@/pages/metrix/strategy/AvatarsView";
import { HypothesisQueueView } from "@/pages/metrix/strategy/HypothesisQueueView";
import { BriefHub } from "@/pages/metrix/briefs/BriefHub";
import { BriefBuilderView } from "@/pages/metrix/briefs/BriefBuilderView";
import { BriefHistoryView } from "@/pages/metrix/briefs/BriefHistoryView";
import { ReportsHub } from "@/pages/metrix/reports/ReportsHub";
import { NewReportView } from "@/pages/metrix/reports/NewReportView";
import { ReportHistoryView } from "@/pages/metrix/reports/ReportHistoryView";
import { ExportsView } from "@/pages/metrix/reports/ExportsView";
import { ReportSettingsView } from "@/pages/metrix/reports/ReportSettingsView";
import { MSTHub } from "@/pages/metrix/mst/MSTHub";
import { ConceptMapView } from "@/pages/metrix/mst/ConceptMapView";
import { MatrixBuilderView } from "@/pages/metrix/mst/MatrixBuilderView";
import { CreativeScanView } from "@/pages/metrix/mst/CreativeScanView";
import { CrossmapResultsView } from "@/pages/metrix/mst/CrossmapResultsView";
import { MetrixAgent } from "@/pages/MetrixAgent";
import { AccountSettingsView } from "@/pages/metrix/settings/AccountSettingsView";
import { IntegrationsView } from "@/pages/metrix/settings/IntegrationsView";
import { TeamAccessView } from "@/pages/metrix/settings/TeamAccessView";
import { NotificationsView } from "@/pages/metrix/settings/NotificationsView";
import { BillingView } from "@/pages/metrix/settings/BillingView";

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

export function Router() {
  return (
    <Switch>
      {/* ── 01 Overview (adaptive: manager ↔ ad account) ──────────────── */}
      <Route path="/"               component={Overview} />
      <Route path="/app/account"    component={Overview} />

      {/* ── 02 Listen ─────────────────────────────────────────────────── */}
      <Route path="/app/listen/alerts"          component={AlertsView} />
      <Route path="/app/listen/signal"          component={SignalView} />
      <Route path="/app/listen/recommendations" component={RecommendationsView} />

      {/* ── 03 Analysis ───────────────────────────────────────────────── */}
      <Route path="/app/analysis"         component={AnalysisHub} />
      <Route path="/app/analysis/overview"   component={AnalysisOverview} />
      <Route path="/app/analysis/library"    component={IapLibraryView} />
      <Route path="/app/analysis/audience"   component={AudienceView} />
      <Route path="/app/analysis/placements" component={PlacementsView} />
      <Route path="/app/analysis/budget"     component={BudgetView} />

      {/* ── 04 Strategy ───────────────────────────────────────────────── */}
      <Route path="/app/strategy"            component={StrategyHub} />
      <Route path="/app/strategy/overview"   component={StrategyOverview} />
      <Route path="/app/strategy/map"        component={StrategyMapView} />
      <Route path="/app/strategy/avatars"    component={AvatarsView} />
      <Route path="/app/strategy/hypotheses" component={HypothesisQueueView} />

      {/* ── 05 Creative Briefs ────────────────────────────────────────── */}
      <Route path="/app/briefs"         component={BriefHub} />
      <Route path="/app/briefs/builder" component={BriefBuilderView} />
      <Route path="/app/briefs/history" component={BriefHistoryView} />

      {/* ── 06 Report Builder ─────────────────────────────────────────── */}
      <Route path="/app/reports"         component={ReportsHub} />
      <Route path="/app/reports/new"     component={NewReportView} />
      <Route path="/app/reports/history" component={ReportHistoryView} />
      <Route path="/app/reports/exports" component={ExportsView} />
      <Route path="/app/reports/settings" component={ReportSettingsView} />

      {/* ── 07 MST ────────────────────────────────────────────────────── */}
      <Route path="/app/mst"               component={MSTHub} />
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
      <Route path="/app/analysis/concept-map">{() => <Redirect to="/app/mst/concept-map" replace />}</Route>
      <Route path="/app/strategy/brief-builder">{() => <Redirect to="/app/briefs/builder" replace />}</Route>
      <Route path="/app/report-builder">{() => <Redirect to="/app/reports/new" replace />}</Route>
      <Route path="/app/settings">{() => <Redirect to="/app/settings/account" replace />}</Route>

      {/* ── 404 ───────────────────────────────────────────────────────── */}
      <Route component={NotFound} />
    </Switch>
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

  // Account creation — open to logged-out visitors; redirect in if already signed in.
  if (location === CREATE_ACCOUNT_PATH) {
    if (!isLoading && user) return <Redirect to="/" replace />;
    return <CreateAccountPage onBack={() => navigate("/", { replace: true })} />;
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
