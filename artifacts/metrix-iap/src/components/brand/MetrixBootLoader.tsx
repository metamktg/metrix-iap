// ─── Metrix boot loader ────────────────────────────────────────────────
// Branded "command deck powering up" full-screen loading state, recreated
// natively in CSS from the motion reference at
// artifacts/metrix-loading-video/src/components/video/.
// Pure CSS keyframes (see index.css "mx-boot-*") — no framer-motion at
// boot so the loader stays lightweight. Reduced-motion users get static
// frames via the global prefers-reduced-motion override.

import { BrandLogo } from "@/components/brand/BrandMark";

const PHASES = [
  "INITIALIZING",
  "CALIBRATING SENSORS",
  "SYNCING DATA STREAMS",
  "RENDERING DECK",
];

/** Skeleton tile with a blue→cyan sweep glint instead of a flat grey pulse. */
function GlintTile({ className, delay }: { className?: string; delay: number }) {
  return (
    <div className={`mx-boot-tile ${className ?? ""}`}>
      <span className="mx-boot-glint" style={{ animationDelay: `${delay}s` }} />
    </div>
  );
}

export function MetrixBootLoader() {
  return (
    <div
      className="h-screen w-screen mx-app-bg flex items-center justify-center"
      role="status"
      aria-busy="true"
      aria-label="Loading Metrix data"
    >
      <div className="flex flex-col items-center gap-8 px-6">
        {/* Glowing logo core with rotating orbital ring */}
        <div className="relative w-24 h-24 grid place-items-center">
          <span className="mx-boot-core-glow" aria-hidden="true" />
          <span className="mx-boot-ring" aria-hidden="true" />
          <BrandLogo className="w-12 h-12 mx-boot-logo-pulse relative" />
        </div>

        {/* Boot phase readout + blue→cyan progress sweep */}
        <div className="w-64 flex flex-col items-center gap-2.5">
          {/* All phase labels stay in the DOM; only opacity cycles — no layout jump. */}
          <div className="relative h-4 w-full" aria-hidden="true">
            {PHASES.map((phase, i) => (
              <span
                key={phase}
                className="mx-boot-phase absolute inset-0 text-center font-mono text-[10px] font-semibold tracking-[0.22em] text-text-secondary"
                style={{ animationDelay: `${i * 1.1}s` }}
              >
                {phase}
              </span>
            ))}
          </div>
          <div className="mx-boot-track" aria-hidden="true">
            <span className="mx-boot-fill" />
          </div>
        </div>

        {/* Branded skeleton tiles echoing the app's KPI layout */}
        <div className="w-full max-w-xl space-y-3" aria-hidden="true">
          <GlintTile className="h-3 w-1/3" delay={0} />
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {[0.15, 0.3, 0.45, 0.6].map((d, i) => (
              <div
                key={i}
                className="rounded-xl border border-border/30 bg-white/[0.02] px-3 py-2.5 space-y-2"
              >
                <GlintTile className="h-2 w-2/3" delay={d} />
                <GlintTile className="h-5 w-1/2" delay={d + 0.2} />
              </div>
            ))}
          </div>
          <GlintTile className="h-24 w-full" delay={0.4} />
          <GlintTile className="h-16 w-full" delay={0.7} />
        </div>
      </div>
    </div>
  );
}
