// ─── Reports · Settings ───────────────────────────────────────────────
// Report Builder's local settings: default template (branding / format /
// mode) and scheduled sends. Seed report_builder values act as defaults;
// workspace-level overrides persist via the API (same override model as
// Settings → Notifications). Scheduled sends are configuration only —
// no send pipeline exists in this build, and the page says so.

import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, SectionCard, CaveatNote, CrossLink } from "../shared";
import { cn } from "@/lib/utils";
import { FileText, Palette, CalendarClock, Building2, Users, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { FORMAT_LABEL } from "./reportFormatLabels";
import {
  useGetReportSettings,
  useUpdateReportSettings,
  getGetReportSettingsQueryKey,
  type ReportSettingsUpdateInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const SECTION = "Reports · 06";

function OptionRow<T extends string>({
  options,
  value,
  onSelect,
  disabled,
  labelFor,
}: {
  options: T[];
  value: T;
  onSelect: (v: T) => void;
  disabled?: boolean;
  labelFor: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onSelect(opt)}
          disabled={disabled}
          className={cn(
            "flex items-center gap-1.5 px-2.5 h-7 rounded-md border text-[11px] font-medium transition-colors",
            value === opt
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/40 text-foreground/70 hover:text-foreground hover:bg-white/5",
            disabled && "opacity-50 pointer-events-none"
          )}
        >
          {value === opt && <Check className="w-3 h-3" />}
          {labelFor(opt)}
        </button>
      ))}
    </div>
  );
}

export function ReportSettingsView() {
  const seed = useMetrixSeed();
  const { manager, adAccounts } = useAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Seed defaults come from the first account that ships a report_builder
  // block (report templates are account-scoped; settings are workspace-wide).
  const rb = adAccounts
    .map((a) => getReportBuilder(seed, a.id))
    .find((r) => r != null);

  const { data: settings } = useGetReportSettings(manager.id);
  const { mutate: update, isPending } = useUpdateReportSettings({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetReportSettingsQueryKey(manager.id), result);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Couldn't save report setting",
          description: "The change was not saved. Please try again.",
        });
      },
    },
  });

  const save = (patch: ReportSettingsUpdateInput) =>
    update({ workspaceId: manager.id, data: patch });

  const seedFormats = rb?.export_formats ?? ["pdf", "google_doc", "html"];
  const branding = settings?.default_branding ?? rb?.default_branding ?? "metrix";
  const format = settings?.default_format ?? seedFormats[0] ?? "pdf";
  const mode = settings?.default_mode ?? "internal";
  const scheduleEnabled = settings?.schedule_enabled ?? false;
  const cadence = settings?.schedule_cadence ?? "weekly";
  const recipients = settings?.schedule_recipients ?? "";

  return (
    <div className="flex-1 flex flex-col">
      <ModuleHeader section={SECTION} title="Report Settings" />

      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-3xl">
        <SectionCard
          title="Default template"
          desc="Branding, format, and audience defaults applied when composing a new report."
          table="workspace_report_settings"
        >
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-foreground/80">Branding</p>
              <OptionRow
                options={["metrix", "white_label"]}
                value={branding as "metrix" | "white_label"}
                onSelect={(v) => save({ default_branding: v })}
                disabled={isPending}
                labelFor={(v) => (v === "metrix" ? "Metrix branded" : "White label")}
              />
              {rb && !rb.white_label_supported && (
                <p className="text-[10px] text-muted-foreground/60">
                  White label is not enabled for this workspace's plan; exports fall back to Metrix branding.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-foreground/80">Export format</p>
              <OptionRow
                options={seedFormats}
                value={format}
                onSelect={(v) => save({ default_format: v as ReportSettingsUpdateInput["default_format"] })}
                disabled={isPending}
                labelFor={(v) => FORMAT_LABEL[v] ?? v}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-foreground/80">Default audience mode</p>
              <OptionRow
                options={["internal", "client"]}
                value={mode as "internal" | "client"}
                onSelect={(v) => save({ default_mode: v })}
                disabled={isPending}
                labelFor={(v) => (v === "internal" ? "Internal (full detail)" : "Client-facing")}
              />
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                {mode === "internal" ? <Building2 className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                New reports open in this mode; it can still be switched per report.
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Scheduled sends"
          desc="Deliver the default report automatically on a cadence."
          table="workspace_report_settings"
        >
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-3">
              <Switch
                checked={scheduleEnabled}
                onCheckedChange={(v) => save({ schedule_enabled: v })}
                disabled={isPending}
                aria-label="Enable scheduled sends"
              />
              <div>
                <p className="text-[12px] font-medium text-foreground/85">Send reports on a schedule</p>
                <p className="text-[10px] text-muted-foreground/60">
                  Compose and deliver the default report automatically.
                </p>
              </div>
            </div>

            {scheduleEnabled && (
              <>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-foreground/80">Cadence</p>
                  <OptionRow
                    options={["weekly", "monthly"]}
                    value={cadence as "weekly" | "monthly"}
                    onSelect={(v) => save({ schedule_cadence: v })}
                    disabled={isPending}
                    labelFor={(v) => (v === "weekly" ? "Weekly" : "Monthly")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground/80" htmlFor="report-recipients">
                    Recipients
                  </label>
                  <input
                    id="report-recipients"
                    type="text"
                    defaultValue={recipients}
                    key={recipients}
                    placeholder="ops@agency.com, client@brand.com"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== recipients) save({ schedule_recipients: v || null });
                    }}
                    className="w-full h-8 px-2.5 rounded-md border border-border/40 bg-white/[0.03] text-[12px] text-foreground/85 placeholder:text-muted-foreground/40"
                  />
                  <p className="text-[10px] text-muted-foreground/60">Comma-separated emails. Saved when the field loses focus.</p>
                </div>
              </>
            )}

            <CaveatNote text="Scheduled sends are configuration only in this build — no delivery pipeline is connected yet, so nothing is emailed. Settings persist and will drive delivery once sending ships." />
          </div>
        </SectionCard>

        <div className="flex items-center gap-2">
          <FileText className="w-3 h-3 text-muted-foreground/60" />
          <CrossLink to="/app/reports/new" label="Compose a report with these defaults" />
        </div>
      </div>
    </div>
  );
}
