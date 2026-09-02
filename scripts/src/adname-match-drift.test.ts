// Creative filename → ad-name matcher drift check.
//
// `adNameMatch.ts` lives twice by necessity: canonically in the API server
// (artifacts/api-server/src/lib) where creativeAutoMap.ts maps every
// uploaded creative on the server, and in the client (artifacts/metrix-iap/
// src/lib) where the mapping editor's tests and the shared type live. The
// scripts package's rootDir forbids cross-package imports, and neither app
// may import the other's source, so the module is copied — and a copy that
// is allowed to drift would let the two halves of the platform disagree
// about which file is which ad. This test is the tie: byte-identical, or
// it fails naming both paths.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER_FILE = path.join(repoRoot, "artifacts/api-server/src/lib/adNameMatch.ts");
const CLIENT_FILE = path.join(repoRoot, "artifacts/metrix-iap/src/lib/adNameMatch.ts");

describe("adNameMatch.ts — server and client copies", () => {
  it("are byte-identical", () => {
    const server = fs.readFileSync(SERVER_FILE, "utf8");
    const client = fs.readFileSync(CLIENT_FILE, "utf8");
    expect(server.length).toBeGreaterThan(0);
    expect(server === client, `${SERVER_FILE} and ${CLIENT_FILE} have drifted — copy one over the other`).toBe(true);
  });
});
