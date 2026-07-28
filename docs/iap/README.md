# docs/iap — IAP reference layer

Cohort-agnostic reference documents for the Intelligent Ads Protocol. These describe the
*creative language* and *matrix mechanics* of the system, one layer below business-model logic.
Per the Phase 1 documentation audit, all three are correctly cohort-agnostic and are **not**
subject to the cohort-awareness repair applied to the execution prompts.

| Document | Purpose |
| :---- | :---- |
| [`MST_METHOD_REFERENCE.md`](MST_METHOD_REFERENCE.md) | Canonical Matrix Sprint Test methodology — matrix architecture, the six variable-consistency layers, distribution strategy, the five-question audit framework, and analysis methodology. |
| [`MST_CREATIVE_SCAN.md`](MST_CREATIVE_SCAN.md) | Pre-launch and post-production validation system for MST assets — eight validation checks, scoring weights, critical/warning classification, and the variable remapping workflow. |
| [`VARIABLES_REGISTRY.md`](VARIABLES_REGISTRY.md) | Canonical registry of every IAP variable code: concept (`CN_`), framework (`FW_`), tonality (`TN_`), hook (`HK_`), funnel stage (`ST_`), awareness (`AW_`), pain point (`HP_`), proof type (`PR_`), and CTA (`CTA_`). |

## How these relate

`MST_METHOD_REFERENCE` defines the rules; `MST_CREATIVE_SCAN` enforces them against real assets;
`VARIABLES_REGISTRY` supplies the code definitions both depend on. The executable prompt chain
lives in [`../prompts/`](../prompts/); the backend architecture that runs it lives in
[`../architecture/`](../architecture/).

## Related

- [`../prompts/`](../prompts/) — the executable IAP prompt chain (v2.0)
- [`../architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md`](../architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md) — canonical backend blueprint
- [`../resources/METRIX_Documentation_Audit_Phase1.md`](../resources/METRIX_Documentation_Audit_Phase1.md) — why these three need no repair
