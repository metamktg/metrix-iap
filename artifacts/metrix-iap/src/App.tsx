import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";

// Phase 1 complete — shell and pages coming in Phase 2+
// Placeholder route components rendered until Phase 2 shell is built
function ComingSoon({ name }: { name: string }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="text-xs font-mono text-metrix-cyan uppercase tracking-widest mb-2">
          METRIX IAP — Phase 1 Complete
        </div>
        <h1 className="text-2xl font-bold text-foreground">{name}</h1>
        <p className="text-sm text-muted-foreground">
          Foundation layer built. Shell + screens coming in Phase 2.
        </p>
        <div className="mt-6 text-xs text-muted-foreground font-mono">
          Types ✓ · Mock Data ✓ · Supabase Stub ✓ · Scoring Utils ✓ · Workspace Context ✓
        </div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // mock data never goes stale
      retry: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ComingSoon name="Master Command Center" />} />
      <Route path="/app" component={() => <ComingSoon name="Master Command Center" />} />
      <Route path="/app/workspaces/:workspaceId" component={() => <ComingSoon name="Workspace Home" />} />
      <Route path="/app/workspaces/:workspaceId/ad-accounts" component={() => <ComingSoon name="Ad Accounts" />} />
      <Route path="/app/workspaces/:workspaceId/ad-accounts/:adAccountId" component={() => <ComingSoon name="Account Intelligence" />} />
      <Route path="/app/imports" component={() => <ComingSoon name="Import Center" />} />
      <Route path="/app/iap/new" component={() => <ComingSoon name="IAP Run Builder" />} />
      <Route path="/app/iap/runs/:runId" component={() => <ComingSoon name="IAP Analysis Run" />} />
      <Route path="/app/creative-library" component={() => <ComingSoon name="Creative Intelligence Library" />} />
      <Route path="/app/briefs" component={() => <ComingSoon name="Brief Engine" />} />
      <Route path="/app/briefs/:briefId" component={() => <ComingSoon name="Brief Detail" />} />
      <Route path="/app/reports" component={() => <ComingSoon name="Reports" />} />
      <Route path="/app/benchmarks" component={() => <ComingSoon name="Benchmark Memory — Coming Soon" />} />
      <Route path="/app/change-watch" component={() => <ComingSoon name="Change Watch — Coming Soon" />} />
      <Route path="/app/settings" component={() => <ComingSoon name="Settings" />} />
      <Route component={() => <ComingSoon name="Not Found" />} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <WorkspaceProvider>
            <Router />
          </WorkspaceProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
