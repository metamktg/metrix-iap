import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { TaskTray } from "./TaskTray";
import { useTaskTray } from "@/contexts/TaskTrayContext";
import { GlobalTaskTray } from "./GlobalTaskTray";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { open } = useTaskTray();
  const [trayOpen, setTrayOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden mx-app-bg">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onOpenTaskTray={() => setTrayOpen(true)} />

        <main className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-auto flex flex-col min-w-0">
            {children}
          </div>

          {open && <TaskTray />}
        </main>
      </div>

      <GlobalTaskTray open={trayOpen} onClose={() => setTrayOpen(false)} />
    </div>
  );
}
