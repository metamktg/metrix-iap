// ─── Shared Metrix brand treatment (marketing site) ────────────────────
// One place for the real logo asset so the header on every page renders
// the same brand mark.
//
// The PNG is the gradient infinity-loop icon. The wordmark "metrix"
// (lowercase, matching the brand guidelines) sits inline to its right.

const LOGO_SRC = `${import.meta.env.BASE_URL}metrix-logo.png`;

export function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src={LOGO_SRC}
        alt=""
        aria-hidden="true"
        className="w-9 h-9 object-contain drop-shadow-[0_0_8px_rgba(0,140,255,0.55)]"
      />
      <span
        className="font-extrabold text-xl tracking-tight text-white"
        style={{ letterSpacing: "-0.02em" }}
      >
        metrix
      </span>
    </div>
  );
}
