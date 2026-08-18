import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { TaskTray } from "./TaskTray";
import { GlobalRunningBanner } from "./GlobalRunningBanner";
import { useTaskTray } from "@/contexts/TaskTrayContext";
import { DeepDivePanel } from "@/components/deepdive/DeepDivePanel";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { open } = useTaskTray();

  return (
    <div className="flex h-screen w-screen overflow-hidden mx-app-bg">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />
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
