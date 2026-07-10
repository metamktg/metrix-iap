# MST Methodology: Comprehensive Review and Provenance Synthesis

Prepared for Alex Jakma. Sources reviewed: live skill files (`metrix-mst-test-engine`, `metrix-mst-creative-scan`, `metrix-iap-routing`, `metrix-analysis-core`, `metrix-client-library`), area memory (`metrix-iap.md`, `east-coast-art-studio.md`, `agency-claude-skills.md`), and chat history from September 2025 through July 2026.

---

## 1. What MST is, as currently documented

MST (Matrix Sprint Test) is the creative testing engine inside IAP (Intelligent Ads Protocol), your proprietary methodology at Meta Marketing Agency. Two live skills carry the operational logic:

- `metrix-mst-creative-scan`: validates assets before launch
- `metrix-mst-test-engine`: analyzes results after launch

Structure, straight from the current skill docs:

**The matrix.** 16 creatives in a 4x4 grid, positions C1A through C4D.

**Columns = concept constants.** All four creatives in a column share the same avatar/ICP, design system, and CTA type. The column is the audience isolation axis. Contaminate it (mix ICP codes within a column) and avatar-level analysis is invalid.

**Rows = one angle variable, not a formula.** All four creatives in a row share exactly one intended angle variable (framework, tone, hook, funnel stage). Everything else must vary. Two shared variables over-constrains the row and breaks isolation. Zero shared variables means the row has no isolation logic at all.

**Diagonals = maximum-diversity isolation.** Main diagonal (C1A, C2B, C3C, C4D) and counter diagonal (C1D, C2C, C3B, C4A) each carry one variable across four different avatars simultaneously. This is the highest-confidence signal in the matrix, since a variable that wins across maximum diversity is close to a universal claim.

**Naming convention.** `{MatrixPosition}_{ConceptCodes}_{AngleCodes}_{UniqueID}`, e.g. `C1A_CN_ICP_BusyParents_CN_Design_UGC_FW_PAS_TN_Emotional_HK_Problem_ST_TOFU_001`.

**Analysis layers (test engine, post-launch):**
1. Creative-level performance
2. Column analysis (avatar/ICP patterns)
3. Row analysis (cross-avatar variable signals)
4. Diagonal analysis (maximum isolation)
5. Variable isolation (aggregate performance per variable)
6. Combination synergy
7. Crossmap variable leaderboard

**Verdicts:** universal_winner, avatar_specific, underperformer, neutral, insufficient_data, avoid_combination, golden_formula.

**Validation layers (creative scan, pre-launch):** naming, column consistency, row consistency, diagonal isolation, variable distribution (2-4 appearances per variable, not 1 and not 5+), copy-to-variable alignment, concept adherence. Severity is critical / warning / info, with a documented remapping decision tree for anything that diverges from the planned stack rather than a silent override.

**Governing rule across both skills:** a winning creative is not automatically a winning variable. A variable needs repeated appearances in varied contexts before you can call it isolated. Row, column, and diagonal signals are never collapsed into one conclusion.

This is the authoritative current spec. It is what East Coast Art Studio's Sprint 1 matrix was built against.

---

## 2. Provenance: what's verifiably yours vs. what got formalized in dialogue

You asked me to separate original ideology and your own phrasing from material that may have drifted in tone or gotten generalized during back-and-forth. Here's the honest breakdown, based on actual human turns in chat history, not inference.

### Verifiably yours (your own typing, your own calls)

**The core testing philosophy, stated in your words (Sept 2025):** *"we do not want to make on the fly tweaks. we have the set out communications we are testing between planned before the launch."* This is the non-negotiable at the center of the whole system, the pre-launch briefs are locked before spend goes out. It's still the operating rule today (see the ECAS pixel/CAPI pre-launch gate).

**MST's original name and structure came from your live campaign builds, not a whiteboard exercise.** The earliest MST reference in your history is a real campaign spec: Campaign Type = "Manual Sales - Testing (MST)", naming pattern `SWU_MST_[MONTH][YEAR]_V1`, $50 ABO, 5 ad sets of 4 variations each. That's an operational artifact from your own account structure, not a Claude invention. The "Matrix Sprint Test" expansion of the acronym came later as the system matured into IAP.

**The naming convention evolution is entirely your call, iterated by you.** You drove a full naming-convention rebuild yourself (Oct 2025): *"after putting this system into effect, i've realized there's a better way to name the conventions to better identify the objective/targeting/version/etc"* — followed by your own structure for Campaign / Ad Set / Ad naming, your own example codes (SWU21_ASC+_Oct1_V9, C0B_STC_PDP_SWU21_V1), and your own list of edge cases to solve for (UGC not fitting the matrix, on-the-fly client creative, concept database cross-referencing). The current `{MatrixPosition}_{ConceptCodes}_{AngleCodes}_{UniqueID}` convention in the skill docs is a direct descendant of this.

