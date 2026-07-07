# Surgical UI and UX Overhaul for the Metrix IAP Replit App

## Verified scope and hard constraints

The highest-confidence requirements are clear from your brief and the visible problems already surfaced from the recording: the app needs a navigation re-architecture around six primary layers, cleanup of duplicated and overlapping labels, hard preservation of event-table-backed data flows, continued visibility of `DataSourceBadge` in both development and production, and honest placeholder states wherever live production data is missing. The correct operating model is not “polish the old UI,” but “stabilize the live implementation around a clean route tree, a single source of navigation truth, and badge counts that come from real repository selectors only.” 

One limitation matters: I could not directly fetch the public Replit app URL through the browsing layer in this environment. Multiple attempts to open the live app returned a cache-miss failure, so I cannot honestly claim I verified the current deployed DOM or exact runtime bundle structure from the public URL itself. citeturn9view0turn2view0

Because I also could not query the uploaded repository archive directly from this environment, I cannot responsibly name exact file paths as confirmed facts. What I *can* do is give you the most likely surgical touchpoints, a route and component architecture that matches the live problems shown in the recording, and drop-in TypeScript/React patterns that a Replit agent can apply with minimal adaptation.

## What the recording indicates is broken

From the visible state you described and the earlier review of the screen recording in this thread, the UI problems are not random. They cluster into four failure modes.

The first is **information architecture drift**. The sidebar appears to be rendering overlapping layer labels, repeated stage text, and mixed concepts of “loop stage,” “section title,” and “actual page route.” That usually happens when a product has more than one nav source of truth: for example, one enum for stage ribbons, another flat array for sidebar items, and a third set of hardcoded labels inside page shells.

The second is **active-state ambiguity**. If the sidebar is not driven by route ancestry and a single nav schema, it is easy for both a parent label and a child item to appear active, or for route-adjacent items to inherit the wrong highlight state. React Router’s design strongly favors nested route trees with child rendering through `<Outlet />`, plus `NavLink` for active handling; it explicitly documents that child routes inherit the parent path and render through the parent’s outlet, while `NavLink` applies active state classes and `aria-current="page"` automatically. citeturn17view0turn16view1

The third is **data-source leakage**. The symptoms you called out around `ReviewQueue`, `IntelligenceCards`, and `BSIL Suggestions` are classic signs that UI labels, counts, and row filters are not all reading from the same selector layer. When the header says one thing and the table shows another, it usually means the badge count, page title, and row collection are being computed in different places.

The fourth is **display logic gated by environment instead of data**. The specific concern around `DataSourceBadge` strongly suggests that visibility was previously controlled by an environment shortcut rather than by whether source metadata actually exists. React’s own guidance on conditional rendering is simple: render different UI based on real conditions, not on arbitrary branches that hide meaningful state from real users. citeturn15view2

## The navigation architecture that should replace the current sidebar

The correct fix is a **single navigation schema** that drives both the sidebar and the top-level stage awareness. Do not let pages define their own sidebar labels. Do not let badges be computed inside random card components. Do not let parent section labels double as page links unless they actually route somewhere.

For your structure, the clean route model is:

| Primary layer | Child pages | Recommended route pattern | Badge source |
|---|---|---|---|
| Listen | Alerts, Signals, Suggestions | `/listen/alerts`, `/listen/signals`, `/listen/suggestions` | Alerts from ReviewQueue open count; Signals from active IntelligenceCards count; Suggestions from pending BSIL count |
| Analysis | Overview, Concept Library, Creative Map, Audience, Placements | `/analysis`, `/analysis/concept-library`, `/analysis/creative-map`, `/analysis/audience`, `/analysis/placements` | No badge by default unless you have a real pending-review count |
| Strategy | Overview, Strategy Map, Avatars/ICP, Hypothesis Queue, Brief Builder | `/strategy`, `/strategy/map`, `/strategy/avatars`, `/strategy/hypothesis-queue`, `/strategy/brief-builder` | Brief Builder may show in-review brief count if real |
| Report Builder | None, or internal tabs only | `/reports` | No badge unless export jobs are real |
| MST | None in sidebar; internal page tabs allowed | `/mst` | Active or pending sprint count if real |
| Metrix Agent | None in sidebar | `/agent` | Only unread task or unresolved action count if real |

