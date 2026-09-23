import { describe, expect, it } from "vitest";
import { compareAdvice, scenarioKey } from "../src/lib/simulation/advice";
import { REFERENCE_SCENARIO } from "../src/lib/simulation/scenarios";
import { simulateScenario } from "../src/lib/simulation/simulate";
import type { ScenarioInput } from "../src/lib/simulation/types";

const cloneReference = () => structuredClone(REFERENCE_SCENARIO);
const improvement = () => {
  const scenario = cloneReference();
  scenario.decisions[4].districtId = "nura";
  return { baseScenario: cloneReference(), scenario };
};

describe("applying a verified single-decision recommendation", () => {
  it("recalculates a real improvement without increasing costs or mutating its inputs", () => {
    const current = cloneReference();
    const proposal = improvement();
    const originals = structuredClone({ current, proposal });
    const result = compareAdvice(current, proposal);
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error(result.message);
    expect(result.comparison.changedIndex).toBe(4);
    expect(result.comparison.before).toEqual(simulateScenario(current));
    expect(result.comparison.after).toEqual(simulateScenario(proposal.scenario));
    expect(result.comparison.after.score).toBeGreaterThan(result.comparison.before.score);
    expect(result.comparison.after.budget.used).toBe(95);
    expect({ current, proposal }).toEqual(originals);
    result.comparison.scenario.decisions[0].districtId = "yesil";
    expect({ current, proposal }).toEqual(originals);
  });

  it("ignores tampered costs and scores supplied alongside a proposal", () => {
    const proposal = improvement();
    const result = compareAdvice(REFERENCE_SCENARIO, {
      ...proposal,
      before: { score: -500, budget: { used: 999 } },
      after: { score: 100, budget: { used: 0 } },
      scenario: { ...proposal.scenario, score: 100, budget: { used: 0 } },
    });
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error(result.message);
    expect(result.comparison.after).toEqual(simulateScenario(proposal.scenario));
    expect(result.comparison.before).toEqual(simulateScenario(REFERENCE_SCENARIO));
    expect(result.comparison.scenario).toEqual(proposal.scenario);
  });

  it("rejects a response after the user changes a district or slot order", () => {
    const current = cloneReference();
    current.decisions[0].districtId = "yesil";
    expect(compareAdvice(current, improvement())).toMatchObject({ valid: false, message: expect.stringContaining("изменился") });
    expect(compareAdvice({ decisions: [...REFERENCE_SCENARIO.decisions].reverse() }, improvement()))
      .toMatchObject({ valid: false, message: expect.stringContaining("изменился") });
    expect(scenarioKey(current)).not.toBe(scenarioKey(REFERENCE_SCENARIO));
  });

  it("rejects advice a second time after it was applied", () => {
    const proposal = improvement();
    expect(compareAdvice(proposal.scenario, proposal)).toMatchObject({ valid: false, message: expect.stringContaining("изменился") });
  });

  it.each([null, {}, { decisions: [] }, { decisions: [null, null, null, null, null] }])(
    "returns an error rather than throwing on malformed current input: %j", current => {
      expect(compareAdvice(current, improvement()).valid).toBe(false);
    },
  );

  it.each([null, {}, { baseScenario: REFERENCE_SCENARIO, scenario: { decisions: [] } }])(
    "returns an error for a malformed proposal: %j", proposal => {
      expect(compareAdvice(REFERENCE_SCENARIO, proposal).valid).toBe(false);
    },
  );

  it("rejects a target missing its district, unknown measures, and duplicate measures", () => {
    for (const decision of [{ measureId: "M5" }, { measureId: "unknown" }, { measureId: "M7", districtId: "nura" as const }]) {
      const proposal = improvement();
      proposal.scenario.decisions[4] = decision;
      expect(compareAdvice(REFERENCE_SCENARIO, proposal).valid).toBe(false);
    }
  });

  it("rejects invalid current scenarios even when the proposal names the same base", () => {
    const current = cloneReference();
    current.decisions[0] = { measureId: "M7" };
    expect(compareAdvice(current, { baseScenario: current, scenario: improvement().scenario }).valid).toBe(false);
  });

  it("rejects no change and multiple changed decisions", () => {
    expect(compareAdvice(REFERENCE_SCENARIO, { baseScenario: REFERENCE_SCENARIO, scenario: REFERENCE_SCENARIO }))
      .toMatchObject({ valid: false, message: expect.stringContaining("ровно одно") });
    const proposal = improvement();
    proposal.scenario.decisions[2].districtId = "yesil";
    expect(compareAdvice(REFERENCE_SCENARIO, proposal))
      .toMatchObject({ valid: false, message: expect.stringContaining("ровно одно") });
  });

  it("rejects extra spending even when the total is within the overall budget", () => {
    const scenario = cloneReference();
    scenario.decisions[3] = { measureId: "M14" };
    const simulated = simulateScenario(scenario);
    expect(simulated.valid).toBe(true);
    if (!simulated.valid) throw new Error("Expected a valid target");
    expect(simulated.budget.used).toBe(97);
    expect(compareAdvice(REFERENCE_SCENARIO, { baseScenario: REFERENCE_SCENARIO, scenario }))
      .toMatchObject({ valid: false, message: expect.stringContaining("увеличивает расходы") });
  });

  it("rejects a lower Score despite a forged positive score", () => {
    const scenario: ScenarioInput = cloneReference();
    scenario.decisions[0].districtId = "yesil";
    expect(compareAdvice(REFERENCE_SCENARIO, { baseScenario: REFERENCE_SCENARIO, scenario, after: { score: 100 } }))
      .toMatchObject({ valid: false, message: expect.stringContaining("не улучшает") });
  });
});
