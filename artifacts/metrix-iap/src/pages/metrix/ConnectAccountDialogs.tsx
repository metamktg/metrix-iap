// ─── Connect / manual-import flows for unconfigured accounts ──────────
// Real flows: ManualImportDialog stages actual file uploads against the
// API (stored raw for the analysis pipeline — never parsed into
// performance data at upload time), and ConnectMetaDialog hands off to
// the live Meta OAuth flow in Settings → Integrations.
//
// Manual imports require the two exact IAP CSV templates (Demographics +
// Placements) plus optional individual creative files with an editable
// ad-name mapping. Date range selection does NOT live here — it belongs
// only to the explicit "Run analysis" step (see AnalysisControls),
// which is surfaced from the account setup screen, not this dialog.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStageManualImport,
  useListManualImports,
  useUpdateManualImportAdNames,
  useDeleteManualImport,
  getGetMetrixSeedQueryKey,
  getListManualImportsQueryKey,
  ApiError,
  type ManualImport,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Plug,
  FileUp,
  ShieldCheck,
  Database,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Images,
  Loader2,
  AlertTriangle,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronDown,
  ListChecks,
  Hash,
  Sparkles,
} from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";
import { RequiredFormatPanel, type IapCsvClassKey } from "./ManualAnalysisControls";
import type { ManualImportInput, ManualImportResult } from "@workspace/api-client-react";

export function PrimaryBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 h-9 px-4 rounded-md border text-[12px] font-medium transition-colors",
        disabled
          ? "border-border/40 text-muted-foreground/80 cursor-not-allowed"
          : "bg-primary/15 border-primary/30 text-primary hover:bg-primary/25"
      )}
    >
      {children}
    </button>
  );
}

export function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 h-9 px-4 rounded-md border border-border/50 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
    >
      {children}
    </button>
  );
}

// ─── Connect Meta Ad Account ──────────────────────────────────────────
// The live Meta OAuth connection lives in Settings → Integrations. This
// dialog explains the flow and hands off — it never fakes a connection.

