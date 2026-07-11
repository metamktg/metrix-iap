// ─── Generated-copy placeholder sanitization tests ────────────────────
// The generation engine must never persist unreplaced template tokens
// ("[Client Name]", "{{brand}}", "[INSERT PRODUCT]") into strategy or
// brief copy — brand-ish tokens become the real account name, generic
// placeholder tokens are stripped, and legitimate content (cell codes,
// variable codes, bracketed prose) is untouched.

import { describe, it, expect } from "vitest";
import { sanitizeGeneratedText } from "../generationEngine";

const NAME = "Acme Fitness";

describe("sanitizeGeneratedText", () => {
  it("substitutes brand/client tokens with the account name", () => {
    expect(sanitizeGeneratedText("Why [Client Name] works", NAME)).toBe("Why Acme Fitness works");
    expect(sanitizeGeneratedText("[BRAND] delivers results", NAME)).toBe("Acme Fitness delivers results");
    expect(sanitizeGeneratedText("Try {{brand_name}} today", NAME)).toBe("Try Acme Fitness today");
    expect(sanitizeGeneratedText("Join {company} now", NAME)).toBe("Join Acme Fitness now");
    expect(sanitizeGeneratedText("[Product Name] in action", NAME)).toBe("Acme Fitness in action");
  });

  it("strips generic placeholder tokens and tidies whitespace", () => {
    expect(sanitizeGeneratedText("Hook: [PLACEHOLDER] then close", NAME)).toBe("Hook: then close");
    expect(sanitizeGeneratedText("Benchmark: [TBD], revisit later", NAME)).toBe("Benchmark:, revisit later");
    expect(sanitizeGeneratedText("Use [INSERT TESTIMONIAL HERE] for proof", NAME)).toBe("Use for proof");
    expect(sanitizeGeneratedText("CTA {{cta_text}} goes here", NAME)).toBe("CTA goes here");
  });

  it("leaves cell codes, variable codes, and normal prose alone", () => {
    expect(sanitizeGeneratedText("C1A", NAME)).toBe("C1A");
    expect(sanitizeGeneratedText("CN_UGC + FW_PAS + TN_Warm", NAME)).toBe("CN_UGC + FW_PAS + TN_Warm");
    expect(sanitizeGeneratedText("Save 20% [limited time] on plans", NAME)).toBe(
      "Save 20% [limited time] on plans",
    );
    expect(sanitizeGeneratedText("CPA under $30 beats control", NAME)).toBe("CPA under $30 beats control");
  });

  it("recurses through nested objects and arrays without touching non-strings", () => {
    const input = {
      pillar_name: "[Brand] authority",
      priority: 1,
      nested: { hook: "Meet [Client Name]", tags: ["[PLACEHOLDER]", "CN_UGC"] },
      nullable: null,
    };
    expect(sanitizeGeneratedText(input, NAME)).toEqual({
      pillar_name: "Acme Fitness authority",
      priority: 1,
      nested: { hook: "Meet Acme Fitness", tags: ["", "CN_UGC"] },
      nullable: null,
    });
  });
});
