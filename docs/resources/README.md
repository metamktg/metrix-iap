# docs/resources — planning and audit record

Non-canonical reference material: the working record of how the current architecture was arrived
at. Nothing here is a specification. Read these for *why* decisions were made; read
[`../architecture/`](../architecture/) and [`../prompts/`](../prompts/) for *what* the system does.

| Document | Purpose |
| :---- | :---- |
| [`METRIX_Conversation_Synthesis_and_Handoff.md`](METRIX_Conversation_Synthesis_and_Handoff.md) | Full-context handoff. Records the wrong turns that were caught and corrected (client identity leaking into schema, invented sprint tracking, inverted resolver priority, the near-miss MST gating table) so they are not quietly reintroduced. Also lists the canonical Drive document IDs. |
| [`METRIX_Document_Briefs_Package.md`](METRIX_Document_Briefs_Package.md) | Scoping briefs for all 15 outstanding Blueprint v2.0 documents, with per-brief purpose, scope, dependencies, acceptance criteria, and a source-confidence rating. |
| [`METRIX_Documentation_Audit_Phase1.md`](METRIX_Documentation_Audit_Phase1.md) | Cohort-aware migration audit: which of the 11 canonical documents carry hardcoded ecommerce assumptions, severity per document, the source-of-truth tier hierarchy, and the five repair briefs in dependency order. |
| [`METRIX_UI_Disclosure_Audit_Phase1.md`](METRIX_UI_Disclosure_Audit_Phase1.md) | Progressive-disclosure UI audit: every module page ranked by raw-pixel typography violations (`check:disclosure-rulebook`), the dead-seed-field pattern found and fixed once in Communications, and the scoped backlog for initiative 2+. |
| [`METRIX_IAP_Loop_Execution_Audit_Phase1.md`](METRIX_IAP_Loop_Execution_Audit_Phase1.md) | IAP Loop execution audit: what actually runs end-to-end per stage vs. what's stubbed, the cross-cutting cohort-awareness hardcoding bug (Analysis Core + Strategy/Brief generation), and the Optimization Loop being a complete stub. Suggested remediation order for initiative 5+. |
| [`METRIX_IAP_Output_Consistency_Audit_Phase1.md`](METRIX_IAP_Output_Consistency_Audit_Phase1.md) | Every seed-bundle field checked against every page, Agency and Ad Account views: which fields are dead, which are Agency-only/Ad-Account-only, and priority order for closing the gaps. |
| [`METRIX_Onboarding_Flow_Audit_Phase1.md`](METRIX_Onboarding_Flow_Audit_Phase1.md) | New-user journey traced end to end: what works, the mislabeled "Soon" badges fixed this pass, and the open items (guided-setup copy the backend assembles but the UI drops, and a cited but missing "Onboarding cold-start" spec). |
| [`METRIX_Platform_Gap_Audit_Phase1.md`](METRIX_Platform_Gap_Audit_Phase1.md) | Cross-system gap audit (Replit/GitHub/Supabase), checked live against the production database via the Supabase MCP connection: the `icp_profiles` schema-drift fix applied this pass, advisor findings confirmed as by-design rather than gaps, and the higher-lift plan for Optimization Loop + MST layers 2-7. |
| [`IAP_INFRASTRUCTURE_AUDIT_2026-07.md`](IAP_INFRASTRUCTURE_AUDIT_2026-07.md) | Infrastructure & UX audit: platform snapshot, five ranked bottlenecks (monolithic seed bundle, no code splitting, in-process jobs on autoscale, whole-bundle refetch, repo weight), progressive-disclosure gaps, and a sequenced P0-P3 roadmap. |
| [`IAP_ROADMAP_SPEC_BRIEFS_2026-07.md`](IAP_ROADMAP_SPEC_BRIEFS_2026-07.md) | Companion per-item technical specs for the roadmap above (P0-P3), each with current-state references, implementation requirements, and validation gates. |
| [`IAP_SPEC_SYNTHESIS_v1.0.md`](IAP_SPEC_SYNTHESIS_v1.0.md) | Modular system prompt for synthesizing a roadmap brief into a production-ready spec or PR. Not one of the six canonical IAP-chain prompts in `../prompts/`. |
| [`METRIX_Bugfix_and_Polish_Phase_Handoff_2026-08.md`](METRIX_Bugfix_and_Polish_Phase_Handoff_2026-08.md) | Handoff written right after the first successful real-account (AAFE) end-to-end IAP loop run: what "done" means for the bug-fix and UI/UX-polish phases that follow, the manual-import bug cluster just fixed, and what's still genuinely open. |

## The one rule worth carrying forward

From the audit: **Drive is edited first; every other copy is a generated mirror, never an
independent source.** The three-layer drift (Drive docs / project knowledge / Skills) is what let
the ecommerce assumption propagate silently. A one-directional sync prevents it recurring.

## Related

- [`../architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md`](../architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md) — what the briefs are scoped against
- [`../iap/`](../iap/) — the three documents the audit confirmed need no repair
