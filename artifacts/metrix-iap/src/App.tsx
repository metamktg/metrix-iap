import { lazy, Suspense, type ComponentType } from "react";
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
import { DeepDiveProvider } from "@/contexts/DeepDiveContext";
import {
  RESET_PASSWORD_PATH,
  FORGOT_PASSWORD_PATH,
  ADMIN_PATH,
  CREATE_ACCOUNT_PATH,
} from "@/navigation/preLoginRoutes";
import { LEGACY_REDIRECTS } from "@/navigation/legacyRoutes";
import { CreateAccountPage } from "@/pages/auth/CreateAccountPage";

// Seed-hydrated Metrix pages (manager → ad-account hierarchy)
import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { ConceptRegistryProvider } from "@/lib/concept-registry-context";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";

// ─── Code-split route views ────────────────────────────────────────────
// In-app views load as per-section chunks so the entry bundle (login page,
// etc.) stays small — pre-auth screens above remain eager since they ARE
// the entry surface. Views keep their named exports; only the router
// defers their chunks.
function lazyView<K extends string>(
  load: () => Promise<{ [P in K]: ComponentType }>,
  name: K,
) {
  return lazy(async () => ({ default: (await load())[name] }));
}

const Overview = lazyView(() => import("@/pages/metrix/Overview"), "Overview");
const OverviewUpdatesView = lazyView(() => import("@/pages/metrix/OverviewUpdatesView"), "OverviewUpdatesView");
const ListenCommandCenter = lazyView(() => import("@/pages/metrix/listen/ListenCommandCenter"), "ListenCommandCenter");
const SignalView = lazyView(() => import("@/pages/metrix/listen/SignalView"), "SignalView");
const AlertsView = lazyView(() => import("@/pages/metrix/listen/AlertsView"), "AlertsView");
const RecommendationsView = lazyView(() => import("@/pages/metrix/listen/RecommendationsView"), "RecommendationsView");
const AnalysisCommandCenter = lazyView(() => import("@/pages/metrix/analysis/AnalysisCommandCenter"), "AnalysisCommandCenter");
const AnalysisOverview = lazyView(() => import("@/pages/metrix/analysis/AnalysisOverview"), "AnalysisOverview");
const AdPerformanceView = lazyView(() => import("@/pages/metrix/analysis/AdPerformanceView"), "AdPerformanceView");
const IapLibraryView = lazyView(() => import("@/pages/metrix/analysis/IapLibraryView"), "IapLibraryView");
const AnalysisDnaView = lazyView(() => import("@/pages/metrix/analysis/AnalysisDnaView"), "AnalysisDnaView");
const AudienceView = lazyView(() => import("@/pages/metrix/analysis/AudienceView"), "AudienceView");
const PlacementsView = lazyView(() => import("@/pages/metrix/analysis/PlacementsView"), "PlacementsView");
const BudgetView = lazyView(() => import("@/pages/metrix/analysis/BudgetView"), "BudgetView");
const AnalysisHistoryView = lazyView(() => import("@/pages/metrix/analysis/AnalysisHistoryView"), "AnalysisHistoryView");
const EngagementFunnelView = lazyView(() => import("@/pages/metrix/analysis/EngagementFunnelView"), "EngagementFunnelView");
const StrategyCommandCenter = lazyView(() => import("@/pages/metrix/strategy/StrategyCommandCenter"), "StrategyCommandCenter");
const StrategyOverview = lazyView(() => import("@/pages/metrix/strategy/StrategyOverview"), "StrategyOverview");
const StrategyMapView = lazyView(() => import("@/pages/metrix/strategy/StrategyMapView"), "StrategyMapView");
const AvatarsView = lazyView(() => import("@/pages/metrix/strategy/AvatarsView"), "AvatarsView");
const CommunicationsView = lazyView(() => import("@/pages/metrix/strategy/CommunicationsView"), "CommunicationsView");
const HypothesisQueueView = lazyView(() => import("@/pages/metrix/strategy/HypothesisQueueView"), "HypothesisQueueView");
const StrategyHistoryView = lazyView(() => import("@/pages/metrix/strategy/StrategyHistoryView"), "StrategyHistoryView");
const CreativeCommandCenter = lazyView(() => import("@/pages/metrix/creative/CreativeCommandCenter"), "CreativeCommandCenter");
const CreativeLibraryView = lazyView(() => import("@/pages/metrix/creative/CreativeLibraryView"), "CreativeLibraryView");
const CreativeBriefBuilderView = lazyView(() => import("@/pages/metrix/creative/CreativeBriefBuilderView"), "CreativeBriefBuilderView");
const CreativeScanView = lazyView(() => import("@/pages/metrix/creative/CreativeScanView"), "CreativeScanView");
const CreativeImportExportView = lazyView(() => import("@/pages/metrix/creative/CreativeImportExportView"), "CreativeImportExportView");
const ReportsCommandCenter = lazyView(() => import("@/pages/metrix/reports/ReportsCommandCenter"), "ReportsCommandCenter");
const ReportBuilderView = lazyView(() => import("@/pages/metrix/reports/ReportBuilderView"), "ReportBuilderView");
const ReportHistoryView = lazyView(() => import("@/pages/metrix/reports/ReportHistoryView"), "ReportHistoryView");
const ReportConfigurationView = lazyView(() => import("@/pages/metrix/reports/ReportConfigurationView"), "ReportConfigurationView");
const ExportsCommandCenter = lazyView(() => import("@/pages/metrix/exports/ExportsCommandCenter"), "ExportsCommandCenter");
const ExportsAnalysisView = lazyView(() => import("@/pages/metrix/exports/ExportsAnalysisView"), "ExportsAnalysisView");
const ExportsStrategyView = lazyView(() => import("@/pages/metrix/exports/ExportsStrategyView"), "ExportsStrategyView");
const ExportsReportsView = lazyView(() => import("@/pages/metrix/exports/ExportsReportsView"), "ExportsReportsView");
const ExportsBriefView = lazyView(() => import("@/pages/metrix/exports/ExportsBriefView"), "ExportsBriefView");
const MstCommandCenter = lazyView(() => import("@/pages/metrix/mst/MstCommandCenter"), "MstCommandCenter");
const MstCrossMapView = lazyView(() => import("@/pages/metrix/mst/MstCrossMapView"), "MstCrossMapView");
const MstSprintsView = lazyView(() => import("@/pages/metrix/mst/MstSprintsView"), "MstSprintsView");
const MstDirectionView = lazyView(() => import("@/pages/metrix/mst/MstDirectionView"), "MstDirectionView");
const MstCreativeScanView = lazyView(() => import("@/pages/metrix/mst/CreativeScanView"), "CreativeScanView");
const MetrixAgent = lazyView(() => import("@/pages/MetrixAgent"), "MetrixAgent");
const FindingsView = lazyView(() => import("@/pages/metrix/analysis/FindingsView"), "FindingsView");
const ActionQueueView = lazyView(() => import("@/pages/metrix/act/ActionQueueView"), "ActionQueueView");
const GeneralView = lazyView(() => import("@/pages/metrix/settings/GeneralView"), "GeneralView");
const SecurityView = lazyView(() => import("@/pages/metrix/settings/SecurityView"), "SecurityView");
const IntegrationsView = lazyView(() => import("@/pages/metrix/settings/IntegrationsView"), "IntegrationsView");
const UsersPermissionsView = lazyView(() => import("@/pages/metrix/settings/UsersPermissionsView"), "UsersPermissionsView");
const BillingView = lazyView(() => import("@/pages/metrix/settings/BillingView"), "BillingView");
const DataProvenanceView = lazyView(() => import("@/pages/metrix/settings/DataProvenanceView"), "DataProvenanceView");

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});

