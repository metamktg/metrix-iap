import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { METRIX_THEME_STORAGE_KEY } from "./themePreference";

export { METRIX_THEME_STORAGE_KEY } from "./themePreference";

export function MetrixThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey={METRIX_THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}