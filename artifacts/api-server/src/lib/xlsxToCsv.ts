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
//
// Memory model: workbooks above STREAMING_THRESHOLD_BYTES are converted with
// ExcelJS's streaming reader (row-at-a-time) instead of the buffered
// full-load reader. The buffered reader materializes every cell as an object
// — a real Google-Sheets demographic export (9.6 MB compressed, one sheet of
// 103 MB XML / 2.3M cells) blew straight through a 1.5 GB heap and
// OOM-killed the production process (surfacing as a bare HTTP 500 from the
// platform). Small files keep the buffered reader and its exact semantics
// (including active-tab sheet selection); both paths share the same
// row-to-CSV core so cell handling never diverges.

import ExcelJS from "exceljs";
import { Readable } from "node:stream";
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

/** Compressed size above which the streaming reader is used. 4 MB compressed
 *  xlsx ≈ tens of MB of sheet XML ≈ hundreds of MB of ExcelJS cell objects
 *  under the buffered reader — comfortably past what a small deployment
 *  instance survives. */
const STREAMING_THRESHOLD_BYTES = 4 * 1024 * 1024;

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

/** Picks the worksheet to read (buffered path). Multi-sheet workbooks (a
 *  whole Google Sheets file saved as .xlsx, with cover/working tabs
 *  alongside the actual export) used to resolve blindly to the active/first
 *  visible tab — which then failed parsing with "required columns could not
 *  be found: Day, Ad name" even though the real export sheet was right there
 *  in the same file.
 *
 *  When the caller knows which columns the target class requires
 *  (`expectedColumns`), every sheet's header row is scored by how many of
 *  those columns resolve through the same alias/slug cascade the CSV parser
 *  uses, and the best-scoring sheet wins (active-tab order breaks ties).
 *  With no expectation, or when no sheet matches at all, the previous
 *  behavior stands: active tab if visible, else first visible, else first —
 *  the same way a human opening the file would default. */
function selectWorksheet(workbook: ExcelJS.Workbook, expectedColumns?: readonly string[]): ExcelJS.Worksheet {
  const sheets = workbook.worksheets;
  if (sheets.length === 0) {
    throw new IapCsvFormatError("This Excel file has no worksheets.");
  }
  if (sheets.length === 1) return sheets[0]!;

  const activeTab = workbook.views?.[0]?.activeTab;
  const fallback =
    (typeof activeTab === "number" && sheets[activeTab] && sheets[activeTab]!.state === "visible"
      ? sheets[activeTab]
      : undefined) ??
    sheets.find((s) => s.state === "visible") ??
    sheets[0]!;

  if (!expectedColumns || expectedColumns.length === 0) return fallback;

  let best: { sheet: ExcelJS.Worksheet; score: number } | null = null;
  for (const sheet of sheets) {
    if (sheet.rowCount === 0) continue;
    const header = readHeaderRow(sheet.getRow(1), Math.max(sheet.actualColumnCount, 1));
    const score = scoreHeader(header, expectedColumns);
    // Prefer the fallback (active/first-visible) sheet on equal scores so a
    // workbook whose tabs all match keeps its previous, predictable pick.
    if (score > 0 && (!best || score > best.score || (score === best.score && sheet === fallback))) {
      best = { sheet, score };
    }
  }
  return best?.sheet ?? fallback;
}

/** How many of the expected canonical columns resolve in this header row. */
function scoreHeader(header: string[], expectedColumns: readonly string[]): number {
  let score = 0;
  for (const col of expectedColumns) {
    if (findColumnInHeader(header, col)) score += 1;
  }
  return score;
}

