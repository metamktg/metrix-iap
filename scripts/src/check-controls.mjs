// check:controls, READ-ONLY browser check, not a `.replit` validation. Needs the
// dev server on 5178 (like check:friction). Opens every dropdown, popover,
// menu and dialog trigger on every route, for two fixture accounts at 1440
// and 390 px, and asserts what a reader would: the surface OPENS (the
// trigger reports expanded and a floating surface appears), it is VISIBLE
// (inside the viewport, with size), it is POPULATED (at least one option,
// item, control or input inside it) and it CLOSES on Escape. Native <select>s
// must carry options and an accessible name. Exists because the owner found
// filtering and dropdown regressions that nothing in the bar could see: the
// crawl shoots pages at rest, the unit tests render without layout, and no
// gate had ever clicked a control open. Exit 0 every control passed / 1 a
// control failed / 2 could not reach the server (nothing checked).
//
//   CONTROLS_ROUTES=/app/analysis/overview,/app/account   narrows the routes
//   CONTROLS_ACCOUNTS=bookster                              narrows the accounts
//   CONTROLS_WIDTHS=1440                                    narrows the widths
//   CONTROLS_BASE=http://localhost:5178
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.CONTROLS_BASE ?? "http://localhost:5178";
const ACCOUNTS = (process.env.CONTROLS_ACCOUNTS ?? "bookster,manual_9JGXU_AQJjxJ").split(",");
const WIDTHS = (process.env.CONTROLS_WIDTHS ?? "1440,390").split(",").map(Number);
const ONLY = process.env.CONTROLS_ROUTES ? process.env.CONTROLS_ROUTES.split(",") : null;
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/opt/pw-browsers/chromium";
const MAX_TRIGGERS_PER_VISIT = 40;

const SEED = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json"), "utf8");

function routes() {
  const set = new Set();
  const nav = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/navigation/navTree.ts"), "utf8");
  for (const m of nav.matchAll(/"(\/app\/[a-z0-9/-]*)"/g)) set.add(m[1]);
  const app = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/App.tsx"), "utf8");
  for (const m of app.matchAll(/path="(\/app[a-z0-9/-]*)"/g)) set.add(m[1]);
  const legacy = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/navigation/legacyRoutes.ts"), "utf8");
  const legacySources = new Set();
  for (const m of legacy.matchAll(/\["(\/app[a-z0-9/-]*)",\s*"(\/app[a-z0-9/-]*)"\]/g)) { legacySources.add(m[1]); set.add(m[2]); }
  return [...set].filter((r) => !legacySources.has(r)).sort();
}

async function reachable() {
  try { const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) }); return res.ok; } catch { return false; }
}

