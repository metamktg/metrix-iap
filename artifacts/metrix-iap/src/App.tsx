import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { AppShell } from "@/components/layout/AppShell";
import { MasterCommandCenter } from "@/pages/MasterCommandCenter";
import { WorkspaceHome } from "@/pages/WorkspaceHome";

// ─── Stub page — used for pages built in Phase 3+ ─────────────────────
function StubPage({ name, phase = "3" }: { name: string; phase?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center py-24">
      <div className="text-center space-y-3 max-w-sm">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border/60 text-xs text-muted-foreground font-mono mb-2">
          Phase {phase}
        </div>
        <h2 className="text-lg font-bold text-foreground">{name}</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          This screen is scheduled for Phase {phase} of the prototype build.
          Navigate to the Bookster workspace to explore available data.
        </p>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Master Command Center — always visible, no workspace required */}
      <Route path="/" component={MasterCommandCenter} />

      {/* Workspace routes — AppShell handles onboarding gate per workspace */}
      <Route path="/app/workspaces/:workspaceId" component={WorkspaceHome} />
      <Route path="/app/workspaces/:workspaceId/ad-accounts" component={() => <StubPage name="Ad Accounts" />} />
      <Route path="/app/workspaces/:workspaceId/ad-accounts/:adAccountId" component={() => <StubPage name="Account Intelligence" />} />
      <Route path="/app/workspaces/:workspaceId/imports" component={() => <StubPage name="Import Center" />} />

      {/* Global routes */}
      <Route path="/app/imports" component={() => <StubPage name="Import Center" />} />
      <Route path="/app/iap/new" component={() => <StubPage name="IAP Run Builder" phase="3" />} />
      <Route path="/app/iap/runs/:runId" component={() => <StubPage name="IAP Analysis Run" phase="3" />} />
      <Route path="/app/creative-library" component={() => <StubPage name="Creative Intelligence Library" phase="4" />} />
      <Route path="/app/briefs" component={() => <StubPage name="Brief Engine" phase="4" />} />
      <Route path="/app/briefs/:briefId" component={() => <StubPage name="Brief Detail" phase="4" />} />
      <Route path="/app/reports" component={() => <StubPage name="Reports" phase="4" />} />
      <Route path="/app/benchmarks" component={() => <StubPage name="Benchmark Memory" phase="5" />} />
      <Route path="/app/change-watch" component={() => <StubPage name="Change Watch" phase="5" />} />
      <Route path="/app/settings" component={() => <StubPage name="Settings" phase="4" />} />
      <Route component={() => <StubPage name="Page Not Found" />} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <WorkspaceProvider>
            <AppShell>
              <Router />
            </AppShell>
          </WorkspaceProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
