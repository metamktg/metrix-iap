import { createRoot } from "react-dom/client";
import App from "./App";
import { MetrixThemeProvider } from "./components/theme/MetrixThemeProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <MetrixThemeProvider>
    <App />
  </MetrixThemeProvider>,
);
