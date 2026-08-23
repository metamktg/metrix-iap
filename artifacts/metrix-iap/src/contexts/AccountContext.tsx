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
  // localStorage so the selection survives new tabs and app restarts; falls
  // back to the legacy sessionStorage slot once, for pre-migration sessions
  // that still only have the old key.
  try {
    const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
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
      // If adAccounts is empty (seed not yet loaded), a useEffect below
      // will re-apply the URL param once accounts become available.
      return { type: "manager", adAccountId: null };
    }
    const stored = loadPersisted();
    // A persisted account id that no longer resolves (revoked grant, deleted
    // account) falls back to manager mode, same as the URL param case above.
    // Skip this check while adAccounts is still empty (seed not yet loaded)
    // so a legitimate persisted account isn't discarded before data arrives —
    // the useEffect below re-validates once adAccounts is populated.
    if (
      stored.type === "ad_account" &&
      adAccounts.length > 0 &&
      !adAccounts.some((a) => a.id === stored.adAccountId)
    ) {
      return { type: "manager", adAccountId: null };
    }
    return stored;
  });

  // Re-apply the ?account= URL param once the seed has loaded and adAccounts
  // is populated. Without this, a hard load on a URL like
  // /app/analysis/overview?account=bookster would stay in manager mode because
  // adAccounts is empty during the first synchronous render (seed is async).
  useEffect(() => {
    if (adAccounts.length === 0) return;
    const urlId = readUrlAccountParam();
    if (urlId === null) return;
    if (!adAccounts.some((a) => a.id === urlId)) return;
    setPersisted((prev) => {
      if (prev.type === "ad_account" && prev.adAccountId === urlId) return prev;
      return { type: "ad_account", adAccountId: urlId };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adAccounts]);

  // A persisted account id (no URL override) that no longer resolves once
  // the seed loads — revoked grant, deleted account — falls back to manager
  // mode, same as the checks above. Runs after the URL re-apply effect so an
  // explicit ?account= URL id still wins when both are present.
  useEffect(() => {
    if (adAccounts.length === 0) return;
    if (readUrlAccountParam() !== null) return;
    setPersisted((prev) => {
      if (prev.type !== "ad_account") return prev;
      if (adAccounts.some((a) => a.id === prev.adAccountId)) return prev;
      return { type: "manager", adAccountId: null };
    });
  }, [adAccounts]);

  // Persist the selection and keep the URL's ?account= param in sync so the
  // current view stays shareable/bookmarkable across in-app navigation.
  // localStorage (not sessionStorage) so the selection survives new tabs.
  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(persisted));
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
    if (location === "/app/account") {
      navigate("/");
    }
  }, [save, navigate, persisted.adAccountId, location]);

  const selectAdAccount = useCallback(
    (id: string) => {
      if (persisted.type === "ad_account" && persisted.adAccountId === id) {
        return;
      }
      save({ type: "ad_account", adAccountId: id });
      if (persisted.type === "manager" && location === "/") {
        navigate("/app/account");
      }
    },
    [save, navigate, persisted.type, persisted.adAccountId, location]
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
