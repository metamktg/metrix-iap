import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { WorkspaceOnboarding } from "@/components/onboarding/WorkspaceOnboarding";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { workspaceNeedsOnboarding } from "@/lib/workspace-state";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { currentWorkspace } = useWorkspace();
  const needsOnboarding = currentWorkspace
    ? workspaceNeedsOnboarding(currentWorkspace.id)
    : false;

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: "hsl(222 61% 5%)" }}
    >
      {/* Left sidebar */}
      <Sidebar />

      {/* Main area: topbar + content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />

        {/* Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {needsOnboarding && currentWorkspace ? (
            <WorkspaceOnboarding workspace={currentWorkspace} />
          ) : (
            <div className="flex-1 overflow-auto">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
