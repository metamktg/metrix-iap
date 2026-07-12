import { createContext, useContext, useState } from "react";

interface TaskTrayCtx {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const TaskTrayContext = createContext<TaskTrayCtx>({
  open: false,
  toggle: () => {},
  close: () => {},
});

export function TaskTrayProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <TaskTrayContext.Provider
      value={{ open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) }}
    >
      {children}
    </TaskTrayContext.Provider>
  );
}

export function useTaskTray() {
  return useContext(TaskTrayContext);
}
