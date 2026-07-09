// Parser for the two Meta Ads Reporting pivot export CSV classes (see
// iapCsvSpec.ts). Enforces the exact template shape: all breakdown columns
// present, all Base-section metric columns present (required), Ecommerce /
// Service / App metric columns parsed only if present in the header — never
// fabricated or zeroed when the account's business type doesn't use them.

import {
  BASE_METRICS,
  OPTIONAL_METRICS,
  headerMatchesColumn,
  slugifyColumn,
  type IapCsvClass,
  IAP_CSV_CLASS_SPECS,
} from "./iapCsvSpec";

export class IapCsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IapCsvFormatError";
  }
}

export type IapCsvRow = {
  breakdowns: Record<string, string>;
  /** Base-section metrics, keyed by slug. Always present in the object (may be null if the cell was blank). */
  base: Record<string, number | string | null>;
  /** Ecommerce/Service/App metrics observed in this file's header, keyed by slug. Absent metrics are simply not keys here — never fabricated as 0/null. */
  extra: Record<string, number | string | null>;
};

export type IapCsvParseResult = {
  rows: IapCsvRow[];
  /** Which optional (non-Base) metric columns were present in this file's header. */
  optionalMetricsPresent: string[];
};

function parseCsvLines(text: string): string[][] {
  // Minimal RFC4180 CSV parser: handles quoted fields, embedded commas/quotes/newlines.
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const push = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    push();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      push();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function parseNumericCell(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "N/A") return null;
  const cleaned = trimmed.replace(/[,%$]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses one staged CSV against the given class's canonical template.
 * Throws IapCsvFormatError (actionable, names the missing columns) if any
 * breakdown column or Base-section metric column is missing from the header.
 */
export function parseIapCsv(text: string, csvClass: IapCsvClass): IapCsvParseResult {
  const spec = IAP_CSV_CLASS_SPECS[csvClass];
  const lines = parseCsvLines(text);
  if (lines.length === 0) {
    throw new IapCsvFormatError("The file is empty.");
  }
  const header = lines[0]!;

  const missingBreakdowns = spec.breakdownColumns.filter(
    (col) => !header.some((h) => h.trim() === col),
  );
  if (missingBreakdowns.length > 0) {
    throw new IapCsvFormatError(
      `Expected ${spec.className} export columns are missing: ${missingBreakdowns.join(", ")}. ` +
        `Export this report from Meta Ads Reporting using the exact breakdown columns: ${spec.breakdownColumns.join(", ")}.`,
    );
  }

  const missingBaseMetrics = BASE_METRICS.filter(
    (col) => !header.some((h) => headerMatchesColumn(h, col)),
  );
  if (missingBaseMetrics.length > 0) {
    throw new IapCsvFormatError(
      `This file is missing required Base metric columns: ${missingBaseMetrics.join(", ")}. ` +
        `Base metrics must be included in every export regardless of business type.`,
    );
  }

  const optionalMetricsPresent = OPTIONAL_METRICS.filter((col) => header.some((h) => h.trim() === col));

  const colIndex = new Map<string, number>();
  header.forEach((h, idx) => colIndex.set(h.trim(), idx));
  // Resolve the currency-suffixed "Amount spent" header separately.
  const amountSpentIdx = header.findIndex((h) => headerMatchesColumn(h, "Amount spent ({ACCOUNT_CURRENCY})"));

  const rows: IapCsvRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = lines[li]!;
    if (cells.every((c) => c.trim() === "")) continue;

    const breakdowns: Record<string, string> = {};
    for (const col of spec.breakdownColumns) {
      const idx = colIndex.get(col);
      breakdowns[col] = idx !== undefined ? (cells[idx] ?? "").trim() : "";
    }
    for (const req of spec.requiredBreakdownColumns) {
      if (!breakdowns[req]) {
        throw new IapCsvFormatError(
          `Row ${li + 1}: missing required value for "${req}". Meta pivot exports must not include totals/subtotals rows — check "no totals" is unchecked in the export.`,
        );
      }
    }

    const base: Record<string, number | string | null> = {};
    for (const col of BASE_METRICS) {
      const slug = slugifyColumn(col);
      if (col === "Amount spent ({ACCOUNT_CURRENCY})") {
        base[slug] = parseNumericCell(cells[amountSpentIdx]);
        continue;
      }
      const idx = colIndex.get(col);
      const raw = idx !== undefined ? cells[idx] : undefined;
      if (col === "Result type" || col === "Result value type") {
        base[slug] = raw !== undefined && raw.trim() !== "" ? raw.trim() : null;
      } else {
        base[slug] = parseNumericCell(raw);
      }
    }

    const extra: Record<string, number | string | null> = {};
    for (const col of optionalMetricsPresent) {
      const idx = colIndex.get(col);
      extra[slugifyColumn(col)] = parseNumericCell(idx !== undefined ? cells[idx] : undefined);
    }

    rows.push({ breakdowns, base, extra });
  }

  if (rows.length === 0) {
    throw new IapCsvFormatError("The file has a header row but no data rows.");
  }

  return { rows, optionalMetricsPresent: optionalMetricsPresent.map(slugifyColumn) };
}

/** Converts a Meta "Date" cell (e.g. "2026-07-01") to an ISO date string, throwing on invalid dates. */
export function toIsoDate(raw: string, context: string): string {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new IapCsvFormatError(`${context}: date "${raw}" is not in YYYY-MM-DD format.`);
  }
  return trimmed;
}