That structure should be implemented as nested parent routes. React Router documents that nested routes create parent/child URLs naturally, and that children render through the parent route’s `<Outlet />`. That is exactly the mechanism you want for a single sidebar with parent grouping and child page content. citeturn17view0

For active styling, use `NavLink` rather than bespoke route matching wherever possible. React Router’s `NavLink` automatically applies active and pending classes and sets `aria-current="page"` on the active link, which is the cleanest way to prevent multiple conflicting “active” states in a nested sidebar. citeturn16view1turn16view2

For markup and accessibility, the main six-layer IAP spine should be represented as a navigation region with structured lists. W3C’s guidance is to identify menus with `<nav>`, label them clearly, and use list markup to convey menu structure. It also notes that ordered lists are suitable where sequence matters, which fits a numbered IAP loop; sub-navigation can sit within nested unordered lists. The same W3C guidance also says that visible menu structure should stay consistent across screen sizes, even if some items collapse. citeturn18view3

For expandable parent groups, WAI-ARIA’s disclosure-navigation pattern is the right model: a button controls the visibility of the child list with `aria-controls` and `aria-expanded`, while the active child link carries `aria-current="page"`. citeturn15view1

## The most likely files to change and how to find them surgically

Because I could not inspect the archive directly, I cannot give you a false-precision answer like “edit `src/components/Sidebar.tsx`” unless I have seen it. The right way to handle this is to identify the likely touchpoints and let Replit patch only those.

In a React/Vite or React Router codebase like this, the files responsible are usually in five buckets:

The first bucket is **route registration**. This is typically one of `app/routes.ts`, `src/router.tsx`, `src/routes.tsx`, `src/App.tsx`, or a workspace layout route file.

The second bucket is **app shell and sidebar rendering**. That is often one of `Sidebar.tsx`, `WorkspaceSidebar.tsx`, `AppShell.tsx`, `WorkspaceLayout.tsx`, or `WorkspaceChrome.tsx`.

The third bucket is **nav data and badge selectors**. If the app is even moderately organized, these may live in `nav.ts`, `navigation.ts`, `sidebar.config.ts`, `useNavBadges.ts`, `selectors.ts`, or a `workspaceSummary` hook.

The fourth bucket is **page-level aggregators** for the items you explicitly care about: `ReviewQueue`, `IntelligenceCards`, `BSIL Suggestions`, and `DataSourceBadge`.

The fifth bucket is **page shells** for missing routes or inconsistent empty states.

The quickest accurate repo sweep is to search for the components and domain terms that are already known to exist:

```bash
rg -n "DataSourceBadge|ReviewQueue|IntelligenceCards|BSIL|Suggestions|sidebar|NavLink|createBrowserRouter|Routes|Outlet|workspace" src app
```

If the repo has a centralized stage enum or nav array, it will usually turn up immediately with:

```bash
rg -n "Listen|Analysis|Strategy|Report Builder|MST|Metrix Agent|ONBOARD|REVIEW|APPROVE" src app
```

That is the surgical entry point. Do not let Replit refactor blindly beyond those hits.

## The implementation package I would have Replit apply

The safest implementation is to create a single `navTree` definition, route parents for `listen`, `analysis`, and `strategy`, and a dedicated badge hook that reads from the real selector layer. The code below is deliberately surgical: it stabilizes the interface without changing your schema, your event-table wiring, or your domain logic.

### Navigation schema

This centralizes labels, children, destination paths, and badge keys. It also prevents duplicate labels because the sidebar no longer composes labels from multiple places.

