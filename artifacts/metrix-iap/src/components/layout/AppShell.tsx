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
  const { currentWorkspace, isOnWorkspaceRoute } = useWorkspace();

  // Show onboarding only when explicitly navigated to a workspace route
  // AND that workspace has no data yet. Never gate global routes.
  const needsOnboarding =
    isOnWorkspaceRoute && workspaceNeedsOnboarding(currentWorkspace.id);

  return (
    <div className="flex h-screen w-screen overflow-hidden mx-app-bg">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />

        <main className="flex-1 overflow-hidden flex flex-col">
          {needsOnboarding ? (
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
