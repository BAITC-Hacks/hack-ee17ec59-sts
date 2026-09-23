import { CONFIG, DISTRICTS, MEASURE_BY_ID, SYNERGIES } from "./data";
import { INDICATOR_IDS, type IndicatorRecord, type Measure, type ScenarioInput, type SimulationResult } from "./types";

export const WIDTH = INDICATOR_IDS.length;
export const SIZE = DISTRICTS.length * WIDTH;
export const BASE = new Float64Array(DISTRICTS.flatMap(d => INDICATOR_IDS.map(id => d.indicators[id])));
const weights = new Float64Array(INDICATOR_IDS.map(id => CONFIG.weights[id]));
export const createScoreState = () => ({
  score: 0, dAvg: 0, dMin: 0, minDistrict: 0, nCrit: 0, districts: new Float64Array(DISTRICTS.length),
});
export type ScoreState = ReturnType<typeof createScoreState>;

// Caller owns the buffers; no allocations or object enumeration in the hot loop.
export function scoreIndicators(values: Float64Array, out: ScoreState): void {
  out.dAvg = 0; out.dMin = Infinity; out.minDistrict = 0; out.nCrit = 0;
  for (let d = 0; d < DISTRICTS.length; d++) {
    let score = 0;
    for (let k = 0; k < WIDTH; k++) {
      const value = Math.max(0, Math.min(100, values[d * WIDTH + k]));
      score += value * weights[k];
      if (value < CONFIG.crit_threshold) out.nCrit++;
    }
    out.districts[d] = score;
    out.dAvg += DISTRICTS[d].populationShare * score;
    if (score < out.dMin) { out.dMin = score; out.minDistrict = d; }
  }
  out.score = CONFIG.w_avg * out.dAvg + CONFIG.w_min * out.dMin - CONFIG.crit_penalty * out.nCrit;
}
export function addIndicatorEffects(target: Float64Array, effects: Partial<IndicatorRecord>, district: number, share = 1): void {
  for (let k = 0; k < WIDTH; k++) target[district * WIDTH + k] += (effects[INDICATOR_IDS[k]] ?? 0) * share;
}
export function addMeasureEffects(target: Float64Array, measure: Measure, district: number, share: number): void {
  if (measure.scope === "city") {
    for (let d = 0; d < DISTRICTS.length; d++) addIndicatorEffects(target, measure.effects, d, share);
  } else addIndicatorEffects(target, measure.effects, district, share);
}

export type ShareFn = (measure: Measure) => number;
export const effectShare = (measure: Measure, quarter = CONFIG.horizon) => Math.max(0, quarter - measure.lag) / CONFIG.horizon;

// One effect pipeline for evaluate and timeline. Called only after validation.
export function applyScenarioEffects(input: ScenarioInput, shareFn: ShareFn) {
  const values = BASE.slice();
  const contributions: SimulationResult["contributions"] = [];
  const selected = new Map(input.decisions.map(d => [d.measureId, d]));
  for (const decision of input.decisions) {
    const measure = MEASURE_BY_ID.get(decision.measureId)!;
    const share = shareFn(measure);
    addMeasureEffects(values, measure, DISTRICTS.findIndex(d => d.id === decision.districtId), share);
    contributions.push({
      measureId: measure.id, districtId: decision.districtId,
      realizedEffects: Object.fromEntries(Object.entries(measure.effects).map(([id, effect]) => [id, effect * share])),
    });
  }
  const activatedSynergies: string[] = [];
  for (const synergy of SYNERGIES) {
    // share > 0 iff q > L, therefore both legs must be active.
    if (!synergy.measureIds.every(id => selected.has(id) && shareFn(MEASURE_BY_ID.get(id)!) > 0)) continue;
    const district = DISTRICTS.findIndex(d => d.id === selected.get(synergy.targetMeasureId)?.districtId);
    if (district < 0) continue;
    addIndicatorEffects(values, synergy.effects, district);
    activatedSynergies.push(synergy.key);
  }
  return { values, contributions, activatedSynergies };
}
