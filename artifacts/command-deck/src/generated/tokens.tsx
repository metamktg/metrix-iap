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
      "destructive": "#b91c1c",
      "destructiveForeground": "#ffffff",
      "success": "#047857",
      "successForeground": "#f2f6fb",
      "warning": "#b45309",
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
      "destructive": "#e4572e",
      "destructiveForeground": "#161826",
      "success": "#3ecfad",
      "successForeground": "#161826",
      "warning": "#e8a33d",
      "warningForeground": "#161826",
      "info": "#9184d9",
      "infoForeground": "#161826",
      "input": "#2c3e5c",
      "ring": "#9184d9",
      "chart1": "#7b63d6",
      "chart2": "#879f18",
      "chart3": "#379fc7",
      "chart4": "#008362",
      "chart5": "#f83b8c",
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
