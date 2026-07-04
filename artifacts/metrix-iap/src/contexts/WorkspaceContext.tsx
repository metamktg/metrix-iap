// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Workspace Context
// URL-driven workspace switching with session persistence.
// The "effective" workspace is always defined — defaults to Bookster.
// isOnWorkspaceRoute is true only when URL contains /app/workspaces/:id.
// ═══════════════════════════════════════════════════════════════════════

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { WORKSPACES, USERS, getWorkspaceWithData } from "../lib/mock-data";
import type { Workspace, WorkspaceWithData, User } from "../lib/types";

const DEFAULT_WORKSPACE_ID = "ws_bookster";
const SESSION_KEY = "metrix_selected_ws";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  // Effective workspace — always defined. URL workspace if on workspace route,
  // else the last selected workspace (persisted in sessionStorage), else Bookster.
  currentWorkspace: WorkspaceWithData;
  // Raw workspace ID from URL — null when on global routes.
  currentWorkspaceId: string | null;
  // True only when the current URL path is a /app/workspaces/:id route.
  isOnWorkspaceRoute: boolean;
  currentUser: User;
  switchWorkspace: (workspaceId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();

  // Extract workspaceId from URL
  const [matchWorkspace, workspaceParams] = useRoute("/app/workspaces/:workspaceId/*?");
  const urlWorkspaceId: string | null =
    matchWorkspace && workspaceParams?.workspaceId ? workspaceParams.workspaceId : null;

  // Persisted workspace — survives navigation between global routes
  const [persistedId, setPersistedId] = useState<string>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) ?? DEFAULT_WORKSPACE_ID;
    } catch {
      return DEFAULT_WORKSPACE_ID;
    }
  });

  // When URL workspace changes (user navigates to a workspace route), persist it
  useEffect(() => {
    if (urlWorkspaceId && urlWorkspaceId !== persistedId) {
      setPersistedId(urlWorkspaceId);
      try { sessionStorage.setItem(SESSION_KEY, urlWorkspaceId); } catch { /* ignore */ }
    }
  }, [urlWorkspaceId]);

  // Effective ID: URL workspace if available, else last persisted, else Bookster
  const effectiveId = urlWorkspaceId ?? persistedId;

  // currentWorkspace is always defined — never null
  const currentWorkspace = useMemo(
    () => getWorkspaceWithData(effectiveId) ?? getWorkspaceWithData(DEFAULT_WORKSPACE_ID)!,
    [effectiveId]
  );

  const isOnWorkspaceRoute = !!urlWorkspaceId;

  const currentUser = USERS[0]; // Alex Chen, Master Admin

  function switchWorkspace(workspaceId: string) {
    setPersistedId(workspaceId);
    try { sessionStorage.setItem(SESSION_KEY, workspaceId); } catch { /* ignore */ }
    navigate(`/app/workspaces/${workspaceId}`);
  }

  const value: WorkspaceContextValue = {
    workspaces: WORKSPACES,
    currentWorkspace,
    currentWorkspaceId: urlWorkspaceId,
    isOnWorkspaceRoute,
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
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export function useCurrentWorkspace(): WorkspaceWithData {
  return useWorkspace().currentWorkspace;
}
