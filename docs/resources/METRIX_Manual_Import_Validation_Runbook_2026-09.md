# METRIX — Manual import validation runbook (fresh account, new user)

**Purpose.** Validate the shipped platform end to end on an account that has never
existed, with a user that has never logged in. No work touches Bookster or any
existing account. Written 2026-09-02 for the build merged from PR #174.

Every expected state below is one the code actually renders; where a state depends
on what the export carries, the condition is named.

## 0. Before the tester starts (owner, five minutes)

| Step | Where | Why it is manual |
|---|---|---|
| Approve the tester | Settings → Metrix Agent waitlist, or the `/admin` console | Users live in Replit Postgres; provisioning needs `DATABASE_URL`. Approval emails a temp password (or shows a copy button if Resend is sandboxed) and forces a password change on first login. |
| Confirm the live build | `sh scripts/src/verify-deployed-build.sh https://app.metrix.ad` from the workspace, then `curl` the entry chunk for the marker `Copy components` | A publish status of `success` is not evidence (closeout §2.7). |
| **Restart the database** (after the 2026-09-02 incident) | Supabase dashboard → project → Settings → Infrastructure → Restart | The first run wedged the instance (register §13.1); it did not recover on its own. Confirm with `select 1` from the SQL editor before the tester starts. |
| Nothing else | — | The evidence columns are already on the live database; the schema drift check is clean in both directions. |

## 1. What the tester needs

Two Meta Ads Manager pivot exports for one ad account, any window:

- the **demographic** export (age × gender breakdown) — `performance_demo_csv`
- the **device / placement / platform** export — `performance_placement_csv`

Both must be the exact pivot shapes `iapCsvSpec.ts` expects; the upload dialog names
any missing column. Creatives are **optional** for this test: the copy-level layer now
runs from the export's own copy columns, and the interface says so.

## 2. The path, and what each screen must show

1. **Sign in** with the temp password → forced password change → lands on the
   Agency Overview.
2. **Add account** (account switcher → Add account → Manual). Name it. Expected: the
   account appears immediately as *Needs setup*; the Account Overview shows the setup
   checklist (Name ✓ · Upload performance CSVs · Map creative assets · Run analysis).
3. **Upload both CSVs** from the checklist. Expected: each file validates on arrival,
   warnings (if any) persist on the row, the dialog requires both files plus an
   explicit Review before it closes. Nothing runs yet. An **Ad Summary** export is
   judged only on Amount spent, Impressions, Reach, Results and Result type — no warning
   about engagement or video columns, and no confidence penalty for them.
   Creatives dropped here are matched to ad names **by the server** (after the first run,
   when the ad registry exists); the dialog never blocks on unmapped files and never
   offers to delete them.
4. **Run analysis** from the Analysis command center: choose the window (it defaults
   to the latest date in the data) and press Run. Expected: the progress bar appears
   **on the click** ("Validating staged files before the run starts"), scrolls into view,
   then shows the server's own stage and percentage; the stage strip's Analysis node
   pulses; then success. Reloading mid-run shows the running state, not the splash;
   if the data service does not answer within 20 s the splash says so and offers a retry. Warnings, if the export lacked columns, appear in the run
   card and in Analysis · History.
5. **Analysis** pages populate: Overview, Ad Performance, IAP Library, Audience,
   Placements, Budget. The objective is derived from the data (Settings → General
   shows it read-only; "Not yet determined" only when every result type is unknown).
6. **Creative · Library.** Expected with no creatives uploaded:
   - the **Copy components** tab is selected and populated (headlines, primary text,
     descriptions, CTAs ranked by weight) **if the export carried the copy columns**;
     if it did not, the tab is disabled with the reason and the page shows the honest
     pending state;
   - the Concept / Variable / Cross-map tabs are disabled with "Scan creatives to
     populate this";
   - the **creative-source suggestion** strip is visible, states the coverage share,
     offers *Upload creatives* and *Connect Meta*, and stays until dismissed;
     dismissing it hides it for this account in this browser only;
   - **Evidence by concept** lists every concept from the run with its confidence
     tier, copy coverage, evidence grade and score;
   - if creatives were staged, a **next-step suggestion** offers "Deconstruct N
     creatives" (manual, 202 + progress) and, once deconstructed, "Re-run analysis with
     the full IAP variable library". Both stay until dismissed.
7. **Creative dialog** (open any ad tile from IAP Library): the Overview tab shows the
   ad's copy labelled *from the performance export*.
8. **Navigation checks** while there: the Back control in the top bar names its
   destination on every page; ⌘K / Ctrl+K opens the palette and finds "Audience";
   the sidebar section label opens the command center and the chevron only toggles.
9. **Strategy → Generate** and **Creative → Generate briefs** are manual and optional
   for this test; both follow the running / success / error pattern.

## 3. What to report

- Any screen that is blank without a reason on it.
- Any number that disagrees between two screens (the run-scoping rule says they must
  agree).
- The run's `csv_warnings`, verbatim, if any.
- Whether the copy columns were in the export (it changes what step 6 must show).

## 4. Known non-blockers

- The Action Queue reads "No actions yet": the optimize producer is sprint 1 of the
  Phase 4 plan and not yet built.
- Rows from analysis runs made before 2026-09-02 show "not graded" for creative
  evidence; a fresh account never sees this.
