// ─── Share-chart slice allocation ─────────────────────────────────────
//
// A categorical palette has a fixed number of slots. The share donut used
// to have ten entries and cycle with `i % length` past them — and four of
// those ten were aliases that resolve to a colour already in the list:
//
//   slot 6  hsl(var(--metrix-cyan))    -> --accent    #00d4ff  = slot 2
//   slot 7  hsl(var(--primary))        -> --primary   #9184d9  = slot 1
//   slot 8  hsl(var(--metrix-gold))    -> --chart-4   #e8a33d  = slot 4
//   slot 9  hsl(var(--metrix-success)) -> --chart-3   #3ecfad  = slot 3
//
// So a seven-slice donut painted slice 7 the same colour as slice 1, and a
// nine-slice donut repeated four colours — the legend mapped two different
// segment names onto one swatch, which makes the chart unreadable in the
// exact case (many segments) where a reader most needs it. jsdom could not
// see this because it does not resolve CSS variables: all ten strings are
// textually distinct. Slot 10 was `--metrix-danger`, a reserved status
// colour, used as an ordinary series.
//
// The rule this restores is the categorical one: hues are assigned in a
// fixed order and never cycled; anything past the last slot folds into a
// neutral "Other" rather than borrowing a colour that already means
// something else. Nothing is discarded — `folded` carries the names so the
// tooltip can still say what is inside the bucket.

export interface ShareSlice {
  name: string;
  value: number;
}

export interface ShareAllocation {
  /** Slices that get their own categorical colour, largest first. */
  named: ShareSlice[];
  /** Everything rolled into the neutral bucket, largest first. */
  folded: ShareSlice[];
  /** The bucket itself, or null when nothing folded. */
  other: ShareSlice | null;
  /** What the chart draws: `named`, plus `other` when there is one. */
  slices: ShareSlice[];
  total: number;
}

/** Below this share of the total a slice is too thin to read at donut size. */
export const MIN_SHARE = 0.03;

/**
 * Allocate segments to the available categorical slots.
 *
 * @param maxNamed how many distinct categorical colours the palette has.
 */
export function allocateShareSlices(data: ShareSlice[], maxNamed: number): ShareAllocation {
  const total = data.reduce((n, d) => n + d.value, 0);
  const threshold = total * MIN_SHARE;
  const ranked = [...data].sort((a, b) => b.value - a.value);

  const named: ShareSlice[] = [];
  const folded: ShareSlice[] = [];
  for (const d of ranked) {
    if (d.value >= threshold && named.length < maxNamed) named.push(d);
    else folded.push(d);
  }

  // Folding a single segment costs it its name and buys nothing — there is
  // a free slot, so give it one.
  if (folded.length === 1 && named.length < maxNamed) named.push(folded.pop()!);

  const otherValue = folded.reduce((n, d) => n + d.value, 0);
  const other = folded.length > 0 ? { name: "Other", value: otherValue } : null;

  return { named, folded, other, slices: other ? [...named, other] : named, total };
}
