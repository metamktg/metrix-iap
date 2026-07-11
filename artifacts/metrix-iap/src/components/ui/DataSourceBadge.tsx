import { cn } from "@/lib/utils";
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

  const toggle = () => {
    _globalVisible = !on;
    localStorage.setItem(STORAGE_KEY, String(_globalVisible));
    setOn(_globalVisible);
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: _globalVisible }));
  };

  return (
    <button
      onClick={toggle}
      className={cn(
        "flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors",
        on
          ? "text-primary border-primary/30 bg-primary/5 hover:bg-primary/10"
          : "text-muted-foreground/70 border-border/30 bg-transparent hover:bg-white/5"
      )}
      title="Toggle data source annotations"
    >
      <Database className="w-2.5 h-2.5" />
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

  // When global toggle is off, hide entirely
  if (!globalVisible) return null;

  const tables = table.split(",").map(t => t.trim());
  const isCollapsible = collapsible || isProd;

  return (
    <div className={cn("inline-flex items-center gap-1.5 flex-wrap", className)}>
      <Database className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
      {!collapsed && tables.map(t => (
        <span
          key={t}
          className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border border-border/30 bg-muted/20 text-muted-foreground/70 leading-none"
        >
          {t}
        </span>
      ))}
      {collapsed && (
        <span className="text-[9px] font-mono text-muted-foreground/60 leading-none">
          {tables.length} table{tables.length > 1 ? "s" : ""}
        </span>
      )}
      {isCollapsible && (
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-muted-foreground/60 hover:text-muted-foreground/60 transition-colors"
          title={collapsed ? "Show table names" : "Collapse"}
        >
          {collapsed ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronUp className="w-2.5 h-2.5" />}
        </button>
      )}
    </div>
  );
}
