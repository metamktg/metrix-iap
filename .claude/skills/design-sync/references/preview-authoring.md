# Writing a preview card

Every file pushed to the design-system project is a single **self-contained**
HTML document — no external requests, everything inlined. The claude.ai
Design System pane discovers cards purely from a first-line comment; nothing
else needs registering.

## Required shape

```html
<!-- @dsCard group="Buttons" -->
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      /* inline CSS only — pull values from references/tokens.md */
    </style>
  </head>
  <body>
    <!-- static markup showing the component's real variants -->
  </body>
</html>
```

Rules:
- Line 1 is exactly `<!-- @dsCard group="<Group>" -->` — use the component's
  source directory as the group (`ui` → e.g. `"Buttons"`, `"Cards"`;
  `brand` → `"Brand"`; `charts` → `"Charts"`, etc.). No trailing content on
  that line.
- No `<link>`, `<script src=...>`, web fonts, or any other network fetch —
  the pane's sandbox blocks it the same way Artifacts do. Declare the real
  font stack from `tokens.md` (`'Inter', 'Manrope', system-ui, sans-serif`)
  and let it fall back to a system sans; don't fetch Inter from a CDN.
- Background the card in the app's real surface (`--mx-bg-main` /
  `--mx-bg-card`) — components are never previewed on white, the app is
  dark-only.
- Show the component's *actual* variants (read them off its `cva` config in
  the `.tsx` source), not a guessed subset. If a variant is genuinely
  unreachable from a static preview (e.g. it needs live interaction/state),
  render its resting visual state rather than skipping it.

## Worked example: `Button` (`artifacts/metrix-iap/src/components/ui/button.tsx`)

The source defines, via `cva`:

- `variant`: `default | destructive | outline | secondary | ghost | link`
- `size`: `default | sm | lg | icon`
- shared behavior: `.hover-elevate` / `.active-elevate-2` (Replit utility
  classes, not Tailwind core — reproduce as plain `:hover`/`:active` overlay
  rules using `--elevate-1` / `--elevate-2` from `tokens.md`)

A preview covering the variant axis at default size:

```html
<!-- @dsCard group="Buttons" -->
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        margin: 0;
        padding: 32px;
        background: #050b18; /* --mx-bg-main */
        font-family: 'Inter', 'Manrope', system-ui, sans-serif;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        white-space: nowrap;
        border-radius: 0.375rem; /* --radius-md */
        font-size: 0.875rem;
        font-weight: 500;
        min-height: 2.25rem; /* min-h-9 */
        padding: 0.5rem 1rem; /* px-4 py-2 */
        border: 1px solid transparent;
        cursor: pointer;
        position: relative;
      }
      .btn:hover::after,
      .btn:active::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: rgba(255, 255, 255, 0.04); /* --elevate-1 */
        pointer-events: none;
      }
      .btn:active::after { background: rgba(255, 255, 255, 0.09); } /* --elevate-2 */

      .btn-default     { background: #155dff; color: #fff; border-color: rgba(21,93,255,0.85); }
      .btn-destructive { background: #ff4f61; color: #fff; border-color: rgba(255,79,97,0.85); }
      .btn-secondary   { background: rgba(255,255,255,0.06); color: #d7deec; border-color: rgba(255,255,255,0.15); }
      .btn-outline     { background: transparent; color: #f5f8ff; border-color: rgba(255,255,255,0.10); }
      .btn-ghost       { background: transparent; color: #f5f8ff; border-color: transparent; }
      .btn-link        { background: transparent; color: #155dff; border-color: transparent; padding: 0; text-decoration: underline; text-underline-offset: 4px; }
    </style>
  </head>
  <body>
    <button class="btn btn-default">Default</button>
    <button class="btn btn-destructive">Destructive</button>
    <button class="btn btn-secondary">Secondary</button>
    <button class="btn btn-outline">Outline</button>
    <button class="btn btn-ghost">Ghost</button>
    <button class="btn btn-link">Link</button>
  </body>
</html>
```

If the size axis is also worth showing, add a second row (or a second card
in the same group) applying `min-height`/`padding`/`font-size` per size
(`sm`: `2rem` / `0.5rem 0.75rem` / `0.75rem`; `lg`: `2.5rem` / `0.5rem 2rem`
/ `0.875rem`; `icon`: `2.25rem` square, no label). Keep variant and size
axes visually distinguishable — a reviewer should be able to tell every
card apart at a glance (this is what the `variantsIdentical` validation
count in step 9 of `SKILL.md` is checking for).

## Checklist before including a preview in `writes`

- [ ] First line is a valid `@dsCard` comment with the right `group`.
- [ ] No external requests (fonts, scripts, images, stylesheets).
- [ ] Colors/radius/shadows/fonts match `references/tokens.md`, not guesses.
- [ ] Every declared variant renders visibly different from its neighbors.
- [ ] You've actually opened the file and looked at it.
