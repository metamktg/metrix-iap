/* eslint-disable */
// ─── Metrix IAP ESLint config ──────────────────────────────────────────
// Guards the pages/metrix typography contract: component authors should
// use TYPE.* tokens from typography.ts instead of raw text-[Npx] sizes.
//
// Currently at "warn" level because the codebase has pre-existing
// text-[Npx] patterns. Enforcement path:
//   1. Clean up existing violations (use cn(TYPE.label, ...) etc.)
//   2. Change "warn" → "error" + add --max-warnings 0 to lint script
//      to make the guard fully blocking for any new raw pixel sizes.
//
// Run: pnpm --filter @workspace/metrix-iap run lint

"use strict";
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["react-hooks"],
  rules: {
    "react-hooks/exhaustive-deps": "warn",
  },
  overrides: [
    {
      files: ["src/pages/metrix/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-syntax": [
          "warn",
          {
            selector:
              "JSXAttribute[name.name='className'] > Literal[value=/text-\\[/]",
            message:
              "Raw text-[Npx] sizes are not allowed in pages/metrix. Use TYPE.label / TYPE.title / TYPE.body / TYPE.caption from typography.ts instead. See: src/pages/metrix/typography.ts",
          },
        ],
      },
    },
  ],
};
