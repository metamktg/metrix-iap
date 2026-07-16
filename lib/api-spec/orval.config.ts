import { defineConfig, InputTransformerFn } from "orval";
import path from "path";

const root = path.resolve(__dirname, "..", "..");

// ORVAL_DRIFT_OUT redirects all generated output into a sandbox directory.
// Used by scripts/src/check-api-codegen-drift.ts so the drift check NEVER
// rewrites the live lib/*/src/generated/** trees — Orval's `clean: true`
// deletes and rewrites those files mid-run, which the Vite dev servers watch;
// regenerating them in place crashes live browser sessions with mass HMR
// invalidations (broken React context identity). The sandbox must mirror the
// committed layout (api-client-react/src with custom-fetch.ts copied in, and
// api-zod/src) so generated relative imports come out identical.
const driftOut = process.env.ORVAL_DRIFT_OUT;
const apiClientReactSrc = driftOut
  ? path.resolve(driftOut, "api-client-react", "src")
  : path.resolve(root, "lib", "api-client-react", "src");
const apiZodSrc = driftOut
  ? path.resolve(driftOut, "api-zod", "src")
  : path.resolve(root, "lib", "api-zod", "src");

// Our exports make assumptions about the title of the API being "Api" (i.e. generated output is `api.ts`).
const titleTransformer: InputTransformerFn = (config) => {
  config.info ??= {};
  config.info.title = "Api";

  return config;
};

export default defineConfig({
  "api-client-react": {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiClientReactSrc,
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
  zod: {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiZodSrc,
      client: "zod",
      target: "generated",
      schemas: { path: "generated/types", type: "typescript" },
      mode: "split",
      clean: true,
      prettier: true,
      override: {
        zod: {
          coerce: {
            query: ['boolean', 'number', 'string'],
            param: ['boolean', 'number', 'string'],
            body: ['bigint', 'date'],
            response: ['bigint', 'date'],
          },
        },
        useDates: true,
        useBigInt: true,
      },
    },
  },
});
