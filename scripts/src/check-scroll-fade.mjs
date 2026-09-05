// check:scroll-fade: READ-ONLY browser check, not a `.replit` validation. Needs
// the dev server on 5178 (like check:friction). Exists because jsdom has no
// layout and no scroll timelines: `.mx-scroll-x`'s edge fade is driven by the
// element's own horizontal scroll timeline (index.css), which a unit test can
// only assert as text. This opens three routes at 390 px through the
// route-crawl stubs and, for every `.mx-scroll-x`, reads the two fade widths
// off the computed style:
//   · a container that does NOT overflow must carry NO fade (both 0px): its
//     timeline is inactive, so the keyframes never apply;
//   · a container that overflows must fade on the RIGHT only at rest
//     (0px / 14px) and on the LEFT only once scrolled to the end (14px / 0px).
// One route at 1440 px must carry no mask at all (the fade is a phone rule).
// Exit 0 every expectation held / 1 an expectation failed / 2 could not reach
// the server or found no scroller (nothing checked, not a verdict).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.SCROLL_FADE_BASE ?? "http://localhost:5178";
const ACCOUNT = process.env.SCROLL_FADE_ACCOUNT ?? "bookster";
const ROUTES = (process.env.SCROLL_FADE_ROUTES ?? "/app/account,/app/analysis/funnel,/app/strategy/hypotheses").split(",");
// The same default its siblings carry (check-friction, check-controls): without it a shell
// with neither variable set asked Playwright for a browser it never downloaded here.
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/opt/pw-browsers/chromium";
const FADE = "14px";

const SEED = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json"), "utf8");

async function reachable() {
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function stub(ctx) {
  await ctx.route("**/api/metrix/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/metrix/auth/me", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "test-user", email: "demo@metrix.app", role: "admin", must_change_password: false, workspace_id: "metrix_manager" } }) }));
  await ctx.route("**/api/metrix/seed", (r) => r.fulfill({ status: 200, contentType: "application/json", body: SEED }));
  await ctx.route("**/api/metrix/workspaces/*/reports", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }) }));
  await ctx.route("**/analysis/data-windows**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ windows: [] }) }));
  await ctx.route("**/analysis/summary**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ totals: {}, concept_rows: [], placement_rows: [], demographic_rows: [] }) }));
}

async function settle(page, route) {
  await page.goto(`${BASE}${route}?account=${ACCOUNT}`, { waitUntil: "domcontentloaded" });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const len = await page.evaluate(() => (document.querySelector("main")?.innerText ?? "").trim().length);
    if (len > 40) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(900);
}

function readScrollers() {
  const out = [];
  for (const el of document.querySelectorAll(".mx-scroll-x")) {
    const cs = getComputedStyle(el);
    out.push({
      label: el.getAttribute("aria-label") || el.getAttribute("data-testid") || el.className.split(" ").slice(0, 2).join(" "),
      overflow: el.scrollWidth - el.clientWidth,
      fadeL: cs.getPropertyValue("--mx-fade-l").trim(),
      fadeR: cs.getPropertyValue("--mx-fade-r").trim(),
      mask: cs.maskImage,
    });
  }
  return out;
}

function scrollOverflowingToEnd() {
  const els = [...document.querySelectorAll(".mx-scroll-x")].filter((e) => e.scrollWidth > e.clientWidth);
  for (const el of els) el.scrollLeft = el.scrollWidth;
  return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
    res(els.map((el) => {
      const cs = getComputedStyle(el);
      return { fadeL: cs.getPropertyValue("--mx-fade-l").trim(), fadeR: cs.getPropertyValue("--mx-fade-r").trim() };
    }));
  })));
}

async function main() {
  if (!(await reachable())) {
    console.error(`check:scroll-fade: could not reach ${BASE} (start the dev server: PORT=5178 BASE_PATH=/ pnpm --filter @workspace/metrix-iap run dev). Nothing checked.`);
    return 2;
  }
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const failures = [];
  let checked = 0;
  let overflowing = 0;
  try {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await stub(phone);
    const page = await phone.newPage();
    for (const route of ROUTES) {
      await settle(page, route);
      const rows = await page.evaluate(readScrollers);
      for (const r of rows) {
        checked += 1;
        if (r.mask === "none") failures.push(`${route} [${r.label}] at 390: no mask (the phone rule did not apply)`);
        if (r.overflow > 0) {
          overflowing += 1;
          if (r.fadeL !== "0px" || r.fadeR !== FADE) failures.push(`${route} [${r.label}] overflows ${r.overflow}px at rest: fades ${r.fadeL || "(unset)"} / ${r.fadeR || "(unset)"}, expected 0px / ${FADE}`);
        } else if (r.fadeL !== "0px" || r.fadeR !== "0px") {
          failures.push(`${route} [${r.label}] fits but fades ${r.fadeL || "(unset)"} / ${r.fadeR || "(unset)"}, expected none`);
        }
        console.log(`  390 ${route.padEnd(28)} [${r.label}] overflow=${r.overflow}px fades=${r.fadeL || "(unset)"}/${r.fadeR || "(unset)"}`);
      }
      const ends = await page.evaluate(scrollOverflowingToEnd);
      for (const e of ends) {
        if (e.fadeL !== FADE || e.fadeR !== "0px") failures.push(`${route} scrolled to the end: fades ${e.fadeL} / ${e.fadeR}, expected ${FADE} / 0px`);
      }
      if (ends.length) console.log(`  390 ${route.padEnd(28)} scrolled to end: ${ends.map((e) => `${e.fadeL}/${e.fadeR}`).join(" ")}`);
    }
    await phone.close();

    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await stub(desk);
    const dpage = await desk.newPage();
    await settle(dpage, ROUTES[0]);
    const drows = await dpage.evaluate(readScrollers);
    for (const r of drows) {
      checked += 1;
      if (r.mask !== "none") failures.push(`${ROUTES[0]} [${r.label}] at 1440: mask set (the fade is a phone rule, at desktop nothing changes)`);
    }
    console.log(`  1440 ${ROUTES[0].padEnd(27)} ${drows.length} scroller(s), mask ${drows.every((r) => r.mask === "none") ? "none" : "SET"}`);
    await desk.close();
  } finally {
    await browser.close();
  }
  if (checked === 0) {
    console.error("check:scroll-fade: found no .mx-scroll-x on the routes. Nothing checked.");
    return 2;
  }
  if (failures.length) {
    console.error(`\ncheck:scroll-fade: ${failures.length} FAILURE(S) over ${checked} scroller reading(s):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    return 1;
  }
  console.log(`\ncheck:scroll-fade: clean (${checked} scroller reading(s), ${overflowing} overflowing at 390 px, every fade where the scroll is and nowhere else)`);
  return 0;
}

process.exitCode = await main();
