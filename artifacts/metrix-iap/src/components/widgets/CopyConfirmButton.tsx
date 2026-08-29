// Copy-to-clipboard with an in-button confirmation morph.
//
// Watermelon `copy-confirm`, taken as a mechanic: the trigger's own icon
// cross-fades to a check — scale 0.25 → 1 with blur(4px) → 0 — and reverts
// on a timer. No global toast for a purely local action: the confirmation
// appears exactly where the reader's eye already is, on the button they
// just pressed.
//
// Three surfaces hand-rolled this (admin temp-password copy, waitlist
// section, integrations panel), each with its own timer, its own icon
// swap, and no shared timing. This is the one implementation; the timing
// values are the icon-swap recipe the motion foundation standardises
// (spring, bounce 0), honoring reduced motion.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";

const REVERT_MS = 1800;

export function CopyConfirmButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  className,
  "data-testid": testId,
}: {
  /** The text written to the clipboard. */
  value: string;
  /** Visible label beside the icon; empty string renders icon-only. */
  label?: string;
  copiedLabel?: string;
  className?: string;
  "data-testid"?: string;
}) {
  const [copied, setCopied] = useState(false);
  const reduced = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), REVERT_MS);
    } catch {
      /* clipboard unavailable — the button simply doesn't confirm */
    }
  };

  const iconMotion = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
        animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
        exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
      };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      data-testid={testId}
      className={cn(
        "pressable inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/40 text-caption font-medium transition-colors",
        copied
          ? "text-status-success border-status-success/30 bg-status-success/[0.06]"
          : "text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04]",
        className,
      )}
    >
      <span className="relative w-3.5 h-3.5 shrink-0">
        <AnimatePresence initial={false} mode="wait">
          {copied ? (
            <motion.span key="check" className="absolute inset-0" {...iconMotion}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}>
              <Check className="w-3.5 h-3.5" />
            </motion.span>
          ) : (
            <motion.span key="copy" className="absolute inset-0" {...iconMotion}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}>
              <Copy className="w-3.5 h-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {label !== "" && (copied ? copiedLabel : label)}
    </button>
  );
}

/**
 * The same in-place confirmation morph for an arbitrary action — a file
 * download, an export — where the browser's own feedback (a downloads
 * shelf that may be hidden) is the only other signal. Idle icon in,
 * check out, revert on a timer; a rejected action never confirms.
 */
export function ActionConfirmButton({
  onAction,
  icon: Icon,
  label,
  confirmedLabel = "Saved",
  className,
  "data-testid": testId,
}: {
  onAction: () => void | Promise<void>;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  confirmedLabel?: string;
  className?: string;
  "data-testid"?: string;
}) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const reduced = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onAction();
      setDone(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), REVERT_MS);
    } finally {
      setBusy(false);
    }
  };

  const iconMotion = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
        animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
        exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
      };

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy}
      aria-live="polite"
      data-testid={testId}
      className={cn(
        "pressable flex items-center gap-1.5 h-9 px-3.5 rounded-md border font-medium transition-colors disabled:opacity-60",
        done
          ? "text-status-success border-status-success/30 bg-status-success/[0.06]"
          : "border-border/50 text-foreground hover:bg-foreground/5",
        className,
      )}
    >
      <span className="relative w-3.5 h-3.5 shrink-0">
        <AnimatePresence initial={false} mode="wait">
          {done ? (
            <motion.span key="check" className="absolute inset-0" {...iconMotion}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}>
              <Check className="w-3.5 h-3.5" />
            </motion.span>
          ) : (
            <motion.span key="idle" className="absolute inset-0" {...iconMotion}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}>
              <Icon className="w-3.5 h-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {done ? confirmedLabel : label}
    </button>
  );
}