async function stub(ctx) {
  await ctx.route("**/api/metrix/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/metrix/auth/me", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "test-user", email: "demo@metrix.app", role: "admin", must_change_password: false, workspace_id: "metrix_manager" } }) }));
  await ctx.route("**/api/metrix/seed", (r) => r.fulfill({ status: 200, contentType: "application/json", body: SEED }));
  await ctx.route("**/api/metrix/workspaces/*/reports", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }) }));
  await ctx.route("**/analysis/data-windows**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ windows: [] }) }));
  await ctx.route("**/analysis/summary**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ totals: {}, concept_rows: [], placement_rows: [], demographic_rows: [] }) }));
}

async function settle(page, route, account) {
  await page.goto(`${BASE}${route}${route.includes("?") ? "&" : "?"}account=${account}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const len = await page.evaluate(() => (document.querySelector("main")?.innerText ?? "").trim().length);
    if (len > 40) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(700);
}

/** The triggers on the page, in DOM order, described for the report. Runs in the page. */
function listTriggers(max) {
  const name = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || (el.textContent || "").trim().replace(/\s+/g, " ")).slice(0, 60) || "(unnamed)";
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const inOverlay = (el) => !!el.closest('[role="dialog"], [data-radix-popper-content-wrapper]');
  const out = [];
  const seen = new Set();
  // Mark what floats BEFORE any click, so a surface a control adds afterwards
  // (a Radix popper, a hand-portalled menu, anything fixed) is the new thing.
  for (const el of document.querySelectorAll("body > *, [style*=\"position: fixed\"], [style*=\"position:fixed\"]")) el.setAttribute("data-controls-pre", "1");
  for (const el of document.querySelectorAll('button[aria-haspopup], [role="combobox"], button[aria-expanded][aria-controls], button[data-state][aria-expanded]')) {
    if (seen.has(el) || !shown(el) || el.disabled || inOverlay(el)) continue;
    // A tab (role=tab) and a disclosure inside a card are not floating controls.
    if (el.getAttribute("role") === "tab") continue;
    if (!el.getAttribute("aria-haspopup") && el.getAttribute("role") !== "combobox") {
      // aria-expanded without haspopup: an inline disclosure (SectionCard, DetailReveal) unless it controls a floating surface.
      const ctl = el.getAttribute("aria-controls");
      const target = ctl ? document.getElementById(ctl) : null;
      if (!target || !target.closest("[data-radix-popper-content-wrapper]")) continue;
    }
    seen.add(el);
    el.setAttribute("data-controls-check", String(out.length));
    out.push({ index: out.length, name: name(el), haspopup: el.getAttribute("aria-haspopup") || "controls", inHeader: !!el.closest("header, [data-testid='topbar']") });
    if (out.length >= max) break;
  }
  const selects = [];
  for (const el of document.querySelectorAll("select")) {
    if (!shown(el) || inOverlay(el)) continue;
    const id = el.id;
    const labelled = !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.closest("label"));
    selects.push({ name: name(el), options: el.options.length, labelled });
  }
  return { triggers: out, selects };
}

/** After a click: what opened. Runs in the page. */
function readOpened(index) {
  const trigger = document.querySelector(`[data-controls-check="${index}"]`);
  const expanded = trigger ? trigger.getAttribute("aria-expanded") : null;
  const state = trigger ? trigger.getAttribute("data-state") : null;
  const vw = window.innerWidth, vh = window.innerHeight;
  const candidates = new Set([
    ...document.querySelectorAll('[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [role="listbox"], [role="menu"]'),
    ...document.querySelectorAll('body > *:not([data-controls-pre]), [style*="position: fixed"]:not([data-controls-pre]), [style*="position:fixed"]:not([data-controls-pre])'),
  ]);
  const surfaces = [...candidates]
    .filter((s) => !s.matches("script, style, link") && !s.closest("[data-sonner-toaster]"))
    .filter((s) => { const r = s.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((s) => {
      const r = s.getBoundingClientRect();
      const inner = s.querySelector('[role="dialog"], [role="menu"], [role="listbox"], [data-state="open"]') ?? s;
      const ir = inner.getBoundingClientRect();
      const box = ir.width > 0 ? ir : r;
      const populated = !!s.querySelector('button, [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], input, a, label, [role="checkbox"], [role="switch"], [role="slider"], textarea');
      const text = (s.textContent || "").trim().length;
      const role = s.getAttribute("role") || (s.querySelector('[role="listbox"], [role="menu"], [role="dialog"]')?.getAttribute("role") ?? null);
      const scrollable = s.scrollHeight > s.clientHeight + 2 || !!s.querySelector("[class*='overflow-y-auto'], [style*='overflow-y: auto'], [style*='overflow: auto']");
      return {
        role, scrollable,
        left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom),
        width: Math.round(box.width), height: Math.round(box.height),
        offscreen: box.left < -2 || box.top < -2 || box.right > vw + 2 || box.bottom > vh + 2,
        populated, text,
      };
    });
  return { expanded, state, surfaces, vw, vh };
}

async function main() {
  if (!(await reachable())) {
    console.error(`check:controls: could not reach ${BASE} (start the dev server: PORT=5178 BASE_PATH=/ pnpm --filter @workspace/metrix-iap run dev). Nothing checked.`);
    return 2;
  }
  const all = ONLY ?? routes();
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const failures = [];
  let checked = 0, selectsChecked = 0, visits = 0;
  try {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
      await stub(ctx);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message.split("\n")[0]}`));
      for (const account of ACCOUNTS) {
        for (const route of all) {
          const where = `${route} · ${account} · ${width}px`;
          try { await settle(page, route, account); } catch (e) { failures.push(`${where}: did not load (${String(e).slice(0, 80)})`); continue; }
          visits++;
          const { triggers, selects } = await page.evaluate(listTriggers, MAX_TRIGGERS_PER_VISIT);
          for (const s of selects) {
            selectsChecked++;
            if (s.options === 0) failures.push(`${where}: <select> "${s.name}" carries no options`);
            if (!s.labelled) failures.push(`${where}: <select> "${s.name}" has no accessible name`);
          }
          for (const t of triggers) {
            const loc = page.locator(`[data-controls-check="${t.index}"]`);
            if (!(await loc.count())) continue;
            checked++;
            const label = `${where}: "${t.name}" (${t.haspopup})`;
            try {
              await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
              await loc.click({ timeout: 3000 });
            } catch (e) {
              failures.push(`${label}: could not click (${String(e).split("\n")[0].slice(0, 80)})`);
              continue;
            }
            await page.waitForTimeout(350);
            const opened = await page.evaluate(readOpened, t.index);
            const surface = opened.surfaces.find((s) => s.populated) ?? opened.surfaces[0] ?? null;
            const reportsOpen = opened.expanded === "true" || opened.state === "open";
            if (!surface && !reportsOpen) {
              failures.push(`${label}: nothing opened (aria-expanded=${opened.expanded ?? "none"}, data-state=${opened.state ?? "none"})`);
            } else if (!surface) {
              failures.push(`${label}: trigger reports open but no floating surface has size`);
            } else {
              if (surface.offscreen && !surface.scrollable) failures.push(`${label}: surface leaves the viewport and does not scroll (${surface.left},${surface.top} to ${surface.right},${surface.bottom} in ${opened.vw}x${opened.vh})`);
              const promised = t.haspopup === "true" ? "menu" : t.haspopup;
              if ((promised === "listbox" || promised === "menu") && surface.role !== promised) failures.push(`${label}: trigger promises a ${promised} but the surface carries role=${surface.role ?? "none"}`);
              if (!surface.populated && surface.text < 8) failures.push(`${label}: surface is empty`);
              if (opened.expanded === "false") failures.push(`${label}: a surface is open but the trigger reports aria-expanded=false`);
            }
            await page.keyboard.press("Escape");
            await page.waitForTimeout(250);
            const after = await page.evaluate(readOpened, t.index);
            const stillOpen = after.surfaces.some((s) => s.populated) || after.state === "open";
            if (stillOpen) {
              // A dialog the reader opened with the trigger closes on Escape as well; a
              // surface that stays is a control the keyboard cannot dismiss.
              failures.push(`${label}: does not close on Escape`);
              await page.mouse.click(2, 2).catch(() => {});
              await page.waitForTimeout(200);
            }
          }
          for (const e of errors.splice(0)) failures.push(`${where}: ${e}`);
          console.log(`  ${String(width).padStart(4)} ${account.padEnd(20)} ${route.padEnd(32)} controls=${triggers.length} selects=${selects.length}`);
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  if (visits === 0 || (checked === 0 && selectsChecked === 0)) {
    console.error("check:controls: found no control on any route. Nothing checked.");
    return 2;
  }
  if (failures.length) {
    console.error(`\ncheck:controls: ${failures.length} FAILURE(S) over ${checked} control(s) and ${selectsChecked} select(s) across ${visits} visits:`);
    for (const f of [...new Set(failures)]) console.error(`  ✗ ${f}`);
    return 1;
  }
  console.log(`\ncheck:controls: clean (${checked} control(s) opened, populated and closed, ${selectsChecked} select(s) labelled and populated, across ${visits} visits)`);
  return 0;
}

process.exitCode = await main();
