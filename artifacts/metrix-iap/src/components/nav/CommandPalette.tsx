// ─── Command palette ──────────────────────────────────────────────────
//
// Watermelon `command-search` + `quick-switcher`, taken as the mechanic —
// one keystroke (⌘K / Ctrl+K), one input, grouped results, arrow keys and
// Enter — and rebuilt over the app's own navigation tree, accounts and
// session history rather than the reference's demo list. The reface
// register deferred it "until after the panel pass"; that pass closed on
// 2026-08-31, and the navigation audit that followed found the sidebar to
// be the ONLY way to reach 40 pages. A reader who knows the page they want
// should be able to type its name.
//
// Three groups, in the order a reader most often wants them:
//
//   · Recent — the last pages visited this session (navHistory), so the
//     loop's back-and-forth between an analysis cell, its strategy and its
//     brief is two keystrokes instead of a sidebar expedition.
//   · Pages — every section command center and every visible menu row.
//     Placeholders ("Soon") are listed disabled with the reason, never
//     hidden: a hidden page is a support ticket.
//   · Accounts — switch scope without leaving the page.
//
// The reference's blur-and-float arrival is not taken. In a dense product
// the palette is a tool, and a tool arrives where the hand expects it.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { Command as Cmdk } from "cmdk";
import { Building2, Clock, CornerDownLeft, FileText, Search } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@workspace/command-deck/components/ui/dialog";
import { navTree, sectionLandingRoute, visibleChildren } from "@/navigation/navTree";
import { useNavigationHistory } from "@/navigation/navHistory";
import { pageLabel } from "@/components/layout/breadcrumbs";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";

// ─── Open state: a tiny external store ─────────────────────────────────
// The trigger lives in the Topbar, the keyboard shortcut in the palette
// itself, and the shell mounts the dialog once. None of the three should
// need a context just to share one boolean.

let isOpen = false;
const listeners = new Set<() => void>();
function setOpen(next: boolean) {
  if (isOpen === next) return;
  isOpen = next;
  for (const l of listeners) l();
}
export function openCommandPalette(): void { setOpen(true); }
function useCommandPaletteOpen(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => isOpen,
    () => isOpen,
  );
}

/** ⌘ on Apple platforms, Ctrl elsewhere — the label, not the binding. */
export function paletteShortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl K";
  return /Mac|iPhone|iPad/.test(navigator.platform ?? "") ? "⌘ K" : "Ctrl K";
}

function isPaletteShortcut(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k";
}

type PageItem = {
  id: string;
  label: string;
  section: string;
  to: string;
  placeholder: boolean;
};

function buildPageItems(isAdmin: boolean): PageItem[] {
  const out: PageItem[] = [];
  for (const section of navTree) {
    const landing = sectionLandingRoute(section) ?? section.to;
    const children = visibleChildren(section).filter(
      (c) => isAdmin || c.id !== "settings-users",
    );
    // The command center is a page of its own, unless its landing IS a
    // child (Settings → General), in which case the child row covers it.
    if (landing && !children.some((c) => c.to === landing)) {
      out.push({
        id: section.id,
        label: section.id === "overview" ? "Overview" : section.label,
        section: section.label,
        to: landing,
        placeholder: Boolean(section.placeholder),
      });
    }
    for (const c of children) {
      out.push({ id: c.id, label: c.label, section: section.label, to: c.to, placeholder: Boolean(c.placeholder) });
    }
  }
  return out;
}

