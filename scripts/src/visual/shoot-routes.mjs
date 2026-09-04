// Visual crawl: screenshot every route at desktop and phone widths against the
// fixture seed, with the same API stubs the route-crawl spec uses. No credentials.
// Also records per route: console errors, page errors, horizontal overflow,
// visible text length, count of hover-only affordances, and the first-layer
// text for reading.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const REPO = "/home/user/metrix-iap";
const BASE = process.env.SHOOT_BASE ?? "http://localhost:5178";
const OUT = process.env.SHOOT_OUT ?? path.join(path.dirname(new URL(import.meta.url).pathname), "shots");
const ACCOUNT = process.env.SHOOT_ACCOUNT ?? "bookster";
const WIDTHS = (process.env.SHOOT_WIDTHS ?? "1440,390").split(",").map(Number);
const ONLY = process.env.SHOOT_ONLY ? process.env.SHOOT_ONLY.split(",") : null;
const PRELOGIN = process.env.SHOOT_PRELOGIN === "1";
const PRELOGIN_ROUTES = ["/", "/forgot-password", "/create-account", "/reset-password?token=x", "/admin"];

const SEED = fs.readFileSync(
  path.join(REPO, "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json"),
  "utf8",
);

function routes() {
  const set = new Set();
  const nav = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/navigation/navTree.ts"), "utf8");
  for (const m of nav.matchAll(/"(\/app\/[a-z0-9/-]*)"/g)) set.add(m[1]);
  const app = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/App.tsx"), "utf8");
  for (const m of app.matchAll(/path="(\/app[a-z0-9/-]*)"/g)) set.add(m[1]);
  const legacy = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/navigation/legacyRoutes.ts"), "utf8");
  // legacy table is [from, to] tuples; only targets matter visually
  const legacySources = new Set();
  for (const m of legacy.matchAll(/\["(\/app[a-z0-9/-]*)",\s*"(\/app[a-z0-9/-]*)"\]/g)) { legacySources.add(m[1]); set.add(m[2]); }
  return [...set].filter((r) => !legacySources.has(r)).sort();
}

async function mock(ctx) {
  // Registered first so it matches LAST: Playwright runs handlers newest-first.
  await ctx.route("**/api/metrix/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/metrix/auth/me", (r) =>
    PRELOGIN ? r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "unauthenticated" }) }) : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "test-user", email: "demo@metrix.app", role: "admin", must_change_password: false, workspace_id: "metrix_manager" } }) }),
  );
  await ctx.route("**/api/metrix/seed", (r) => r.fulfill({ status: 200, contentType: "application/json", body: SEED }));
  await ctx.route("**/api/metrix/workspaces/*/reports", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }) }));
  await ctx.route("**/analysis/data-windows**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ windows: [] }) }));
  await ctx.route("**/analysis/summary**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ totals: {}, concept_rows: [], placement_rows: [], demographic_rows: [] }) }));
}

const IGNORE = [/\[vite\]/i, /Failed to load resource|net::ERR_FAILED|ERR_ABORTED/i];

async function shoot(page, route, width, slug) {
  const errors = [];
  const onErr = (e) => errors.push("PAGEERROR " + e.message.split("\n")[0]);
  const onCon = (m) => { if (m.type() === "error" && !IGNORE.some((p) => p.test(m.text()))) errors.push("CONSOLE " + m.text().split("\n")[0]); };
  page.on("pageerror", onErr); page.on("console", onCon);
  await page.goto(`${BASE}${route}${route.includes("?") ? "&" : "?"}account=${ACCOUNT}`, { waitUntil: "domcontentloaded" });
  await page.locator(PRELOGIN ? "form, h1" : "main").first().waitFor({ state: "visible", timeout: PRELOGIN ? 8000 : 30000 }).catch(() => {});
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const len = await page.evaluate(() => ((document.querySelector("main") ?? document.body)?.innerText ?? "").trim().length);
    if (len > 40) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(900);
  // The shell scrolls inside <main>, so a "fullPage" shot is one viewport tall. Grow
  // the viewport to the tallest scroll container (capped) and let layout settle.
  const wanted = await page.evaluate(() => {
    let max = document.documentElement.scrollHeight;
    for (const el of document.querySelectorAll("main *")) {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 4) {
        max = Math.max(max, el.scrollHeight + (el.getBoundingClientRect().top || 0) + 24);
      }
    }
    return Math.min(Math.ceil(max), 6000);
  });
  const vp = page.viewportSize();
  if (wanted > vp.height) { await page.setViewportSize({ width: vp.width, height: wanted }); await page.waitForTimeout(500); }
  const facts = await page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const text = (main?.innerText ?? "").trim();
    const de = document.documentElement;
    const overflow = de.scrollWidth > de.clientWidth + 1;
    const buttons = document.querySelectorAll("button").length;
    const links = document.querySelectorAll("a[href]").length;
    const h1 = document.querySelector("h1")?.innerText ?? "";
    const headings = [...document.querySelectorAll("h1,h2,h3")].slice(0, 12).map((h) => h.tagName + ": " + h.innerText.trim().slice(0, 60));
    const unlabeledIconButtons = [...document.querySelectorAll("button")].filter((b) => !b.innerText.trim() && !b.getAttribute("aria-label") && !b.getAttribute("title")).length;
    return { textLen: text.length, overflow, buttons, links, h1, headings, unlabeledIconButtons, firstLayer: text.slice(0, 1400) };
  });
  const file = path.join(OUT, `${slug}@${width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  page.off("pageerror", onErr); page.off("console", onCon);
  if (wanted > vp.height) await page.setViewportSize(vp);
  return { route, width, errors, ...facts, file };
}

const list = PRELOGIN ? PRELOGIN_ROUTES : (ONLY ?? routes());
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const report = [];
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, deviceScaleFactor: 1, hasTouch: width < 500 });
  await mock(ctx);
  const page = await ctx.newPage();
  for (const route of list) {
    const slug = (route === "/" ? "login" : route.replace(/^\/app\/?/, "").replace(/^\//, "").replace(/\?.*$/, "").replace(/\//g, "_")) || "root";
    try {
      const r = await shoot(page, route, width, slug);
      report.push(r);
      const flag = (r.errors.length ? " ERR" : "") + (r.overflow ? " OVERFLOW" : "") + (r.textLen < 40 ? " EMPTY" : "");
      console.log(`${String(width).padStart(4)} ${route.padEnd(40)} text=${String(r.textLen).padStart(5)} btn=${String(r.buttons).padStart(3)} unlabeled=${r.unlabeledIconButtons}${flag}${r.errors.length ? "\n       " + r.errors.slice(0,3).join("\n       ") : ""}`);
    } catch (e) {
      report.push({ route, width, errors: ["CRAWL " + e.message] });
      console.log(`${width} ${route} CRAWL-FAIL ${e.message.split("\n")[0]}`);
    }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(`\n${report.length} shots -> ${OUT}`);
