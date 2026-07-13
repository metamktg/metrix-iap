import type { ManualImport } from "@workspace/api-client-react";

export function guessedCreativeImports(imports: ManualImport[]): ManualImport[] {
  return imports.filter((i) => i.kind === "creative_asset" && i.match_method === "guess");
}