/** Unwraps rich-text / hyperlink / formula cell value shapes down to plain text. */
function textualCellValue(raw: ExcelJS.CellValue): string {
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) return formatUtcIsoDate(raw);
  if (typeof raw === "object") {
    if ("richText" in raw && Array.isArray(raw.richText)) {
      return raw.richText.map((rt: { text?: string }) => rt.text ?? "").join("");
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

/** Row-to-CSV core shared by the buffered and streaming paths — one place
 *  for the corruption guard, blank-row skip, quoting, and warning tally, so
 *  cell handling can never diverge between the two readers. */
function createCsvBuilder(headerStrings: string[]): {
  appendExcelRow: (row: ExcelJS.Row) => void;
  finish: () => XlsxConversionResult;
} {
  const colCount = headerStrings.length;
  const idColumnIndices = resolveIdColumnIndices(headerStrings);
  const lines: string[] = [headerStrings.map(csvQuote).join(",")];
  // Per-ID-column corruption tally, so a file where every row lost precision
  // (the real-world case: a Google-Sheets export) produces ONE clear summary
  // warning instead of hundreds of identical per-row lines.
  const corruption = new Map<string, { count: number; example: string }>();
  let totalDataRows = 0;

  const appendExcelRow = (row: ExcelJS.Row): void => {
    const cells: string[] = [];
    let allBlank = true;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      const idCanonical = idColumnIndices.get(c - 1);

      let text: string;
      if (idCanonical && cell.type === ExcelJS.ValueType.Number) {
        const raw = cell.value as number;
        if (isCorruptedIdCell(raw, cell.numFmt)) {
          text = "";
          const prior = corruption.get(idCanonical);
          corruption.set(idCanonical, {
            count: (prior?.count ?? 0) + 1,
            example: prior?.example ?? String(raw),
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
    if (allBlank) return; // matches parseIapCsv's own fully-blank-row skip
    totalDataRows++;
    lines.push(cells.map(csvQuote).join(","));
  };

  const finish = (): XlsxConversionResult => {
    const warnings: string[] = [];
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
  };

  return { appendExcelRow, finish };
}

// ── Streaming path ──────────────────────────────────────────────────────

/** exceljs's streaming reader takes a Node stream and loose option types. */
function openStreamingReader(buffer: Buffer): AsyncIterable<AsyncIterable<ExcelJS.Row> & { name?: string }> {
  const options = {
    entries: "emit",
    sharedStrings: "cache",
    styles: "cache",
    hyperlinks: "ignore",
    worksheets: "emit",
  };
  return new ExcelJS.stream.xlsx.WorkbookReader(
    Readable.from(buffer) as unknown as string,
    options as never,
  ) as unknown as AsyncIterable<AsyncIterable<ExcelJS.Row> & { name?: string }>;
}

/**
 * Row-at-a-time conversion for large workbooks. Sheets are visited in file
 * order; the first sheet whose header resolves EVERY expected column is
 * converted in the same pass. Sheets that only partially match are remembered
 * and, when no sheet fully matches, a second pass converts the best partial
 * scorer — or, with no expectation at all, the first sheet that has rows.
 * (The streaming reader has no active-tab metadata, so file order stands in
 * for it; single-sheet files — the overwhelmingly common case — are
 * unaffected.)
 */
async function convertXlsxStreaming(
  buffer: Buffer,
  expectedColumns?: readonly string[],
): Promise<XlsxConversionResult> {
  const wantAll = expectedColumns?.length ?? 0;

  const convertSheet = async (
    sheetRows: AsyncIterable<ExcelJS.Row>,
    headerStrings: string[],
    firstDataRow: ExcelJS.Row | null,
  ): Promise<XlsxConversionResult> => {
    const builder = createCsvBuilder(headerStrings);
    if (firstDataRow) builder.appendExcelRow(firstDataRow);
    for await (const row of sheetRows) {
      builder.appendExcelRow(row);
    }
    return builder.finish();
  };

  const readHeaderStrings = (row: ExcelJS.Row): string[] => {
    const colCount = Math.max(row.cellCount, 1);
    const header: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      header.push(textualCellValue(row.getCell(c).value).trim());
    }
    return header;
  };

  try {
    // Pass 1: score headers sheet by sheet; convert in place on a full match.
    let sheetOrdinal = -1;
    let best: { ordinal: number; score: number } | null = null;
    let sawAnySheet = false;
    let firstWithRows: number | null = null;
    for await (const sheet of openStreamingReader(buffer)) {
      sheetOrdinal += 1;
      sawAnySheet = true;
      const iterator = sheet[Symbol.asyncIterator]();
      const first = await iterator.next();
      if (first.done) continue; // empty sheet
      if (firstWithRows === null) firstWithRows = sheetOrdinal;
      const header = readHeaderStrings(first.value);
      if (wantAll === 0) {
        // No expectation: first sheet with rows wins, converted in this pass.
        return await convertSheet({ [Symbol.asyncIterator]: () => iterator }, header, null);
      }
      const score = scoreHeader(header, expectedColumns!);
      if (score === wantAll) {
        return await convertSheet({ [Symbol.asyncIterator]: () => iterator }, header, null);
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { ordinal: sheetOrdinal, score };
      }
      // Stop consuming this sheet's rows; move on to the next sheet.
      await iterator.return?.(undefined);
    }

    if (!sawAnySheet) {
      throw new IapCsvFormatError("This Excel file has no worksheets.");
    }
    const targetOrdinal = best?.ordinal ?? firstWithRows;
    if (targetOrdinal === null || targetOrdinal === undefined) {
      throw new IapCsvFormatError("This Excel file's sheet has no rows.");
    }

    // Pass 2: convert the chosen sheet.
    let ordinal = -1;
    for await (const sheet of openStreamingReader(buffer)) {
      ordinal += 1;
      if (ordinal !== targetOrdinal) continue;
      const iterator = sheet[Symbol.asyncIterator]();
      const first = await iterator.next();
      if (first.done) {
        throw new IapCsvFormatError("This Excel file's sheet has no rows.");
      }
      const header = readHeaderStrings(first.value);
      return await convertSheet({ [Symbol.asyncIterator]: () => iterator }, header, null);
    }
    throw new IapCsvFormatError("This Excel file's sheet has no rows.");
  } catch (err) {
    if (err instanceof IapCsvFormatError) throw err;
    throw new IapCsvFormatError(
      `Could not read this file as an Excel workbook (${err instanceof Error ? err.message : "unknown error"}). ` +
        `Re-export it as .xlsx or .csv and try again.`,
    );
  }
}

// ── Public entry point ──────────────────────────────────────────────────

/**
 * Converts one XLSX workbook (as a Buffer) into canonical CSV text plus any
 * conversion-time warnings, ready to hand to parseIapCsv() exactly as if it
 * had been a CSV file all along.
 *
 * `expectedColumns` (optional): the target class's required breakdown
 * columns — used to pick the right sheet in a multi-sheet workbook.
 *
 * `opts.forceStreaming` exists for tests: it routes a small workbook through
 * the streaming reader so both paths are held to the same assertions.
 */
export async function convertXlsxToCsvText(
  buffer: Buffer,
  expectedColumns?: readonly string[],
  opts?: { forceStreaming?: boolean },
): Promise<XlsxConversionResult> {
  if (opts?.forceStreaming || buffer.length > STREAMING_THRESHOLD_BYTES) {
    return convertXlsxStreaming(buffer, expectedColumns);
  }

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

  const sheet = selectWorksheet(workbook, expectedColumns);
  if (sheet.rowCount === 0) {
    throw new IapCsvFormatError("This Excel file's sheet has no rows.");
  }

  const colCount = Math.max(sheet.actualColumnCount, 1);
  const headerStrings = readHeaderRow(sheet.getRow(1), colCount);
  const builder = createCsvBuilder(headerStrings);
  for (let r = 2; r <= sheet.rowCount; r++) {
    builder.appendExcelRow(sheet.getRow(r));
  }
  return builder.finish();
}
