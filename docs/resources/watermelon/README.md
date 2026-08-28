# Watermelon component sources

The registry JSON for every component named in the reference sheet, fetched
verbatim from `https://registry.watermelon.sh/r/<slug>.json`.

**Why these are checked in.** The reference sheet gives URLs; working from a
URL means each pass re-reads a page and reconstructs the pattern from
memory, which is how you end up with a component that has the reference's
*shape* and none of its mechanics. The actual source removes the guessing:
the container ladder, the transition values and the ARIA are all right here.

Each file has `{ name, dependencies, files: [{ path, content }] }`.

## What is here

16 of the 17 slugs resolve. **`card-split-accordian` 404s** — the registry
serves the SPA shell for it, so either the slug in the reference sheet is
wrong or the component was renamed. Everything else fetched clean.

## Reading them against this codebase

These are not drop-ins and must not be pasted. They target
`motion/react` + `@hugeicons/react` + neutral-palette Tailwind; this app uses
`framer-motion`, `lucide-react`, and a token palette that
`check:token-colors` enforces. What transfers is the MECHANIC — the
container structure, the transition shape, the interaction model — not the
markup.

Two things that turned out to matter more than they look:

- **The container ladder.** Nested planes with concentric radii
  (24 → 16 → 8, each step the parent's radius minus its padding) are how the
  reference makes depth legible without labels. Copying the animation and
  skipping the ladder produces a component that opens but does not read as
  layered. See `LayeredDisclosure.tsx`.
- **Blur on reveal.** `filter: blur(4px) → blur(0)` alongside height and
  opacity. It is what makes revealed content read as *arriving* rather than
  as having been there all along.

One value is deliberately changed: the reference travels revealed content
`y: -50`, sized for a phone-sized settings card. In a dense analytical
surface that moves every line the reader was holding by half an inch. The
offset exists to signal direction, and 8px signals it as well as 50 without
moving anyone's reading target.
