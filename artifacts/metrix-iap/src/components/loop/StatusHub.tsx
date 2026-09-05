// ─── Status hub ────────────────────────────────────────────────────────
// Sweep spec §4: one component, one model, four rows, on every Execution
// Layer page between the loop spine and the execution card, so the run's
// state is read before the run is started again. The rows use the loop's
// own vocabulary (Staged · Running · Completed · Failed) and carry
// fragments, never sentences; the run's whole error and its warnings sit
// behind the existing disclosure primitive.
//
// Watermelon references (mechanics, not branding): labeled-progress-
// indicator for the in-flight row (RunProgress already is one: the label
// is the engine's stage, the percent only when the engine reports one),
// inline-toast for a settled row's arrival (opacity and a 4 px rise over
// 160 ms through .mx-inline-toast, none under reduced motion, no keyframes).

import { CheckCircle2, Loader2, XCircle, FileText, History as HistoryIcon } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { CrossLink, DetailReveal, deriveLabel } from "@/pages/metrix/shared";
import { RunProgress } from "@/components/widgets/RunProgress";
import { fmtDuration } from "@/lib/runEta";
import { usuallyAboutLabel } from "@/lib/loop/analysisEta";
import type { StatusHubModel } from "@/lib/loop/statusHub";

const ROW_LABEL = {
  inputs: "Staged",
  inFlight: "Running",
  completed: "Completed",
  failed: "Failed",
  history: "History",
} as const;

function Row({
  kind,
  children,
  tone = "default",
  arrive = false,
  testId,
}: {
  kind: keyof typeof ROW_LABEL;
  children: React.ReactNode;
  tone?: "default" | "success" | "danger" | "warning";
  /** A settled row arrives with the inline-toast signature. */
  arrive?: boolean;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 items-start py-2 border-t border-border/25 first:border-0",
        arrive && "mx-inline-toast",
      )}
      data-testid={testId}
      data-hub-row={kind}
    >
      <span
        className={cn(
          TYPE.microLabel,
          "pt-0.5",
          tone === "success" && "text-status-success",
          tone === "danger" && "text-status-danger",
          tone === "warning" && "text-status-warning",
        )}
      >
        {ROW_LABEL[kind]}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function StatusHub({
  model,
  label,
  className,
}: {
  model: StatusHubModel;
  /** Accessible name of the region: "Analysis status". */
  label: string;
  className?: string;
}) {
  const { inputs, inFlight, lastCompleted, failed, history } = model;
  return (
    <section
      aria-label={label}
      data-testid="status-hub"
      className={cn("mx-card-hero relative px-3 py-1", className)}
    >
      <Row kind="inputs" testId="status-hub-inputs">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {inputs.map((input, i) => (
            <li key={`${input.label}-${i}`} className={cn(TYPE.caption, "flex items-center gap-1.5 min-w-0")}>
              {i === 0 && <FileText className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" aria-hidden />}
              <span className="text-foreground/85">{input.label}</span>
              {/* A linked input carries its detail AS the link (the page it
                  points at), never twice. */}
              {input.to ? (
                <CrossLink to={input.to} label={input.detail ?? "Open"} />
              ) : (
                input.detail && <span className="text-muted-foreground/75 min-w-0">· {input.detail}</span>
              )}
            </li>
          ))}
        </ul>
      </Row>

      {inFlight && (
        <Row kind="inFlight" tone="warning" testId="status-hub-in-flight">
          <div className="space-y-1">
            <RunProgress phase="running" stage={inFlight.stage} pct={inFlight.percent} data-testid="status-hub-progress" />
            <p className={cn(TYPE.label, "text-muted-foreground/80 tabular-nums normal-case tracking-normal")} data-testid="status-hub-elapsed">
              <Loader2 className="inline w-3 h-3 mr-1 -mt-0.5 animate-spin text-status-warning" aria-hidden />
              {inFlight.elapsedSeconds > 0 ? `${fmtDuration(inFlight.elapsedSeconds)} elapsed` : "Starting"}
              {inFlight.etaSeconds !== null && ` · ${usuallyAboutLabel(inFlight.etaSeconds)}`}
              {inFlight.slowStage && (
                <span className="text-status-warning" data-testid="status-hub-slow-stage">
                  {" · "}
                  {deriveLabel(inFlight.slowStage, 48)} is taking longer than usual
                </span>
              )}
            </p>
          </div>
        </Row>
      )}

      {lastCompleted && (
        <Row kind="completed" tone="success" arrive testId="status-hub-completed">
          <div className={cn(TYPE.caption, "flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0")}>
            <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" aria-hidden />
            <span className="text-foreground/85 truncate">{lastCompleted.summary}</span>
            {lastCompleted.warnings.length > 0 ? (
              <DetailReveal
                label={`${lastCompleted.warnings.length} warning${lastCompleted.warnings.length === 1 ? "" : "s"}`}
                eyebrow="Run warnings"
                labelClassName={cn(TYPE.caption, "text-status-warning")}
                testId="status-hub-warnings"
                sections={[
                  {
                    render: () => (
                      <ul className="space-y-1.5">
                        {lastCompleted.warnings.map((w, i) => (
                          <li key={i} className={cn(TYPE.caption, "text-foreground/85 break-words")}>{w}</li>
                        ))}
                      </ul>
                    ),
                  },
                ]}
              />
            ) : (
              <span className="text-muted-foreground/75">no warnings</span>
            )}
            {lastCompleted.detailsTo && <CrossLink to={lastCompleted.detailsTo} label="Details" srNote="this run in the history" />}
          </div>
        </Row>
      )}

      {failed && (
        <Row kind="failed" tone="danger" arrive testId="status-hub-failed">
          <div className={cn(TYPE.caption, "flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0")}>
            <XCircle className="w-3.5 h-3.5 text-status-danger shrink-0" aria-hidden />
            <DetailReveal
              label={deriveLabel(failed.message, 88)}
              eyebrow="The run's own error"
              labelClassName={cn(TYPE.caption, "text-foreground/85")}
              testId="status-hub-failure"
              sections={[{ text: failed.message }]}
            />
            <span className="text-muted-foreground/75">· {failed.retained}</span>
          </div>
        </Row>
      )}

      {history && (
        <Row kind="history" testId="status-hub-history">
          <div className={cn(TYPE.caption, "flex items-center gap-2")}>
            <HistoryIcon className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" aria-hidden />
            <span className="text-foreground/85">
              {history.count === 0 ? "No completed runs yet" : `${history.count} completed run${history.count === 1 ? "" : "s"}`}
            </span>
            {history.to && <CrossLink to={history.to} label="Full history" />}
          </div>
        </Row>
      )}
    </section>
  );
}
