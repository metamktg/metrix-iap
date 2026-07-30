# METRIX Product Loop

**Source:** `docs/architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md` §4 — reproduced verbatim.
The blueprint remains canonical; this file exists so the loop can be referenced on its own
without pulling in the full backend architecture document.

---

## 4. Product Loop

```
ONBOARD    → cohort selection (Section 6), creative intake (Section 8.1)
INPUT      → structured upload / data ingestion (Listen Layer, Section 9)
STORE      → Supabase persists analysis_run_inputs + raw payload
VALIDATE   → Skill Bridge schema + cohort-column validation
ANALYZE    → IAP engine runs the analysis chain (Plane 1)
OUTPUT     → intelligence_cards → reports / creative_briefs
REVIEW     → review_events / human_edits
APPROVE    → approval_events, scoped by approved_for
REMEMBER   → learning_registry — approved signals feed the optimization loop
```

---

Section references in the loop above point back into the master blueprint:

| Step | Blueprint section |
| :---- | :---- |
| ONBOARD | §6 (Cohort Architecture), §8.1 (Onboarding cold-start) |
| INPUT | §9 (Listen Layer — Metric Contract) |
| STORE | §11.2 (Analysis runs) |
| VALIDATE | §9, §6.2 (Schema) |
| ANALYZE | §3 (Four-Plane Architecture, Plane 1) |
| OUTPUT | §11.3 (Outputs) |
| REVIEW | §11.4 (Review, approval, learning) |
| APPROVE | §11.4 |
| REMEMBER | §11.4 |
