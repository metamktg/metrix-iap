// ─── check:unexplained-dashes ─────────────────────────────────────────
//
// A dash that explains nothing, measured in a real browser.
//
// An absent metric is a FACT about the account's data, and the reader needs
// to know which fact. "This segment recorded no results, so cost per result
// has no denominator" and "the page failed to compute this" look identical
// on screen: both are "—". The first is honest reporting; the second is a
// bug. A bare dash makes them indistinguishable, and a reader who cannot
// tell them apart eventually assumes the worse one.
//
// WHY A BROWSER, AND WHY NOT A SOURCE SCAN. The dash is produced by shared
// formatters — fmtUSD, fmtRate, fmtMetric all render "—" for null — so
// grepping for the literal finds the formatters, not the surfaces. What
// matters is what a reader SEES: a dash with nothing nearby to resolve it.
// That is a rendered-DOM question. jsdom cannot answer it either: no
// layout, no computed styles, no visibility.
//
// Measured 2026-09-01 before this existed: 684 visible dashes across 16
// routes x 2 accounts, 625 already resolvable, 59 bare. The 59 were not
// spread thin — they sat in five components, each rendering a formatter
// result straight out with no reason attached. All five now carry one, from
// the same expression that produced the null so the dash and its
// explanation cannot drift apart.
//
// WHAT COUNTS AS EXPLAINED: a `title` or `aria-label` on the element or
// within four ancestors, or an info affordance beside it. That is
// deliberately the affordance KpiStat established — a dotted underline plus
// a title, not a tooltip — because these stats also render inside
// button-cards where a nested interactive element is invalid HTML.
//
// NOT WIRED INTO .replit — needs a running dev server, same constraint as
// check:accessible-names and check:chart-geometry.
//
//   pnpm --filter @workspace/scripts run check:unexplained-dashes
//
// Exit 0 clean / 1 with findings / 2 could not reach the server.

import { chromium } from "playwright-core";
import fs from "node:fs"; import path from "node:path";
const BASE = process.env.DASH_CHECK_BASE ?? "http://localhost:5178";
// Resolved from THIS FILE, not from cwd: pnpm runs the script with cwd
// set to scripts/, where a repo-root-relative path points at nothing.
const REPO = path.resolve(import.meta.dirname, "../..");
const SEED = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json"), "utf8");
const b=await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",headless:true,args:["--no-sandbox","--disable-setuid-sandbox"]});
const p=await b.newPage({viewport:{width:1440,height:1200}});
await p.route("**/api/**",r=>r.fulfill({status:200,contentType:"application/json",body:"{}"}));
await p.route("**/api/metrix/auth/me",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({user:{id:"t",email:"demo@metrix.app",role:"admin",must_change_password:false,workspace_id:"metrix_manager"}})}));
await p.route("**/api/metrix/seed",r=>r.fulfill({status:200,contentType:"application/json",body:SEED}));
await p.route("**/api/metrix/workspaces/*/reports",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({reports:[]})}));
try {
  await p.goto(BASE, { waitUntil: "domcontentloaded", timeout: 15000 });
} catch {
  await b.close();
  console.log(`check:unexplained-dashes — could not reach ${BASE}. Start the dev server first; nothing was checked.`);
  process.exit(2);
}

const ROUTES=[["Analysis Overview","/app/analysis/overview"],["Ad performance","/app/analysis/performance"],
 ["IAP Library","/app/analysis/library"],["Creative DNA","/app/analysis/dna"],["Audience","/app/analysis/audience"],
 ["Placements","/app/analysis/placements"],["Budget","/app/analysis/budget"],["Funnel","/app/analysis/funnel"],
 ["Strategy map","/app/strategy/map"],["Avatars","/app/strategy/avatars"],["Hypotheses","/app/strategy/hypotheses"],
 ["Creative","/app/creative"],["Listen signals","/app/listen/signal"],["Alerts","/app/listen/alerts"],
 ["MST direction","/app/mst/direction"],["Manager overview","/app/overview"]];
let tot=0, unexplained=0; const rows=[];
for(const [label,url] of ROUTES){
  for (const acct of ["bookster","ecas"]) {
    await p.goto(`${BASE}${url}?account=${acct}`,{waitUntil:"domcontentloaded"});
    await p.waitForTimeout(2100);
    const r=await p.evaluate(()=>{
      const out=[];
      const walk=(el)=>{
        for(const c of el.children){
          const cs=getComputedStyle(c);
          if(cs.display==="none"||cs.visibility==="hidden") continue;
          const own=Array.from(c.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join("").trim();
          if(own==="—"||own==="–"){
            // Does anything nearby explain it? title on self or an ancestor,
            // aria-label, or a sibling info affordance.
            let expl=null, n=c;
            for(let d=0; d<4 && n; d++,n=n.parentElement){
              if(n.title) {expl=`title:${n.title.slice(0,40)}`;break;}
              if(n.getAttribute&&n.getAttribute("aria-label")){expl=`aria:${n.getAttribute("aria-label").slice(0,40)}`;break;}
              if(n.parentElement&&n.parentElement.querySelector('[data-info],[aria-haspopup],svg.lucide-info')){expl="info affordance";break;}
            }
            const ctx=(c.parentElement?.innerText||"").replace(/\n+/g," ").trim().slice(0,55);
            out.push({expl, ctx});
          }
          walk(c);
        }
      };
      walk(document.querySelector("main")||document.body);
      return out;
    });
    for(const d of r){ tot++; if(!d.expl){ unexplained++; rows.push(`${label} · ${acct}   "${d.ctx}"`);} }
  }
}
await b.close();
if (unexplained === 0) {
  console.log(`check:unexplained-dashes — clean (${tot} visible dash(es) across ${ROUTES.length} routes x 2 accounts, every one resolvable)`);
  process.exit(0);
}
console.log(`\ncheck:unexplained-dashes — ${unexplained} of ${tot} visible dash(es) explain nothing\n`);
for (const r of [...new Set(rows)].slice(0, 40)) console.log("   " + r);
console.log(
  "\nAn absent value is a fact about the data, and the reader needs to know\n" +
  "WHICH fact. Attach the reason where the null is produced, not at the render\n" +
  "site — a reason written next to the dash drifts from the condition that\n" +
  "caused it. The affordance is a dotted underline plus a `title` (see\n" +
  "KpiStat in rankSort.tsx): these stats also render inside button-cards,\n" +
  "where a tooltip or a DetailReveal would be invalid HTML.\n",
);
process.exit(1);
