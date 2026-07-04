// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Workspace Context
// URL-driven workspace switching. /app/workspaces/[workspaceId] is the
// source of truth. One context, one source.
// ═══════════════════════════════════════════════════════════════════════

import React, { createContext, useContext, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { WORKSPACES, USERS, getWorkspaceWithData } from "../lib/mock-data";
import type { Workspace, WorkspaceWithData, User } from "../lib/types";

interface WorkspaceContextValue {
  // All available workspaces for this user
  workspaces: Workspace[];
  // Currently active workspace (derived from URL)
  currentWorkspace: WorkspaceWithData | null;
  // Current workspace ID from URL (may be null if not on a workspace route)
  currentWorkspaceId: string | null;
  // Simulated current user
  currentUser: User;
  // Navigate to a workspace
  switchWorkspace: (workspaceId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();

  // Extract workspaceId from URL. Multiple route patterns are checked.
  const [matchWorkspace, workspaceParams] = useRoute("/app/workspaces/:workspaceId/*?");
  const [matchAdAccounts] = useRoute("/app/workspaces/:workspaceId/ad-accounts/*?");

  const currentWorkspaceId = useMemo(() => {
    if (matchWorkspace && workspaceParams?.workspaceId) {
      return workspaceParams.workspaceId;
    }
    if (matchAdAccounts && workspaceParams?.workspaceId) {
      return workspaceParams.workspaceId;
    }
    return null;
  }, [matchWorkspace, matchAdAccounts, workspaceParams]);

  const currentWorkspace = useMemo(() => {
    if (!currentWorkspaceId) return null;
    return getWorkspaceWithData(currentWorkspaceId) ?? null;
  }, [currentWorkspaceId]);

  // Simulated current user — in production this comes from auth
  const currentUser = USERS[0]; // Alex Chen, Master Admin

  function switchWorkspace(workspaceId: string) {
    navigate(`/app/workspaces/${workspaceId}`);
  }

  const value: WorkspaceContextValue = {
    workspaces: WORKSPACES,
    currentWorkspace,
    currentWorkspaceId,
    currentUser,
    switchWorkspace,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}

export function useCurrentWorkspace(): WorkspaceWithData | null {
  return useWorkspace().currentWorkspace;
}
