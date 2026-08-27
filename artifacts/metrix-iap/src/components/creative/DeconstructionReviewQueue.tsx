// ─── Deconstruction review queue ───────────────────────────────────────
// Lists uploaded creatives whose classification graded below the 80%
// confidence gate. For each item the reviewer can (a) correct individual
// variable classifications (registry-constrained), (b) explicitly bypass
// the gate and accept — recorded as user-overridden, or (c) discard.
// When the mapped ad traces back to a brief, the brief-INTENDED variables
// render side by side with what was detected; historical/brief-less
// creatives skip that comparison entirely.

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Pencil, ShieldAlert, Trash2, X } from "lucide-react";
import type { CreativeDeconstruction, DetectedCreativeVariable } from "@workspace/api-client-react";
import {
  DECONSTRUCTION_STATUS_LABEL,
  REGISTRY_FAMILIES,
  familyDisplayLabel,
  isRegistryValidCode,
  pct,
  useDeconstruction,
} from "./useDeconstruction";

function ConfidenceBadge({ value }: { value: number | null | undefined }) {
  const high = value != null && value >= 0.8;
  return (
    <span
      className={[
        "inline-flex items-center px-1.5 py-0.5 rounded text-label font-semibold tabular-nums",
        high ? "bg-status-success/10 text-status-success" : "bg-status-warning/10 text-status-warning",
      ].join(" ")}
    >
      {pct(value)}
    </span>
  );
}

