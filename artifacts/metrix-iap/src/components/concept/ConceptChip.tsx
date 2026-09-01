// ─── ConceptChip ──────────────────────────────────────────────────────
// Self-contained interactive chip for a concept code (e.g. "C2B").
// - Reads descriptor from ConceptRegistryContext (no prop-drilling).
// - Hover: shows tooltip with raw code + concept summary; fires a
//   library highlight signal so the matching card scrolls into view.
// - Click: navigates to IAP Library with the concept cell focused.

import { useLocation } from "wouter";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/command-deck/components/ui/tooltip";
import { useConceptRegistry, useConceptDescriptor } from "@/lib/concept-registry-context";
import { normalizeMetricsInProse, usableName } from "@/lib/normalize";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";

interface ConceptChipProps {
  code: string;
  className?: string;
}

export function ConceptChip({ code, className }: ConceptChipProps) {
  const [, navigate] = useLocation();
  const { highlightConcept } = useConceptRegistry();
  const entry = useConceptDescriptor(code);
  // A chip label is a NAME. The Bookster package fills `descriptor` with the
  // same generated performance sentence it puts in `what`, so this chip was
  // rendering "C1 produced $12.2632 CPA on $515.0538 spend (42 results)."
  // inline where "Social Proof" belongs — and for three concepts that
  // sentence contains the literal `$undefined`. When the field is prose, the
  // code is the honest label; the sentence is still one hover away below.
  const descriptor = usableName(entry?.descriptor) ?? code;

  const openInLibrary = () => {
    const focusCell = entry?.source_cells?.[0] ?? code;
    navigate(`/app/analysis/library?focus=${encodeURIComponent(focusCell)}`);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openInLibrary();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      openInLibrary();
    }
  };

  const handleMouseEnter = () => {
    highlightConcept(code);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onMouseEnter={handleMouseEnter}
          className={
            className ??
            "inline-flex items-center gap-0.5 text-label font-semibold " +
            "text-interactive border border-primary/30 bg-primary/[0.08] " +
            "hover:bg-primary/[0.18] px-1.5 py-0.5 rounded leading-none " +
            "cursor-pointer transition-colors align-baseline"
          }
          aria-label={`Concept ${code}: ${descriptor}`}
        >
          {descriptor}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[220px] space-y-1 text-left"
      >
        <p className={cn(TYPE.caption, "text-muted-foreground")}>{code}</p>
        {entry?.what && (
          // A sentence, so it sits on the body floor — it was text-label
          // (12px), three points under the floor every sentence must clear.
          <p className={cn(TYPE.body, "leading-relaxed text-foreground/90")}>
            {(() => {
              const what = normalizeMetricsInProse(entry.what);
              return what.length > 120 ? what.slice(0, 120) + "…" : what;
            })()}
          </p>
        )}
        <p className={cn(TYPE.caption, "text-muted-foreground/75 italic")}>Click to open in Library</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Tokenized text renderer ────────────────────────────────────────────
// Renders a string that may contain concept codes, replacing matched
// codes with <ConceptChip> inline. Import alongside ConceptChip.

import { tokenizeConceptCodes } from "@/lib/tokenizeConceptCodes";

interface TokenizedConceptTextProps {
  text: string;
  className?: string;
}

export function TokenizedConceptText({ text, className }: TokenizedConceptTextProps) {
  const { registry } = useConceptRegistry();
  // This component exists to render STORED analysis prose — 28 call sites
  // across Listen, Creative, Strategy and the recommendation deck. That
  // makes it the one place worth correcting the numbers the upstream
  // composer left unformatted, rather than hunting each site and missing
  // some. Tokenization runs on the corrected string, so chip offsets stay
  // consistent; the transform only touches `$` literals and never a
  // concept code.
  const tokens = tokenizeConceptCodes(normalizeMetricsInProse(text), registry);

  return (
    <span className={className}>
      {tokens.map((t, i) =>
        t.type === "chip" ? (
          <ConceptChip key={i} code={t.code} />
        ) : (
          <span key={i}>{t.value}</span>
        ),
      )}
    </span>
  );
}
