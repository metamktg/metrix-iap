import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";

export const METRIX_THEME_STORAGE_KEY = "metrix-theme";

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