export function ConnectMetaDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center">
              <Plug className="w-4 h-4 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-[16px]">Connect Meta Ad Account</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            Link a live Meta ad account so Metrix can pull real performance data for{" "}
            <span className="text-foreground/80 font-medium">{account.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {[
            {
              Icon: ShieldCheck,
              title: "1 · Authorize with Meta",
              desc: "Sign in with the Meta Business account that owns the ad account. Metrix requests read-only ads access (ads_read) — it can never edit campaigns.",
            },
            {
              Icon: Database,
              title: "2 · Select the ad account",
              desc: "Pick which ad account to link. Metrix scopes every module to exactly one ad account — no cross-account blending.",
            },
            {
              Icon: Clock,
              title: "3 · Pull reports",
              desc: "Run the initial report pulls. Analysis surfaces stay honestly pending until the analysis pipeline processes the pulled data.",
            },
          ].map(({ Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-white/[0.02]">
              <Icon className="w-4 h-4 text-primary/80 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-foreground">{title}</div>
                <p className="text-[11px] text-muted-foreground/85 leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <GhostBtn onClick={() => onOpenChange(false)}>Cancel</GhostBtn>
          <PrimaryBtn
            onClick={() => {
              onOpenChange(false);
              navigate("/app/settings/integrations");
            }}
          >
            Go to Integrations <ArrowRight className="w-3.5 h-3.5" />
          </PrimaryBtn>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Manual import upload panel (shared) ──────────────────────────────

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Stages a manual import over XMLHttpRequest (instead of the generated
 * fetch-based hook) so we get real byte-level upload progress — `fetch`
 * has no upload-progress event, which is why the previous UI could only
 * show an indeterminate spinner regardless of file size.
 */
function stageManualImportWithProgress(
  accountId: string,
  data: ManualImportInput,
  onProgress?: (pct: number) => void
): Promise<ManualImportResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/metrix/accounts/${accountId}/manual-imports`, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let parsed: unknown = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // ignore parse failures, handled below via status check
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(parsed as ManualImportResult);
      } else {
        const message =
          (parsed && typeof parsed === "object" && "message" in parsed
            ? String((parsed as { message?: unknown }).message)
            : null) ?? `Upload failed (HTTP ${xhr.status})`;
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));

    xhr.send(JSON.stringify(data));
  });
}

/**
 * Normalizes a filename or ad name for auto-mapping comparisons: strips
 * the extension, lowercases, and collapses separators (- _ . whitespace)
 * to single spaces so "Summer_Sale-v2.mp4" and "Summer Sale v2" line up.
 */
function normalizeForMatch(value: string): string {
  return value
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type AdNameMatch = {
  name: string;
  /** "id" = a shared concept/creative ID code uniquely identified the ad (high confidence). "fuzzy" = closest filename similarity (substring/token/edit-distance based). */
  method: "id" | "fuzzy";
};

/** Regexes for concept/creative ID codes commonly embedded in ad/creative filenames (e.g. "CR1234", "CR-1234", or a UUID). Punctuation between letters/digits is stripped before comparison so "CR-1234" and "CR_1234" are treated as the same code. */
// Note: uses [a-z0-9] lookaround rather than \b, because "_" is a word
// character in regex — a code like "CR1234" immediately followed by "_"
// (e.g. "CR1234_final.mp4") would otherwise fail to match at the trailing
// boundary since digit->underscore isn't a \b transition.
const ID_CODE_PATTERNS: readonly RegExp[] = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  /(?<![a-z0-9])[a-z]{1,4}[-_]?\d{3,8}(?![a-z0-9])/gi,
];

/** Extracts normalized ID/creative code tokens from a filename or ad name (lowercased, separators stripped). Codes shorter than 4 chars after stripping are ignored — too common to be a reliable identifier. */
function extractIdCodes(value: string): string[] {
  const base = value.replace(/\.[^/.]+$/, "").toLowerCase();
  const codes = new Set<string>();
  for (const pattern of ID_CODE_PATTERNS) {
    for (const match of base.matchAll(pattern)) {
      const normalized = match[0].replace(/[-_]/g, "");
      if (normalized.length >= 4) codes.add(normalized);
    }
  }
  return Array.from(codes);
}

/** Dice's (bigram overlap) coefficient — robust to typos/minor edits, 0..1. */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string): string[] => {
    const arr: string[] = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.substring(i, i + 2));
    return arr;
  };
  const bigramsA = bigrams(a);
  const remaining = new Map<string, number>();
  for (const bg of bigrams(b)) remaining.set(bg, (remaining.get(bg) ?? 0) + 1);
  let matches = 0;
  for (const bg of bigramsA) {
    const count = remaining.get(bg) ?? 0;
    if (count > 0) {
      matches++;
      remaining.set(bg, count - 1);
    }
  }
  return (2 * matches) / (bigramsA.length + bigrams(b).length);
}

/** Word-level Jaccard similarity — robust to reordered tokens (e.g. "v1_UGC_Testimonial" vs "UGC Testimonial v1"). */
function tokenSetSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(" ").filter(Boolean));
  const tokensB = new Set(b.split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) if (tokensB.has(token)) intersection++;
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

/** Below this combined similarity score, a fuzzy suggestion is considered too unreliable — left unmapped rather than guessed. */
const FUZZY_MATCH_THRESHOLD = 0.55;

/**
 * Suggests the best ad-name match for an uploaded filename against a set
 * of known/available ad names, in two passes:
 *  1. ID/creative code match — a code (e.g. "CR1234", a UUID) embedded in
 *     the filename that appears in exactly ONE candidate's name is a
 *     high-confidence match. A code shared by 2+ candidates is ambiguous
 *     and is skipped (never guessed).
 *  2. Fuzzy fallback — exact normalized match, substring containment, or
 *     the best combined bigram/token-overlap similarity score. Scores
 *     below FUZZY_MATCH_THRESHOLD are left unmapped rather than guessed.
 */
function suggestAdNameMatch(filename: string, candidates: Iterable<string>): AdNameMatch | null {
  const candidateList = Array.from(candidates);
  if (candidateList.length === 0) return null;

  const normalizedFile = normalizeForMatch(filename);
  if (!normalizedFile) return null;

  const fileCodes = extractIdCodes(filename);
  if (fileCodes.length > 0) {
    const ownersByCode = new Map<string, Set<string>>();
    for (const candidate of candidateList) {
      for (const code of extractIdCodes(candidate)) {
        if (!ownersByCode.has(code)) ownersByCode.set(code, new Set());
        ownersByCode.get(code)!.add(candidate);
      }
    }
    for (const code of fileCodes) {
      const owners = ownersByCode.get(code);
      if (owners && owners.size === 1) {
        return { name: [...owners][0]!, method: "id" };
      }
    }
  }

  let best: { name: string; score: number } | null = null;
  for (const candidate of candidateList) {
    const normalizedCandidate = normalizeForMatch(candidate);
    if (!normalizedCandidate) continue;
    if (normalizedCandidate === normalizedFile) return { name: candidate, method: "fuzzy" };

    let score: number;
    if (normalizedFile.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedFile)) {
      // Substring containment is a strong signal — filenames often carry extra
      // tokens (dates, sizes, "_final") around the ad name. Weight by how much
      // of the longer string the overlap covers so a near-full match beats a
      // short/coincidental substring.
      const overlapRatio =
        Math.min(normalizedFile.length, normalizedCandidate.length) /
        Math.max(normalizedFile.length, normalizedCandidate.length);
      score = 0.75 + 0.2 * overlapRatio;
    } else {
      score = Math.max(diceCoefficient(normalizedFile, normalizedCandidate), tokenSetSimilarity(normalizedFile, normalizedCandidate));
    }
    if (!best || score > best.score) best = { name: candidate, score };
  }

  if (best && best.score >= FUZZY_MATCH_THRESHOLD) {
    return { name: best.name, method: "fuzzy" };
  }
  return null;
}

const CSV_SLOTS: { kind: "performance_demo_csv" | "performance_placement_csv"; csvClass: IapCsvClassKey; title: string; desc: string }[] = [
  {
    kind: "performance_demo_csv",
    csvClass: "demographic",
    title: "Demographics CSV",
    desc: "Exact export of the IAP_DEMOGRAPHIC_TEXT_SIGNAL pivot template (age/gender/body-text breakdowns).",
  },
  {
    kind: "performance_placement_csv",
    csvClass: "device_placement",
    title: "Placements CSV",
    desc: "Exact export of the IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL pivot template (device/platform/placement breakdowns).",
  },
];

function UploadProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/85">
        <span className="flex items-center gap-1.5 truncate">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" /> {label}
        </span>
        <span className="shrink-0 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${Math.min(100, Math.max(pct > 0 ? 4 : 0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function CsvSlotUpload({
  accountId,
  kind,
  csvClass,
  title,
  desc,
  staged,
  onStaged,
  onRemoved,
}: {
  accountId: string;
  kind: "performance_demo_csv" | "performance_placement_csv";
  csvClass: IapCsvClassKey;
  title: string;
  desc: string;
  staged: ManualImport | null;
  onStaged: () => void;
  onRemoved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const deleteMutation = useDeleteManualImport();

  const handleStage = async () => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("File is too large — the limit is 8 MB.");
      return;
    }
    setUploadPct(0);
    try {
      const content_base64 = await fileToBase64(file);
      await stageManualImportWithProgress(
        accountId,
        { kind, filename: file.name, content_type: file.type || undefined, content_base64 },
        setUploadPct
      );
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onStaged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Check your connection and try again.");
    } finally {
      setUploadPct(null);
    }
  };

  const handleRemove = async () => {
    if (!staged) return;
    await deleteMutation.mutateAsync({ accountId, importId: staged.id });
    onRemoved();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-white/[0.02]">
        <FileSpreadsheet className={cn("w-4 h-4 shrink-0 mt-0.5", staged ? "text-emerald-400" : "text-muted-foreground/85")} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-foreground">{title} <span className="text-red-400/80 font-normal">*required</span></div>
          <p className="text-[11px] text-muted-foreground/85 leading-relaxed mt-0.5">{desc}</p>
        </div>
      </div>

      <RequiredFormatPanel csvClass={csvClass} />

      {staged ? (
        <div className="flex items-center gap-2 p-2 rounded-md border border-emerald-400/20 bg-emerald-400/[0.05]">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] text-foreground/80 truncate">{staged.filename}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400/90 ml-auto shrink-0 mr-1">Staged</span>
          <button
            onClick={() => void handleRemove()}
            disabled={deleteMutation.isPending}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-muted-foreground/80 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            aria-label={`Remove ${staged.filename}`}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </button>
        </div>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { setError(null); setFile(e.target.files?.[0] ?? null); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center gap-1.5 p-4 rounded-lg border border-dashed border-border/60 hover:border-primary/40 hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 text-muted-foreground/85" />
            {file ? (
              <span className="text-[12px] font-medium text-foreground">
                {file.name} <span className="text-muted-foreground/80 font-normal">({(file.size / 1024).toFixed(0)} KB)</span>
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/80">Choose a .csv file (max 8 MB)</span>
            )}
          </button>
          {file && uploadPct === null && (
            <div className="flex items-center justify-end">
              <PrimaryBtn onClick={() => void handleStage()}>
                <>Stage {title}</>
              </PrimaryBtn>
            </div>
          )}
          {uploadPct !== null && <UploadProgressBar pct={uploadPct} label={`Uploading ${file?.name ?? title}…`} />}
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-400/25 bg-red-400/[0.06]">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Searchable, checkbox-driven multi-select over ad names that already
 * exist in this account's IAP analysis (`account.ads` registry). Picking
 * from the real list rather than typing eliminates mapping typos.
 */
function AdNameDropdownPicker({
  availableAdNames,
  selected,
  onChange,
  defaultOpen,
}: {
  availableAdNames: string[];
  selected: string[];
  onChange: (names: string[]) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [search, setSearch] = useState("");

  const toggle = (name: string) => {
    onChange(
      selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 h-7 px-2.5 rounded bg-white/[0.03] border border-border/50 text-[11px] text-foreground hover:border-primary/40 transition-colors cursor-pointer"
          aria-label="Pick ad name(s) from existing analysis"
        >
          <ListChecks className="w-3 h-3 text-muted-foreground/85" />
          {selected.length > 0 ? `${selected.length} ad${selected.length > 1 ? "s" : ""} selected` : "Pick ad name(s)…"}
          <ChevronDown className="w-3 h-3 text-muted-foreground/80" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search ad names…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No matching ad names.</CommandEmpty>
            <CommandGroup>
              {availableAdNames.map((name) => {
                const isSelected = selected.includes(name);
                return (
                  <CommandItem key={name} value={name} onSelect={() => toggle(name)} className="cursor-pointer">
                    <div
                      className={cn(
                        "w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0",
                        isSelected ? "bg-primary border-primary" : "border-border/60"
                      )}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Small badge explaining why an ad-name suggestion was made. Only shown while the current mapping still equals the auto-suggested value — overriding it (dropdown/free-text) drops the badge automatically. */
function MatchMethodBadge({ match, adNames }: { match?: AdNameMatch; adNames: string[] }) {
  if (!match || adNames.length !== 1 || adNames[0] !== match.name) return null;
  const isId = match.method === "id";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0",
        isId ? "bg-primary/10 text-primary" : "bg-white/[0.06] text-muted-foreground/85"
      )}
    >
      {isId ? <Hash className="w-2.5 h-2.5" /> : <Sparkles className="w-2.5 h-2.5" />}
      {isId ? "Matched by ID code" : "Matched by filename similarity"}
    </span>
  );
}

function CreativeThumbnail({ accountId, asset }: { accountId: string; asset: ManualImport }) {
  const [broken, setBroken] = useState(false);
  const fileUrl = `/api/metrix/accounts/${accountId}/manual-imports/${asset.id}/file`;
  const isVideo = (asset.content_type ?? "").startsWith("video/");

  if (broken) {
    return (
      <div className="w-10 h-10 rounded-md border border-border/40 bg-white/[0.03] flex items-center justify-center shrink-0">
        <Images className="w-4 h-4 text-muted-foreground/60" />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded-md border border-border/40 bg-black/20 overflow-hidden shrink-0 flex items-center justify-center">
      {isVideo ? (
        <video src={fileUrl} className="w-full h-full object-cover" muted onError={() => setBroken(true)} />
      ) : (
        <img
          src={fileUrl}
          alt={asset.filename}
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

/**
 * Ad-name mapping editor. When a real ad registry exists, the dropdown is
 * always visible and saves immediately on every toggle — no separate
 * edit/confirm step, since that extra click was the source of "nothing
 * happened after I picked a name" confusion. Free-typed fallback (no
 * registry) keeps an explicit save since it needs a moment to type.
 */
function CreativeAdNamesEditor({
  accountId,
  asset,
  knownAdNames,
  availableAdNames,
  autoFocusPicker,
  suggestedMatch,
  onSaved,
}: {
  accountId: string;
  asset: ManualImport;
  knownAdNames: Set<string>;
  /** Real ad names from this account's analysis (`account.ads`). When present, mapping is dropdown-only — no free typing. */
  availableAdNames?: string[];
  /** Auto-open the picker popover on mount (newly staged, unmapped file). */
  autoFocusPicker?: boolean;
  /** How the current mapping was auto-suggested at stage time, if it still matches the saved value (cleared once the user overrides it). */
  suggestedMatch?: AdNameMatch;
  onSaved: () => void;
}) {
  const [editingFree, setEditingFree] = useState(false);
  const [value, setValue] = useState(asset.ad_names.join(", "));
  const updateMutation = useUpdateManualImportAdNames();
  const hasRegistry = Boolean(availableAdNames && availableAdNames.length > 0);

  const parsedNames = editingFree ? value.split(",").map((s) => s.trim()).filter(Boolean) : asset.ad_names;
  const mismatch = !hasRegistry && parsedNames.length > 0 && parsedNames.some((n) => !knownAdNames.has(n));

  const handleDropdownChange = async (names: string[]) => {
    await updateMutation.mutateAsync({ accountId, importId: asset.id, data: { ad_names: names } });
    onSaved();
  };

  const handleFreeSave = async () => {
    const ad_names = value.split(",").map((s) => s.trim()).filter(Boolean);
    await updateMutation.mutateAsync({ accountId, importId: asset.id, data: { ad_names } });
    setEditingFree(false);
    onSaved();
  };

  return (
    <div
      className={cn(
        "p-2 rounded-md border bg-white/[0.02] space-y-1.5",
        asset.ad_names.length > 0 ? "border-border/30" : "border-amber-400/30 bg-amber-400/[0.03]"
      )}
    >
      <div className="flex items-center gap-2">
        <CreativeThumbnail accountId={accountId} asset={asset} />
        <span className="text-[11px] text-foreground/80 truncate flex-1">{asset.filename}</span>
        {updateMutation.isPending && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/70 shrink-0" />}
      </div>

      {hasRegistry ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <AdNameDropdownPicker
            availableAdNames={availableAdNames!}
            selected={asset.ad_names}
            onChange={(names) => void handleDropdownChange(names)}
            defaultOpen={autoFocusPicker && asset.ad_names.length === 0}
          />
          {asset.ad_names.length > 0 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
          <MatchMethodBadge match={suggestedMatch} adNames={asset.ad_names} />
        </div>
      ) : editingFree ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleFreeSave(); }}
            placeholder="Ad name(s), comma-separated"
            className="flex-1 h-7 px-2 rounded bg-white/[0.03] border border-border/50 text-[11px] text-foreground placeholder:text-muted-foreground/75 focus:outline-none focus:border-primary/40"
          />
          <button
            onClick={() => void handleFreeSave()}
            disabled={updateMutation.isPending}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-emerald-400 hover:bg-emerald-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Save"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => { setValue(asset.ad_names.join(", ")); setEditingFree(false); }}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-muted-foreground/80 hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[10px] text-muted-foreground/85 flex-1">
            {asset.ad_names.length > 0 ? `Mapped to: ${asset.ad_names.join(", ")}` : "No ad name mapped yet"}
          </div>
          <MatchMethodBadge match={suggestedMatch} adNames={asset.ad_names} />
          <button
            onClick={() => { setValue(asset.ad_names.join(", ")); setEditingFree(true); }}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-muted-foreground/80 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
            aria-label="Edit ad name mapping"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
      {mismatch && (
        <div className="flex items-start gap-1.5 text-[10px] text-amber-400/90">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>
            {parsedNames.filter((n) => !knownAdNames.has(n)).join(", ")} not found among ad names seen in the staged
            CSVs yet — double check spelling, or this is expected if the CSVs haven't been uploaded.
          </span>
        </div>
      )}
    </div>
  );
}

function CreativeUploadSection({
  accountId,
  imports,
  knownAdNames,
  availableAdNames,
  onChanged,
}: {
  accountId: string;
  imports: ManualImport[];
  knownAdNames: Set<string>;
  /** Real ad names from this account's analysis (`account.ads`), when it exists. Drives filename auto-mapping + dropdown mapping. */
  availableAdNames?: string[];
  onChanged: () => void;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueIndex, setQueueIndex] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [currentPct, setCurrentPct] = useState(0);
  const [justStagedIds, setJustStagedIds] = useState<Set<string>>(new Set());
  const [matchInfoById, setMatchInfoById] = useState<Map<string, AdNameMatch>>(new Map());
  const fileRef = useRef<HTMLInputElement>(null);
  const deleteMutation = useDeleteManualImport();

  const creativeAssets = imports.filter((i) => i.kind === "creative_asset");
  const registryNames = useMemo(() => new Set(availableAdNames ?? []), [availableAdNames]);
  const matchCandidates = registryNames.size > 0 ? registryNames : knownAdNames;
  const mappedCount = creativeAssets.filter((a) => a.ad_names.length > 0).length;
  const isUploading = queueTotal > 0;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrors([]);
    const fileList = Array.from(files);
    setQueueTotal(fileList.length);
    const newlyStaged: string[] = [];
    const failures: string[] = [];

    // Each file is staged independently so one bad/oversized file in a
    // multi-file selection doesn't block the rest from uploading — the
    // previous implementation aborted the whole batch on the first error.
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setQueueIndex(i + 1);
      setCurrentFile(file.name);
      setCurrentPct(0);

      if (file.size > MAX_UPLOAD_BYTES) {
        failures.push(`${file.name} is too large — the limit is 8 MB.`);
        continue;
      }

      try {
        const content_base64 = await fileToBase64(file);
        const match = suggestAdNameMatch(file.name, matchCandidates);
        const staged = await stageManualImportWithProgress(
          accountId,
          {
            kind: "creative_asset",
            filename: file.name,
            content_type: file.type || undefined,
            content_base64,
            ad_names: match ? [match.name] : [],
          },
          setCurrentPct
        );
        newlyStaged.push(staged.import_id);
        if (match) {
          setMatchInfoById((prev) => {
            const next = new Map(prev);
            next.set(staged.import_id, match);
            return next;
          });
        }
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : "Upload failed."}`);
      }
    }

    if (newlyStaged.length > 0) {
      setJustStagedIds((prev) => new Set([...prev, ...newlyStaged]));
      onChanged();
    }
    setErrors(failures);
    setQueueTotal(0);
    setQueueIndex(0);
    setCurrentFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-white/[0.02]">
        <Images className="w-4 h-4 text-muted-foreground/85 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-foreground">Creative library <span className="text-muted-foreground/80 font-normal">(optional)</span></div>
          <p className="text-[11px] text-muted-foreground/85 leading-relaxed mt-0.5">
            Stage individual ad creative files (images/videos) so they render immediately. Map each
            file to the ad name(s) it represents — filenames matching an ad name are pre-mapped.
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={isUploading}
        className="w-full flex flex-col items-center gap-1.5 p-4 rounded-lg border border-dashed border-border/60 hover:border-primary/40 hover:bg-white/[0.02] transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        <Upload className="w-4 h-4 text-muted-foreground/85" />
        {!isUploading && (
          <span className="text-[11px] text-muted-foreground/80">Choose one or more creative files (max 8 MB each)</span>
        )}
      </button>

      {isUploading && currentFile && (
        <UploadProgressBar
          pct={currentPct}
          label={queueTotal > 1 ? `File ${queueIndex} of ${queueTotal} — ${currentFile}` : currentFile}
        />
      )}

      {errors.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-400/25 bg-red-400/[0.06]">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-red-300 leading-relaxed space-y-0.5">
            {errors.map((msg, i) => (
              <p key={i}>{msg}</p>
            ))}
          </div>
        </div>
      )}

      {creativeAssets.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-medium text-muted-foreground/85">
              {mappedCount} of {creativeAssets.length} mapped
            </span>
            {mappedCount < creativeAssets.length && (
              <span className="text-[10px] text-amber-400/90">Pick an ad name for each highlighted file below</span>
            )}
          </div>
          {creativeAssets.map((asset) => (
            <div key={asset.id} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <CreativeAdNamesEditor
                  accountId={accountId}
                  asset={asset}
                  knownAdNames={knownAdNames}
                  availableAdNames={availableAdNames}
                  autoFocusPicker={justStagedIds.has(asset.id)}
                  suggestedMatch={matchInfoById.get(asset.id)}
                  onSaved={onChanged}
                />
              </div>
              <button
                onClick={async () => { await deleteMutation.mutateAsync({ accountId, importId: asset.id }); onChanged(); }}
                disabled={deleteMutation.isPending}
                className="shrink-0 mt-2 w-7 h-7 flex items-center justify-center rounded text-muted-foreground/80 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                aria-label={`Remove ${asset.filename}`}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Full manual-import upload flow for an account: both required CSV
 * templates, optional individual creative files with editable ad-name
 * mapping, and an explicit confirmation/review step before finalizing.
 * No date range lives here — that's a separate, explicit "Run analysis"
 * step from the account setup screen.
 */
export function ManualUploadPanel({ accountId, availableAdNames }: { accountId: string; availableAdNames?: string[] }) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const { data, refetch } = useListManualImports(accountId);
  const queryClient = useQueryClient();
  const imports = data?.imports ?? [];

  const refresh = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: getListManualImportsQueryKey(accountId) });
  };

  const demoImport = imports.find((i) => i.kind === "performance_demo_csv") ?? null;
  const placementImport = imports.find((i) => i.kind === "performance_placement_csv") ?? null;
  const creativeAssets = imports.filter((i) => i.kind === "creative_asset");
  const bothRequiredStaged = Boolean(demoImport && placementImport);

  // Ad names actually seen aren't known client-side (CSVs are staged raw,
  // not parsed) — mismatch warnings are informational only, based on
  // whatever ad names other staged creatives already carry.
  const knownAdNames = new Set(creativeAssets.flatMap((a) => a.ad_names));

  if (step === "review") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-border/40 bg-white/[0.02] p-3 space-y-2">
          <div className="text-[12px] font-semibold text-foreground">Review before finishing</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-foreground/80">Demographics CSV — {demoImport?.filename}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-foreground/80">Placements CSV — {placementImport?.filename}</span>
            </div>
            {creativeAssets.length > 0 ? (
              creativeAssets.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-[11px]">
                  <Images className="w-3.5 h-3.5 text-muted-foreground/85 shrink-0" />
                  <span className="text-foreground/80 truncate">{a.filename}</span>
                  <span className="text-muted-foreground/80 truncate">
                    {a.ad_names.length > 0 ? `→ ${a.ad_names.join(", ")}` : "→ unmapped"}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-muted-foreground/80">No creative files staged.</div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/75 leading-relaxed pt-1 border-t border-border/30">
            Nothing has been parsed into performance data yet. Go to the account's setup screen to
            pick a date range and explicitly run analysis over these staged files.
          </p>
        </div>
        <div className="flex items-center justify-between pt-1">
          <GhostBtn onClick={() => setStep("upload")}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to uploads
          </GhostBtn>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {CSV_SLOTS.map((slot) => (
        <CsvSlotUpload
          key={slot.kind}
          accountId={accountId}
          kind={slot.kind}
          csvClass={slot.csvClass}
          title={slot.title}
          desc={slot.desc}
          staged={slot.kind === "performance_demo_csv" ? demoImport : placementImport}
          onStaged={refresh}
          onRemoved={refresh}
        />
      ))}

      <CreativeUploadSection
        accountId={accountId}
        imports={imports}
        knownAdNames={knownAdNames}
        availableAdNames={availableAdNames}
        onChanged={refresh}
      />

      <div className="flex items-center justify-between pt-1 border-t border-border/30 mt-1">
        <p className="text-[10px] text-muted-foreground/75 leading-relaxed max-w-[60%]">
          Both CSVs are required before you can continue. Files are stored raw until an analysis
          run explicitly processes them.
        </p>
        <PrimaryBtn onClick={() => setStep("review")} disabled={!bothRequiredStaged}>
          Review <ArrowRight className="w-3.5 h-3.5" />
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Upload creatives (after the fact, for an already-analyzed account) ──
// A dedicated, own-interface flow for adding creative files to an account
// whose CSVs are already staged/analyzed — no CSV re-upload required.
// Ad-name mapping is dropdown-only against the account's real ads registry
// (`account.ads`), so there's no way to mistype a mapping.

export function CreativeLibraryPanel({
  accountId,
  availableAdNames,
  onDone,
}: {
  accountId: string;
  availableAdNames: string[];
  onDone?: () => void;
}) {
  const { data, refetch } = useListManualImports(accountId);
  const queryClient = useQueryClient();
  const imports = data?.imports ?? [];
  const creativeAssets = imports.filter((i) => i.kind === "creative_asset");
  const mappedCount = creativeAssets.filter((a) => a.ad_names.length > 0).length;

  const refresh = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: getListManualImportsQueryKey(accountId) });
  };

  const knownAdNames = new Set(creativeAssets.flatMap((a) => a.ad_names));

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 p-3 rounded-lg border border-primary/20 bg-primary/[0.04]">
        <ListChecks className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-foreground/80 leading-relaxed">
          Map each file to an ad from this account's existing analysis using the dropdown below —
          mappings save immediately, no separate confirm step.
        </p>
      </div>
      <CreativeUploadSection
        accountId={accountId}
        imports={imports}
        knownAdNames={knownAdNames}
        availableAdNames={availableAdNames}
        onChanged={refresh}
      />
      {onDone && (
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <span className="text-[11px] text-muted-foreground/85">
            {creativeAssets.length > 0
              ? `${mappedCount} of ${creativeAssets.length} files mapped`
              : "No files staged yet"}
          </span>
          <PrimaryBtn onClick={onDone}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Done
          </PrimaryBtn>
        </div>
      )}
    </div>
  );
}

export function CreativeLibraryDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const availableAdNames = useMemo(
    () => Array.from(new Set((account.ads ?? []).map((a) => a.ad_name))).sort(),
    [account.ads]
  );

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center">
              <Images className="w-4 h-4 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-[16px]">Upload Creatives</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            Add creative files to{" "}
            <span className="text-foreground/80 font-medium">{account.name}</span> after the fact —
            they render immediately and map to ads already in its IAP analysis.
          </DialogDescription>
        </DialogHeader>
        <CreativeLibraryPanel
          accountId={account.id}
          availableAdNames={availableAdNames}
          onDone={() => handleOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Manual Import dialog ─────────────────────────────────────────

export function ManualImportDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      // Staged uploads may change account state downstream; keep the seed fresh.
      queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center">
              <FileUp className="w-4 h-4 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-[16px]">Add Manual Import</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            Upload the two required exports for{" "}
            <span className="text-foreground/80 font-medium">{account.name}</span>, plus any
            creative files. Files are staged for the analysis pipeline — performance data appears
            only after you explicitly run analysis from the account's setup screen.
          </DialogDescription>
        </DialogHeader>
        <ManualUploadPanel accountId={account.id} />
      </DialogContent>
    </Dialog>
  );
}
