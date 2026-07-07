import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { AppShell } from "@/components/layout/AppShell";

// Seed-hydrated Metrix pages (manager → ad-account hierarchy)
import { AccountProvider } from "@/contexts/AccountContext";
import { Overview } from "@/pages/metrix/Overview";
import { ListenView } from "@/pages/metrix/ListenView";
import { AnalysisView } from "@/pages/metrix/AnalysisView";
import { StrategyView } from "@/pages/metrix/StrategyView";
import { BriefBuilderView } from "@/pages/metrix/BriefBuilderView";
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
      {/* ── Overview (adaptive: manager ↔ ad account) ─────────────────── */}
      <Route path="/"               component={Overview} />
      <Route path="/app/account"    component={Overview} />

      {/* ── 01–07 primary nav (seed-hydrated, account-scoped) ─────────── */}
      <Route path="/app/listen"                 component={ListenView} />
      <Route path="/app/analysis"               component={AnalysisView} />
      <Route path="/app/strategy"               component={StrategyView} />
      <Route path="/app/strategy/brief-builder" component={BriefBuilderView} />
      <Route path="/app/report-builder"         component={ReportBuilderView} />
      <Route path="/app/mst"                    component={MSTView} />
      <Route path="/app/agent"                  component={MetrixAgent} />
      <Route path="/app/settings"               component={SettingsView} />

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
          <WorkspaceProvider>
            <AccountProvider>
              <AppShell>
                <Router />
              </AppShell>
            </AccountProvider>
          </WorkspaceProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
