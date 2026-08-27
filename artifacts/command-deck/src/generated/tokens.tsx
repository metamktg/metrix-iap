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
      "background": "#050b18",
      "foreground": "#f5f8ff",
      "border": "#142242",
      "card": "#09152a",
      "cardForeground": "#f5f8ff",
      "popover": "#070d1d",
      "popoverForeground": "#f5f8ff",
      "primary": "#155dff",
      "primaryForeground": "#f5f8ff",
      "secondary": "#0f1c33",
      "secondaryForeground": "#c6d2e5",
      "muted": "#0f1c33",
      "mutedForeground": "#aab6ca",
      "accent": "#16d9ff",
      "accentForeground": "#020711",
      "destructive": "#ff4f61",
      "destructiveForeground": "#f5f8ff",
      "success": "#35d96f",
      "successForeground": "#020711",
      "warning": "#f7c948",
      "warningForeground": "#020711",
      "info": "#155dff",
      "infoForeground": "#f5f8ff",
      "input": "#142242",
      "ring": "#6497ff",
      "chart1": "#3574ff",
      "chart2": "#008faa",
      "chart3": "#963ac4",
      "chart4": "#6a8620",
      "chart5": "#c5146a",
      "sidebar": "#091020",
      "sidebarForeground": "#c6d2e5",
      "sidebarBorder": "#142242",
      "sidebarPrimary": "#155dff",
      "sidebarPrimaryForeground": "#f5f8ff",
      "sidebarAccent": "#0f1c33",
      "sidebarAccentForeground": "#f5f8ff",
      "sidebarRing": "#6497ff"
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
  "radius": "0.625rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
