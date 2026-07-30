// ─── MST · Cross-Map ────────────────────────────────────────────────
// Merges the former Concept Map (concepts → strategy pillars) and
// Crossmap Results (planned matrix cells → observed performance) into
// one Cross-Map surface with two tabs. Both underlying views are
// unchanged real data; richer dynamic visualization (heatmaps, position
// maps, avatar tiles, trend/pattern charts) is a planned P2 deepening —
// noted honestly rather than faked here.

import { useState } from "react";
import { ModuleTabs, CaveatNote } from "../shared";
import { ConceptMapView } from "./ConceptMapView";
import { CrossmapResultsView } from "./CrossmapResultsView";
import { Network, GitMerge } from "lucide-react";

type Tab = "concept" | "crossmap";

export function MstCrossMapView() {
  const [tab, setTab] = useState<Tab>("concept");

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleTabs<Tab>
        tabs={[
          { id: "concept", label: "Concept Map", Icon: Network },
          { id: "crossmap", label: "Crossmap Results", Icon: GitMerge },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="px-6 pt-2">
        <CaveatNote text="Dynamic cross-tile visualization (heatmaps, position maps, avatar tiles, trend/pattern charts) is planned but not yet built — this shows the underlying joins today." defaultExpanded={false} />
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        {tab === "concept" ? <ConceptMapView /> : <CrossmapResultsView />}
      </div>
    </div>
  );
}
