export const METRIX_THEME_STORAGE_KEY = "metrix-theme";
export const METRIX_THEMES = ["light", "dark"] as const;
export type MetrixTheme = (typeof METRIX_THEMES)[number];

export function isMetrixTheme(value: unknown): value is MetrixTheme {
  return value === "light" || value === "dark";
}

/**
 * Establishes a deterministic theme before React mounts. This repairs stale or
 * malformed browser preferences, removes conflicting classes, and preserves a
 * usable dark default when storage is unavailable.
 */
export function initializeMetrixTheme(
  root: HTMLElement = document.documentElement,
  storage: Pick<Storage, "getItem" | "removeItem"> = window.localStorage,
): MetrixTheme {
  let storedTheme: string | null = null;
  try {
    storedTheme = storage.getItem(METRIX_THEME_STORAGE_KEY);
  } catch {
    // Private browsing and locked-down environments may deny storage access.
  }

  const theme: MetrixTheme = isMetrixTheme(storedTheme) ? storedTheme : "dark";
  if (storedTheme !== null && !isMetrixTheme(storedTheme)) {
    try {
      storage.removeItem(METRIX_THEME_STORAGE_KEY);
    } catch {
      // The applied in-memory theme remains fully usable for this session.
    }
  }

  root.classList.remove(...METRIX_THEMES);
  root.classList.add(theme);
  root.style.colorScheme = theme;
  return theme;
}