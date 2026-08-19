// ─── XLSX → canonical CSV text conversion ─────────────────────────────────
//
// Manual performance uploads accept both CSV and XLSX exports (CSV is the
// preferred/native Meta Ads Manager format; XLSX is common when a client or
// agency has round-tripped the export through Excel/Google Sheets first).
// Rather than forking the column-matching, alias, and confidence-grading
// logic in iapCsvSpec.ts/iapCsvParser.ts for a second file format, this
// module converts an XLSX workbook into the exact same CSV text shape
// parseIapCsv() already consumes, so every downstream rule (aliases, Jaccard
// inference, class-mismatch detection, delivery-coverage gate, signal
// weights…) runs unchanged for both file types.
//
// Two real-world wrinkles this module exists to handle correctly:
//
//   1. Dates: Meta's "Day" column round-trips through Excel/Sheets as a date
//      SERIAL NUMBER, not a string. ExcelJS auto-promotes a numeric cell to a
//      JS `Date` when its number format looks like a date, so we format that
//      Date back to the exact "YYYY-MM-DD" string toIsoDate() expects — using
//      UTC getters, since exceljs's date decoding has no timezone of its own
//      and a local-timezone read could roll the date across midnight.
//
//   2. Ad/Ad set/Campaign ID precision loss: a spreadsheet tool that doesn't
//      preserve a long numeric ID as text (observed firsthand: a
//      Google-Sheets-authored export storing an 18-digit Meta Ad ID as
//      `1.20253E17`) silently rounds it before this file is ever saved. No
//      parser can recover the true ID from a file that already lost it — the
//      only safe move is to detect the loss and refuse to store the wrong
//      value, since a corrupted Ad ID could cause false joins with
//      `ads.meta_ad_id` downstream. See `isCorruptedIdCell` below.
//
// Everything else about a cell (plain numbers, plain strings, blanks, rich
// text, hyperlinks, formula results) is passed through as literal text with
// no unit conversion — exactly as a CSV cell already would be — so parsing
// behaviour never diverges from the CSV path for data that isn't corrupted.

import ExcelJS from "exceljs";
import { findColumnInHeader } from "./iapCsvSpec";
import { IapCsvFormatError } from "./iapCsvParser";

export type XlsxConversionResult = {
  csvText: string;
  /** Human-readable, actionable warnings — same shape/consumer as parseIapCsv's `warnings`. */
  warnings: string[];
};

/** Breakdown columns whose values are Meta object IDs — corruption in any of
 *  these must never be silently stored, since it can cause false joins. */
const ID_CANONICAL_COLUMNS = ["Ad ID", "Ad set ID", "Campaign ID"] as const;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** True when the buffer's leading bytes are the ZIP local-file-header magic
 *  every XLSX file starts with (XLSX is a ZIP container). Used as a
 *  content-based signal alongside the ".xlsx" filename extension, so a
 *  mislabeled file is still routed to the right parser instead of failing as
 *  unreadable CSV text. */
export function looksLikeXlsxContent(buf: Buffer): boolean {
  return buf.length >= 4 && ZIP_MAGIC.every((b, i) => buf[i] === b);
}

function formatUtcIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** RFC4180 quoting, matching the convention parseIapCsv's own CSV parser expects. */
function csvQuote(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** Picks the worksheet to read: the workbook's active tab when it points at
 *  a visible sheet, else the first visible sheet, else simply the first
 *  sheet — so a multi-sheet file never crashes, it just degrades to "read
 *  the first sheet" the same way a human opening the file would default. */
function selectWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheets = workbook.worksheets;
  if (sheets.length === 0) {
    throw new IapCsvFormatError("This Excel file has no worksheets.");
  }
  if (sheets.length === 1) return sheets[0]!;
  const activeTab = workbook.views?.[0]?.activeTab;
  if (typeof activeTab === "number" && sheets[activeTab] && sheets[activeTab]!.state === "visible") {
    return sheets[activeTab]!;
  }
  return sheets.find((s) => s.state === "visible") ?? sheets[0]!;
}

/** Unwraps rich-text / hyperlink / formula cell value shapes down to plain text. */
function textualCellValue(raw: ExcelJS.CellValue): string {
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) return formatUtcIsoDate(raw);
  if (typeof raw === "object") {
    if ("richText" in raw && Array.isArray(raw.richText)) {
      return raw.richText.map((rt) => rt.text ?? "").join("");
    }
    if ("text" in raw && "hyperlink" in raw) {
      return String(raw.text ?? "");
    }
    if ("formula" in raw) {
      return textualCellValue((raw as ExcelJS.CellFormulaValue).result ?? "");
    }
    if ("error" in raw) return "";
    return "";
  }
  return String(raw);
}

