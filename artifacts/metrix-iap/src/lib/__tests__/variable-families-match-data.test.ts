// ─── The family list must come from the data, not the letters ─────────
//
// The first version of VARIABLE_FAMILIES was written from the prefix codes
// alone and got three things wrong, all of which the checked-in seed bundle
// would have answered:
//
//   · HP was labelled "Hook position". variable_registry says "Pain proof",
//     and the stacks that carry it are keyed pain_proof.
//   · It invented the keys hook_position, awareness and structure. Real
//     stacks use st, and nothing at all for awareness.
//   · It listed only the long key form, while the bundle carries both — a
//     stack keyed hk/tn/fw resolved to nothing and rendered nine empty
//     slots on real data.
//
// So these read the fixture rather than restating a list.

import { describe, it, expect } from "vitest";
import seed from "../../test-fixtures/metrix_seed_bundle.json";
import { VARIABLE_FAMILIES, stackValue, registryStatusFor, getVariablePrefix } from "../variable-registry";
import { familyLabel } from "@/pages/metrix/strategy/strategyShared";

const registry = (seed as { variable_registry?: { prefix: string; family: string; status: string }[] })
  .variable_registry ?? [];

/** Every variable_stack object anywhere in the bundle. */
function allStacks(): Record<string, string | null>[] {
  const out: Record<string, string | null>[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && typeof n === "object") {
      const o = n as Record<string, unknown>;
      if (o["variable_stack"] && typeof o["variable_stack"] === "object") {
        out.push(o["variable_stack"] as Record<string, string | null>);
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(seed);
  return out;
}

describe("labels and prefixes come from variable_registry", () => {
  it("the fixture actually carries a registry — otherwise the rest proves nothing", () => {
    expect(registry.length).toBeGreaterThan(0);
  });

  it("every registry prefix has a family entry", () => {
    for (const r of registry) {
      expect(
        VARIABLE_FAMILIES.some((f) => f.prefix === r.prefix),
        `registry defines ${r.prefix} (${r.family}) and VARIABLE_FAMILIES has no entry for it`,
      ).toBe(true);
    }
  });

  it("every label matches the registry's family name verbatim", () => {
    for (const r of registry) {
      const f = VARIABLE_FAMILIES.find((x) => x.prefix === r.prefix)!;
      expect(f.label, `${r.prefix} is "${r.family}" in the data`).toBe(r.family);
    }
  });

  it("HP is Pain proof, which is the one that was wrong", () => {
    expect(VARIABLE_FAMILIES.find((f) => f.prefix === "HP")!.label).toBe("Pain proof");
  });
});

describe("keys come from the stacks that exist", () => {
  const stacks = allStacks();

  it("the fixture actually carries stacks", () => {
    expect(stacks.length).toBeGreaterThan(0);
  });

  it("resolves every stack key present in the bundle", () => {
    const known = new Set(VARIABLE_FAMILIES.flatMap((f) => [f.key, ...f.aliases]));
    const unknown = new Set<string>();
    for (const s of stacks) for (const k of Object.keys(s)) if (!known.has(k)) unknown.add(k);
    expect([...unknown], "stack keys in real data that no family claims").toEqual([]);
  });

  it("reads a short-form stack, which used to render as entirely unset", () => {
    const short = { hk: "HK_ProofFirst", tn: "TN_Direct", hp: "HP_TimePoor" };
    const hook = VARIABLE_FAMILIES.find((f) => f.prefix === "HK")!;
    const pain = VARIABLE_FAMILIES.find((f) => f.prefix === "HP")!;
    expect(stackValue(short, hook)).toBe("HK_ProofFirst");
    expect(stackValue(short, pain)).toBe("HP_TimePoor");
  });

  it("treats a blank value as unset rather than set-but-empty", () => {
    const hook = VARIABLE_FAMILIES.find((f) => f.prefix === "HK")!;
    expect(stackValue({ hook: "" }, hook)).toBeNull();
    expect(stackValue({ hook: "   " }, hook)).toBeNull();
  });

  it("finds at least one real stack in the bundle it can read", () => {
    const readable = stacks.filter((s) => VARIABLE_FAMILIES.some((f) => stackValue(s, f) !== null));
    expect(readable.length).toBeGreaterThan(0);
  });
});

describe("registry gaps are a different fact from an unset slot", () => {
  it("reports the three confirmed gaps as missing, with their reason", () => {
    for (const prefix of ["AW", "CTA", "ST"] as const) {
      const f = VARIABLE_FAMILIES.find((x) => x.prefix === prefix)!;
      const st = registryStatusFor(registry, f);
      expect(st, `${prefix} should be in the registry`).not.toBeNull();
      expect(st!.status).toBe("registry_missing");
      expect(st!.note, `${prefix}'s gap should be explained, not just flagged`).toBeTruthy();
    }
  });

  it("reports a defined family as active", () => {
    const hook = VARIABLE_FAMILIES.find((f) => f.prefix === "HK")!;
    expect(registryStatusFor(registry, hook)!.status).toBe("active");
  });

  it("returns null when the seed carried no registry, rather than guessing", () => {
    const hook = VARIABLE_FAMILIES.find((f) => f.prefix === "HK")!;
    expect(registryStatusFor(undefined, hook)).toBeNull();
  });
});

describe("prefix parsing agrees with the family list", () => {
  it("maps each family's own prefix back to itself", () => {
    for (const f of VARIABLE_FAMILIES) {
      expect(getVariablePrefix(`${f.prefix}_Example`)).toBe(f.prefix);
    }
  });
});

describe("familyLabel agrees with the registry for both key forms", () => {
  it("names a long-form key", () => {
    expect(familyLabel("pain_proof")).toBe("Pain proof");
    expect(familyLabel("proof")).toBe("Proof type");
    expect(familyLabel("cta")).toBe("Call to action");
  });

  it("names a short-form key, which used to render as 'Hk'", () => {
    expect(familyLabel("hk")).toBe("Hook");
    expect(familyLabel("tn")).toBe("Tone");
    expect(familyLabel("hp")).toBe("Pain proof");
  });

  it("still says something for a key no family claims", () => {
    expect(familyLabel("some_new_thing")).toBe("Some New Thing");
  });

  it("gives every key in the bundle the registry's own family name", () => {
    const registryName = new Map(registry.map((r) => [r.prefix, r.family]));
    const keys = new Set(allStacks().flatMap((s) => Object.keys(s)));
    expect(keys.size).toBeGreaterThan(0);
    for (const k of keys) {
      const f = VARIABLE_FAMILIES.find((x) => x.key === k || x.aliases.includes(k));
      expect(f, `no family claims the stack key "${k}"`).toBeTruthy();
      expect(familyLabel(k), `"${k}" should be named as the registry names ${f!.prefix}`)
        .toBe(registryName.get(f!.prefix) ?? f!.label);
    }
  });
});
