import { describe, expect, it } from "vitest";
import { enumerateValid, findBest, findWorst, scoreRank, optimizerStats, suggestSwaps, pareto, timeline, evaluate, MEASURES, REFERENCE_SCENARIO, simulateScenario, simulateWithShare, validateScenario } from "../src/lib/simulation";
import { effectShare } from "../src/lib/simulation/numeric";
import { engineTools, executeTool } from "../src/lib/simulation/tools";

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

describe("agent tool dispatcher", () => {
  it("publishes eight Chat Completions schemas with Russian descriptions", () => {
    expect(engineTools).toHaveLength(8);
    expect(new Set(engineTools.map(t => t.function.name)).size).toBe(8);
    for (const tool of engineTools) {
      expect(tool.type).toBe("function");
      expect(tool.function.description).toMatch(/[А-Яа-я]/);
      expect(tool.function.parameters).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
  it.each(["evaluate_scenario", "validate_scenario", "find_best", "find_worst", "suggest_swaps", "pareto", "timeline", "score_rank"])("executes %s through the public dispatcher", name => {
    const args = ["find_best", "find_worst", "pareto"].includes(name) ? {} : { scenario: REFERENCE_SCENARIO };
    const output = executeTool(name, JSON.stringify(args));
    expect(output).not.toHaveProperty("error");
    expect(JSON.stringify(output).length).toBeGreaterThan(2);
  });
  it("caps result sizes, rounds only the tool output and preserves the engine cache", () => {
    const best = executeTool("find_best", {}) as { score: number }[];
    expect(best).toHaveLength(5);
    expect(best[0].score).toBe(57.24);
    expect(findBest(1)[0].score).toBeCloseTo(57.236735, 8);
    expect(executeTool("evaluate_scenario", { scenario: REFERENCE_SCENARIO })).toMatchObject({ score: 56.54, cost: 95 });
    expect(Object.keys(executeTool("timeline", { scenario: REFERENCE_SCENARIO }) as object).sort()).toEqual(["byMeasure", "score"]);
    expect(executeTool("validate_scenario", { scenario: { decisions: [] } })).toMatchObject({ valid: false });
  });
  it("passes constraints through find_best without changing district semantics", () => {
    const result = executeTool("find_best", { constraints: { avoidDistricts: ["yesil"], budgetMax: 80, mustInclude: ["M3"] } }) as ReturnType<typeof findBest>;
    expect(result).toHaveLength(5);
    for (const row of result) {
      expect(row.cost).toBeLessThanOrEqual(80);
      expect(row.scenario.decisions.every(d => d.districtId !== "yesil")).toBe(true);
      expect(row.scenario.decisions.some(d => d.measureId === "M3")).toBe(true);
    }
  });
  it.each([
    ["unknown", {}], ["__proto__", {}], ["evaluate_scenario", "{"], ["evaluate_scenario", {}],
    ["find_best", { topN: 500 }], ["find_best", { constraints: { avoidDistricts: ["wrong"] } }],
    ["find_best", { constraints: { budgetMax: "80" } }], ["pareto", { step: 0 }],
    ["timeline", { scenario: { decisions: [{ measureId: "M3" }] } }], ["score_rank", null],
  ])("returns a Russian error for invalid %s arguments", (name, args) => {
    const result = executeTool(name as string, args) as { error: string };
    expect(result.error).toMatch(/[А-Яа-я]/);
  });
});

describe("constrained tools and timeline", () => {
  it("finds deterministic worst cases and ranks extremes and the reference by score", () => {
    const worst = findWorst(10), best = findBest(10);
    expect(worst).toHaveLength(10);
    for (const entry of worst) {
      expect(validateScenario(entry.scenario).valid).toBe(true);
      expect(entry.score).toBeLessThanOrEqual(best.at(-1)!.score);
    }
    for (let i = 1; i < worst.length; i++) {
      expect(worst[i].score).toBeGreaterThanOrEqual(worst[i - 1].score);
      if (worst[i].score === worst[i - 1].score) expect(worst[i].cost).toBeGreaterThanOrEqual(worst[i - 1].cost);
    }
    expect(findWorst(10)).toEqual(worst);
    expect(findWorst(3, { budgetMax: 80, avoidDistricts: ["yesil"] }).every(r =>
      r.cost <= 80 && r.scenario.decisions.every(d => d.districtId !== "yesil"))).toBe(true);
    expect(findWorst(1, { exclude: MEASURES.map(m => m.id) })).toEqual([]);
    const topRank = scoreRank(best[0].scenario), bottomRank = scoreRank(worst[0].scenario), reference = scoreRank(REFERENCE_SCENARIO);
    if ("error" in topRank || "error" in bottomRank || "error" in reference) throw new Error("Expected ranks");
    expect(topRank.rank).toBe(1);
    expect(bottomRank.rank).toBe(bottomRank.total);
    expect(bottomRank.percentile).toBe(0);
    expect(reference.percentile).toBeGreaterThan(0);
    expect(reference.percentile).toBeLessThan(100);
    const evaluated = evaluate(REFERENCE_SCENARIO);
    if (!evaluated.valid) throw new Error("Expected valid reference");
    const worse = enumerateValid().filter(r => r.score < evaluated.score - 1e-10).length;
    expect(reference.percentile).toBe(100 * worse / enumerateValid().length);
    expect(scoreRank({ decisions: [...REFERENCE_SCENARIO.decisions].reverse() })).toEqual(reference);
    expect(scoreRank({ decisions: [] })).toHaveProperty("error");
    console.log("RANK", JSON.stringify({ worst: worst[0], reference }));
  });
  it("filters required/excluded measures, exact placements, districts and minimum district score", () => {
    const noYesil = findBest(10, { avoidDistricts: ["yesil"] });
    expect(noYesil).toHaveLength(10);
    expect(noYesil.every(r => r.scenario.decisions.every(d => d.districtId !== "yesil"))).toBe(true);
    const lrt = findBest(10, { mustInclude: ["M3"], budgetMax: 80 });
    expect(lrt).toHaveLength(10);
    expect(lrt.every(r => r.cost <= 80 && r.scenario.decisions.some(d => d.measureId === "M3"))).toBe(true);
    const exact = findBest(10, { mustIncludePlaced: [{ id: "M3", district: "nura" }], minDistrictScore: 54, exclude: ["M7"] });
    expect(exact.length).toBeGreaterThan(0);
    for (const entry of exact) {
      expect(validateScenario(entry.scenario).valid).toBe(true);
      expect(entry.dMin).toBeGreaterThanOrEqual(54);
      expect(entry.scenario.decisions).toContainEqual({ measureId: "M3", districtId: "nura" });
      expect(entry.scenario.decisions.some(d => d.measureId === "M7")).toBe(false);
    }
    expect(findBest(10, { exclude: MEASURES.map(m => m.id) })).toEqual([]);
    expect(findBest(10, { mustInclude: ["M3"], exclude: ["M3"] })).toEqual([]);
    expect(findBest(10, { mustInclude: ["unknown"] })).toEqual([]);
    expect(findBest(10, { budgetMax: 60 })).toEqual([]);
    expect(findBest(10, { minDistrictScore: 100 })).toEqual([]);
    expect(findBest(10, { mustIncludePlaced: [{ id: "M3", district: "nura" }], avoidDistricts: ["nura"] })).toEqual([]);
    expect(findBest(0.5)).toEqual([]);
    expect(findBest(0)).toEqual([]);
  });
  it("returns the monotone budget frontier, omits impossible budgets, includes the true 100 optimum", () => {
    const points = pareto();
    console.log("PARETO", JSON.stringify(points));
    expect(points.map(p => p.budget)).toEqual([65, 70, 75, 80, 85, 90, 95, 100]);
    for (let i = 0; i < points.length; i++) {
      expect(points[i].cost).toBeLessThanOrEqual(points[i].budget);
      expect(validateScenario(points[i].scenario).valid).toBe(true);
      const result = evaluate(points[i].scenario);
      expect(result.valid && result.score).toBeCloseTo(points[i].score, 10);
      if (i) expect(points[i].score).toBeGreaterThanOrEqual(points[i - 1].score);
    }
    expect(points.at(-1)?.score).toBe(findBest()[0].score);
    expect(pareto(7).at(-1)?.budget).toBe(100);
    expect(() => pareto(0)).toThrow(RangeError);
    expect(() => pareto(.1)).toThrow(RangeError);
  });
  it("matches evaluate at q=8, baseline at q=0 and preserves lag fractions", () => {
    const line = timeline(REFERENCE_SCENARIO), result = evaluate(REFERENCE_SCENARIO);
    if (!line.valid || !result.valid) throw new Error("expected valid reference");
    expect(line.quarters).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(line.score[8]).toBeCloseTo(result.score, 10);
    expect(line.dAvg[8]).toBeCloseTo(result.cityAverageAfter, 10);
    expect(line.dMin[8]).toBeCloseTo(Math.min(...result.districts.map(d => d.scoreAfter)), 10);
    expect(line.score[0]).toBeCloseTo(52.56, 2);
    expect(line.baseScore).toBe(line.score[0]);
    expect(line.byMeasure.M7).toEqual([0, 0, 0, 0, .125, .25, .375, .5, .625]);
    const lrt = timeline(findBest(1)[0].scenario);
    if (!lrt.valid) throw new Error("expected valid optimum");
    expect(lrt.byMeasure.M3).toEqual([0, 0, 0, 0, 0, .125, .25, .375, .5]);
    const empty = timeline({ decisions: [] });
    expect(empty.valid && empty.score.every(s => s === empty.baseScore)).toBe(true);
    expect(timeline({ decisions: [{ measureId: "M3" }] }).valid).toBe(false);
  });
  it("activates synergy only after both lags and preserves negative effects", () => {
    const atOne = simulateWithShare(REFERENCE_SCENARIO, m => effectShare(m, 1));
    const atTwo = simulateWithShare(REFERENCE_SCENARIO, m => effectShare(m, 2));
    if (!atOne.valid || !atTwo.valid) throw new Error("expected valid reference");
    expect(atOne.activatedSynergies).toEqual([]);
    expect(atTwo.activatedSynergies).toEqual(["M10+M12"]);
    expect(atTwo.districts.find(d => d.id === "nura")?.indicatorDeltas.B1).toBe(3.5);
    const unequalLags = { decisions: [
      { measureId: "M5", districtId: "nura" as const }, { measureId: "M6" },
      { measureId: "M9", districtId: "nura" as const }, { measureId: "M10", districtId: "nura" as const }, { measureId: "M12" },
    ] };
    const atFour = simulateWithShare(unequalLags, m => effectShare(m, 4));
    const atFive = simulateWithShare(unequalLags, m => effectShare(m, 5));
    if (!atFour.valid || !atFive.valid) throw new Error("expected valid unequal-lag scenario");
    expect(atFour.activatedSynergies).not.toContain("M5+M6");
    expect(atFive.activatedSynergies).toContain("M5+M6");
    expect(atFour.districts.find(d => d.id === "nura")?.indicatorDeltas.E2).toBe(1.75);
    expect(atFive.districts.find(d => d.id === "nura")?.indicatorDeltas.E2).toBe(5.875);
    const negative = simulateWithShare({ decisions: [
      { measureId: "M4", districtId: "nura" }, { measureId: "M9", districtId: "nura" },
      { measureId: "M10", districtId: "nura" }, { measureId: "M11", districtId: "nura" }, { measureId: "M12" },
    ] }, m => effectShare(m, 2));
    expect(negative.valid && negative.districts.find(d => d.id === "nura")?.indicatorDeltas.T1).toBe(-.25);
  });
});
