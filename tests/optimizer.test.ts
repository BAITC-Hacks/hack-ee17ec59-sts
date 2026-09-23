import { describe, expect, it } from "vitest";
import { enumerateValid, findBest, optimizerStats, suggestSwaps, REFERENCE_SCENARIO, simulateScenario, validateScenario } from "../src/lib/simulation";

describe("full server optimizer", () => {
  it("enumerates once, matches scoring across the search and returns a valid optimum", () => {
    const all = enumerateValid();
    console.log("OPTIMIZER", JSON.stringify({ ...optimizerStats(), top3: findBest(3) }));
    expect(all.length).toBe(694395);
    expect(enumerateValid()).toBe(all);
    expect(findBest()[0].score).toBeGreaterThanOrEqual(56.54);
    const sample = [...findBest(10), ...all.filter((_, i) => i % 997 === 0)];
    for (const entry of sample) {
      expect(validateScenario(entry.scenario).valid).toBe(true);
      const scored = simulateScenario(entry.scenario);
      if (!scored.valid) throw new Error("invalid enumeration");
      expect(entry.score).toBeCloseTo(scored.score, 10);
      expect(entry.cost).toBe(scored.budget.used);
      expect(entry.dMin).toBeCloseTo(Math.min(...scored.districts.map(d => d.scoreAfter)), 10);
      expect(entry.minDistrict).toBe(scored.weakestDistrictAfter);
      expect(entry.nCrit).toBe(scored.criticalIndicators.length);
    }
    expect(Object.isFrozen(all)).toBe(true);
    expect(Object.isFrozen(all[0].scenario.decisions)).toBe(true);
  });
  it("suggests only valid positive single changes, including district relocation, with exact optimum gap", () => {
    const input = structuredClone(REFERENCE_SCENARIO);
    const result = suggestSwaps(input, 1000);
    expect(result.swaps.length).toBeGreaterThanOrEqual(3);
    expect(result.gapToOptimum).toBeCloseTo(findBest(1)[0].score - result.currentScore!, 10);
    for (const swap of result.swaps) {
      expect(validateScenario(swap.scenario).valid).toBe(true);
      expect(swap.scoreDelta).toBeGreaterThan(0);
      const changed = swap.scenario.decisions.filter((d, i) => JSON.stringify(d) !== JSON.stringify(input.decisions[i]));
      expect(changed).toHaveLength(1);
    }
    expect(result.swaps.some(s => s.addedMeasureId === s.replacedMeasureId && s.addedDistrictId !== s.replacedDistrictId)).toBe(true);
    expect(suggestSwaps(input).swaps).toEqual(result.swaps.slice(0, 3));
    expect(input).toEqual(REFERENCE_SCENARIO);
    expect(suggestSwaps({ decisions: [] })).toEqual({ swaps: [], gapToOptimum: null, currentScore: null });
    expect(suggestSwaps(findBest(1)[0].scenario).swaps).toEqual([]);
  });
});
