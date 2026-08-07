// ─── MST · Cross-Map ────────────────────────────────────────────────
// Merges the former Concept Map (concepts → strategy pillars) and
// Crossmap Results (planned matrix cells → observed performance) into
// one Cross-Map surface with two tabs. Both underlying views are
// unchanged real data; richer dynamic visualization (heatmaps, position
// maps, avatar tiles, trend/pattern charts) is a planned P2 deepening —
// noted honestly rather than faked here.

import { useState } from "react";
import { ModuleHeader, ModuleTabs } from "../shared";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { ConceptMapView } from "./ConceptMapView";
import { CrossmapResultsView } from "./CrossmapResultsView";
import { Network, GitMerge } from "lucide-react";

type Tab = "concept" | "crossmap";

const TAB_CONTENT: Record<Tab, { section: string; title: string; subtitle: string }> = {
  concept: {
    section: "MST · 06",
    title: "Concept Map",
    subtitle: "Concepts mapped to pillars — dynamic cross-tile visualization (heatmaps, position maps, avatar tiles, trend/pattern charts) is planned but not yet built; this shows the underlying joins today.",
  },
  crossmap: {
    section: "MST · 07",
    title: "Crossmap Results",
    subtitle: "Planned cells × actual delivery — dynamic cross-tile visualization (heatmaps, position maps, avatar tiles, trend/pattern charts) is planned but not yet built; this shows the underlying joins today.",
  },
};

// This surface merges the former Concept Map and Crossmap Results pages
// into one tabbed view. It owns the single <ModuleHeader> for both tabs —
// ConceptMapView/CrossmapResultsView are mounted with renderHeader={false}
// so the title never renders twice (once here, once inside the child).
export function MstCrossMapView() {
  const [tab, setTab] = useState<Tab>("concept");
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const content = TAB_CONTENT[tab];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={content.section}
        title={content.title}
        subtitle={content.subtitle}
        account={account ?? undefined}
      />
      <ModuleTabs
        tabs={[
          { id: "concept", label: "Concept Map", Icon: Network },
          { id: "crossmap", label: "Crossmap Results", Icon: GitMerge },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />
      <div className="flex-1 flex flex-col min-h-0">
        {tab === "concept" ? <ConceptMapView renderHeader={false} /> : <CrossmapResultsView renderHeader={false} />}
      </div>
    </div>
  );
}
