import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { TaskTray } from "./TaskTray";
import { GlobalRunningBanner } from "./GlobalRunningBanner";
import { SeedRefreshFailedBanner } from "./SeedRefreshFailedBanner";
import { useTaskTray } from "@/contexts/TaskTrayContext";
import { DeepDivePanel } from "@/components/deepdive/DeepDivePanel";
import { useIsCompactShell } from "@/lib/useMediaQuery";

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * The application frame.
 *
 * Below 1024px the sidebar stops being a rail beside the content and becomes
 * a drawer over it. Before this it was neither — it was a permanent 216px
 * rail at every width, so a 390px phone gave the actual page 174px. That is
 * not a cramped layout, it is an unusable one, and there was no breakpoint
 * anywhere in the shell to make it otherwise.
 *
 * The drawer is a real dialog: it traps nothing (the page behind it is inert
 * via aria-hidden rather than a focus trap, which keeps the browser's own
 * back-gesture working), closes on Escape, closes on backdrop press, and
 * closes on navigation — because a nav drawer that stays open after you have
 * navigated hides the page you just asked for.
 */
export function AppShell({ children }: AppShellProps) {
  useTaskTray();
  const compact = useIsCompactShell();
  const [navOpen, setNavOpen] = useState(false);
  const [location] = useLocation();

  // Navigating closes the drawer. Keyed on location so it fires for any
  // route change, including one triggered from inside the drawer itself.
  useEffect(() => { setNavOpen(false); }, [location]);

  // Leaving compact width closes it too, so returning to a desktop layout
  // never leaves an invisible open drawer holding a scroll lock.
  useEffect(() => { if (!compact) setNavOpen(false); }, [compact]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNavOpen(false); };
    document.addEventListener("keydown", onKey);
    // The page behind a modal drawer must not scroll under it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  return (
    // h-dvh, not h-screen. 100vh on iOS Safari and Chrome Android is the
    // viewport WITHOUT the collapsing browser chrome, so the bottom of a
    // 100vh app sits behind the URL bar and its last row is unreachable.
    // w-full, not w-screen: 100vw includes the scrollbar gutter and produces
    // a horizontal scrollbar on every desktop that shows one.
    <div className="flex h-dvh w-full overflow-hidden mx-app-bg">
      {compact ? (
        <>
          {/* Backdrop. Rendered only when open so it can never swallow a
              press while invisible. */}
          {navOpen && (
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setNavOpen(false)}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
            />
          )}
          <div
            className={`fixed inset-y-0 left-0 z-50 flex transition-transform duration-200
                        ease-[cubic-bezier(0.2,0,0,1)] ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
            // INERT, not just aria-hidden.
            //
            // aria-hidden hides a subtree from assistive tech and does
            // nothing about focus. The closed drawer is still in the layout
            // — translated off-screen, not unmounted — so every link and
            // button inside it stayed in the tab order. On a phone, tabbing
            // off the menu button walked into ~20 invisible nav controls
            // before reaching the page. Focusing an aria-hidden element is
            // also a spec violation that Chrome logs.
            //
            // `inert` is the attribute that actually means it: no focus, no
            // pointer events, no AT, no find-in-page. React 19 supports it
            // as a boolean prop.
            //
            // Still not unmounted, for the original reason: unmounting would
            // reset the sidebar's own expanded-section state every time the
            // drawer closes.
            inert={!navOpen}
            aria-hidden={!navOpen}
          >
            <Sidebar />
          </div>
        </>
      ) : (
        <Sidebar />
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center min-w-0">
          {compact && (
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              aria-expanded={navOpen}
              className="pressable shrink-0 h-10 w-10 ml-2 inline-flex items-center justify-center rounded-lg
                         text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]
                         transition-[color,background-color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <Topbar />
          </div>
        </div>
        <SeedRefreshFailedBanner />
        <GlobalRunningBanner />

        <main className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-auto flex flex-col min-w-0">
            {children}
          </div>

          <TaskTray />
        </main>
      </div>

      {/* Deep-dive slide-over — renders null until a module is pushed. */}
      <DeepDivePanel />
    </div>
  );
}
