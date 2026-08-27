# METRIX — Colour system: findings and the palette decision

Written 2026-08-27. Every number here was computed with the data-viz validator
(`validate_palette.js`, Machado–Oliveira–Fernandes CVD simulation, OKLab ΔE×100)
against the real Metrix dark card surface `#232532` — none of it was eyeballed.

## 1. What was wrong, and why nothing caught it

The design system shipped `destructive` and no other status colour. So the app
invented a status palette by borrowing chart slots:

```
--status-success: var(--chart-3)     --mx-success:    hsl(var(--chart-3))
--status-warning: var(--chart-4)     --mx-warning:    hsl(var(--chart-4))
--status-info:    var(--primary)     --metrix-gold:   var(--chart-4)
                                     --metrix-success: var(--chart-3)
```

`tokens.json` had this written down as a constraint rather than a defect:

> *"chart3 doubles as --mx-success in the IAP theme and must stay distinct from
> chart2's cyan"*

The coupling ran both ways. Two of five categorical slots were spoken for before
any chart was designed, so the palette could not move hue; and a palette change
would have silently repainted every success and warning state in the product.
Measured, the three coupled slots sat at **ΔE 0.0** from their status colour —
not similar, identical.

Consequences that shipped:

- **`SharePieChart` painted different segments the same colour.** Ten palette
  entries indexed `i % length`, four of which resolved to a colour already in the
  list (`--metrix-cyan`→slot 2, `--primary`→slot 1, `--metrix-gold`→slot 4,
  `--metrix-success`→slot 3), plus `--destructive` — a reserved status colour —
  as series 10. A seven-slice donut repeated a colour; a nine-slice donut
  repeated four. The legend then mapped two names onto one swatch.
- **jsdom cannot see any of it.** It does not resolve CSS variables, so all ten
  strings are textually distinct and every test passed. Same class of blind spot
  as the KPI-tile `overflow:hidden` bug.

Both are fixed, and `check:chart-palette` (wired into `.replit`) now fails on a
status role resolving to a chart slot, on two entries of a series palette
resolving to one colour, and on a modulo-indexed categorical scale. Each rule was
verified by restoring the original defect and watching it fire.

## 2. Measurements on the palettes considered

Dark mode, surface `#232532`. Gates: OKLCH L within 0.48–0.67, chroma ≥ 0.10,
CVD ΔE ≥ 8 (min of protan/deutan), normal-vision ΔE ≥ 15 (hard), contrast ≥ 3:1.

| Palette | Verdict |
|---|---|
| **Proposed zinc set** `#d4d4d8,#71717b,#52525c,#3f3f46,#27272a` | **FAIL ×3.** All five below the chroma floor (0.005–0.016 — they read grey, not as five categories). Three outside the lightness band. Normal-vision worst 7.2. Contrast down to **1.02:1**. Via the aliases above it would also have made success and warning both grey, 1.35:1 from each other. |
| **Current Nocturne** `#9184d9,#00d4ff,#3ecfad,#e8a33d,#9397ab` | **FAIL ×3.** Cyan/teal/amber all above the dark lightness band (0.804/0.770/0.765); chart5 is grey (C 0.03); cyan↔teal ΔE 11.4 under *normal* vision. |
| **Current light** `#0369a1,#0e7490,#047857,#b45309,#64748b` | **FAIL ×3.** Worse. chart1↔chart2 are ΔE **4.8** apart under normal vision — effectively one colour. Two of five below the chroma floor. |
| **Recommended** (below) | **PASS, every check, on both pairlists.** |

The zinc set fails *as chart series*. As surfaces, borders and text it is a
perfectly reasonable modern neutral — those are different roles, and adopting it
there is independent of this decision. What must not happen is zinc steps landing
in `chart1‑5`.

## 3. The recommended categorical scale

```
chart1  #7b63d6   brand blurple (hue 289.6 — Metrix identity, held)
chart2  #879f18   citron
chart3  #379fc7   azure
chart4  #008362   deep green
chart5  #f83b8c   magenta
```

| Check | adjacent | all pairs |
|---|---|---|
| Lightness band (0.48–0.67) | PASS | PASS |
| Chroma floor (≥ 0.10) | PASS | PASS |
| CVD separation (≥ 8) | 8.5 · tritan 10.8 | **8.5** · tritan 8.6 |
| Normal-vision floor (≥ 15) | 16.3 | 16.3 |
| Contrast vs `#232532` (≥ 3:1) | PASS | PASS |

Clearing the **all-pairs** pairlist is what matters beyond bars and lines: it is
the requirement for scatter, bubble, heatmap and cluster views, where any two
series can end up adjacent. Neither the current palette nor any earlier candidate
cleared it. Slot 1 holds the brand hue, so identity survives the change.

Separation from the reserved status colours, measured rather than assumed:

```
slot1 #7b63d6  nearest status  info    ΔE  9.2   <- see §4
slot2 #879f18                  warning ΔE 15.6
slot3 #379fc7                  info    ΔE 12.1   <- see §4
slot4 #008362                  success ΔE 23.0
slot5 #f83b8c                  danger  ΔE 13.8
```

No five-hue set on a dark surface inside the lightness band can be ≥15 ΔE from
four status colours *and* ≥15 from each other — there is not enough room. The
residual is handled the way the standard already requires: a legend is always
present, ≤4 series are also direct-labelled, and status ships with an icon and a
label, never colour alone.

## 4. Still open

- **`--status-info: var(--primary)`.** Info is still the brand blurple, which is
  also chart1 — the last instance of the coupling this document removes
  everywhere else. Options: give info its own hue, or accept it on the grounds
  that info states are rare and always carry an icon and label. Needs a call.
- **A light Nocturne theme.** The light palette is a Command Deck derivative and
  fails harder than dark. It needs designing, not patching.
- **993 raw Tailwind colour classes across 76 files** bypass the token system
  entirely (`bg-emerald-500`, `text-amber-400`, `border-red-500/40`, …). **89% of
  them are emerald / amber / red** — success, warning and danger, written by hand
  because there was no token to point at. Now there is. Until they are migrated,
  changing `tokens.json` moves almost nothing on screen, and the platform keeps
  the default palette every shadcn dashboard ships with.
