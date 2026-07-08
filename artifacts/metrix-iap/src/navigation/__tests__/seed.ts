// Loads a captured seed-bundle fixture for router tests. The live app
// fetches this bundle from the API (assembled from Supabase); the fixture
// is a snapshot of that response kept under src/test-fixtures.
// Kept App-import-free so vi.mock factories can import it safely.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);