```tsx
// src/navigation/navTree.ts
export type NavBadgeKey =
  | "alerts"
  | "signals"
  | "suggestions"
  | "briefs"
  | "mst"
  | "agent"
  | null;

export type NavChild = {
  id: string;
  label: string;
  to: string;
  badgeKey?: NavBadgeKey;
  placeholder?: "No production data connected yet" | "Pending Stage 2 implementation";
};

export type NavSection = {
  id: string;
  number: string;
  label: string;
  children?: NavChild[];
  to?: string;
  badgeKey?: NavBadgeKey;
};

export const navTree: NavSection[] = [
  {
    id: "listen",
    number: "01",
    label: "Listen",
    children: [
      { id: "listen-alerts", label: "Alerts", to: "/listen/alerts", badgeKey: "alerts" },
      { id: "listen-signals", label: "Signals", to: "/listen/signals", badgeKey: "signals" },
      { id: "listen-suggestions", label: "Suggestions", to: "/listen/suggestions", badgeKey: "suggestions" },
    ],
  },
  {
    id: "analysis",
    number: "02",
    label: "Analysis",
    children: [
      { id: "analysis-overview", label: "Overview", to: "/analysis" },
      { id: "analysis-concept-library", label: "Concept Library", to: "/analysis/concept-library" },
      { id: "analysis-creative-map", label: "Creative Map", to: "/analysis/creative-map" },
      { id: "analysis-audience", label: "Audience", to: "/analysis/audience" },
      { id: "analysis-placements", label: "Placements", to: "/analysis/placements" },
    ],
  },
  {
    id: "strategy",
    number: "03",
    label: "Strategy",
    children: [
      { id: "strategy-overview", label: "Overview", to: "/strategy" },
      { id: "strategy-map", label: "Strategy Map", to: "/strategy/map" },
      { id: "strategy-avatars", label: "Avatars / ICP", to: "/strategy/avatars" },
      { id: "strategy-hypothesis-queue", label: "Hypothesis Queue", to: "/strategy/hypothesis-queue" },
      { id: "strategy-brief-builder", label: "Brief Builder", to: "/strategy/brief-builder", badgeKey: "briefs" },
    ],
  },
  {
    id: "reports",
    number: "04",
    label: "Report Builder",
    to: "/reports",
  },
  {
    id: "mst",
    number: "05",
    label: "MST",
    to: "/mst",
    badgeKey: "mst",
  },
  {
    id: "agent",
    number: "06",
    label: "Metrix Agent",
    to: "/agent",
    badgeKey: "agent",
  },
];
```

### Sidebar component

Use one navigation region, an ordered list for the main numbered loop, and disclosure buttons only for groups with children. This follows W3C guidance for structured menus and aligns with the disclosure-navigation pattern for parent-child sections. citeturn18view3turn15view1

