import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * All operational logging goes to stderr. This is an MCP stdio server —
 * stdout is reserved exclusively for JSON-RPC frames, so a stray
 * console.log() here would corrupt the protocol stream from the client's
 * point of view.
 */
export function logEvent(level: "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...redact(fields),
  };
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

const SECRET_KEY_PATTERN = /token|secret|password|authorization/i;

/** Strips any field whose key looks credential-shaped before it can reach a log line. */
export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : value;
  }
  return safe;
}

/** Deterministic hash of a mutation request — the basis for idempotency/retry checks. */
export function hashRequest(payload: unknown): string {
  const stable = stableStringify(payload);
  return createHash("sha256").update(stable).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

export interface MutationLogEntry {
  tool: string;
  request_hash: string;
  meta_object_id: string | null;
  operator: string;
  status: string;
  detail?: Record<string, unknown>;
}

/**
 * Appends one JSONL line per mutation attempt to META_MUTATION_LOG_PATH.
 * This is the record future retry logic reads before ever re-issuing a
 * create call for the same request_hash.
 */
export class MutationLogger {
  constructor(private readonly logPath: string) {}

  async record(entry: MutationLogEntry): Promise<void> {
    await mkdir(dirname(this.logPath), { recursive: true });
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
      detail: entry.detail ? redact(entry.detail) : undefined,
    });
    await appendFile(this.logPath, `${line}\n`, "utf8");
  }
}
