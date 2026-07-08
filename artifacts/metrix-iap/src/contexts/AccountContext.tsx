// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Account Context
// Manager → Ad Account hierarchy. Single source of active-account state.
// Modules read activeAdAccountId; only the manager overview aggregates totals.
// Defaults to the Manager / Agency overview (no ad account selected).
// ═══════════════════════════════════════════════════════════════════════

import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import {
  getManagerOverview,
  getAdAccounts,
  getAdAccount,
} from "@/lib/data/metrixSeedAdapter";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import type { AdAccount, ManagerAccount } from "@/lib/data/seedTypes";

export type SelectedAccountType = "manager" | "ad_account";

const SESSION_KEY = "metrix_active_account_v1";
const URL_PARAM = "account";

interface PersistShape {
  type: SelectedAccountType;
  adAccountId: string | null;
}

interface AccountContextValue {
  manager: ManagerAccount;
  adAccounts: AdAccount[];
  selectedAccountType: SelectedAccountType;
  activeManagerAccountId: string;
  activeAdAccountId: string | null;
  activeAdAccount: AdAccount | null;
  selectManager: () => void;
  selectAdAccount: (id: string) => void;
  /** Set the active ad account without forcing navigation (module scoping). */
  setActiveAdAccountId: (id: string) => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

function loadPersisted(): PersistShape {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { type: "manager", adAccountId: null };
}

function readUrlAccountParam(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(URL_PARAM);
  } catch {
    return null;
  }
}

function writeUrlAccountParam(adAccountId: string | null) {
  try {
    const url = new URL(window.location.href);
    const current = url.searchParams.get(URL_PARAM);
    if (adAccountId === current) return;
    if (adAccountId) {
      url.searchParams.set(URL_PARAM, adAccountId);
    } else {
      url.searchParams.delete(URL_PARAM);
    }
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    /* ignore */
  }
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const seed = useMetrixSeed();
  const manager = getManagerOverview(seed);
  const adAccounts = getAdAccounts(seed);

  const [persisted, setPersisted] = useState<PersistShape>(() => {
    const urlId = readUrlAccountParam();
    if (urlId !== null) {
      if (adAccounts.some((a) => a.id === urlId)) {
        return { type: "ad_account", adAccountId: urlId };
      }
      // Unknown account id in the URL — fall back to manager mode.
      return { type: "manager", adAccountId: null };
    }
    return loadPersisted();
  });

  // Persist the selection and keep the URL's ?account= param in sync so the
  // current view stays shareable/bookmarkable across in-app navigation.
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(persisted));
    } catch {
      /* ignore */
    }
  }, [persisted]);

  useEffect(() => {
    writeUrlAccountParam(persisted.type === "ad_account" ? persisted.adAccountId : null);
  }, [persisted, location]);

  const save = useCallback((next: PersistShape) => {
    setPersisted(next);
  }, []);

  const selectManager = useCallback(() => {
    save({ type: "manager", adAccountId: persisted.adAccountId });
    navigate("/");
  }, [save, navigate, persisted.adAccountId]);

  const selectAdAccount = useCallback(
    (id: string) => {
      save({ type: "ad_account", adAccountId: id });
      navigate("/app/account");
    },
    [save, navigate]
  );

  const setActiveAdAccountId = useCallback(
    (id: string) => {
      save({ type: "ad_account", adAccountId: id });
    },
    [save]
  );

  const activeAdAccount = useMemo(
    () => getAdAccount(seed, persisted.adAccountId),
    [seed, persisted.adAccountId]
  );

  const value: AccountContextValue = {
    manager,
    adAccounts,
    selectedAccountType: persisted.type,
    activeManagerAccountId: manager.id,
    activeAdAccountId: persisted.adAccountId,
    activeAdAccount,
    selectManager,
    selectAdAccount,
    setActiveAdAccountId,
  };

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}

/**
 * Resolves the ad account a module should render.
 * Only returns an id when an ad account is explicitly selected — with the
 * manager selected, account-scoped modules must prompt to pick an account
 * rather than silently falling back to another account's data.
 */
export function useScopedAdAccountId(): string | null {
  const { selectedAccountType, activeAdAccountId } = useAccount();
  if (selectedAccountType !== "ad_account") return null;
  return activeAdAccountId;
}