```tsx
// src/navigation/WorkspaceSidebar.tsx
import { NavLink, matchPath, useLocation } from "react-router-dom";
import { useId, useMemo, useState } from "react";
import { navTree } from "./navTree";
import { useNavBadges } from "./useNavBadges";

function Badge({ count }: { count?: number | null }) {
  if (count == null || count <= 0) return null;
  return <span className="nav-badge">{count}</span>;
}

export function WorkspaceSidebar() {
  const location = useLocation();
  const badgeCounts = useNavBadges();

  const activeParents = useMemo(() => {
    const set = new Set<string>();
    for (const section of navTree) {
      if (section.to && matchPath({ path: section.to, end: section.to !== "/" }, location.pathname)) {
        set.add(section.id);
      }
      for (const child of section.children ?? []) {
        if (matchPath({ path: child.to, end: child.to === "/analysis" || child.to === "/strategy" }, location.pathname)) {
          set.add(section.id);
        }
      }
    }
    return set;
  }, [location.pathname]);

  return (
    <aside className="sidebar" aria-label="Workspace sidebar">
      <nav aria-label="Main workspace navigation">
        <ol className="nav-sections">
          {navTree.map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              active={activeParents.has(section.id)}
              badgeCounts={badgeCounts}
            />
          ))}
        </ol>
      </nav>
    </aside>
  );
}

function SidebarSection({
  section,
  active,
  badgeCounts,
}: {
  section: (typeof navTree)[number];
  active: boolean;
  badgeCounts: Record<string, number | null>;
}) {
  const controlsId = useId();
  const [open, setOpen] = useState(active);

  const showChildren = !!section.children?.length;

  if (!showChildren && section.to) {
    return (
      <li className="nav-section">
        <NavLink
          to={section.to}
          end
          className={({ isActive }) => `nav-item nav-parent ${isActive ? "on" : ""}`}
        >
          <span className="nav-kicker">{section.number}</span>
          <span className="nav-label">{section.label}</span>
          <Badge count={section.badgeKey ? badgeCounts[section.badgeKey] : null} />
        </NavLink>
      </li>
    );
  }

  return (
    <li className={`nav-section ${active ? "expanded" : ""}`}>
      <button
        type="button"
        className={`nav-item nav-parent ${active ? "on" : ""}`}
        aria-expanded={open}
        aria-controls={controlsId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nav-kicker">{section.number}</span>
        <span className="nav-label">{section.label}</span>
      </button>

      <ul id={controlsId} className="nav-children" hidden={!open}>
        {section.children?.map((child) => (
          <li key={child.id}>
            <NavLink
              to={child.to}
              end={child.to === "/analysis" || child.to === "/strategy"}
              className={({ isActive }) => `nav-item nav-child ${isActive ? "on" : ""}`}
            >
              <span className="nav-label">{child.label}</span>
              <Badge count={child.badgeKey ? badgeCounts[child.badgeKey] : null} />
            </NavLink>
          </li>
        ))}
      </ul>
    </li>
  );
}
```

### Route tree

If the app uses React Router’s nested routes, parent layout routes are the cleanest way to keep the sidebar stable while child pages swap into the content area. React Router documents that nested routes inherit the parent path and render via `<Outlet />`. citeturn17view0

```tsx
// src/router.tsx
import { createBrowserRouter, Navigate } from "react-router-dom";
import { WorkspaceLayout } from "./layout/WorkspaceLayout";
import { ListenLayout } from "./pages/listen/ListenLayout";
import { AnalysisLayout } from "./pages/analysis/AnalysisLayout";
import { StrategyLayout } from "./pages/strategy/StrategyLayout";

import { AlertsPage } from "./pages/listen/AlertsPage";
import { SignalsPage } from "./pages/listen/SignalsPage";
import { SuggestionsPage } from "./pages/listen/SuggestionsPage";

import { AnalysisOverviewPage } from "./pages/analysis/AnalysisOverviewPage";
import { ConceptLibraryPage } from "./pages/analysis/ConceptLibraryPage";
import { CreativeMapPage } from "./pages/analysis/CreativeMapPage";
import { AudiencePage } from "./pages/analysis/AudiencePage";
import { PlacementsPage } from "./pages/analysis/PlacementsPage";

import { StrategyOverviewPage } from "./pages/strategy/StrategyOverviewPage";
import { StrategyMapPage } from "./pages/strategy/StrategyMapPage";
import { AvatarsPage } from "./pages/strategy/AvatarsPage";
import { HypothesisQueuePage } from "./pages/strategy/HypothesisQueuePage";
import { BriefBuilderPage } from "./pages/strategy/BriefBuilderPage";

import { ReportBuilderPage } from "./pages/reports/ReportBuilderPage";
import { MstPage } from "./pages/mst/MstPage";
import { AgentPage } from "./pages/agent/AgentPage";

export const router = createBrowserRouter([
  {
    path: "/app/workspaces/:workspaceId",
    element: <WorkspaceLayout />,
    children: [
      { index: true, element: <Navigate to="listen/alerts" replace /> },

      {
        path: "listen",
        element: <ListenLayout />,
        children: [
          { index: true, element: <Navigate to="alerts" replace /> },
          { path: "alerts", element: <AlertsPage /> },
          { path: "signals", element: <SignalsPage /> },
          { path: "suggestions", element: <SuggestionsPage /> },
        ],
      },

      {
        path: "analysis",
        element: <AnalysisLayout />,
        children: [
          { index: true, element: <AnalysisOverviewPage /> },
          { path: "concept-library", element: <ConceptLibraryPage /> },
          { path: "creative-map", element: <CreativeMapPage /> },
          { path: "audience", element: <AudiencePage /> },
          { path: "placements", element: <PlacementsPage /> },
        ],
      },

      {
        path: "strategy",
        element: <StrategyLayout />,
        children: [
          { index: true, element: <StrategyOverviewPage /> },
          { path: "map", element: <StrategyMapPage /> },
          { path: "avatars", element: <AvatarsPage /> },
          { path: "hypothesis-queue", element: <HypothesisQueuePage /> },
          { path: "brief-builder", element: <BriefBuilderPage /> },
        ],
      },

      { path: "reports", element: <ReportBuilderPage /> },
      { path: "mst", element: <MstPage /> },
      { path: "agent", element: <AgentPage /> },
    ],
  },
]);
```

