import { createContext, useContext, useState } from "react";

interface TaskTrayCtx {
  open: boolean;
  toggle: () => void;
  close: () => void;
  openTray: () => void;
}

const TaskTrayContext = createContext<TaskTrayCtx>({
  open: false,
  toggle: () => {},
  close: () => {},
  openTray: () => {},
});

// ─── Open-state persistence ─────────────────────────────────────────────
// Mirrors the sidebar's collapse-preference pattern: the user's last
// open/closed choice (including via drag-to-close) survives a reload
// instead of always resetting to closed.

const STORAGE_KEY = "metrix_tray_open";

function loadOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // default: closed
  }
}

function saveOpen(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function TaskTrayProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(loadOpen);
  return (
    <TaskTrayContext.Provider
      value={{
        open,
        toggle: () =>
          setOpen((v) => {
            saveOpen(!v);
            return !v;
          }),
        close: () => {
          saveOpen(false);
          setOpen(false);
        },
        openTray: () => {
          saveOpen(true);
          setOpen(true);
        },
      }}
    >
      {children}
    </TaskTrayContext.Provider>
  );
}

export function useTaskTray() {
  return useContext(TaskTrayContext);
}