export function CommandPalette() {
  const open = useCommandPaletteOpen();
  const [location, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const { user } = useAuth();
  const { manager, adAccounts, selectedAccountType, activeAdAccountId, selectManager, selectAdAccount } = useAccount();
  const history = useNavigationHistory();
  const isManager = selectedAccountType === "manager";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e)) return;
      e.preventDefault();
      setOpen(!isOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A fresh palette every time it opens: a stale query from ten minutes
  // ago is not what the reader is looking for now.
  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const pages = useMemo(() => buildPageItems(user?.role === "admin"), [user?.role]);

  const recent = useMemo(() => {
    const seen = new Set<string>([location]);
    const out: { to: string; label: string }[] = [];
    for (let i = history.length - 1; i >= 0 && out.length < 5; i--) {
      const loc = history[i]!;
      if (seen.has(loc)) continue;
      seen.add(loc);
      const label = pageLabel(loc, isManager);
      if (label) out.push({ to: loc, label });
    }
    return out;
  }, [history, location, isManager]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="p-0 gap-0 max-w-xl top-[18%] translate-y-0 overflow-hidden"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Go to a page or account</DialogTitle>
        <DialogDescription className="sr-only">
          Type to filter. Arrow keys move, Enter opens, Escape closes.
        </DialogDescription>
        <Cmdk label="Go to a page or account" loop className="flex flex-col">
          <div className="flex items-center gap-2 px-4 border-b border-border/50">
            <Search className="w-4 h-4 shrink-0 text-muted-foreground/75" aria-hidden="true" />
            <Cmdk.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Go to page, account…"
              autoFocus
              className="flex-1 h-12 bg-transparent text-body text-foreground placeholder:text-muted-foreground/75 outline-none"
            />
            <kbd className="text-micro font-semibold text-muted-foreground/75 border border-border/50 rounded px-1.5 py-0.5 leading-none">
              Esc
            </kbd>
          </div>
          <Cmdk.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
            <Cmdk.Empty className="px-3 py-8 text-center text-caption text-muted-foreground/75">
              Nothing matches. Try a section name, like “Audience” or “Brief”.
            </Cmdk.Empty>

            {recent.length > 0 && (
              <PaletteGroup heading="Recent">
                {recent.map((r) => (
                  <PaletteItem
                    key={`recent:${r.to}`}
                    value={`recent ${r.label} ${r.to}`}
                    onSelect={() => go(r.to)}
                    Icon={Clock}
                    label={r.label}
                    meta={r.to}
                  />
                ))}
              </PaletteGroup>
            )}

            <PaletteGroup heading="Pages">
              {pages.map((p) => (
                <PaletteItem
                  key={p.id}
                  value={`page ${p.section} ${p.label} ${p.to}`}
                  onSelect={() => go(p.to)}
                  disabled={p.placeholder}
                  Icon={FileText}
                  label={p.label}
                  meta={p.section === p.label ? undefined : p.section}
                  trailing={p.placeholder ? "Soon" : undefined}
                  current={p.to === location}
                />
              ))}
            </PaletteGroup>

            <PaletteGroup heading="Accounts">
              <PaletteItem
                value={`account ${manager.name} agency overview`}
                onSelect={() => { setOpen(false); selectManager(); }}
                Icon={Building2}
                label={manager.name}
                meta="Agency Overview"
                current={isManager}
              />
              {adAccounts.map((a) => (
                <PaletteItem
                  key={`account:${a.id}`}
                  value={`account ${a.name} ${a.id}`}
                  onSelect={() => { setOpen(false); selectAdAccount(a.id); }}
                  Icon={Building2}
                  label={a.name}
                  meta={a.status === "unconfigured" ? "Needs setup" : undefined}
                  current={!isManager && a.id === activeAdAccountId}
                />
              ))}
            </PaletteGroup>
          </Cmdk.List>
          <div className="flex items-center gap-3 px-4 h-9 border-t border-border/50 text-micro text-muted-foreground/75">
            <span className="inline-flex items-center gap-1"><kbd className="font-semibold">↑↓</kbd> move</span>
            <span className="inline-flex items-center gap-1"><CornerDownLeft className="w-3 h-3" aria-hidden="true" /> open</span>
            <span className="ml-auto">{paletteShortcutLabel()}</span>
          </div>
        </Cmdk>
      </DialogContent>
    </Dialog>
  );
}

function PaletteGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Cmdk.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-label
                 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide
                 [&_[cmdk-group-heading]]:text-muted-foreground/75"
    >
      {children}
    </Cmdk.Group>
  );
}

function PaletteItem({
  value, onSelect, Icon, label, meta, trailing, disabled, current,
}: {
  value: string;
  onSelect: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  meta?: string;
  trailing?: string;
  disabled?: boolean;
  current?: boolean;
}) {
  return (
    <Cmdk.Item
      value={value}
      onSelect={onSelect}
      disabled={disabled}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 px-2.5 h-10 rounded-lg text-body cursor-default select-none",
        "text-foreground/85 data-[selected=true]:bg-primary/12 data-[selected=true]:text-foreground",
        "data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed",
      )}
    >
      <Icon className="w-4 h-4 shrink-0 text-muted-foreground/75" aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {meta && <span className="text-caption text-muted-foreground/75 truncate max-w-[40%]">{meta}</span>}
      {current && <span className="text-micro font-semibold uppercase text-interactive">Here</span>}
      {trailing && (
        <span className="text-micro font-semibold uppercase text-muted-foreground/75 border border-border/40 px-1 py-0.5 rounded leading-none">
          {trailing}
        </span>
      )}
    </Cmdk.Item>
  );
}
