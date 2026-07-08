import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MetrixDataProvider } from "@/contexts/MetrixDataContext";
import { AppShell } from "@/components/layout/AppShell";

// Seed-hydrated Metrix pages (manager → ad-account hierarchy)
import { AccountProvider } from "@/contexts/AccountContext";
import { Overview } from "@/pages/metrix/Overview";
import { SignalView } from "@/pages/metrix/listen/SignalView";
import { AlertsView } from "@/pages/metrix/listen/AlertsView";
import { RecommendationsView } from "@/pages/metrix/listen/RecommendationsView";
import { IapLibraryView } from "@/pages/metrix/analysis/IapLibraryView";
import { ConceptMapView } from "@/pages/metrix/analysis/ConceptMapView";
import { BudgetView } from "@/pages/metrix/analysis/BudgetView";
import { HypothesisQueueView } from "@/pages/metrix/strategy/HypothesisQueueView";
import { AvatarsView } from "@/pages/metrix/strategy/AvatarsView";
import { BriefBuilderView } from "@/pages/metrix/briefs/BriefBuilderView";
import { BriefHistoryView } from "@/pages/metrix/briefs/BriefHistoryView";
import { ReportBuilderView } from "@/pages/metrix/ReportBuilderView";
import { MSTView } from "@/pages/metrix/MSTView";
import { SettingsView } from "@/pages/metrix/SettingsView";
import { MetrixAgent } from "@/pages/MetrixAgent";

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

function Router() {
  return (
    <Switch>
      {/* ── 00 Overview (adaptive: manager ↔ ad account) ──────────────── */}
      <Route path="/"               component={Overview} />
      <Route path="/app/account"    component={Overview} />

      {/* ── 01 Listen ─────────────────────────────────────────────────── */}
      <Route path="/app/listen/signal"          component={SignalView} />
      <Route path="/app/listen/alerts"          component={AlertsView} />
      <Route path="/app/listen/recommendations" component={RecommendationsView} />

      {/* ── 02 Analysis ───────────────────────────────────────────────── */}
      <Route path="/app/analysis/library"     component={IapLibraryView} />
      <Route path="/app/analysis/concept-map" component={ConceptMapView} />
      <Route path="/app/analysis/budget"      component={BudgetView} />

      {/* ── 03 Strategy ───────────────────────────────────────────────── */}
      <Route path="/app/strategy/hypotheses" component={HypothesisQueueView} />
      <Route path="/app/strategy/avatars"    component={AvatarsView} />

      {/* ── 04 Creative Briefs ────────────────────────────────────────── */}
      <Route path="/app/briefs/builder" component={BriefBuilderView} />
      <Route path="/app/briefs/history" component={BriefHistoryView} />

      {/* ── 05–08 leaf modules ────────────────────────────────────────── */}
      <Route path="/app/report-builder" component={ReportBuilderView} />
      <Route path="/app/mst"            component={MSTView} />
      <Route path="/app/agent"          component={MetrixAgent} />
      <Route path="/app/settings"       component={SettingsView} />

      {/* ── Legacy route redirects ────────────────────────────────────── */}
      <Route path="/app/listen">{() => <Redirect to="/app/listen/signal" replace />}</Route>
      <Route path="/app/analysis">{() => <Redirect to="/app/analysis/library" replace />}</Route>
      <Route path="/app/strategy">{() => <Redirect to="/app/strategy/hypotheses" replace />}</Route>
      <Route path="/app/strategy/brief-builder">{() => <Redirect to="/app/briefs/builder" replace />}</Route>

      {/* ── 404 ───────────────────────────────────────────────────────── */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <MetrixDataProvider>
            <AccountProvider>
              <AppShell>
                <Router />
              </AppShell>
            </AccountProvider>
          </MetrixDataProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
