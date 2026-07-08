// ─── Shared Metrix brand treatment (marketing site) ────────────────────
// One place for the real logo asset so the header on every page renders
// the same brand mark.

const LOGO_SRC = `${import.meta.env.BASE_URL}metrix-logo.png`;

export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <img
        src={LOGO_SRC}
        alt="Metrix"
        className="w-8 h-8 object-contain mx-glow-blue"
      />
      <span className="font-bold text-xl tracking-tight text-white">Metrix</span>
    </div>
  );
}
