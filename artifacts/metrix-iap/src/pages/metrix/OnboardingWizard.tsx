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
  Check,
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
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
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

// Watermelon onboarding-checklist, taken as its mechanic: setup progress is
// a CHECKLIST, not a wizard. Every step is visible and clickable from the
// start — nothing about the path is hidden behind "Next" — a visited step
// wears a check, the current one is highlighted, and the segmented meter
// (our own ProgressMeter, ordinal mode) carries the count. Completion here
// is honest to what this screen can know: "visited" — the only real
// completion signal (an account existing) dismisses this whole surface.
function SetupChecklist({
  step,
  visited,
  onJump,
}: {
  step: Step;
  visited: ReadonlySet<Step>;
  onJump: (s: Step) => void;
}) {
  const doneCount = STEPS.filter((s) => visited.has(s) && s !== step).length;
  return (
    <div className="mb-6 space-y-2.5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 flex-wrap">
          {STEPS.map((s, i) => {
            const isCurrent = s === step;
            const isDone = visited.has(s) && !isCurrent;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onJump(s)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "pressable inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border transition-colors",
                  TYPE.caption,
                  isCurrent
                    ? "border-primary/40 bg-primary/10 text-foreground font-semibold"
                    : isDone
                      ? "border-status-success/30 text-status-success/90 hover:bg-status-success/[0.06]"
                      : "border-border/40 text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded-full border flex items-center justify-center shrink-0",
                    isDone
                      ? "border-transparent bg-status-success/20"
                      : isCurrent
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-border/50",
                  )}
                >
                  {isDone
                    ? <Check className="w-2.5 h-2.5" />
                    : <span className="text-micro-num font-semibold leading-none">{i + 1}</span>}
                </span>
                {STEP_TITLE[s]}
              </button>
            );
          })}
        </div>
        <span className={cn(TYPE.label, "font-medium text-muted-foreground/75 tabular-nums ml-auto shrink-0")}>
          {doneCount}/{STEPS.length} visited
        </span>
      </div>
      <ProgressMeter value={doneCount} total={STEPS.length} label="Setup steps visited" size="sm" segments={STEPS.length} />
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
  const [step, setStepRaw] = useState<Step>("welcome");
  const [visited, setVisited] = useState<Set<Step>>(() => new Set(["welcome"]));
  const [addOpen, setAddOpen] = useState(false);
  const setStep = (s: Step) => {
    setVisited((prev) => new Set(prev).add(s));
    setStepRaw(s);
  };

  return (
    // my-auto on the CHILD, not items-center on this scroller: with
    // items-center, content taller than the viewport clips its own top
    // unreachably (the checklist rail vanished above the fold on the
    // prepare step). my-auto centers short content and yields to natural
    // top alignment the moment content overflows.
    <div className="flex-1 flex justify-center px-6 py-10 overflow-y-auto">
      <div className="max-w-2xl w-full my-auto">
        <SetupChecklist step={step} visited={visited} onJump={setStep} />

        {step === "welcome" && (
          <div className="mx-step-enter max-w-md mx-auto text-center space-y-5">
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
                  <span className="font-medium text-foreground">Manager Suite</span>. The page
                  you're on now. It rolls up blended performance across every ad account you
                  connect. Nothing here is editable directly; it's a read-only summary.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Boxes className="w-4 h-4 text-interactive shrink-0 mt-0.5" />
                <p className={cn(TYPE.caption, "text-foreground/80")}>
                  <span className="font-medium text-foreground">Ad accounts</span>. Each one
                  holds its own creatives, imported data, and the full IAP Loop (Analysis →
                  Strategy → Briefs → MST → Optimization). This is where the real work happens.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Plug className="w-4 h-4 text-interactive shrink-0 mt-0.5" />
                <p className={cn(TYPE.caption, "text-foreground/80")}>
                  You'll link <span className="font-medium text-foreground">one ad account</span>{" "}
                  to get started · via manual CSV upload today, live Meta connection when it
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
          <div className="mx-step-enter space-y-5">
            <div className="text-center space-y-1.5">
              <IconTile icon={FileSpreadsheet} />
              <h2 className={HEADING.h2}>What you'll need from Meta</h2>
              <p className={cn(TYPE.body, "text-muted-foreground/80 max-w-lg mx-auto")}>
                Uploading manual reports needs two exports pulled from Meta Ads Manager first.
                Live Meta connection (once available) will need nothing prepared, you'll
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
                  <span className=" text-foreground/90">Age</span> and{" "}
                  <span className=" text-foreground/90">Gender</span>; for the Placements
                  export use <span className=" text-foreground/90">Impression device</span>,{" "}
                  <span className=" text-foreground/90">Platform</span>, and{" "}
                  <span className=" text-foreground/90">Placement</span>. Meta applies one
                  breakdown combination per export, so this needs to be done twice.
                </li>
                <li>
                  Make sure <span className=" text-foreground/90">Date</span>,{" "}
                  <span className=" text-foreground/90">Campaign name</span>,{" "}
                  <span className=" text-foreground/90">Ad set name</span>, and{" "}
                  <span className=" text-foreground/90">Ad name</span> are included as
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
                The Ad Summary CSV above is optional but recommended. It carries full, accurate
                spend totals.
              </p>
            </div>

            <div className="rounded-lg border border-border/40 bg-foreground/[0.02] p-3 flex items-start gap-2.5">
              <Images className="w-3.5 h-3.5 text-interactive shrink-0 mt-0.5" />
              <p className={cn(TYPE.caption, "text-foreground/75")}>
                You'll also upload your creative files (images/videos) individually. No ZIP
                files. And map each one to its ad name. That happens right after the CSVs, in
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
          <div className="mx-step-enter max-w-md mx-auto text-center space-y-5">
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
