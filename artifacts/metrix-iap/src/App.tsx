import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { AppShell } from "@/components/layout/AppShell";
import { StagePlaceholder } from "@/pages/StagePlaceholder";

// Pages
import { MasterCommandCenter } from "@/pages/MasterCommandCenter";
import { WorkspaceHome } from "@/pages/WorkspaceHome";
import { IAPRunBuilder } from "@/pages/IAPRunBuilder";
import { RunDetail } from "@/pages/RunDetail";
import { BriefEngine } from "@/pages/BriefEngine";
import { BriefDetail } from "@/pages/BriefDetail";
import { CreativeLibrary } from "@/pages/CreativeLibrary";
import { Reports } from "@/pages/Reports";
import { ImportCenter } from "@/pages/ImportCenter";
import { AccountIntelligence } from "@/pages/AccountIntelligence";
import { AccountDetail } from "@/pages/AccountDetail";
import { BenchmarkMemoryPage } from "@/pages/BenchmarkMemory";
import { ChangeWatch } from "@/pages/ChangeWatch";
import { Settings } from "@/pages/Settings";
import { IntelligenceCards } from "@/pages/IntelligenceCards";
import { BSILSuggestions } from "@/pages/BSILSuggestions";
import { ReviewQueue } from "@/pages/ReviewQueue";
import { LearningRegistry } from "@/pages/LearningRegistry";
import { CohortSettings } from "@/pages/CohortSettings";
import { RunsList } from "@/pages/RunsList";
import { MST } from "@/pages/MST";
import { MetrixAgent } from "@/pages/MetrixAgent";

// Seed-hydrated Metrix pages (manager → ad-account hierarchy)
import { AccountProvider } from "@/contexts/AccountContext";
import { ManagerOverview } from "@/pages/metrix/ManagerOverview";
import { AdAccountOverview } from "@/pages/metrix/AdAccountOverview";
import { ListenView } from "@/pages/metrix/ListenView";
import { AnalysisView } from "@/pages/metrix/AnalysisView";
import { StrategyView } from "@/pages/metrix/StrategyView";
import { BriefBuilderView } from "@/pages/metrix/BriefBuilderView";
import { ReportBuilderView } from "@/pages/metrix/ReportBuilderView";
import { MSTView } from "@/pages/metrix/MSTView";
import { SettingsView } from "@/pages/metrix/SettingsView";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});

