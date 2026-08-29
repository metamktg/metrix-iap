// ─── Account Switcher ─────────────────────────────────────────────────
// Sidebar account selector with initials avatars, live search, and
// a clear visual distinction between the manager account and ad accounts.

import { motion, useReducedMotion } from "framer-motion";
import { DUR_FAST, EASE, motionOr, staggerDelay } from "@/lib/motion";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown, Check, Building2, Plus, Search, ArrowUpRight } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { useAccount } from "@/contexts/AccountContext";
import { AddAccountDialog } from "@/pages/metrix/AddAccountDialog";
import { resolveObjectivesMeta } from "@/lib/data/cohortMeta";

// ─── Avatar ────────────────────────────────────────────────────────────

const AVATAR_HUES = [217, 262, 191, 162, 231, 280, 38, 15];

function nameToHue(name: string): number {
  let h = 0;
  for (const c of name) h = (((h * 31) ^ c.charCodeAt(0)) >>> 0);
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

function nameInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function AccountAvatar({
  name,
  size = "md",
  status,
  isManager = false,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  status?: string;
  isManager?: boolean;
}) {
  const hue = nameToHue(name);
  const init = nameInitials(name);
  const dims: Record<string, string> = {
    // disclosure-ok: a GEOMETRIC ramp, not a type ramp — each size is bound
    // to its circle diameter (20/28/32/36px) so the initial keeps the same
    // optical weight inside the disc. Snapping these to the type scale would
    // make the initial overflow the small disc and float in the large one.
    xs: "w-5 h-5 text-[8px]",
    sm: "w-7 h-7 text-[10px]",
    md: "w-8 h-8 text-[11px]",
    lg: "w-9 h-9 text-[12px]",
  };
  const iconSize: Record<string, string> = {
    xs: "w-2.5 h-2.5", sm: "w-3 h-3", md: "w-4 h-4", lg: "w-4.5 h-4.5",
  };
  const dotSize: Record<string, string> = {
    xs: "w-1.5 h-1.5", sm: "w-2 h-2", md: "w-2 h-2", lg: "w-2.5 h-2.5",
  };
  const dotOffset: Record<string, string> = {
    xs: "-bottom-px -right-px", sm: "-bottom-0.5 -right-0.5",
    md: "-bottom-0.5 -right-0.5", lg: "-bottom-0.5 -right-0.5",
  };

  return (
    <div className="relative shrink-0">
      {isManager ? (
        <div className={cn("rounded-lg flex items-center justify-center border bg-primary/15 border-primary/30", dims[size])}>
          <Building2 className={cn("text-interactive", iconSize[size])} />
        </div>
      ) : (
        <div
          className={cn("rounded-lg flex items-center justify-center font-bold border leading-none", dims[size])}
          style={{
            background: `hsl(${hue} 50% 15%)`,
            borderColor: `hsl(${hue} 50% 26% / 0.5)`,
            color: `hsl(${hue} 75% 68%)`,
          }}
        >
          {init}
        </div>
      )}
      {status != null && (
        <span
          className={cn(
            "absolute rounded-full ring-[1.5px] ring-surface-sidebar",
            dotSize[size],
            dotOffset[size],
            status === "configured" ? "bg-status-success" : "bg-muted-foreground/40"
          )}
        />
      )}
    </div>
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────

function SwitcherPanel({
  anchorRef,
  compact,
  onClose,
  onAddAccount,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  compact: boolean;
  onClose: () => void;
  onAddAccount: () => void;
}) {
  const {
    manager, adAccounts,
    selectedAccountType, activeAdAccountId,
    selectManager, selectAdAccount,
  } = useAccount();

  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const isManager = selectedAccountType === "manager";
  const showSearch = adAccounts.length > 3;

  const reduced = useReducedMotion();
  const filtered = search.trim()
    ? adAccounts.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : adAccounts;

  const configuredCount = adAccounts.filter((a) => a.status === "configured").length;

  // Position relative to anchor on mount
  useEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const panelW = 256;
    if (compact) {
      // Flyout to the right in icon rail
      const top = Math.min(r.top, window.innerHeight - 360 - 8);
      setPos({ top: Math.max(8, top), left: r.right + 8 });
    } else {
      // Drop below in expanded sidebar
      const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
      setPos({ top: r.bottom + 6, left });
    }
    // Auto-focus search
    setTimeout(() => searchRef.current?.focus(), 40);
  }, [anchorRef, compact]);

  // Click-outside + Escape
  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorRef, onClose]);

  function pick(fn: () => void) {
    fn();
    onClose();
  }

  if (!pos) return null;

  const panel = (
    <div
      ref={panelRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: 256 }}
      className={cn(
        "flex flex-col rounded-xl overflow-hidden",
        "bg-surface-sidebar border border-border/50",
        "shadow-[0_8px_40px_hsl(0 0% 0% / 0.55)]",
        "animate-in fade-in-0 zoom-in-95 duration-100"
      )}
      role="dialog"
      aria-label="Switch account"
    >
      {/* Search */}
      {showSearch && (
        <div className="p-2 border-b border-border/30">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-foreground/[0.04] border border-border/30 focus-within:border-primary/40 transition-colors">
            <Search className="w-3 h-3 text-muted-foreground/75 shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search accounts…"
              className="flex-1 bg-transparent text-caption text-foreground placeholder:text-muted-foreground/75 outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="pressable text-muted-foreground/75 hover:text-muted-foreground/75 transition-colors text-caption"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-y-auto max-h-[340px] p-1.5 space-y-0.5">
        {/* Manager row */}
        {!search.trim() && (
          <button
            onClick={() => pick(selectManager)}
            className={cn(
              "pressable-lg w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-left transition-colors relative group",
              isManager
                ? "bg-primary/10 hover:bg-primary/15"
                : "hover:bg-foreground/[0.05]"
            )}
          >
            {isManager && (
              <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 bg-primary rounded-r-full" />
            )}
            <AccountAvatar name={manager.name} size="md" isManager />
            <div className="flex-1 min-w-0">
              <div className={cn("text-caption font-semibold leading-tight truncate", isManager ? "text-foreground" : "text-foreground/75")}>
                {manager.name}
              </div>
              <div className="text-caption text-muted-foreground/75 leading-tight mt-0.5">
                Agency · All accounts
              </div>
            </div>
            {isManager && <Check className="w-3.5 h-3.5 text-interactive shrink-0" />}
          </button>
        )}

        {/* Divider + section label */}
        {!search.trim() && (
          <div className="flex items-center gap-2 px-1 py-1">
            <span className="text-micro font-semibold uppercase text-muted-foreground/75">
              Ad Accounts
            </span>
            <span className="text-micro-num text-muted-foreground/75 ml-auto tabular-nums">
              {configuredCount}/{adAccounts.length}
            </span>
          </div>
        )}

        {/* Ad account rows */}
        {filtered.length === 0 ? (
          <div className="px-2.5 py-4 text-center">
            <p className="text-body text-muted-foreground/75">No accounts match "{search}"</p>
          </div>
        ) : (
          filtered.map((a, rowIdx) => {
            const isActive = !isManager && activeAdAccountId === a.id;
            const isUnconfigured = a.status === "unconfigured";
            return (
              <motion.button
                key={a.id}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={motionOr(reduced, { duration: DUR_FAST, ease: EASE, delay: staggerDelay(rowIdx, filtered.length) })}
                onClick={() => pick(() => selectAdAccount(a.id))}
                className={cn(
                  "pressable-lg w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-left transition-colors relative group/row",
                  isActive
                    ? "bg-primary/10 hover:bg-primary/15"
                    : "hover:bg-foreground/[0.05]",
                  isUnconfigured && !isActive && "opacity-70"
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 bg-primary rounded-r-full" />
                )}
                <AccountAvatar name={a.name} size="md" status={a.status} />
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "text-caption font-semibold leading-tight truncate",
                    isActive ? "text-foreground" : "text-foreground/75"
                  )}>
                    {a.name}
                  </div>
                  {isUnconfigured ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-caption text-status-warning/70 leading-tight">
                        Needs setup
                      </span>
                      <ArrowUpRight className="w-2.5 h-2.5 text-status-warning/50" />
                    </div>
                  ) : (
                    <div className="text-caption text-muted-foreground/75 leading-tight mt-0.5">
                      {resolveObjectivesMeta(a.objectives).label}
                    </div>
                  )}
                </div>
                {isActive && <Check className="w-3.5 h-3.5 text-interactive shrink-0" />}
              </motion.button>
            );
          })
        )}
      </div>

      {/* Add account footer */}
      {!search.trim() && (
        <div className="border-t border-border/30 p-1.5">
          <button
            onClick={() => { onClose(); setTimeout(onAddAccount, 0); }}
            className="pressable-lg w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-foreground/[0.05] transition-colors group"
          >
            <div className="w-8 h-8 rounded-lg border border-dashed border-border/40 flex items-center justify-center shrink-0 group-hover:border-border/60 transition-colors">
              <Plus className="w-3.5 h-3.5 text-muted-foreground/75 group-hover:text-muted-foreground/80 transition-colors" />
            </div>
            <span className="text-caption font-medium text-muted-foreground/75 group-hover:text-muted-foreground/90 transition-colors">
              Connect Ad Account
            </span>
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(panel, document.body);
}

// ─── Switcher ─────────────────────────────────────────────────────────

export function AccountSwitcher({ compact = false }: { compact?: boolean }) {
  const { manager, adAccounts, selectedAccountType, activeAdAccountId } = useAccount();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isManager = selectedAccountType === "manager";
  const active = adAccounts.find((a) => a.id === activeAdAccountId) ?? null;
  const triggerLabel = isManager ? manager.name : active?.name ?? manager.name;

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  if (compact) {
    return (
      <>
        <button
          ref={triggerRef}
          onClick={toggle}
          aria-label={`Switch account — currently: ${triggerLabel}`}
          title={triggerLabel}
          className={cn(
            "pressable w-10 h-10 mx-auto rounded-lg flex items-center justify-center transition-colors",
            "hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
            open && "bg-primary/10"
          )}
        >
          <AccountAvatar
            name={triggerLabel}
            size="sm"
            isManager={isManager}
            status={!isManager && active ? active.status : undefined}
          />
        </button>

        {open && (
          <SwitcherPanel
            anchorRef={triggerRef}
            compact
            onClose={close}
            onAddAccount={() => setAddOpen(true)}
          />
        )}
        <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
      </>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        aria-label={`Current account: ${triggerLabel}`}
        className={cn(
          "pressable-lg w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors",
          "hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          open && "bg-foreground/[0.06]"
        )}
      >
        <AccountAvatar
          name={triggerLabel}
          size="md"
          isManager={isManager}
          status={!isManager && active ? active.status : undefined}
        />
        <div className="flex-1 min-w-0">
          <div className="text-caption font-semibold text-foreground/90 leading-tight truncate">
            {triggerLabel}
          </div>
          <div className="text-caption text-muted-foreground/75 leading-tight mt-0.5">
            {isManager ? "Agency Overview" : resolveObjectivesMeta(active?.objectives).label}
          </div>
        </div>
        <ChevronsUpDown
          className={cn(
            "w-3.5 h-3.5 shrink-0 transition-colors",
            open ? "text-muted-foreground/75" : "text-muted-foreground/75"
          )}
        />
      </button>

      {open && (
        <SwitcherPanel
          anchorRef={triggerRef}
          compact={false}
          onClose={close}
          onAddAccount={() => setAddOpen(true)}
        />
      )}
      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
