// ─── First-run onboarding wizard ───────────────────────────────────────
// Shown only in place of the Manager Suite (agency-level) overview when a
// user has zero ad accounts granted/connected — the same signal
// ManagerOverview already used for its one-line empty state. This replaces
// that card with a guided, back/next orientation: what the Manager Suite
// is, what to export from Meta, and a hand-off into the existing
// AddAccountDialog (which already owns the real account-creation and
// upload mutations — nothing here duplicates that logic).
//
// Styled against the current Nocturne system (TYPE/HEADING from
// ./typography, the flat border/bg-foreground[0.0N] card treatment used
// throughout shared.tsx and ConnectAccountDialogs.tsx) rather than any
// bespoke chrome — the step-indicator dots below are the same pattern
// AddAccountDialog's own multi-step flow already uses.

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
  AlertTriangle,
} from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { AddAccountDialog } from "./AddAccountDialog";
import { PrimaryBtn, GhostBtn } from "./ConnectAccountDialogs";
import { RequiredFormatPanel } from "./ManualAnalysisControls";
import { TYPE, HEADING } from "./typography";

type Step = "welcome" | "prepare" | "link";

const STEPS: Step[] = ["welcome", "prepare", "link"];
const STEP_TITLE: Record<Step, string> = {
  welcome: "Orientation",
  prepare: "Prepare exports",
  link: "Link account",
};

// Same dot + "Step X of Y" chrome as AddAccountDialog's own step indicator —
// reused verbatim so a wizard entered from the empty state and a wizard
// entered mid-dialog read as the same system.
function StepIndicator({ step }: { step: Step }) {
  const stepNumber = STEPS.indexOf(step) + 1;
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => {
          const n = i + 1;
          return (
            <div
              key={s}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors",
                n < stepNumber ? "bg-status-success/60" : n === stepNumber ? "bg-primary/70" : "bg-border/40"
              )}
            />
          );
        })}
      </div>
      <span className={cn(TYPE.label, "font-medium text-muted-foreground/40 tabular-nums")}>
        Step {stepNumber} of {STEPS.length} · {STEP_TITLE[step]}
      </span>
    </div>
  );
}

// The one dialog-icon-tile treatment used everywhere else in this file's
// neighbors (AddAccountDialog, ConnectMetaDialog) — flat border, no glow.
function IconTile({ icon: Icon }: { icon: typeof Compass }) {
  return (
    <div className="w-11 h-11 rounded-lg border border-border/40 bg-foreground/[0.03] flex items-center justify-center mx-auto">
      <Icon className="w-4 h-4 text-interactive" />
    </div>
  );
}

