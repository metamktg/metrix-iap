# Metrix IAP design tokens

Extracted from `artifacts/metrix-iap/src/index.css` (Tailwind v4 `@theme
inline` + HSL channel variables). The app is **dark-only**: `:root` and
`.dark` define identical values, so previews can use either block — there is
no separate light theme to worry about.

Use these values verbatim in preview HTML. Don't invent colors or approximate
from memory.

## Raw cockpit tokens (spec)

```css
--mx-bg-deep: #020711;
--mx-bg-main: #050b18;
--mx-bg-panel: rgba(8, 18, 38, 0.82);
--mx-bg-card: rgba(9, 24, 50, 0.72);
--mx-bg-card-hover: rgba(12, 34, 70, 0.86);

--mx-border-soft: rgba(86, 140, 255, 0.18);
--mx-border-medium: rgba(71, 163, 255, 0.32);
--mx-border-strong: rgba(0, 188, 255, 0.55);

--mx-blue: #155dff;
--mx-blue-bright: #1f8fff;
--mx-cyan: #16d9ff;
--mx-cyan-soft: #62e6ff;
--mx-indigo: #183bff;

--mx-text-main: #f5f8ff;
--mx-text-muted: #aab6ca;
--mx-text-soft: #c6d2e5;
--mx-text-faint: #8796ac;

--mx-success: #35d96f;
--mx-danger: #ff4f61;
--mx-warning: #f7c948;

--mx-shadow-blue: 0 0 28px rgba(0, 128, 255, 0.28);
--mx-shadow-cyan: 0 0 36px rgba(22, 217, 255, 0.24);
```

## Semantic tokens (HSL channels — used as `hsl(var(--x))`)

| Token | HSL | Approx. hex | Notes |
|---|---|---|---|
| `--background` | `221 66% 6%` | `#050b18` | page background |
| `--foreground` | `222 100% 97%` | `#f5f8ff` | primary text |
| `--border` | `221 53% 20%` | | default border |
| `--card` | `218 65% 10%` | | glass navy panel |
| `--card-foreground` | `222 100% 97%` | `#f5f8ff` | |
| `--card-border` | `221 53% 20%` | | |
| `--sidebar` | `220 79% 4%` | `#020711` | deepest layer |
| `--popover` | `219 65% 9%` | | |
| `--primary` | `222 100% 54%` | `#155dff` | electric blue |
| `--primary-foreground` | `0 0% 100%` | `#ffffff` | |
| `--secondary` | `218 55% 15%` | | subtle glass surface |
| `--secondary-foreground` | `217 37% 84%` | | |
| `--muted` | `219 45% 16%` | | |
| `--muted-foreground` | `216 22% 74%` | | |
| `--accent` | `218 55% 17%` | | elevated panel |
| `--accent-foreground` | `217 37% 88%` | | |
| `--destructive` | `354 100% 65%` | `#ff4f61` | controlled red |
| `--destructive-foreground` | `0 0% 100%` | `#ffffff` | |
| `--input` | `221 50% 26%` | | |
| `--ring` | `222 100% 54%` | `#155dff` | |
| `--chart-1` | `222 100% 54%` | `#155dff` | |
| `--chart-2` | `190 100% 54%` | | |
| `--chart-3` | `44 92% 63%` | `#f7c948`-ish | |
| `--chart-4` | `141 68% 53%` | `#35d96f`-ish | |
| `--chart-5` | `354 100% 65%` | `#ff4f61` | |

Border variants (`--primary-border`, `--secondary-border`, etc.) are computed
as the base color lightened via `hsl(from ... calc(l + 9))` — for a static
preview, approximate with the base color at ~85% opacity over the panel
background rather than reproducing the `hsl(from ...)` relative-color syntax
(support for it varies).

## Type, radius, spacing

```css
--app-font-sans: 'Inter', 'Manrope', system-ui, sans-serif;
--app-font-serif: Georgia, serif;
--app-font-mono: 'IBM Plex Mono', 'SFMono-Regular', 'Menlo', Consolas, monospace;

--radius: 0.5rem;      /* --radius-lg */
--radius-sm: calc(var(--radius) - 4px);  /* 0.25rem */
--radius-md: calc(var(--radius) - 2px);  /* 0.375rem */
--radius-xl: calc(var(--radius) + 4px);  /* 0.75rem */

--spacing: 0.25rem;
--tracking-normal: 0em;
```

## Shadows (dark palette — `.dark` values, identical set used everywhere)

```css
--shadow-2xs: 0 1px 2px 0 rgba(0,0,0,0.5);
--shadow-xs:  0 1px 3px 0 rgba(0,0,0,0.6);
--shadow-sm:  0 2px 4px -1px rgba(0,0,0,0.6), 0 1px 2px -1px rgba(0,0,0,0.5);
--shadow:     0 4px 6px -2px rgba(0,0,0,0.7), 0 2px 4px -1px rgba(0,0,0,0.5);
--shadow-md:  0 6px 10px -3px rgba(0,0,0,0.7), 0 3px 6px -2px rgba(0,0,0,0.5);
--shadow-lg:  0 10px 20px -5px rgba(0,0,0,0.8), 0 4px 8px -3px rgba(0,0,0,0.5);
--shadow-xl:  0 20px 30px -8px rgba(0,0,0,0.9), 0 8px 12px -4px rgba(0,0,0,0.5);
--shadow-2xl: 0 24px 48px -12px rgba(0,0,0,1);
```

## Component-level border variables

Several components read a bare (non-HSL) CSS var directly:

```css
--button-outline: rgba(255,255,255, .10);
--badge-outline: rgba(255,255,255, .05);
--elevate-1: rgba(255,255,255, .04);   /* .hover-elevate overlay */
--elevate-2: rgba(255,255,255, .09);   /* .active-elevate-2 overlay */
```

If a component preview needs `.hover-elevate` / `.active-elevate-2` behavior,
reproduce it as a plain `:hover` / `:active` background-overlay rule in the
preview's inline `<style>` — these are Replit-specific utility classes, not
Tailwind core, and won't exist unless hand-authored into the preview.

Always re-check this file against the live `artifacts/metrix-iap/src/index.css`
before a sync if it's been a while — tokens do change as the app evolves.
