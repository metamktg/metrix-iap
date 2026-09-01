// End-to-end route crawl: visit every navigable page and watch for breakage.
//
// The other specs each drive one feature deeply. Nothing walks the WHOLE app,
// so a page that throws on mount, renders empty, or logs an error every time
// it loads has no detector — it only surfaces when someone happens to click it.
//
// jsdom cannot stand in for this. `nav-routes.test.tsx` already proves every
// nav target resolves to a real page rather than the 404, but it renders into
// jsdom with a stubbed ResizeObserver, so anything that depends on real layout
// — every recharts surface in this app — is not exercised there at all.
//
// The crawl asserts three things per route:
//   1. no uncaught exception (a blank screen leaves one)
//   2. no console error
//   3. the page rendered its own content, rather than the seed error screen,
//      the route-level 404, or nothing at all
//
// Route list is read out of navTree.ts as text, so a page added to the sidebar
// is crawled automatically instead of quietly escaping this suite.
//
// Run: tsx tests/e2e/metrix-iap-route-crawl.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-route-crawl

import { chromium } from "playwright-core";
import type { BrowserContext, ConsoleMessage, Page } from "playwright-core";
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
 * Every /app page the router can land on.
 *
 * Read from BOTH the sidebar tree and App.tsx's own <Route path> list. The
 * sidebar alone misses 23 of them — settings sub-pages reached by deep link,
 * pages reached only from inside another page, and the legacy paths that
 * redirect. Those are exactly the routes nobody clicks by hand, so they are
 * the ones worth a machine visiting. A redirect simply lands on its target
 * and gets validated there, which also proves the redirect still works.
 */
function navRoutes(): string[] {
  const routes = new Set<string>();
  const nav = fs.readFileSync(
    path.resolve(REPO_ROOT, "artifacts/metrix-iap/src/navigation/navTree.ts"),
    "utf-8",
  );
  for (const m of nav.matchAll(/"(\/app\/[a-z0-9/-]*)"/g)) routes.add(m[1]!);
  const app = fs.readFileSync(
    path.resolve(REPO_ROOT, "artifacts/metrix-iap/src/App.tsx"),
    "utf-8",
  );
  for (const m of app.matchAll(/path="(\/app[a-z0-9/-]*)"/g)) routes.add(m[1]!);
  return [...routes].sort();
}

/**
 * Run `worker` over `items` with a bounded number in flight.
 *
 * The worker is handed its SLOT, not the item index: each slot owns one tab
 * for the whole run, so two concurrent visits can never share a page. Keying
 * the tab off the item index instead would put items 0 and 3 on the same tab
 * at the same time.
 */
async function pooled<T, R>(
  items: T[],
  slots: number,
  worker: (item: T, slot: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(slots, items.length) }, async (_unused, slot) => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!, slot);
      }
    }),
  );
  return results;
}

// ── harness ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

/**
 * Console noise that is not a defect in this app.
 *
 * Each entry needs a reason. An unexplained filter is how a real error gets
 * classified as noise and stops being reported.
 */
const IGNORED_CONSOLE = [
  {
    // Vite's dev server injects this when a module graph node is re-requested;
    // it is dev-transport chatter, absent from a production build.
    pattern: /\[vite\]/i,
    why: "Vite dev-server transport message, not application output",
  },
  {
    // Route mocks below deliberately answer a subset of endpoints; anything
    // unmocked is aborted by Playwright and the browser logs the failed load.
    pattern: /Failed to load resource|net::ERR_FAILED|ERR_ABORTED/i,
    why: "an endpoint this crawl does not mock — a transport fact, not a page defect",
  },
];

function isIgnorable(text: string): boolean {
  return IGNORED_CONSOLE.some((entry) => entry.pattern.test(text));
}

async function mockApis(ctx: BrowserContext): Promise<void> {
  await ctx.route("**/api/metrix/auth/me", (route) =>
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
  await ctx.route("**/api/metrix/seed", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: SEED_FIXTURE_BODY }),
  );
  await ctx.route("**/api/metrix/workspaces/*/reports", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }) }),
  );
  await ctx.route("**/analysis/data-windows**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ windows: [] }) }),
  );
  await ctx.route("**/analysis/summary**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ totals: {}, concept_rows: [], placement_rows: [], demographic_rows: [] }),
    }),
  );
}

/**
 * Accounts to crawl every route against.
 *
 * One route set against one fully configured account only ever proves the app
 * works when everything is present. This codebase's central promise is the
 * opposite case — "honest pending state", never fabricated data — and nothing
 * walked the pages with an account that has no analysis at all. A page that
 * assumes `iap` exists crashes there and nowhere else.
 *
 * The fixture holds three distinct shapes and all three are worth walking:
 * everything present, nothing present, and the mixed state where an account
 * reads as unconfigured yet still carries a full iap object.
 */
