import { cn } from "@workspace/command-deck/lib/utils";
import { Database, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";

// ─── Dev-mode global state ─────────────────────────────────────────────
// In dev: always-visible by default, can be toggled via DataSourceBadgeToggle.
// In prod: always collapsible (collapsed by default), toggle in same control.
// localStorage persists the on/off state across sessions.

const STORAGE_KEY = "metrix_datasource_badge";
const EVENT_KEY = "metrix_dsb_toggle";

function getInitialVisible(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === "true";
  // Default: on in dev, collapsed (but shown) in prod — so global visibility starts true
  return true;
}

let _globalVisible = getInitialVisible();

// ─── Global dev-mode toggle ────────────────────────────────────────────

export function DataSourceBadgeToggle() {
  const [on, setOn] = useState(_globalVisible);
  // Nothing to toggle in production — the badges do not render there. A live
  // control for an invisible feature is its own small lie.
  const hidden = import.meta.env.PROD;

  const toggle = () => {
    _globalVisible = !on;
    localStorage.setItem(STORAGE_KEY, String(_globalVisible));
    setOn(_globalVisible);
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: _globalVisible }));
  };

  if (hidden) return null;

  return (
    <button
      onClick={toggle}
      className={cn(
        "pressable flex items-center gap-1 text-caption px-1.5 py-0.5 rounded border transition-colors",
        on
          ? "text-interactive border-primary/30 bg-primary/5 hover:bg-primary/10"
          : "text-muted-foreground/75 border-border/30 bg-transparent hover:bg-foreground/5"
      )}
      title="Toggle data source annotations"
    >
      <Database className="w-3.5 h-3.5" />
      DB
    </button>
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────

interface DataSourceBadgeProps {
  table: string;         // e.g. "intelligence_cards" or "intelligence_cards, review_events"
  className?: string;
  collapsible?: boolean; // when true, shows a collapse/expand toggle (always true in prod)
}

export function DataSourceBadge({ table, className, collapsible = false }: DataSourceBadgeProps) {
  const isProd = import.meta.env.PROD;
  // In prod, badges start collapsed; in dev, start expanded
  const [collapsed, setCollapsed] = useState(isProd);
  const [globalVisible, setGlobalVisible] = useState(_globalVisible);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<boolean>).detail;
      setGlobalVisible(detail);
    }
    window.addEventListener(EVENT_KEY, handler);
    return () => window.removeEventListener(EVENT_KEY, handler);
  }, []);

  // PRODUCTION RENDERS NOTHING. These badges name real Postgres tables —
  // 28 distinct ones across 30 surfaces, `user_sessions` and `app_config`
  // among them. Shipping that to every signed-in browser publishes the
  // schema: this deployment's own security model (see
  // docs/security/METRIX_RLS_and_Service_Role_Security.md) is that PostgREST
  // exposes `public` tables to the browser-embedded anon key, with RLS and
  // revoked grants as what stops a read. Table names are exactly the
  // reconnaissance needed to aim at that surface, and "collapsed by default"
  // was never a control — the chip expands on click.
  //
  // It stays fully available in development, where knowing which table feeds
  // a panel is useful and the reader is the person building it.
  if (isProd) return null;

  // When global toggle is off, hide entirely
  if (!globalVisible) return null;

  const tables = table.split(",").map(t => t.trim());
  const isCollapsible = collapsible || isProd;

  return (
    // data-provenance marks this as a DELIBERATE engineering annotation, not
    // reader-facing copy. Without it, sweeps that hunt for raw identifiers
    // leaking into the interface cannot tell this badge's table names from a
    // genuine leak, and every module header reads as 15 false positives.
    <div data-provenance="data-source" className={cn("inline-flex items-center gap-1.5 flex-wrap", className)}>
      <Database className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
      {!collapsed && tables.map(t => (
        <span
          key={t}
          className="inline-flex items-center gap-1 text-caption px-1.5 py-0.5 rounded border border-border/30 bg-muted/20 text-muted-foreground/75 leading-none"
        >
          {t}
        </span>
      ))}
      {collapsed && (
        <span className="text-caption text-muted-foreground/75 leading-none">
          {tables.length} table{tables.length > 1 ? "s" : ""}
        </span>
      )}
      {isCollapsible && (
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="pressable hit-target-24 text-muted-foreground/75 hover:text-muted-foreground/75 transition-colors"
          title={collapsed ? "Show table names" : "Collapse table names"}
          aria-label={collapsed ? "Show table names" : "Collapse table names"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}