function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center py-24">
      <div className="text-center space-y-2">
        <h2 className="text-title font-h5 font-bold text-foreground">Page not found</h2>
        <p className="text-caption text-muted-foreground">This route does not exist.</p>
      </div>
    </div>
  );
}

// Shown in the content area (inside AppShell chrome) while a route chunk
// downloads — matches the app's standard spinner treatment (see AuthGate's
// full-page loading state above).
function RouteFallback() {
  return (
    <div className="flex-1 flex items-center justify-center py-24" data-testid="route-loading">
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
      <Route path="/app/overview/updates" component={OverviewUpdatesView} />

      {/* ── 02 Listen ─────────────────────────────────────────────────── */}
      <Route path="/app/listen"                 component={ListenCommandCenter} />
      <Route path="/app/listen/alerts"          component={AlertsView} />
      <Route path="/app/listen/signal"          component={SignalView} />
      <Route path="/app/listen/recommendations" component={RecommendationsView} />

      {/* ── 03 Analysis ───────────────────────────────────────────────── */}
      <Route path="/app/analysis"            component={AnalysisCommandCenter} />
      <Route path="/app/analysis/overview"   component={AnalysisOverview} />
      <Route path="/app/analysis/performance" component={AdPerformanceView} />
      <Route path="/app/analysis/library"    component={IapLibraryView} />
      <Route path="/app/analysis/dna"        component={AnalysisDnaView} />
      <Route path="/app/analysis/audience"   component={AudienceView} />
      <Route path="/app/analysis/placements" component={PlacementsView} />
      <Route path="/app/analysis/budget"     component={BudgetView} />
      <Route path="/app/analysis/history"    component={AnalysisHistoryView} />
      <Route path="/app/analysis/funnel"    component={EngagementFunnelView} />
      {/* Findings — the AI verdict panel; an Analysis page (hidden in the
          tree until its producer runs for real accounts). */}
      <Route path="/app/analyze/findings" component={FindingsView} />

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

      {/* ── 06 MST ────────────────────────────────────────────────────── */}
      <Route path="/app/mst"                component={MstCommandCenter} />
      <Route path="/app/mst/cross-map"     component={MstCrossMapView} />
      <Route path="/app/mst/sprints"       component={MstSprintsView} />
      <Route path="/app/mst/direction"     component={MstDirectionView} />
      <Route path="/app/mst/creative-scan" component={MstCreativeScanView} />

      {/* ── 07 Action ─────────────────────────────────────────────────── */}
      <Route path="/app/act/queue"     component={ActionQueueView} />
      <Route path="/app/action/agent"  component={MetrixAgent} />

      {/* ── 08 Reports ────────────────────────────────────────────────── */}
      <Route path="/app/reports"              component={ReportsCommandCenter} />
      <Route path="/app/reports/builder"      component={ReportBuilderView} />
      <Route path="/app/reports/configuration" component={ReportConfigurationView} />
      <Route path="/app/reports/history"      component={ReportHistoryView} />

      {/* ── 09 Exports ────────────────────────────────────────────────── */}
      <Route path="/app/exports"           component={ExportsCommandCenter} />
      <Route path="/app/exports/analysis"  component={ExportsAnalysisView} />
      <Route path="/app/exports/strategy"  component={ExportsStrategyView} />
      <Route path="/app/exports/reports"   component={ExportsReportsView} />
      <Route path="/app/exports/brief"     component={ExportsBriefView} />

      {/* ── 10 Settings ───────────────────────────────────────────────── */}
      <Route path="/app/settings/general"       component={GeneralView} />
      <Route path="/app/settings/users"         component={UsersPermissionsView} />
      <Route path="/app/settings/security"      component={SecurityView} />
      <Route path="/app/settings/integrations"  component={IntegrationsView} />
      <Route path="/app/settings/billing"       component={BillingView} />
      <Route path="/app/settings/provenance"    component={DataProvenanceView} />

      {/* ── Legacy route redirects (old IA → new IA, zero dead ends) ────
          One table (navigation/legacyRoutes.ts) drives these, the route
          tests, and the lint that stops new code linking to an old path. */}
      {LEGACY_REDIRECTS.map(([from, to]) => (
        <Route key={from} path={from}>{() => <Redirect to={to} replace />}</Route>
      ))}

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
                <DeepDiveProvider>
                  <AppShell>
                    <Router />
                  </AppShell>
                </DeepDiveProvider>
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