### Real badge mapping only

The sidebar should not fetch its own data ad hoc. It should use one badge hook that reads from the same repository selectors the pages already use. If a selector does not exist, the badge should disappear rather than fabricate counts. React’s conditional rendering model is the right fit for this: include or exclude the badge element based on real data. citeturn15view2

```tsx
// src/navigation/useNavBadges.ts
import { useMemo } from "react";
import { useWorkspaceReviewQueue } from "../data/useWorkspaceReviewQueue";
import { useWorkspaceIntelligenceCards } from "../data/useWorkspaceIntelligenceCards";
import { useWorkspaceBsilSuggestions } from "../data/useWorkspaceBsilSuggestions";
import { useWorkspaceBriefs } from "../data/useWorkspaceBriefs";
import { useWorkspaceMstSprints } from "../data/useWorkspaceMstSprints";
import { useWorkspaceAgentInbox } from "../data/useWorkspaceAgentInbox";

export function useNavBadges() {
  const reviewQueue = useWorkspaceReviewQueue();
  const intelligence = useWorkspaceIntelligenceCards();
  const bsil = useWorkspaceBsilSuggestions({
    scopes: ["campaign", "ad_set"], // preserve BSIL scope constraint
  });
  const briefs = useWorkspaceBriefs();
  const mst = useWorkspaceMstSprints();
  const agent = useWorkspaceAgentInbox();

  return useMemo(
    () => ({
      alerts: reviewQueue.data?.filter((x) => x.status === "open").length ?? null,
      signals: intelligence.data?.filter((x) => x.state === "active").length ?? null,
      suggestions:
        bsil.data?.filter(
          (x) =>
            x.status === "pending" &&
            (x.scope === "campaign" || x.scope === "ad_set")
        ).length ?? null,
      briefs: briefs.data?.filter((x) => x.status === "in_review").length ?? null,
      mst: mst.data?.filter((x) => x.status === "active" || x.status === "pending").length ?? null,
      agent: agent.data?.filter((x) => !x.read).length ?? null,
    }),
    [reviewQueue.data, intelligence.data, bsil.data, briefs.data, mst.data, agent.data]
  );
}
```

### Honest placeholder pages

Where live production data does not exist, do not seed fake stats. Render a clean empty state. That is entirely consistent with React’s conditional rendering model. citeturn15view2

