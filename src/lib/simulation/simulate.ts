import { BUDGET_LIMIT, CONFIG, DISTRICTS, MEASURE_BY_ID } from "./data";
import { BASE, WIDTH, applyScenarioEffects, createScoreState, effectShare, scoreIndicators, type ShareFn } from "./numeric";
import { INDICATOR_IDS, type BaselineSnapshot, type IndicatorRecord, type InvalidSimulationResult, type ScenarioInput, type SimulationResult } from "./types";
import { validateScenario } from "./validate";

const indicatorsAt = (values: Float64Array, district: number): IndicatorRecord => Object.fromEntries(
  INDICATOR_IDS.map((id, k) => [id, Math.max(0, Math.min(100, values[district * WIDTH + k]))]),
) as IndicatorRecord;

function snapshot(values: Float64Array) {
  const state = createScoreState();
  scoreIndicators(values, state);
  const criticalIndicators: BaselineSnapshot["criticalIndicators"] = [];
  for (let d = 0; d < DISTRICTS.length; d++) {
    for (let k = 0; k < WIDTH; k++) {
      const value = Math.max(0, Math.min(100, values[d * WIDTH + k]));
      if (value < CONFIG.crit_threshold) criticalIndicators.push({ districtId: DISTRICTS[d].id, indicatorId: INDICATOR_IDS[k], value });
    }
  }
  return { ...state, criticalIndicators };
}

export function getBaselineSnapshot(): BaselineSnapshot {
  const base = snapshot(BASE);
  return { score: base.score, cityAverage: base.dAvg, weakestDistrict: DISTRICTS[base.minDistrict].id, criticalIndicators: base.criticalIndicators };
}

export function simulateWithShare(input: ScenarioInput, shareFn: ShareFn): SimulationResult | InvalidSimulationResult {
  const validation = input.decisions.length === 0 ? { valid: true as const } : validateScenario(input);
  if (!validation.valid) return validation;
  const applied = applyScenarioEffects(input, shareFn);
  const before = snapshot(BASE), after = snapshot(applied.values);
  const cost = input.decisions.reduce((sum, decision) => sum + MEASURE_BY_ID.get(decision.measureId)!.cost, 0);
  return {
    valid: true,
    budget: { limit: BUDGET_LIMIT, used: cost, remaining: BUDGET_LIMIT - cost },
    baselineScore: before.score, score: after.score, scoreDelta: after.score - before.score,
    cityAverageBefore: before.dAvg, cityAverageAfter: after.dAvg,
    weakestDistrictBefore: DISTRICTS[before.minDistrict].id, weakestDistrictAfter: DISTRICTS[after.minDistrict].id,
    districts: DISTRICTS.map((district, d) => {
      const indicatorsBefore = indicatorsAt(BASE, d), indicatorsAfter = indicatorsAt(applied.values, d);
      return {
        id: district.id, name: district.name,
        scoreBefore: before.districts[d], scoreAfter: after.districts[d], scoreDelta: after.districts[d] - before.districts[d],
        indicatorsBefore, indicatorsAfter,
        indicatorDeltas: Object.fromEntries(INDICATOR_IDS.map(id => [id, indicatorsAfter[id] - indicatorsBefore[id]])),
      };
    }),
    criticalIndicators: after.criticalIndicators, activatedSynergies: applied.activatedSynergies, contributions: applied.contributions,
  };
}

export function simulateScenario(input: ScenarioInput): SimulationResult | InvalidSimulationResult {
  return simulateWithShare(input, measure => effectShare(measure));
}
export const evaluate = simulateScenario;
export const baselineScenario = (): ScenarioInput => ({ decisions: [] });