function Router() {
  return (
    <Switch>
      {/* ── Manager → Ad Account hierarchy (seed-hydrated) ─────────────── */}
      <Route path="/" component={ManagerOverview} />
      <Route path="/app/account"                component={AdAccountOverview} />
      <Route path="/app/listen"                 component={ListenView} />
      <Route path="/app/analysis"               component={AnalysisView} />
      <Route path="/app/strategy"               component={StrategyView} />
      <Route path="/app/strategy/brief-builder" component={BriefBuilderView} />
      <Route path="/app/report-builder"         component={ReportBuilderView} />
      <Route path="/app/mst"                    component={MSTView} />
      <Route path="/app/settings"               component={SettingsView} />

      {/* ── Legacy master command center (deep-link compat) ───────────── */}
      <Route path="/app/master" component={MasterCommandCenter} />

      {/* ── 01 LISTEN ──────────────────────────────────────────────── */}
      <Route path="/app/listen/alerts"      component={ReviewQueue} />
      <Route path="/app/listen/signals"     component={IntelligenceCards} />
      <Route path="/app/listen/suggestions" component={BSILSuggestions} />

      {/* ── 02 ANALYSIS ────────────────────────────────────────────── */}
      {/* Overview → Account Intelligence (primary analysis dashboard) */}
      <Route path="/app/analysis"           component={AccountIntelligence} />
      <Route path="/app/analysis/account-detail/:adAccountId" component={AccountDetail} />
      <Route path="/app/analysis/concept-library">
        {() => (
          <StagePlaceholder
            title="Concept Library"
            section="Analysis · 02"
            message="No production data connected yet"
            dataSource="creative_alignment_checks"
            action={{ label: "Run an analysis first", href: "/app/analysis/runs" }}
          />
        )}
      </Route>
      <Route path="/app/analysis/creative-map">
        {() => (
          <StagePlaceholder
            title="Creative Map"
            section="Analysis · 02"
            message="No production data connected yet"
            dataSource="creative_concepts"
          />
        )}
      </Route>
      <Route path="/app/analysis/audience">
        {() => (
          <StagePlaceholder
            title="Audience"
            section="Analysis · 02"
            message="No production data connected yet"
            dataSource="client_enabled_cohorts"
          />
        )}
      </Route>
      <Route path="/app/analysis/placements">
        {() => (
          <StagePlaceholder
            title="Placements"
            section="Analysis · 02"
            message="No production data connected yet"
            dataSource="fact_ad_insights_daily"
          />
        )}
      </Route>
      {/* Run pipeline (accessible from Analysis Overview page) */}
      <Route path="/app/analysis/runs"          component={RunsList} />
      <Route path="/app/analysis/runs/:runId"   component={RunDetail} />

      {/* ── 03 STRATEGY ────────────────────────────────────────────── */}
      <Route path="/app/strategy">
        {() => (
          <StagePlaceholder
            title="Strategy Overview"
            section="Strategy · 03"
            message="Pending Stage 2 implementation"
          />
        )}
      </Route>
      <Route path="/app/strategy/map">
        {() => (
          <StagePlaceholder
            title="Strategy Map"
            section="Strategy · 03"
            message="Pending Stage 2 implementation"
          />
        )}
      </Route>
      <Route path="/app/strategy/avatars">
        {() => (
          <StagePlaceholder
            title="Avatars / ICP"
            section="Strategy · 03"
            message="Pending Stage 2 implementation"
            dataSource="icp_profiles"
          />
        )}
      </Route>
      <Route path="/app/strategy/hypothesis-queue">
        {() => (
          <StagePlaceholder
            title="Hypothesis Queue"
            section="Strategy · 03"
            message="Pending Stage 2 implementation"
          />
        )}
      </Route>
      {/* Brief Builder → BriefEngine (existing real page) */}
      <Route path="/app/strategy/brief-builder"           component={BriefEngine} />
      <Route path="/app/strategy/brief-builder/:briefId"  component={BriefDetail} />

      {/* ── 04 REPORT BUILDER ──────────────────────────────────────── */}
      <Route path="/app/report-builder"                   component={Reports} />
      <Route path="/app/report-builder/cohort-settings"   component={CohortSettings} />
      <Route path="/app/report-builder/import"            component={ImportCenter} />

      {/* ── 05 MST ─────────────────────────────────────────────────── */}
      <Route path="/app/mst" component={MST} />

      {/* ── 06 METRIX AGENT ────────────────────────────────────────── */}
      <Route path="/app/agent" component={MetrixAgent} />

      {/* ── LEGACY ROUTES (backward compat / deep links) ───────────── */}
      <Route path="/app/workspaces/:workspaceId"                          component={WorkspaceHome} />
      <Route path="/app/workspaces/:workspaceId/ad-accounts"              component={AccountIntelligence} />
      <Route path="/app/workspaces/:workspaceId/ad-accounts/:adAccountId" component={AccountDetail} />
      <Route path="/app/workspaces/:workspaceId/imports"                  component={ImportCenter} />
      <Route path="/app/workspaces/:workspaceId/cohort-settings"          component={CohortSettings} />
      <Route path="/app/imports"           component={ImportCenter} />
      <Route path="/app/iap/new"           component={IAPRunBuilder} />
      <Route path="/app/iap/runs"          component={RunsList} />
      <Route path="/app/iap/runs/:runId"   component={RunDetail} />
      <Route path="/app/creative-library"  component={CreativeLibrary} />
      <Route path="/app/briefs"            component={BriefEngine} />
      <Route path="/app/briefs/:briefId"   component={BriefDetail} />
      <Route path="/app/reports"           component={Reports} />
      <Route path="/app/benchmarks"        component={BenchmarkMemoryPage} />
      <Route path="/app/change-watch"      component={ChangeWatch} />
      <Route path="/app/settings"          component={Settings} />
      <Route path="/app/intelligence-cards" component={IntelligenceCards} />
      <Route path="/app/bsil-suggestions"  component={BSILSuggestions} />
      <Route path="/app/review-queue"      component={ReviewQueue} />
      <Route path="/app/learning-registry" component={LearningRegistry} />
      {/* Previous nav iteration legacy routes */}
      <Route path="/app/listen/alerts"       component={ReviewQueue} />
      <Route path="/app/strategy/review-queue" component={ReviewQueue} />
      <Route path="/app/strategy/briefs"       component={BriefEngine} />
      <Route path="/app/strategy/briefs/:briefId" component={BriefDetail} />
      <Route path="/app/strategy/creative-library" component={CreativeLibrary} />
      <Route path="/app/strategy/learning-registry" component={LearningRegistry} />
      <Route path="/app/agent/benchmarks"  component={BenchmarkMemoryPage} />
      <Route path="/app/agent/change-watch" component={ChangeWatch} />

      {/* ── 404 ─────────────────────────────────────────────────────── */}
      <Route>
        {() => (
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="text-center space-y-2">
              <h2 className="text-base font-semibold text-foreground">Page not found</h2>
              <p className="text-xs text-muted-foreground">This route does not exist.</p>
            </div>
          </div>
        )}
      </Route>
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
