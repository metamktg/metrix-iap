// ─── First-run onboarding wizard ───────────────────────────────────────
// Shown only in place of the Manager Suite (agency-level) overview when a
// user has zero ad accounts granted/connected — the same signal
// ManagerOverview already used for its old single-card empty state. This
// replaces that card with a guided, back/next orientation: what the
// Manager Suite is, what to export from Meta, and a hand-off into the
// existing AddAccountDialog (which already owns the real account-creation
// and upload mutations — nothing here duplicates that logic).

import { useState } from "react";
import {
  Compass,
  FileSpreadsheet,
  Images,
  Plug,
  Plus,
  ArrowRight,
  ArrowLeft,
  LayoutGrid,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddAccountDialog } from "./AddAccountDialog";
import { PrimaryBtn, GhostBtn } from "./ConnectAccountDialogs";
import { RequiredFormatPanel } from "./ManualAnalysisControls";

type Step = "welcome" | "prepare" | "link";

const STEPS: Step[] = ["welcome", "prepare", "link"];

function StepDots({ step }: { step: Step }) {
  const idx = STEPS.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i < idx ? "w-1.5 bg-emerald-400/60" : i === idx ? "w-5 bg-primary/70" : "w-1.5 bg-border/40"
          )}
        />
      ))}
    </div>
  );
}

function IconTile({ icon: Icon }: { icon: typeof Compass }) {
  return (
    <div className="w-12 h-12 rounded-xl border border-primary/25 bg-primary/10 flex items-center justify-center mx-auto">
      <Icon className="w-5 h-5 text-interactive" />
    </div>
  );
}

export function OnboardingWizard({ managerName }: { managerName: string }) {
  const [step, setStep] = useState<Step>("welcome");
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12 overflow-y-auto">
      <div className="max-w-2xl w-full">
        <StepDots step={step} />

        {step === "welcome" && (
          <div className="max-w-md mx-auto text-center space-y-5">
            <IconTile icon={Compass} />
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-foreground">Welcome to {managerName}</h2>
              <p className="text-body text-muted-foreground/80 leading-relaxed">
                A quick orientation before you link your first ad account.
              </p>
            </div>
            <div className="text-left space-y-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
              <div className="flex items-start gap-2.5">
                <LayoutGrid className="w-4 h-4 text-interactive shrink-0 mt-0.5" />
                <p className="text-caption text-foreground/85 leading-relaxed">
                  <span className="font-medium text-foreground">Manager Suite</span> — the page you're on
                  now. It rolls up blended performance across every ad account you connect. Nothing here is
                  editable directly; it's a read-only summary.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Boxes className="w-4 h-4 text-interactive shrink-0 mt-0.5" />
                <p className="text-caption text-foreground/85 leading-relaxed">
                  <span className="font-medium text-foreground">Ad accounts</span> — each one holds its own
                  creatives, imported data, and the full IAP Loop (Analysis → Strategy → Briefs → MST →
                  Optimization). This is where the real work happens.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Plug className="w-4 h-4 text-interactive shrink-0 mt-0.5" />
                <p className="text-caption text-foreground/85 leading-relaxed">
                  You'll link <span className="font-medium text-foreground">one ad account</span> to get
                  started — live via Meta, or manual CSV upload. You can add more from here anytime.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <GhostBtn onClick={() => setAddOpen(true)}>Skip guide</GhostBtn>
              <PrimaryBtn onClick={() => setStep("prepare")}>
                Next <ArrowRight className="w-3.5 h-3.5" />
              </PrimaryBtn>
            </div>
          </div>
        )}

        {step === "prepare" && (
          <div className="space-y-5">
            <div className="text-center space-y-1.5">
              <IconTile icon={FileSpreadsheet} />
              <h2 className="text-base font-semibold text-foreground">What you'll need from Meta</h2>
              <p className="text-body text-muted-foreground/80 leading-relaxed max-w-lg mx-auto">
                Connecting live via Meta needs nothing to prepare — you'll authorize read-only access in the
                next step. Uploading manual reports needs two exports pulled from Meta Ads Manager first.
              </p>
            </div>

            <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4 space-y-3">
              <div className="text-caption font-semibold text-foreground/90">
                Pulling the two required CSVs from Meta Ads Manager
              </div>
              <ol className="text-caption text-foreground/80 leading-relaxed space-y-1.5 list-decimal list-inside">
                <li>Open Ads Manager (or Ads Reporting) for the ad account and set the date range to export.</li>
                <li>
                  Add a <span className="font-medium text-foreground">breakdown</span>: for the Demographics
                  export use <span className="font-mono text-foreground/90">Age</span> and{" "}
                  <span className="font-mono text-foreground/90">Gender</span>; for the Placements export use{" "}
                  <span className="font-mono text-foreground/90">Impression device</span>,{" "}
                  <span className="font-mono text-foreground/90">Platform</span>, and{" "}
                  <span className="font-mono text-foreground/90">Placement</span>. Meta applies one breakdown
                  combination per export, so this needs to be done twice.
                </li>
                <li>
                  Make sure <span className="font-mono text-foreground/90">Date</span>,{" "}
                  <span className="font-mono text-foreground/90">Campaign name</span>,{" "}
                  <span className="font-mono text-foreground/90">Ad set name</span>, and{" "}
                  <span className="font-mono text-foreground/90">Ad name</span> are included as columns, along
                  with your performance metrics (spend, impressions, clicks, results).
                </li>
                <li>Export → Export table data → CSV. The exact columns required are below.</li>
              </ol>
            </div>

            <div className="space-y-2">
              <RequiredFormatPanel csvClass="demographic" />
              <RequiredFormatPanel csvClass="device_placement" />
              <RequiredFormatPanel csvClass="ad_summary" />
            </div>

            <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.05] p-3 flex items-start gap-2.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
              <p className="text-caption text-amber-200/90 leading-relaxed">
                Meta's demographic/placement exports undercount spend due to iOS privacy limits. The Ad
                Summary CSV above is optional but recommended — it carries full, accurate spend totals.
              </p>
            </div>

            <div className="rounded-lg border border-border/40 bg-white/[0.02] p-3 flex items-start gap-2.5">
              <Images className="w-3.5 h-3.5 text-interactive shrink-0 mt-0.5" />
              <p className="text-caption text-foreground/80 leading-relaxed">
                You'll also upload your creative files (images/videos) individually — no ZIP files — and map
                each one to its ad name. That happens right after the CSVs, in the next step.
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <GhostBtn onClick={() => setStep("welcome")}>
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </GhostBtn>
              <PrimaryBtn onClick={() => setStep("link")}>
                Next <ArrowRight className="w-3.5 h-3.5" />
              </PrimaryBtn>
            </div>
          </div>
        )}

        {step === "link" && (
          <div className="max-w-md mx-auto text-center space-y-5">
            <IconTile icon={Plug} />
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-foreground">Link your first ad account</h2>
              <p className="text-body text-muted-foreground/80 leading-relaxed">
                Connect Meta directly, or create a manual account and upload the reports you just prepared.
                Once it's linked, this page becomes your live Manager Suite dashboard.
              </p>
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-md bg-primary/15 border border-primary/30 text-interactive text-body font-medium hover:bg-primary/25 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Ad Account
            </button>
            <div className="flex items-center justify-center pt-1">
              <GhostBtn onClick={() => setStep("prepare")}>
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </GhostBtn>
            </div>
          </div>
        )}
      </div>

      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