export function OnboardingWizard({ managerName }: { managerName: string }) {
  const [step, setStep] = useState<Step>("welcome");
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-10 overflow-y-auto">
      <div className="max-w-2xl w-full">
        <StepIndicator step={step} />

        {step === "welcome" && (
          <div className="max-w-md mx-auto text-center space-y-5">
            <IconTile icon={Compass} />
            <div className="space-y-1.5">
              <h2 className={HEADING.h2}>Welcome to {managerName}</h2>
              <p className={cn(TYPE.body, "text-muted-foreground/80")}>
                A quick orientation before you link your first ad account.
              </p>
            </div>
            <div className="text-left space-y-3 rounded-lg border border-border/40 bg-foreground/[0.02] p-4">
              <div className="flex items-start gap-2.5">
                <LayoutGrid className="w-4 h-4 text-interactive shrink-0 mt-0.5" />
                <p className={cn(TYPE.caption, "text-foreground/80")}>
                  <span className="font-medium text-foreground">Manager Suite</span> — the page
                  you're on now. It rolls up blended performance across every ad account you
                  connect. Nothing here is editable directly; it's a read-only summary.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Boxes className="w-4 h-4 text-interactive shrink-0 mt-0.5" />
                <p className={cn(TYPE.caption, "text-foreground/80")}>
                  <span className="font-medium text-foreground">Ad accounts</span> — each one
                  holds its own creatives, imported data, and the full IAP Loop (Analysis →
                  Strategy → Briefs → MST → Optimization). This is where the real work happens.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Plug className="w-4 h-4 text-interactive shrink-0 mt-0.5" />
                <p className={cn(TYPE.caption, "text-foreground/80")}>
                  You'll link <span className="font-medium text-foreground">one ad account</span>{" "}
                  to get started — via manual CSV upload today, live Meta connection when it
                  ships. You can add more from here anytime.
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
              <h2 className={HEADING.h2}>What you'll need from Meta</h2>
              <p className={cn(TYPE.body, "text-muted-foreground/80 max-w-lg mx-auto")}>
                Uploading manual reports needs two exports pulled from Meta Ads Manager first.
                Live Meta connection (once available) will need nothing prepared — you'll
                authorize read-only access instead.
              </p>
            </div>

            <div className="rounded-lg border border-border/40 bg-foreground/[0.02] p-4 space-y-3">
              <div className={cn(TYPE.caption, "font-semibold text-foreground/90")}>
                Pulling the two required CSVs from Meta Ads Manager
              </div>
              <ol className={cn(TYPE.caption, "text-foreground/75 space-y-1.5 list-decimal list-inside")}>
                <li>Open Ads Manager (or Ads Reporting) for the ad account and set the date range to export.</li>
                <li>
                  Add a <span className="font-medium text-foreground">breakdown</span>: for the
                  Demographics export use{" "}
                  <span className="font-mono text-foreground/90">Age</span> and{" "}
                  <span className="font-mono text-foreground/90">Gender</span>; for the Placements
                  export use <span className="font-mono text-foreground/90">Impression device</span>,{" "}
                  <span className="font-mono text-foreground/90">Platform</span>, and{" "}
                  <span className="font-mono text-foreground/90">Placement</span>. Meta applies one
                  breakdown combination per export, so this needs to be done twice.
                </li>
                <li>
                  Make sure <span className="font-mono text-foreground/90">Date</span>,{" "}
                  <span className="font-mono text-foreground/90">Campaign name</span>,{" "}
                  <span className="font-mono text-foreground/90">Ad set name</span>, and{" "}
                  <span className="font-mono text-foreground/90">Ad name</span> are included as
                  columns, along with your performance metrics (spend, impressions, clicks, results).
                </li>
                <li>Export → Export table data → CSV. The exact columns required are below.</li>
              </ol>
            </div>

            <div className="space-y-2">
              <RequiredFormatPanel csvClass="demographic" />
              <RequiredFormatPanel csvClass="device_placement" />
              <RequiredFormatPanel csvClass="ad_summary" />
            </div>

            <div className="rounded-lg border border-status-warning/30 bg-status-warning/[0.06] p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0 mt-0.5" />
              <p className={cn(TYPE.caption, "text-status-warning/90")}>
                Meta's demographic/placement exports undercount spend due to iOS privacy limits.
                The Ad Summary CSV above is optional but recommended — it carries full, accurate
                spend totals.
              </p>
            </div>

            <div className="rounded-lg border border-border/40 bg-foreground/[0.02] p-3 flex items-start gap-2.5">
              <Images className="w-3.5 h-3.5 text-interactive shrink-0 mt-0.5" />
              <p className={cn(TYPE.caption, "text-foreground/75")}>
                You'll also upload your creative files (images/videos) individually — no ZIP
                files — and map each one to its ad name. That happens right after the CSVs, in
                the account's setup screen.
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
              <h2 className={HEADING.h2}>Link your first ad account</h2>
              <p className={cn(TYPE.body, "text-muted-foreground/80")}>
                Create a manual account and upload the reports you just prepared. Once it's
                linked, this page becomes your live Manager Suite dashboard.
              </p>
            </div>
            <div className="flex justify-center">
              <PrimaryBtn onClick={() => setAddOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> Add Ad Account
              </PrimaryBtn>
            </div>
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
