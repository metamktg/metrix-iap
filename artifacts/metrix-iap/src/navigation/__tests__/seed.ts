// Loads the API server's seed bundle for router tests.
// Kept App-import-free so vi.mock factories can import it safely.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../api-server/src/data/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);
