// Result-event taxonomy drift check.
//
// `resultEvents.ts` lives twice by necessity: canonically in the API server
// (analysis engine and seed assembly place every result type) and in the
// client (rankings over rows that carry only the raw "Result type" string).
// The scripts package's rootDir forbids cross-package imports and neither
// app may import the other's source, so the module is copied — and a copy
// allowed to drift would let the two halves disagree about whether a row
// is an awareness read or a purchase-intent event. Byte-identical, or it
// fails naming both paths.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER_FILE = path.join(repoRoot, "artifacts/api-server/src/lib/resultEvents.ts");
const CLIENT_FILE = path.join(repoRoot, "artifacts/metrix-iap/src/lib/resultEvents.ts");

describe("resultEvents.ts — server and client copies", () => {
  it("are byte-identical", () => {
    const server = fs.readFileSync(SERVER_FILE, "utf8");
    const client = fs.readFileSync(CLIENT_FILE, "utf8");
    expect(server.length).toBeGreaterThan(0);
    expect(server === client, `${SERVER_FILE} and ${CLIENT_FILE} have drifted — copy one over the other`).toBe(true);
  });
});