const ACCOUNTS = [
  { id: "bookster", why: "configured, multi-event" },
  {
    id: "manual_9JGXU_AQJjxJ",
    why: "iap is null — exactly what POST /accounts creates before any analysis",
  },
  {
    id: "skov_pet",
    why: "unconfigured, yet carrying a full iap object — the mixed state",
  },
];

interface RouteReport {
  account: string;
  route: string;
  pageErrors: string[];
  consoleErrors: string[];
  bodyTextLength: number;
  showedSeedError: boolean;
  showedNotFound: boolean;
}

async function visit(page: Page, route: string, account: string): Promise<RouteReport> {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const onPageError = (err: Error) => pageErrors.push(err.message);
  // React formats its warnings with %s placeholders and passes the offending
  // component stack as a trailing argument, so `msg.text()` alone reads
  // "<%s> cannot contain a nested %s" — true, and useless for finding it.
  // Resolving the arguments is what turns a console error into a location.
  const pending: Promise<void>[] = [];
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    if (isIgnorable(msg.text())) return;
    pending.push(
      (async () => {
        let text = msg.text();
        try {
          const args = await Promise.all(msg.args().map((a) => a.jsonValue()));
          const parts = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a)));
          if (parts.length > 1) {
            let i = 1;
            const formatted = parts[0]!.replace(/%[sdioOfc]/g, () => parts[i++] ?? "");
            text = [formatted, ...parts.slice(i)].join(" ").trim();
          }
        } catch {
          // handle already collected — keep the unresolved text
        }
        // Component stacks are long; the first few frames name the culprit.
        consoleErrors.push(text.split("\n").slice(0, 6).join("\n       "));
      })(),
    );
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  try {
    await page.goto(`${BASE}${route}?account=${account}`, { waitUntil: "domcontentloaded" });
    // Wait for the shell, then let lazy route chunks and charts settle.
    await page
      .locator("main")
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => {});
    // Route chunks are lazy. Waiting a fixed beat reads the spinner as an
    // empty page under load, so wait for the route-level loading state to
    // clear first and only then give charts a moment to lay out.
    await page
      .getByTestId("route-loading")
      .waitFor({ state: "detached", timeout: 30_000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
    await Promise.all(pending);

    const main = page.locator("main").first();
    const bodyText = (await main.textContent().catch(() => "")) ?? "";
    return {
      account,
      route,
      pageErrors,
      consoleErrors,
      bodyTextLength: bodyText.trim().length,
      showedSeedError: await page
        .getByText("Couldn't load Metrix data")
        .isVisible()
        .catch(() => false),
      showedNotFound: await page
        .getByText("Page not found")
        .isVisible()
        .catch(() => false),
    };
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const routes = navRoutes();
  const visits = ACCOUNTS.flatMap((a) => routes.map((route) => ({ route, account: a.id })));
  console.log(
    `\nMetrix IAP route crawl (${BASE}) — ${routes.length} route(s) × ${ACCOUNTS.length} account(s)\n` +
      ACCOUNTS.map((a) => `  ${a.id} — ${a.why}`).join("\n") +
      "\n",
  );

  if (routes.length < 30) {
    console.error(
      `FAIL  only ${routes.length} route(s) extracted from navTree.ts — the crawl would pass over nothing`,
    );
    process.exit(1);
  }

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const reports: RouteReport[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.newPage();
    await mockApis(ctx);

    // Three tabs at once. Serially this is ~15 minutes of mostly waiting, and
    // the pages are independent — each visit attaches its own listeners and
    // reads only its own page.
    const pages = [ctx.pages()[0]!, await ctx.newPage(), await ctx.newPage()];
    const settled = await pooled(visits, pages.length, (v, slot) =>
      visit(pages[slot]!, v.route, v.account),
    );

    for (const report of settled) {
      reports.push(report);
      const problems: string[] = [];
      if (report.pageErrors.length) problems.push(`${report.pageErrors.length} uncaught`);
      if (report.consoleErrors.length) problems.push(`${report.consoleErrors.length} console`);
      if (report.showedSeedError) problems.push("seed error screen");
      if (report.showedNotFound) problems.push("404");
      if (report.bodyTextLength < 40) problems.push(`empty (${report.bodyTextLength} chars)`);

      if (problems.length === 0) {
        console.log(`  ✓  ${report.account} ${report.route}`);
        passed++;
      } else {
        console.error(`  ✗  ${report.account} ${report.route}  —  ${problems.join(", ")}`);
        for (const e of report.pageErrors) console.error(`       uncaught: ${e}`);
        for (const e of report.consoleErrors) console.error(`       console:  ${e}`);
        failed++;
      }
    }
    await ctx.close();
  } finally {
    await browser.close();
  }

  console.log(`\n${passed + failed} visit(s): ${passed} clean, ${failed} with problems`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nFatal error running route crawl:", err);
  process.exit(1);
});
