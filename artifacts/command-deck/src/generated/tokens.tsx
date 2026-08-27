/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f2f6fb",
      "foreground": "#0b1526",
      "border": "#c9d8e8",
      "card": "#ffffff",
      "cardForeground": "#0b1526",
      "popover": "#ffffff",
      "popoverForeground": "#0b1526",
      "primary": "#0369a1",
      "primaryForeground": "#f2f6fb",
      "secondary": "#e2eaf3",
      "secondaryForeground": "#1e3a5f",
      "muted": "#e8eef6",
      "mutedForeground": "#4c6079",
      "accent": "#0e7490",
      "accentForeground": "#f2f6fb",
      "destructive": "#c22336",
      "destructiveForeground": "#ffffff",
      "success": "#12924a",
      "successForeground": "#f2f6fb",
      "warning": "#8a6a00",
      "warningForeground": "#f2f6fb",
      "info": "#0369a1",
      "infoForeground": "#f2f6fb",
      "input": "#c9d8e8",
      "ring": "#0369a1",
      "chart1": "#0369a1",
      "chart2": "#0e7490",
      "chart3": "#047857",
      "chart4": "#b45309",
      "chart5": "#64748b",
      "sidebar": "#e9f0f8",
      "sidebarForeground": "#33475e",
      "sidebarBorder": "#c9d8e8",
      "sidebarPrimary": "#0369a1",
      "sidebarPrimaryForeground": "#f2f6fb",
      "sidebarAccent": "#dbe6f2",
      "sidebarAccentForeground": "#0b1526",
      "sidebarRing": "#0369a1"
    },
    "dark": {
      "background": "#161826",
      "foreground": "#e9e9ed",
      "border": "#233248",
      "card": "#232532",
      "cardForeground": "#e9e9ed",
      "popover": "#292b31",
      "popoverForeground": "#e9e9ed",
      "primary": "#9184d9",
      "primaryForeground": "#161826",
      "secondary": "#2b2741",
      "secondaryForeground": "#cfd3e5",
      "muted": "#1c1e2c",
      "mutedForeground": "#9397ab",
      "accent": "#00d4ff",
      "accentForeground": "#161826",
      "destructive": "#ff4f61",
      "destructiveForeground": "#161826",
      "success": "#35d96f",
      "successForeground": "#161826",
      "warning": "#f7c948",
      "warningForeground": "#161826",
      "info": "#9184d9",
      "infoForeground": "#161826",
      "input": "#2c3e5c",
      "ring": "#9184d9",
      "chart1": "#598df9",
      "chart2": "#7a8201",
      "chart3": "#0c78a4",
      "chart4": "#cd3ec6",
      "chart5": "#1fa89c",
      "sidebar": "#12141f",
      "sidebarForeground": "#9397ab",
      "sidebarBorder": "#1b2739",
      "sidebarPrimary": "#9184d9",
      "sidebarPrimaryForeground": "#161826",
      "sidebarAccent": "#232532",
      "sidebarAccentForeground": "#e9e9ed",
      "sidebarRing": "#9184d9"
    }
  },
  "fontFamily": {
    "sans": [
      "Inter",
      "sans-serif"
    ],
    "serif": [
      "Georgia",
      "serif"
    ],
    "mono": [
      "Share Tech Mono",
      "monospace"
    ]
  },
  "radius": "0.5rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
