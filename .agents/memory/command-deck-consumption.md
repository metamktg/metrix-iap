---
name: Command Deck consumption in Metrix IAP
description: How the metrix-iap app consumes the command-deck design system theme and tokens
---

- Theme comes from the @workspace/command-deck package; app forces .dark on <html>.
- **Rule:** no raw color literals (hex/rgb) in Metrix IAP styling — neither index.css nor component TSX/registry/chart props. Always alias a design-system variable (background/card/popover/muted/sidebar/primary/accent/chart-N/destructive/foreground/muted-foreground) or an app alias derived from one.
- **Why:** raw literals silently stop following tokens.json edits, defeating the design-system unification.
- **How to apply:** channel-triplet tokens (consumed as hsl(var(--x)) or hsl(var(--x)/a)) must alias other channel tokens; full-color tokens can use hsl()/color-mix(). In Tailwind arbitrary values prefer named utilities (bg-accent/10) over bracketed colors.
- The standalone css-token-contrast check merges the package's `.dark` block into its var map so cross-package var chains resolve; it fails if zero tokens evaluate. Test-side contrast checks read tokens via loadEffectiveThemeCss().
