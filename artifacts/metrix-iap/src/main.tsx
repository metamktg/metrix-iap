import { createRoot } from "react-dom/client";
import App from "./App";
import { MetrixThemeProvider } from "./components/theme/MetrixThemeProvider";
import { initializeMetrixTheme } from "./components/theme/themePreference";
import "./index.css";

initializeMetrixTheme();

createRoot(document.getElementById("root")!).render(
  <MetrixThemeProvider>
    <App />
  </MetrixThemeProvider>,
);
