import { Database } from "lucide-react";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";

type PlaceholderMessage =
  | "No production data connected yet"
  | "Pending Stage 2 implementation"
  | "Connect a source or run an analysis to populate this layer";

interface StagePlaceholderProps {
  title: string;
  section: string;
  message?: PlaceholderMessage;
  dataSource?: string;
  action?: { label: string; href: string };
}

export function StagePlaceholder({
  title,
  section,
  message = "No production data connected yet",
  dataSource,
  action,
}: StagePlaceholderProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-border/40 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest">
              {section}
            </span>
          </div>
          <h1 className="text-[18px] font-semibold text-foreground leading-tight">{title}</h1>
        </div>
        {dataSource && (
          <div className="shrink-0 pt-1">
            <DataSourceBadge table={dataSource} collapsible />
          </div>
        )}
      </div>

      {/* Empty state body */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="text-center max-w-xs space-y-4">
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] mx-auto">
            <Database className="w-4 h-4 text-muted-foreground/40" />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-foreground/80">{message}</p>
            {dataSource && (
              <p className="text-[11px] font-mono text-muted-foreground/35">
                Source: {dataSource}
              </p>
            )}
          </div>

          {/* Optional CTA */}
          {action && (
            <a
              href={action.href}
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, "", action.href);
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors mt-1"
            >
              {action.label} →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
