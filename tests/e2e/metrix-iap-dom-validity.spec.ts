// Invalid interactive nesting, found by walking the LIVE DOM.
//
// WHY THIS EXISTS SEPARATELY FROM check:interaction
// `check:interaction` already looks for a <button> inside a <button>. It is a
// static scan, so it can only see nesting written inside ONE file — and the
// real instances are never written that way. The one this check was built to
// catch lived in BudgetView: the file wrote an outer <button> for a
// disclosure header and dropped a <CrossLink> inside it. CrossLink renders
// its own <button>. Neither file contains a nested button; the composition
// does. The gate passed for as long as the defect existed.
//
// WHY IT MATTERS MORE THAN IT SOUNDS
// A <button> inside a <button> is not merely invalid markup. The HTML parser
// resolves it by keeping one and discarding the other, so ONE OF THE TWO
// ACTIONS SILENTLY STOPS WORKING. There is no error, no warning in
// production, and no visual difference — the control is still drawn, still
// styled, still hoverable. It just does nothing, or does the wrong thing.
// The same is true of an <a href> inside a <button>.
//
// So the only reliable detector is a browser that has actually parsed the
// page. This walks every authenticated route and asks the DOM directly.
//
// Run: tsx tests/e2e/metrix-iap-dom-validity.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-dom-validity

import { chromium } from "playwright-core";
import type { Page } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname_local = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname_local, "../..");

const BASE = process.env.METRIX_IAP_BASE_URL ?? "http://localhost:80";
const CHROMIUM_EXE = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

const SEED_FIXTURE_BODY = fs.readFileSync(
  path.resolve(REPO_ROOT, "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json"),
  "utf-8",
);

/**
 * Every authenticated route that renders analysed data. A route missing from
 * this list is a route nothing checks, so add new ones as they are built.
 */
const ROUTES = [
  "/app/analysis/overview",
  "/app/analysis/budget",
  "/app/analysis/library",
  "/app/analysis/placements",
  "/app/analysis/audience",
  "/app/analysis/funnel",
  "/app/analysis/performance",
  "/app/analysis/dna",
  "/app/analysis/history",
  "/app/strategy/overview",
  "/app/strategy/avatars",
  "/app/creative",
  "/app/mst/cross-map",
  "/app/reports",
  "/app/settings/provenance",
  "/app/settings/general",
];

interface Finding {
  route: string;
  kind: "button-in-button" | "link-in-button";
  outer: string;
  inner: string;
}

async function mockApis(page: Page): Promise<void> {
  // Playwright matches the MOST RECENTLY registered route first, so the
  // catch-all is registered FIRST or it swallows the specific handlers.
  await page.route("**/api/metrix/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reports: [], runs: [], windows: [], imports: [] }),
    }),
  );
  await page.route("**/api/metrix/seed", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: SEED_FIXTURE_BODY }),
  );
  await page.route("**/api/metrix/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "test-user",
          email: "demo@metrix.app",
          role: "admin",
          must_change_password: false,
          workspace_id: "metrix_manager",
        },
      }),
    }),
  );
}

async function main(): Promise<void> {
  const browser = await chromium.launch(
    CHROMIUM_EXE ? { executablePath: CHROMIUM_EXE } : {},
  );
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await mockApis(page);

  // Scope to an account with real analysis rows, or most routes render an
  // empty state and the check silently inspects nothing.
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "metrix_active_account_v1",
      JSON.stringify({ type: "ad_account", adAccountId: "bookster" }),
    );
  });

  const findings: Finding[] = [];
  let inspected = 0;

  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // NO named helper functions inside page.evaluate. tsx compiles this
    // through esbuild with keepNames, which wraps every named function in a
    // `__name(...)` call — a helper that exists in the Node bundle and NOT in
    // the page, so the evaluate throws `__name is not defined`. Everything
    // here is written inline for that reason.
    const onThisRoute = await page.evaluate(() => {
      const out: { kind: "button-in-button" | "link-in-button"; outer: string; inner: string }[] = [];
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        const outer = (btn.getAttribute("aria-label") || btn.textContent || "")
          .trim().replace(/\s+/g, " ").slice(0, 70);
        for (const nested of btn.querySelectorAll("button")) {
          out.push({
            kind: "button-in-button",
            outer,
            inner: (nested.getAttribute("aria-label") || nested.textContent || "")
              .trim().replace(/\s+/g, " ").slice(0, 70),
          });
        }
        for (const link of btn.querySelectorAll("a[href]")) {
          out.push({
            kind: "link-in-button",
            outer,
            inner: (link.getAttribute("aria-label") || link.textContent || "")
              .trim().replace(/\s+/g, " ").slice(0, 70),
          });
        }
      }
      return { out, buttonCount: buttons.length };
    });

    inspected += onThisRoute.buttonCount;
    for (const f of onThisRoute.out) findings.push({ route, ...f });
  }

  await browser.close();

  if (findings.length > 0) {
    console.error(`\nFAIL  ${findings.length} invalid interactive nesting(s):\n`);
    for (const f of findings) {
      console.error(`      · ${f.route}`);
      console.error(`        ${f.kind}: outer ${JSON.stringify(f.outer)}`);
      console.error(`                   inner ${JSON.stringify(f.inner)}`);
      console.error(
        `        The browser keeps ONE of these and drops the other, so one action ` +
          `silently does nothing. Make them siblings in a row instead of nesting them.\n`,
      );
    }
    process.exit(1);
  }

  console.log(
    `\nPASS  ${inspected} control(s) across ${ROUTES.length} route(s): no button inside a ` +
      `button, no link inside a button.`,
  );
}

main().catch((err) => {
  console.error(`\nFAIL  DOM validity scan could not run: ${String(err?.message ?? err)}`);
  process.exit(1);
});
