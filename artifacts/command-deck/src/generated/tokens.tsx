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
      "destructive": "#dc2626",
      "destructiveForeground": "#fef2f2",
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
      "background": "#050a14",
      "foreground": "#e2e8f0",
      "border": "#16324e",
      "card": "#091224",
      "cardForeground": "#e2e8f0",
      "popover": "#0e1b35",
      "popoverForeground": "#e2e8f0",
      "primary": "#38bdf8",
      "primaryForeground": "#050a14",
      "secondary": "#0e1b35",
      "secondaryForeground": "#8fa6c4",
      "muted": "#0b1526",
      "mutedForeground": "#8fa6c4",
      "accent": "#22d3ee",
      "accentForeground": "#050a14",
      "destructive": "#ef4444",
      "destructiveForeground": "#fef2f2",
      "input": "#16324e",
      "ring": "#38bdf8",
      "chart1": "#38bdf8",
      "chart2": "#22d3ee",
      "chart3": "#10b981",
      "chart4": "#f59e0b",
      "chart5": "#94a3b8",
      "sidebar": "#050d1a",
      "sidebarForeground": "#8fa6c4",
      "sidebarBorder": "#16324e",
      "sidebarPrimary": "#38bdf8",
      "sidebarPrimaryForeground": "#050a14",
      "sidebarAccent": "#0e1b35",
      "sidebarAccentForeground": "#e2e8f0",
      "sidebarRing": "#38bdf8"
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
  "radius": "0.125rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
