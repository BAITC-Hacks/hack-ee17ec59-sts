import { describe, expect, it } from "vitest";
import { buildFallbackAnalysis } from "../src/lib/analysis";
import { CONFIG, DISTRICTS, MEASURES, REFERENCE_SCENARIO, simulateScenario, validateScenario } from "../src/lib/simulation";
import type { Decision, ScenarioInput } from "../src/lib/simulation";

function evaluate(input: ScenarioInput) {
  const result = simulateScenario(input);
  if (!result.valid) throw new Error(JSON.stringify(result.errors));
  return result;
}
const scenario = (ids: string[]): ScenarioInput => ({ decisions: ids.map(measureId => ({
  measureId, ...(MEASURES.find(m => m.id === measureId)?.scope === "district" ? { districtId: "nura" as const } : {}),
})) });

describe("reference values from the JSON catalogue", () => {
  it("calculates the empty baseline, while UI validation still requires five decisions", () => {
    const result = evaluate({ decisions: [] });
    expect(result.score).toBeCloseTo(52.56, 2);
    expect(result.cityAverageAfter).toBeCloseTo(56.86, 2);
    expect(result.criticalIndicators).toEqual([
      { districtId: "nura", indicatorId: "S1", value: 38 },
      { districtId: "nura", indicatorId: "S2", value: 35 },
    ]);
    expect(result.budget.used).toBe(0);
    expect(validateScenario({ decisions: [] }).valid).toBe(false);
  });
  it("matches the 95-cost reference and activates the exact synergy", () => {
    const result = evaluate(REFERENCE_SCENARIO);
    expect(result.budget.used).toBe(95);
    expect(Math.abs(result.score - 56.54)).toBeLessThanOrEqual(.01);
    expect(result.criticalIndicators).toHaveLength(0);
    expect(result.activatedSynergies).toEqual(["M10+M12"]);
    expect(result.districts.find(d => d.id === "nura")?.indicatorsAfter.S1).toBe(48);
  });
  it("accepts the cheapest valid 61-cost set and applies a negative effect", () => {
    const result = evaluate(scenario(["M9", "M11", "M10", "M12", "M4"]));
    expect(result.budget.used).toBe(61);
    expect(result.districts.find(d => d.id === "nura")?.indicatorDeltas.T1).toBe(-1.75);
  });
  it("is input-dependent, order-independent and does not mutate shared JSON", () => {
    const before = structuredClone({ DISTRICTS, MEASURES, CONFIG, REFERENCE_SCENARIO });
    const first = evaluate(REFERENCE_SCENARIO);
    const shifted = structuredClone(REFERENCE_SCENARIO);
    shifted.decisions[0].districtId = "yesil";
    expect(evaluate(shifted).score).not.toBe(first.score);
    expect(evaluate({ decisions: [...REFERENCE_SCENARIO.decisions].reverse() }).score).toBeCloseTo(first.score, 10);
    first.districts[0].indicatorsAfter.T1 = -999;
    expect(evaluate(REFERENCE_SCENARIO).districts[0].indicatorsAfter.T1).toBeGreaterThanOrEqual(0);
    expect({ DISTRICTS, MEASURES, CONFIG, REFERENCE_SCENARIO }).toEqual(before);
  });
  it("keeps all indicators in range", () => {
    for (const district of evaluate(REFERENCE_SCENARIO).districts) {
      for (const value of Object.values(district.indicatorsAfter)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
  it("builds fallback from actual numbers without any key or network", () => {
    const result = evaluate(REFERENCE_SCENARIO);
    const brief = buildFallbackAnalysis(result);
    expect(brief.source).toBe("fallback");
    expect(brief.executiveSummary).toContain(result.score.toFixed(2));
    expect(brief.executiveSummary).toContain("95");
  });
});

describe("validation", () => {
  it.each([
    ["wrong-count", scenario(["M7"])],
    ["budget", scenario(["M3", "M7", "M8", "M13", "M14"])],
    ["duplicate-measure", scenario(["M7", "M7", "M10", "M12", "M5"])],
    ["category-limit", scenario(["M7", "M8", "M9", "M10", "M12"])],
    ["incompatible", scenario(["M1", "M3", "M9", "M10", "M12"])],
    ["incompatible", scenario(["M4", "M7", "M9", "M10", "M12"])],
    ["incompatible", scenario(["M5", "M13", "M9", "M10", "M12"])],
    ["unknown-measure", scenario(["unknown", "M8", "M10", "M12", "M5"])],
  ])("rejects %s", (code, input) => {
    const result = simulateScenario(input as ScenarioInput);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.map(e => e.code)).toContain(code);
  });
  it.each([
    ["district-required", { measureId: "M7" }],
    ["district-invalid", { measureId: "M7", districtId: "not-a-district" }],
    ["district-not-allowed", { measureId: "M12", districtId: "nura" }],
  ])("checks placement: %s", (code, decision) => {
    const input = structuredClone(REFERENCE_SCENARIO);
    const index = input.decisions.findIndex(d => d.measureId === decision.measureId);
    input.decisions[index] = decision as Decision;
    const result = simulateScenario(input);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.map(e => e.code)).toContain(code);
  });
});
