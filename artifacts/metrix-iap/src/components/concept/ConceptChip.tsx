// ─── ConceptChip ──────────────────────────────────────────────────────
// Self-contained interactive chip for a concept code (e.g. "C2B").
// - Reads descriptor from ConceptRegistryContext (no prop-drilling).
// - Hover: shows tooltip with raw code + concept summary; fires a
//   library highlight signal so the matching card scrolls into view.
// - Click: navigates to IAP Library with the concept cell focused.

import { useLocation } from "wouter";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/command-deck/components/ui/tooltip";
import { useConceptRegistry, useConceptDescriptor } from "@/lib/concept-registry-context";

interface ConceptChipProps {
  code: string;
  className?: string;
}

export function ConceptChip({ code, className }: ConceptChipProps) {
  const [, navigate] = useLocation();
  const { highlightConcept } = useConceptRegistry();
  const entry = useConceptDescriptor(code);
  const descriptor = entry?.descriptor ?? code;

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
        <p className="font-mono text-label text-muted-foreground">{code}</p>
        {entry?.what && (
          <p className="text-label leading-relaxed text-foreground/90">
            {entry.what.length > 120 ? entry.what.slice(0, 120) + "…" : entry.what}
          </p>
        )}
        <p className="text-micro text-muted-foreground/75 italic">Click to open in Library</p>
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
  const tokens = tokenizeConceptCodes(text, registry);

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
