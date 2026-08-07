---
name: LLM JSON truncation handling
description: Why "Expected ',' or ']' ... in JSON" from generation runs means max_tokens truncation, and the durable rule for handling it
---

Generation-run errors like `Expected ',' or ']' after array element in JSON at position ~29000` mean the model's JSON was cut off by the output-token budget, not that the model wrote bad JSON.

**Why:** A repair prompt cannot fix truncated JSON — the missing tail was never generated, and re-asking with the same budget truncates again.

**How to apply:** Detect provider truncation from the response's stop reason and escalate the output budget (bounded) before parsing; never send a same-budget "fix your JSON" repair for a truncated response. If this parse error reappears, look for a call path that bypasses the truncation-aware wrapper in the generation engine rather than tweaking prompts.