function VariableEditorRow({
  variable,
  onChange,
  onRemove,
}: {
  variable: DetectedCreativeVariable;
  onChange: (v: DetectedCreativeVariable) => void;
  onRemove: () => void;
}) {
  const fam = REGISTRY_FAMILIES.find((f) => f.family === variable.family);
  const valid = isRegistryValidCode(variable.family, variable.code);
  return (
    <div className="flex items-center gap-2">
      <select
        value={variable.family}
        onChange={(e) => {
          const next = REGISTRY_FAMILIES.find((f) => f.family === e.target.value)!;
          onChange({ ...variable, family: next.family, code: next.suggestions[0] ?? `${next.prefix}_` });
        }}
        aria-label="Variable family"
        className="h-7 rounded border border-border/50 bg-background text-label text-foreground px-1.5"
      >
        {REGISTRY_FAMILIES.map((f) => (
          <option key={f.family} value={f.family}>
            {f.label}
          </option>
        ))}
      </select>
      <input
        value={variable.code}
        onChange={(e) => onChange({ ...variable, code: e.target.value.trim() })}
        list={`codes-${variable.family}`}
        aria-label="Variable code"
        className={[
          "h-7 flex-1 min-w-0 rounded border bg-background text-label text-foreground px-2 font-mono",
          valid ? "border-border/50" : "border-status-danger/50",
        ].join(" ")}
      />
      <datalist id={`codes-${variable.family}`}>
        {(fam?.suggestions ?? []).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button
        onClick={onRemove}
        aria-label={`Remove ${variable.code}`}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-muted-foreground/70 hover:text-status-danger hover:bg-status-danger/10 transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ReviewItem({
  item,
  onReview,
  reviewPending,
}: {
  item: CreativeDeconstruction;
  onReview: (
    id: string,
    action: "update_variables" | "bypass" | "discard",
    variables?: DetectedCreativeVariable[],
  ) => Promise<void>;
  reviewPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DetectedCreativeVariable[]>(item.variables);
  const [confirmBypass, setConfirmBypass] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectedCodes = useMemo(() => new Set(item.variables.map((v) => v.code)), [item.variables]);
  const briefVariables = item.brief_variables ?? null;
  const draftValid = draft.length > 0 && draft.every((v) => isRegistryValidCode(v.family, v.code));

  const act = async (
    action: "update_variables" | "bypass" | "discard",
    variables?: DetectedCreativeVariable[],
  ) => {
    setError(null);
    try {
      await onReview(item.id, action, variables);
      if (action === "update_variables") setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action failed. Try again.");
    }
  };

  return (
    <div
      data-testid={`review-item-${item.id}`}
      className="rounded-lg border border-status-warning/25 bg-status-warning/[0.03] p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-body font-semibold text-foreground truncate">{item.filename}</div>
          <div className="text-caption text-muted-foreground/85 truncate">
            {item.ad_names.length > 0 ? item.ad_names.join(", ") : "Not mapped to a live ad"}
            {item.brief_ref ? ` · brief ${item.brief_ref}` : " · no linked brief (historical upload)"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-label text-muted-foreground/80">Overall</span>
          <ConfidenceBadge value={item.overall_confidence} />
        </div>
      </div>

      {/* Detected variables (and brief comparison when a brief is linked) */}
      <div className={briefVariables ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : ""}>
        <div>
          <div className="text-label font-medium text-muted-foreground/85 mb-1.5">Detected in creative</div>
          {editing ? (
            <div className="space-y-1.5">
              {draft.map((v, i) => (
                <VariableEditorRow
                  key={`${v.family}-${i}`}
                  variable={v}
                  onChange={(nv) => setDraft((d) => d.map((x, j) => (j === i ? nv : x)))}
                  onRemove={() => setDraft((d) => d.filter((_, j) => j !== i))}
                />
              ))}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => {
                    const used = new Set(draft.map((v) => v.family));
                    const next = REGISTRY_FAMILIES.find((f) => !used.has(f.family)) ?? REGISTRY_FAMILIES[0]!;
                    setDraft((d) => [
                      ...d,
                      { family: next.family, code: next.suggestions[0] ?? `${next.prefix}_`, confidence: 1 },
                    ]);
                  }}
                  className="text-label font-medium text-interactive hover:underline cursor-pointer"
                >
                  + Add variable
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => {
                    setDraft(item.variables);
                    setEditing(false);
                  }}
                  className="h-7 px-2.5 rounded border border-border/50 text-label text-muted-foreground/85 hover:text-foreground transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void act("update_variables", draft)}
                  disabled={!draftValid || reviewPending}
                  className="h-7 px-2.5 rounded border border-primary/40 bg-primary/10 text-label font-medium text-interactive hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Save corrections
                </button>
              </div>
              {!draftValid && (
                <p className="text-label text-status-danger">
                  Each code must use its family's registry prefix (e.g. CN_, FW_, TN_, HK_).
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {item.variables.map((v) => (
                <span
                  key={v.code}
                  title={v.evidence ?? undefined}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border/50 bg-white/[0.03] text-label font-mono text-foreground/90"
                >
                  {v.code}
                  <span className="text-muted-foreground/70">{pct(v.confidence)}</span>
                  {v.user_edited && <Pencil className="w-3 h-3 text-interactive" aria-label="Edited by reviewer" />}
                </span>
              ))}
            </div>
          )}
        </div>

        {briefVariables && (
          <div>
            <div className="text-label font-medium text-muted-foreground/85 mb-1.5">Brief intended</div>
            <div className="flex flex-wrap gap-1.5">
              {briefVariables.map((code) => {
                const matched = detectedCodes.has(code);
                return (
                  <span
                    key={code}
                    className={[
                      "inline-flex items-center gap-1 px-2 py-1 rounded border text-label font-mono",
                      matched
                        ? "border-status-success/30 bg-status-success/[0.05] text-status-success"
                        : "border-status-warning/30 bg-status-warning/[0.05] text-status-warning",
                    ].join(" ")}
                    title={matched ? "Also detected in the creative" : "Planned in the brief but not detected"}
                  >
                    {matched ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {code}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-caption text-status-danger flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => {
              setDraft(item.variables);
              setEditing(true);
            }}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded border border-border/50 text-label font-medium text-muted-foreground/85 hover:text-foreground transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" /> Correct
          </button>
          {confirmBypass ? (
            <span className="flex items-center gap-2 text-label">
              <span className="text-status-warning">
                Accept below the 80% gate? This is recorded as a user override.
              </span>
              <button
                onClick={() => void act("bypass")}
                disabled={reviewPending}
                className="h-7 px-2.5 rounded border border-status-warning/40 bg-status-warning/10 font-medium text-status-warning hover:bg-status-warning/20 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {reviewPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yes, accept anyway"}
              </button>
              <button
                onClick={() => setConfirmBypass(false)}
                className="h-7 px-2 rounded border border-border/50 text-muted-foreground/85 hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmBypass(true)}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded border border-status-warning/40 bg-status-warning/[0.06] text-label font-medium text-status-warning hover:bg-status-warning/[0.12] transition-colors cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Accept anyway
            </button>
          )}
          <button
            onClick={() => void act("discard")}
            disabled={reviewPending}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded border border-status-danger/30 text-label font-medium text-status-danger/90 hover:bg-status-danger/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Discard
          </button>
        </div>
      )}
    </div>
  );
}

export function DeconstructionReviewQueue({ accountId }: { accountId: string | null }) {
  const { deconstructions, review, reviewPending } = useDeconstruction(accountId);
  const queue = deconstructions.filter((d) => d.status === "needs_review");
  const resolved = deconstructions.filter(
    (d) => d.status === "user_overridden" || d.status === "discarded" || d.status === "auto_filed",
  );

  return (
    <div data-testid="deconstruction-review-queue" className="space-y-3">
      <p className="text-caption text-muted-foreground/85 leading-relaxed">
        Uploaded creatives that graded below the 80% confidence gate wait here. Correct the detected
        variables, accept as-is (recorded as a user override), or discard. Entries at or above the
        gate file into the library automatically.
      </p>
      {queue.length === 0 ? (
        <div
          data-testid="review-queue-empty"
          className="rounded-lg border border-border/40 bg-white/[0.02] p-6 text-center text-caption text-muted-foreground/80"
        >
          Nothing needs review — new classifications land here when a deconstruction run grades a
          creative below 80% confidence.
        </div>
      ) : (
        queue.map((item) => <ReviewItem key={item.id} item={item} onReview={review} reviewPending={reviewPending} />)
      )}
      {resolved.length > 0 && (
        <p className="text-label text-muted-foreground/70">
          {resolved.filter((d) => d.status === "auto_filed").length} auto-classified ·{" "}
          {resolved.filter((d) => d.status === "user_overridden").length} accepted via override ·{" "}
          {resolved.filter((d) => d.status === "discarded").length} discarded
        </p>
      )}
    </div>
  );
}

export { DECONSTRUCTION_STATUS_LABEL, familyDisplayLabel };
