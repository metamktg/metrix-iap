import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@workspace/command-deck/components/ui/toaster";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
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
  CREATE_ACCOUNT_PATH,
} from "@/navigation/preLoginRoutes";
import { CreateAccountPage } from "@/pages/auth/CreateAccountPage";

// Seed-hydrated Metrix pages (manager → ad-account hierarchy)
import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { ConceptRegistryProvider } from "@/lib/concept-registry-context";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { Overview } from "@/pages/metrix/Overview";
import { OverviewLoopPage } from "@/pages/metrix/OverviewLoopPage";
import { OverviewUpdatesView } from "@/pages/metrix/OverviewUpdatesView";
import { ListenCommandCenter } from "@/pages/metrix/listen/ListenCommandCenter";
import { SignalView } from "@/pages/metrix/listen/SignalView";
import { AlertsView } from "@/pages/metrix/listen/AlertsView";
import { RecommendationsView } from "@/pages/metrix/listen/RecommendationsView";
import { AnalysisCommandCenter } from "@/pages/metrix/analysis/AnalysisCommandCenter";
import { AnalysisOverview } from "@/pages/metrix/analysis/AnalysisOverview";
import { AdPerformanceView } from "@/pages/metrix/analysis/AdPerformanceView";
import { IapLibraryView } from "@/pages/metrix/analysis/IapLibraryView";
import { AudienceView } from "@/pages/metrix/analysis/AudienceView";
import { PlacementsView } from "@/pages/metrix/analysis/PlacementsView";
import { BudgetView } from "@/pages/metrix/analysis/BudgetView";
import { AnalysisHistoryView } from "@/pages/metrix/analysis/AnalysisHistoryView";
import { EngagementFunnelView } from "@/pages/metrix/analysis/EngagementFunnelView";
import { StrategyCommandCenter } from "@/pages/metrix/strategy/StrategyCommandCenter";
import { StrategyOverview } from "@/pages/metrix/strategy/StrategyOverview";
import { StrategyMapView } from "@/pages/metrix/strategy/StrategyMapView";
import { AvatarsView } from "@/pages/metrix/strategy/AvatarsView";
import { CommunicationsView } from "@/pages/metrix/strategy/CommunicationsView";
import { HypothesisQueueView } from "@/pages/metrix/strategy/HypothesisQueueView";
import { StrategyHistoryView } from "@/pages/metrix/strategy/StrategyHistoryView";
import { CreativeCommandCenter } from "@/pages/metrix/creative/CreativeCommandCenter";
import { CreativeLibraryView } from "@/pages/metrix/creative/CreativeLibraryView";
import { CreativeBriefBuilderView } from "@/pages/metrix/creative/CreativeBriefBuilderView";
import { CreativeScanView } from "@/pages/metrix/creative/CreativeScanView";
import { CreativeImportExportView } from "@/pages/metrix/creative/CreativeImportExportView";
import { ReportsCommandCenter } from "@/pages/metrix/reports/ReportsCommandCenter";
import { ReportBuilderView } from "@/pages/metrix/reports/ReportBuilderView";
import { ReportHistoryView } from "@/pages/metrix/reports/ReportHistoryView";
import { ReportConfigurationView } from "@/pages/metrix/reports/ReportConfigurationView";
import { MstCommandCenter } from "@/pages/metrix/mst/MstCommandCenter";
import { MstCrossMapView } from "@/pages/metrix/mst/MstCrossMapView";
import { MstSprintsView } from "@/pages/metrix/mst/MstSprintsView";
import { MstPerformanceView } from "@/pages/metrix/mst/MstPerformanceView";
import { MstDirectionView } from "@/pages/metrix/mst/MstDirectionView";
import { CreativeScanView as MstCreativeScanView } from "@/pages/metrix/mst/CreativeScanView";
import { MetrixAgent } from "@/pages/MetrixAgent";
import { HomeView } from "@/pages/metrix/HomeView";
import { FindingsView } from "@/pages/metrix/analysis/FindingsView";
import { GeneralView } from "@/pages/metrix/settings/GeneralView";
import { SecurityView } from "@/pages/metrix/settings/SecurityView";
import { IntegrationsView } from "@/pages/metrix/settings/IntegrationsView";
import { UsersPermissionsView } from "@/pages/metrix/settings/UsersPermissionsView";
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
      <Route path="/app/overview/loop"    component={OverviewLoopPage} />
      <Route path="/app/overview/updates" component={OverviewUpdatesView} />

      {/* ── 02 Listen ─────────────────────────────────────────────────── */}
      <Route path="/app/listen"                 component={ListenCommandCenter} />
      <Route path="/app/listen/alerts"          component={AlertsView} />
      <Route path="/app/listen/signal"          component={SignalView} />
      <Route path="/app/listen/recommendations" component={RecommendationsView} />

      {/* ── 03 Analysis ───────────────────────────────────────────────── */}
      <Route path="/app/analysis"            component={AnalysisCommandCenter} />
      <Route path="/app/analysis/performance" component={AdPerformanceView} />
      <Route path="/app/analysis/library"    component={IapLibraryView} />
      <Route path="/app/analysis/audience"   component={AudienceView} />
      <Route path="/app/analysis/placements" component={PlacementsView} />
      <Route path="/app/analysis/budget"     component={BudgetView} />
      <Route path="/app/analysis/history"    component={AnalysisHistoryView} />
      <Route path="/app/analysis/funnel"    component={EngagementFunnelView} />

      {/* ── 04 Strategy ───────────────────────────────────────────────── */}
      <Route path="/app/strategy"              component={StrategyCommandCenter} />
      <Route path="/app/strategy/overview"     component={StrategyOverview} />
      <Route path="/app/strategy/map"          component={StrategyMapView} />
      <Route path="/app/strategy/avatars"      component={AvatarsView} />
      <Route path="/app/strategy/communications" component={CommunicationsView} />
      <Route path="/app/strategy/hypotheses"   component={HypothesisQueueView} />
      <Route path="/app/strategy/history"      component={StrategyHistoryView} />

      {/* ── 05 Creative ───────────────────────────────────────────────── */}
      <Route path="/app/creative"              component={CreativeCommandCenter} />
      <Route path="/app/creative/library"      component={CreativeLibraryView} />
      <Route path="/app/creative/builder"      component={CreativeBriefBuilderView} />
      <Route path="/app/creative/scan"         component={CreativeScanView} />
      <Route path="/app/creative/import-export" component={CreativeImportExportView} />

      {/* ── 06 Report Builder ─────────────────────────────────────────── */}
      <Route path="/app/reports"              component={ReportsCommandCenter} />
      <Route path="/app/reports/builder"      component={ReportBuilderView} />
      <Route path="/app/reports/configuration" component={ReportConfigurationView} />
      <Route path="/app/reports/history"      component={ReportHistoryView} />

      {/* ── 06 MST ────────────────────────────────────────────────────── */}
      <Route path="/app/mst"                component={MstCommandCenter} />
      <Route path="/app/mst/cross-map"     component={MstCrossMapView} />
      <Route path="/app/mst/sprints"       component={MstSprintsView} />
      <Route path="/app/mst/performance"   component={MstPerformanceView} />
      <Route path="/app/mst/direction"     component={MstDirectionView} />
      <Route path="/app/mst/creative-scan" component={MstCreativeScanView} />

      {/* ── Home screen ───────────────────────────────────────────────── */}
      <Route path="/app/home" component={HomeView} />

      {/* ── Analyze section ───────────────────────────────────────────── */}
      <Route path="/app/analyze/findings" component={FindingsView} />
      <Route path="/app/analyze">{() => <Redirect to="/app/analyze/findings" replace />}</Route>

      {/* ── 09 Action (coming soon) ──────────────────────────────────── */}
      <Route path="/app/action/agent" component={MetrixAgent} />

      {/* ── 10 Settings ───────────────────────────────────────────────── */}
      <Route path="/app/settings/general"       component={GeneralView} />
      <Route path="/app/settings/users"         component={UsersPermissionsView} />
      <Route path="/app/settings/security"      component={SecurityView} />
      <Route path="/app/settings/integrations"  component={IntegrationsView} />
      <Route path="/app/settings/billing"       component={BillingView} />

      {/* ── Legacy route redirects (old IA → new IA, zero dead ends) ──── */}
      <Route path="/app/analysis/overview" component={AnalysisOverview} />
      <Route path="/app/analysis/concept-map">{() => <Redirect to="/app/mst/cross-map" replace />}</Route>
      <Route path="/app/mst/concept-map">{() => <Redirect to="/app/mst/cross-map" replace />}</Route>
      <Route path="/app/mst/crossmap">{() => <Redirect to="/app/mst/cross-map" replace />}</Route>
      <Route path="/app/mst/matrix">{() => <Redirect to="/app/mst/sprints" replace />}</Route>
      <Route path="/app/strategy/brief-builder">{() => <Redirect to="/app/creative/builder" replace />}</Route>
      <Route path="/app/briefs/builder">{() => <Redirect to="/app/creative/builder" replace />}</Route>
      <Route path="/app/briefs/history">{() => <Redirect to="/app/creative" replace />}</Route>
      <Route path="/app/briefs">{() => <Redirect to="/app/creative" replace />}</Route>
      <Route path="/app/report-builder">{() => <Redirect to="/app/reports/builder" replace />}</Route>
      <Route path="/app/reports/new">{() => <Redirect to="/app/reports/builder" replace />}</Route>
      <Route path="/app/reports/settings">{() => <Redirect to="/app/reports/configuration" replace />}</Route>
      <Route path="/app/reports/exports">{() => <Redirect to="/app/reports/history" replace />}</Route>
      <Route path="/app/agent">{() => <Redirect to="/app/action/agent" replace />}</Route>
      <Route path="/app/action">{() => <Redirect to="/app/action/agent" replace />}</Route>
      <Route path="/app/settings">{() => <Redirect to="/app/settings/general" replace />}</Route>
      <Route path="/app/settings/account">{() => <Redirect to="/app/settings/general" replace />}</Route>
      <Route path="/app/settings/team">{() => <Redirect to="/app/settings/users" replace />}</Route>
      <Route path="/app/settings/notifications">{() => <Redirect to="/app/settings/general" replace />}</Route>

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
    if (location === CREATE_ACCOUNT_PATH) {
      return <CreateAccountPage onBack={() => navigate("/", { replace: true })} />;
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
    return <Redirect to="/app/settings/security?focus=password" replace />;
  }

  return (
    <MetrixDataProvider>
      <ConceptRegistryProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <TaskTrayProvider>
                <AppShell>
                  <Router />
                </AppShell>
              </TaskTrayProvider>
            </AnalysisViewProvider>
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
