// ─── Shared Metrix brand treatment ─────────────────────────────────────
// One place for the real logo asset so login, password screens, topbar,
// and sidebar all render the same brand mark.

import { cn } from "@workspace/command-deck/lib/utils";

const LOGO_SRC = `${import.meta.env.BASE_URL}metrix-logo.png`;

export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={LOGO_SRC}
      alt="Metrix"
      className={cn("object-contain shrink-0 mx-logo-glow", className)}
    />
  );
}

/** Centered brand block for auth screens (logo + wordmark). */
export function AuthBrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="text-center space-y-2">
      <BrandLogo className="w-10 h-10 mx-auto" />
      <h1 className="text-h4 font-h4 font-semibold text-foreground normal-case tracking-normal">Metrix</h1>
      {subtitle ? (
        <p className="text-body text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}