```tsx
// src/components/StagePlaceholder.tsx
export function StagePlaceholder({
  title,
  message = "No production data connected yet",
}: {
  title: string;
  message?: "No production data connected yet" | "Pending Stage 2 implementation";
}) {
  return (
    <section className="empty-state">
      <header className="page-header">
        <h1>{title}</h1>
      </header>
      <div className="empty-card">
        <p>{message}</p>
      </div>
    </section>
  );
}
```

### DataSourceBadge patch

If the component still contains an environment-based early return, remove it. Visibility should be driven by the presence of source metadata, not by build mode.

```tsx
// src/components/DataSourceBadge.tsx
import { useState } from "react";

type SourceItem = {
  label: string;
  value?: string;
};

export function DataSourceBadge({ sources }: { sources?: SourceItem[] | null }) {
  const [open, setOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="data-source-badge">
      <button
        type="button"
        className="data-source-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Data source
      </button>

      {open ? (
        <ul className="data-source-list">
          {sources.map((source) => (
            <li key={`${source.label}:${source.value ?? ""}`}>
              <strong>{source.label}</strong>
              {source.value ? ` — ${source.value}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

## How the data should map to the repaired navigation

This is the part that matters most for integrity.

The **Listen / Alerts** page should be the home for open or unresolved review items. If `ReviewQueue` is already the actionable review surface, it becomes the data source for the Alerts page and its badge. Do not compute the Alerts badge from a separate dashboard summary if the page itself reads from `ReviewQueue`; page rows and nav badge should share exactly the same selector.

The **Listen / Signals** page should be the home for `IntelligenceCards` or whichever repository layer stores signal observations, anomalies, confidence, and quality indicators. If the current dashboard cards summarize those signals, use the same source here, not a second aggregation path.

The **Listen / Suggestions** page should be the home for `BSIL Suggestions`, but the filter must stay strict: campaign and ad-set scope only. If a current suggestions query mixes creative-level objects into the result set, that query belongs on another page, not here. The header count, badge count, and visible rows must all read from the same post-filtered collection.

The **Analysis** group should hold interpretive and structural views: concept library, creative map, audience, placements. If those data streams are not all live, leave the routes in place and show empty-state shells rather than synthetic numbers.

The **Strategy** group is where downstream translation belongs: strategy map, ICPs, hypotheses, and brief generation. If a page exists but is not live, preserve the route and render an honest placeholder.

The **MST** and **Metrix Agent** routes can remain single entries in the sidebar. If they already contain tabs internally, keep them there rather than bloating the sidebar.

## What Replit should return before you accept the change

Your merge gate should be blunt.

The sidebar should render one parent label per section, no repeated stage text, no visual overlaps, and exactly one active child state at a time. The navigation should be implemented as a single `<nav>` tree with consistent wording across responsive states, which is in line with W3C guidance for structured, labeled navigation. citeturn18view3turn15view1

Parent sections with children should expand and collapse via disclosure buttons using `aria-expanded` and `aria-controls`. Active child links should carry `aria-current="page"` through `NavLink`, not through custom duplicated logic. citeturn15view1turn16view1

Child routes should sit under parent routes and render through `<Outlet />`, not through page-local switch statements or duplicated layout shells. React Router explicitly recommends this nested route model. citeturn17view0

The Replit implementation report should tell you five things only: which files it changed, which current routes it reused, which new routes are placeholders, which repository selectors drive the badges, and whether build, lint, and typecheck passed. If it starts talking about “improved design consistency” without proving those five items, do not accept the patch.

My bottom-line recommendation is this: **approve only a surgical nav-and-data-source refactor, not a visual rewrite**. The highest-confidence stabilization path is a single nav schema, nested routes, `NavLink` active-state control, disclosure-based parent groups, repository-backed badge selectors, and strict empty-state rendering where live data does not exist. That is the smallest change set that actually fixes the structural problems visible in the recording while preserving the repository logic you explicitly told Replit not to break.