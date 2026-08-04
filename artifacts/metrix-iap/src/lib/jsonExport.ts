// ─── Client-side JSON export ───────────────────────────────────────────
// Shared by the Exports · Analysis/Strategy/Brief JSON downloads. Every
// export is wrapped in the same honest envelope so a recipient (or their
// internal tooling) knows exactly what this file is and isn't: strictly
// the data already shown in this account's Metrix interface, never
// Metrix's internal scoring/weighting/confidence methodology.

import type { AdAccount } from "./data/seedTypes";

export interface ExportEnvelope<T> {
  exported_at: string;
  account: { id: string; name: string };
  cohort: AdAccount["cohort"];
  note: string;
}

export const DATA_LIMITED_NOTE =
  "This export contains only the data already shown in your Metrix interface for this account. " +
  "It does not include Metrix's internal analysis scoring, variable weighting, or confidence-grading methodology.";

export function buildExportEnvelope<T extends object>(
  account: AdAccount,
  data: T,
): ExportEnvelope<T> & T {
  return {
    exported_at: new Date().toISOString(),
    account: { id: account.id, name: account.name },
    cohort: account.cohort,
    note: DATA_LIMITED_NOTE,
    ...data,
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
