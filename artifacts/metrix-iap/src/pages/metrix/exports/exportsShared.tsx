// ─── Shared building blocks for the Exports pages ─────────────────────
// The three JSON export views (Analysis / Strategy / Brief) share the same
// download-card shape; keep it in one place instead of three near-copies.

import { useState } from "react";
import { Download, Check, Cloud } from "lucide-react";
import { downloadJson } from "@/lib/jsonExport";
import { SectionCard, CaveatNote } from "../shared";
import { DATA_LIMITED_NOTE } from "@/lib/jsonExport";

export function GoogleDriveComingSoonButton() {
  return (
    <button
      type="button"
      disabled
      title="Google Drive export is coming soon"
      className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/40 text-caption font-medium text-muted-foreground/50 cursor-not-allowed"
    >
      <Cloud className="w-3.5 h-3.5" />
      Google Drive — Coming soon
    </button>
  );
}

export function DataLimitedCaveat() {
  return <CaveatNote source="Data-limited export" text={DATA_LIMITED_NOTE} />;
}

export function JsonExportCard({
  title,
  desc,
  filename,
  data,
  fieldSummary,
}: {
  title: string;
  desc: string;
  filename: string;
  data: unknown;
  fieldSummary: string[];
}) {
  const [downloaded, setDownloaded] = useState(false);
  return (
    <SectionCard title={title} desc={desc}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-caption text-muted-foreground/75 leading-relaxed min-w-0">
          Includes: {fieldSummary.join(", ")}.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              downloadJson(filename, data);
              setDownloaded(true);
            }}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-interactive text-caption font-medium hover:bg-primary/25 transition-colors"
          >
            {downloaded ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            {downloaded ? "Downloaded" : "Download JSON"}
          </button>
          <GoogleDriveComingSoonButton />
        </div>
      </div>
    </SectionCard>
  );
}
