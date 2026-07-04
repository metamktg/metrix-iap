import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Upload, Zap, LayoutDashboard, BarChart3, Lightbulb,
  FileText, BookOpen, TrendingUp, Bell, Settings, Lock,
} from "lucide-react";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AD_ACCOUNTS } from "@/lib/mock-data";

// ─── Nav item types ────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string | number;
  badgeVariant?: "blue" | "gold" | "danger" | "muted";
  roadmap?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ─── Nav group builder ─────────────────────────────────────────────────

function buildNavGroups(workspaceId: string): NavGroup[] {
  const base = `/app/workspaces/${workspaceId}`;
  const accounts = AD_ACCOUNTS.filter((a) => a.workspace_id === workspaceId);
  const openRecs = accounts.reduce((sum, a) => sum + a.open_recommendations, 0);

  return [
    {
      label: "Pipeline",
      items: [
        {
          label: "Import Center",
          icon: Upload,
          href: "/app/imports",
          badge: workspaceId === "ws_bookster" ? 2 : undefined,
          badgeVariant: "blue",
        },
        {
          label: "IAP Run Builder",
          icon: Zap,
          href: "/app/iap/new",
        },
      ],
    },
    {
      label: "Intelligence",
      items: [
        {
          label: "Workspace Overview",
          icon: LayoutDashboard,
          href: base,
        },
        {
          label: "Account Intelligence",
          icon: BarChart3,
          href: `${base}/ad-accounts`,
          badge: openRecs > 0 ? openRecs : undefined,
          badgeVariant: "gold",
        },
      ],
    },
    {
      label: "Creative",
      items: [
        {
          label: "Creative Library",
          icon: Lightbulb,
          href: "/app/creative-library",
        },
        {
          label: "Brief Engine",
          icon: FileText,
          href: "/app/briefs",
        },
      ],
    },
    {
      label: "Reports & Memory",
      items: [
        {
          label: "Reports",
          icon: BookOpen,
          href: "/app/reports",
        },
        {
          label: "Benchmark Memory",
          icon: TrendingUp,
          href: "/app/benchmarks",
          roadmap: true,
        },
        {
          label: "Change Watch",
          icon: Bell,
          href: "/app/change-watch",
          roadmap: true,
        },
      ],
    },
    {
      label: "Settings",
      items: [
        {
          label: "Settings",
          icon: Settings,
          href: "/app/settings",
        },
      ],
    },
  ];
}

// ─── Active check ──────────────────────────────────────────────────────

function isActive(href: string, location: string): boolean {
  // Workspace overview: match exactly (don't highlight when on sub-routes)
  if (href.match(/\/app\/workspaces\/[^/]+$/)) {
    return location === href;
  }
  if (href === "/" || href === "/app") return location === "/" || location === "/app";
  return location.startsWith(href);
}

// ─── Badge ─────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<string, string> = {
  blue: "bg-primary/15 text-primary border-primary/20",
  gold: "text-[hsl(var(--metrix-gold))] bg-[hsl(var(--metrix-gold)/0.12)] border-[hsl(var(--metrix-gold)/0.25)]",
  danger: "bg-destructive/15 text-destructive border-destructive/20",
  muted: "bg-muted text-muted-foreground border-border/40",
};

function NavBadge({ value, variant = "blue" }: { value: string | number; variant?: string }) {
  return (
    <span className={cn(
      "ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none",
      BADGE_STYLES[variant] ?? BADGE_STYLES.blue
    )}>
      {value}
    </span>
  );
}

// ─── Sidebar component ─────────────────────────────────────────────────

export function Sidebar() {
  const [location] = useLocation();
  const { currentWorkspace } = useWorkspace();
  const navGroups = buildNavGroups(currentWorkspace.id);

  return (
    <aside
      className="flex flex-col w-[220px] shrink-0 h-full border-r border-border/60 overflow-hidden"
      style={{ background: "hsl(222 61% 5%)" }}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <img
            src={`${import.meta.env.BASE_URL}metrix-logo.png`}
            alt="Metrix"
            className="w-6 h-6 object-contain shrink-0"
          />
          <span className="text-sm font-bold tracking-tight text-foreground">METRIX</span>
          <span className="text-[10px] font-mono text-muted-foreground border border-border/60 px-1 py-0.5 rounded leading-none">
            IAP
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-1.5 leading-tight">
          Not more data. Better decisions.
        </p>
      </div>

      {/* Workspace switcher */}
      <div className="px-2 py-2 border-b border-border/40">
        <WorkspaceSwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, location);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      window.history.pushState({}, "", item.href);
                      window.dispatchEvent(new PopStateEvent("popstate"));
                    }}
                    className={cn(
                      "flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors",
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                      item.roadmap && "opacity-60"
                    )}
                  >
                    <Icon className={cn("w-3.5 h-3.5 shrink-0", active ? "text-primary" : "")} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.roadmap && (
                      <Lock className="w-2.5 h-2.5 shrink-0 text-muted-foreground/50" />
                    )}
                    {item.badge !== undefined && (
                      <NavBadge value={item.badge} variant={item.badgeVariant} />
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border/40">
        <div className="text-[10px] text-muted-foreground/50 font-mono">
          METRIX IAP v0.1.0
        </div>
        <div className="text-[10px] text-muted-foreground/40 font-mono mt-0.5">
          SAMPLE / DEMO DATA
        </div>
      </div>
    </aside>
  );
}