/** Header row → trimmed string cells, tolerant of the same value shapes as data cells. */
function readHeaderRow(row: ExcelJS.Row, colCount: number): string[] {
  const header: string[] = [];
  for (let c = 1; c <= colCount; c++) {
    header.push(textualCellValue(row.getCell(c).value).trim());
  }
  return header;
}

/** Maps 0-based column index → canonical ID column name, for the columns
 *  that resolve in this header (via the same alias/case-insensitive/slug
 *  cascade the CSV parser itself uses, so an XLSX with e.g. "ad id" still
 *  gets the corruption guard). */
function resolveIdColumnIndices(headerStrings: string[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const canonical of ID_CANONICAL_COLUMNS) {
    const match = findColumnInHeader(headerStrings, canonical);
    if (!match) continue;
    const idx = headerStrings.findIndex((h) => h.trim() === match.headerValue);
    if (idx !== -1) map.set(idx, canonical);
  }
  return map;
}

/** True when a numeric ID cell has already lost precision at the source —
 *  either it exceeds Number.MAX_SAFE_INTEGER (so the float can no longer
 *  represent every digit of an 18-ish digit Meta ID), or Excel/Sheets
 *  displays it in scientific notation (a symptom of the same underlying
 *  problem: the tool that built the file stored it as a float, not text). */
function isCorruptedIdCell(value: number, numFmt: string | undefined): boolean {
  if (!Number.isFinite(value)) return true;
  if (!Number.isSafeInteger(value)) return true;
  if (numFmt && /e[+-]?\d/i.test(numFmt)) return true;
  return false;
}

/**
 * Converts one XLSX workbook (as a Buffer) into canonical CSV text plus any
 * conversion-time warnings, ready to hand to parseIapCsv() exactly as if it
 * had been a CSV file all along.
 */
export async function convertXlsxToCsvText(buffer: Buffer): Promise<XlsxConversionResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's bundled type defs declare a structurally slightly different
    // `Buffer` than this workspace's @types/node — same runtime value, cast
    // needed only to satisfy the two competing declarations.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (err) {
    throw new IapCsvFormatError(
      `Could not read this file as an Excel workbook (${err instanceof Error ? err.message : "unknown error"}). ` +
        `Re-export it as .xlsx or .csv and try again.`,
    );
  }

  const sheet = selectWorksheet(workbook);
  if (sheet.rowCount === 0) {
    throw new IapCsvFormatError("This Excel file's sheet has no rows.");
  }

  const colCount = Math.max(sheet.actualColumnCount, 1);
  const headerRow = sheet.getRow(1);
  const headerStrings = readHeaderRow(headerRow, colCount);
  const idColumnIndices = resolveIdColumnIndices(headerStrings);

  const warnings: string[] = [];
  const lines: string[] = [headerStrings.map(csvQuote).join(",")];

  // Per-ID-column corruption tally, so a file where every row lost precision
  // (the real-world case: a Google-Sheets export) produces ONE clear summary
  // warning instead of hundreds of identical per-row lines.
  const corruption = new Map<string, { count: number; example: string }>();
  let totalDataRows = 0;

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    let allBlank = true;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      const colIdx0 = c - 1;
      const idCanonical = idColumnIndices.get(colIdx0);

      let text: string;
      if (idCanonical && cell.type === ExcelJS.ValueType.Number) {
        const raw = cell.value as number;
        if (isCorruptedIdCell(raw, cell.numFmt)) {
          text = "";
          const prior = corruption.get(idCanonical);
          const example = String(raw);
          corruption.set(idCanonical, {
            count: (prior?.count ?? 0) + 1,
            example: prior?.example ?? example,
          });
        } else {
          text = String(raw);
        }
      } else {
        text = textualCellValue(cell.value);
      }

      if (text !== "") allBlank = false;
      cells.push(text);
    }
    if (allBlank) continue; // matches parseIapCsv's own fully-blank-row skip
    totalDataRows++;
    lines.push(cells.map(csvQuote).join(","));
  }

  for (const canonical of ID_CANONICAL_COLUMNS) {
    const entry = corruption.get(canonical);
    if (!entry || entry.count === 0) continue;
    warnings.push(
      `⚠ "${canonical}" could not be read reliably from this spreadsheet: ${entry.count} of ${totalDataRows} ` +
        `row(s) stored it as a rounded number instead of the exact ID (for example "${entry.example}") — this is ` +
        `what happens when a tool like Google Sheets re-saves a long Meta ID as a number instead of text. Those ` +
        `cells were left blank rather than risk an incorrect ID; joins that depend on "${canonical}" will skip ` +
        `these rows. Re-export the source report as CSV, or format the "${canonical}" column as Text before ` +
        `saving as .xlsx, to preserve the exact value.`,
    );
  }

  return { csvText: lines.join("\n"), warnings };
}