**"IAP" (Intelligent Ads Protocol) is your proprietary framework, not a term Claude introduced.** Multiple threads confirm this: your history shows Claude initially misreading "IAP" as a generic industry term before you clarified it was your own system, and your profile background (Google ad data reporting, replacing opinion-based scaling with objective systems) is the stated motivation behind building it.

**The instinct to test single variables, not complete formulas, is your correction, repeated multiple times.** Across the Oct 2025 "IAP system document analysis" threads, you're the one steering Claude back on track when it kept defaulting to testing whole creative formulas instead of isolating individual variables. Your phrasing in that thread — asking whether a "group of variables... work seamlessly with one another... without distortion" before agreeing to add desire/benefit as the fifth axis — shows you making the actual methodology decisions, with Claude proposing options and you picking.

**Crossmap testing and avatar clustering are your terms.** You referred to *"our IAP crossmap testing methodoly"* and provided your own overlapping avatar clusters directly, not something Claude generated and you adopted.

### Formalized or generalized during dialogue (built with you, but not verbatim your phrasing)

**The specific variable-code taxonomy (CN_, FW_, TN_, HK_, ST_, PR_, HP_, AW_) was assembled collaboratively during the Oct 2025 correction threads**, as Claude tried to systematize your naming convention into a full "master variable" system. Your own naming convention docs used codes like STC, PDP, T1 — simpler, execution-level tags. The expanded semantic taxonomy is a joint construction, not something you typed out whole. Worth a direct check against your actual variable master list if one exists outside these chats, since a generalized version can drift from what your team actually uses.

**"The Golden Rule" as a named, quoted principle is Claude's framing**, introduced in the Oct 2025 "IAP system learning resource" thread as a way to summarize your correction ("variables must appear in multiple creatives with different combinations"). The underlying idea is unmistakably yours. The packaging (bolded callout box, "Golden Rule" label) is not something you asked for by name.

**The verdict taxonomy (universal_winner, avatar_specific, underperformer, neutral, insufficient_data, avoid_combination, golden_formula) is skill-productization language**, written when the MST skills were built in May 2026 (v1.0.0, per version history). It's a reasonable formalization of decisions you'd already been making informally, but it's Claude's naming scheme for those buckets, not terms you're on record using yourself.

**JSON schema structure, severity levels (critical/warning/info), and the remapping decision tree are engineering scaffolding** added when the skills were built for repeatable execution. Functionally sound and consistent with your stated standards ("we don't want on the fly tweaks"), but they're implementation detail, not methodology you dictated line by line.

### One flag worth your attention

The Oct 2025 threads show a real pattern: Claude repeatedly misapplied your methodology (testing complete formulas instead of isolating variables, missing diagonal logic, inventing avatar concepts) and you had to catch and correct it multiple times before the system stabilized. The current skill docs reflect the corrected, stabilized version. But it means part of what's now "canon" in the skill files passed through a few rounds of Claude getting it wrong first. If any of the current MST documentation feels slightly off from how you actually think about the system, that's the most likely place to check first, not the parts you typed directly, but the parts that got formalized after Claude had already misunderstood them once.

---

## 3. Timeline

- **Sept 2025:** MST exists as a live Meta Ads campaign type ("Manual Sales - Testing") with your own naming convention and creative brief docs. You set the no-on-the-fly-tweaks rule here.
- **Sept-Oct 2025:** Naming convention rebuilt by you into Campaign/Ad Set/Ad structure with objective, targeting, version, and concept-database considerations.
- **Oct 2025:** IAP formalized as "Intelligent Ads Protocol." Heavy correction cycles between you and Claude establish the row/column/diagonal isolation logic correctly (multiple false starts documented). Variable taxonomy and "Golden Rule" framing emerge here.
- **2026 (ongoing):** IAP/MST productized into the Metrix IAP SaaS platform and the current skill ecosystem (`metrix-*` skills, v1.0.0 shipped May 8, 2026; creative-scan expanded May 8, 2026 with full check-by-check validation logic).
- **July 2026:** First live account run through the full skill pipeline end to end — East Coast Art Studio, Sprint 1 matrix designed and validated.

---

## 4. Bottom line

The methodology in the current skills is accurate to your system and battle-tested against a real account. The core ideology, isolate one variable at a time, plan the full matrix before launch, never let a winning creative pass for a winning variable, is yours, stated by you, in your own words, well before any skill file existed. The taxonomy, verdict names, and JSON scaffolding around it are collaborative formalization for the purpose of making the system executable by Claude and your team consistently. If you want the skill docs to sound and think more like you specifically, the naming convention and validation rules are the safest to leave alone (closest to your own language), and the variable taxonomy and verdict labels are the ones worth a pass to confirm they match what you and your team actually call things day to day.
