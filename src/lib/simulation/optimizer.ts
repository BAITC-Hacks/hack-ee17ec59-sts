import { BUDGET_LIMIT, CONFIG, DISTRICTS, GLOBAL_INCOMPATIBILITIES, LOCAL_INCOMPATIBILITIES, MEASURES, SYNERGIES } from "./data";
import { BASE, SIZE, WIDTH, addIndicatorEffects, addMeasureEffects, createScoreState, scoreIndicators } from "./numeric";
import { simulateScenario } from "./simulate";
import { validateScenario } from "./validate";
import type { Decision, DistrictId, ScenarioInput, SimulationResult } from "./types";

export type OptimizedScenario = {
  scenario: ScenarioInput; score: number; cost: number; dMin: number; minDistrict: DistrictId; nCrit: number;
};
export type ScenarioSwap = {
  scenario: ScenarioInput; replacedMeasureId: string; replacedDistrictId?: DistrictId;
  addedMeasureId: string; addedDistrictId?: DistrictId; score: number; scoreDelta: number;
  budget: SimulationResult["budget"];
};
export type SwapAdvice = { swaps: ScenarioSwap[]; gapToOptimum: number | null; currentScore: number | null };
let memo: OptimizedScenario[] | undefined;
let ranked: OptimizedScenario[] | undefined;
let elapsedMs = 0;
function serverOnly() {
  if (typeof window !== "undefined") throw new Error("Оптимизатор вызывается только на сервере через API");
}

// Lazy module memoization: no enumeration during imports or client rendering.
export function enumerateValid(): OptimizedScenario[] {
  serverOnly();
  if (memo) return memo;
  const start = performance.now();
  const count = CONFIG.n_decisions, districtCount = DISTRICTS.length;
  const variantBase = districtCount + 1, radix = MEASURES.length * variantBase;
  const categories = Object.keys(CONFIG.directions);
  const categoryIds = MEASURES.map(m => categories.indexOf(m.category));
  const categoryCounts = new Int8Array(categories.length);
  const selected = new Int8Array(count), placed = new Int8Array(count);
  const frames = Array.from({ length: count + 1 }, () => new Float64Array(SIZE));
  frames[0].set(BASE);
  const globalMasks = new Int32Array(MEASURES.length), localMasks = new Int32Array(MEASURES.length);
  const indexOf = (id: string) => MEASURES.findIndex(m => m.id === id);
  for (const [pairs, masks] of [[GLOBAL_INCOMPATIBILITIES, globalMasks], [LOCAL_INCOMPATIBILITIES, localMasks]] as const) {
    for (const [a, b] of pairs) { const i = indexOf(a), j = indexOf(b); masks[i] |= 1 << j; masks[j] |= 1 << i; }
  }
  // Precompute measure × placement × indicator once, including the lag.
  const variants: Float64Array[] = [], decisions: Decision[] = [];
  for (let m = 0; m < MEASURES.length; m++) {
    for (let d = -1; d < districtCount; d++) {
      const code = m * variantBase + d + 1;
      variants[code] = new Float64Array(SIZE);
      if (d < 0 && MEASURES[m].scope === "district") continue;
      addMeasureEffects(variants[code], MEASURES[m], d, (CONFIG.horizon - MEASURES[m].lag) / CONFIG.horizon);
      decisions[code] = Object.freeze(d < 0 ? { measureId: MEASURES[m].id } : { measureId: MEASURES[m].id, districtId: DISTRICTS[d].id });
    }
  }
  const synergyRules = SYNERGIES.map(s => ({
    mask: s.measureIds.reduce((mask, id) => mask | (1 << indexOf(id)), 0), target: indexOf(s.targetMeasureId), effects: s.effects,
  }));
  const bonuses = MEASURES.map(() => new Float64Array(WIDTH));
  const score = createScoreState();
  // Store scalars during search; allocate public result objects only afterwards.
  const codes: number[] = [], scores: number[] = [], costs: number[] = [], mins: number[] = [], weakest: number[] = [], critical: number[] = [];
  function placements(depth: number, cost: number, encoded: number) {
    if (depth === count) {
      scoreIndicators(frames[depth], score);
      codes.push(encoded); scores.push(score.score); costs.push(cost); mins.push(score.dMin); weakest.push(score.minDistrict); critical.push(score.nCrit);
      return;
    }
    const m = selected[depth], first = MEASURES[m].scope === "city" ? -1 : 0;
    const end = first === -1 ? 0 : districtCount;
    for (let d = first; d < end; d++) {
      let conflict = false;
      for (let p = 0; p < depth; p++) {
        if (d >= 0 && placed[p] === d && (localMasks[m] & (1 << selected[p]))) { conflict = true; break; }
      }
      if (conflict) continue;
      placed[depth] = d;
      const code = m * variantBase + d + 1;
      const target = frames[depth + 1], source = frames[depth], delta = variants[code];
      for (let k = 0; k < SIZE; k++) target[k] = source[k] + delta[k];
      if (d >= 0) for (let k = 0; k < WIDTH; k++) target[d * WIDTH + k] += bonuses[m][k];
      placements(depth + 1, cost, encoded * radix + code);
    }
  }
  function combinations(from: number, depth: number, cost: number, mask: number) {
    if (depth === count) {
      for (const bonus of bonuses) bonus.fill(0);
      for (const s of synergyRules) if ((mask & s.mask) === s.mask) addIndicatorEffects(bonuses[s.target], s.effects, 0);
      placements(0, cost, 0);
      return;
    }
    for (let m = from; m <= MEASURES.length - (count - depth); m++) {
      const nextCost = cost + MEASURES[m].cost, category = categoryIds[m];
      // Measure-only constraints are pruned before district assignment.
      if (nextCost > BUDGET_LIMIT || categoryCounts[category] >= CONFIG.max_per_direction || (mask & globalMasks[m])) continue;
      selected[depth] = m; categoryCounts[category]++;
      combinations(m + 1, depth + 1, nextCost, mask | (1 << m));
      categoryCounts[category]--;
    }
  }
  combinations(0, 0, 0, 0);
  memo = codes.map((encoded, i) => {
    const picked = new Array<Decision>(count);
    for (let p = count - 1; p >= 0; p--) { picked[p] = decisions[encoded % radix]; encoded = Math.floor(encoded / radix); }
    Object.freeze(picked);
    return Object.freeze({ scenario: Object.freeze({ decisions: picked }), score: scores[i], cost: costs[i], dMin: mins[i], minDistrict: DISTRICTS[weakest[i]].id, nCrit: critical[i] });
  });
  Object.freeze(memo);
  elapsedMs = performance.now() - start;
  return memo;
}
export function optimizerStats() { enumerateValid(); return { count: memo!.length, elapsedMs }; }
export function findBest(topN = 10): OptimizedScenario[] {
  serverOnly();
  if (!Number.isFinite(topN) || topN <= 0) return [];
  ranked ??= [...enumerateValid()].sort((a, b) => b.score - a.score || a.cost - b.cost);
  return ranked.slice(0, Math.floor(topN));
}
export function suggestSwaps(input: ScenarioInput, k = 3): SwapAdvice {
  serverOnly();
  if (!validateScenario(input).valid) return { swaps: [], gapToOptimum: null, currentScore: null };
  const baseline = simulateScenario(input);
  if (!baseline.valid) return { swaps: [], gapToOptimum: null, currentScore: null };
  const gapToOptimum = Math.max(0, findBest(1)[0].score - baseline.score);
  if (!Number.isFinite(k) || k <= 0) return { swaps: [], gapToOptimum, currentScore: baseline.score };
  const suggestions: ScenarioSwap[] = [];
  input.decisions.forEach((old, index) => {
    for (const measure of MEASURES) {
      if (input.decisions.some((d, i) => i !== index && d.measureId === measure.id)) continue;
      for (const districtId of measure.scope === "city" ? [undefined] : DISTRICTS.map(d => d.id)) {
        if (old.measureId === measure.id && old.districtId === districtId) continue;
        const replacement: Decision = districtId ? { measureId: measure.id, districtId } : { measureId: measure.id };
        const scenario = { decisions: input.decisions.map((d, i) => i === index ? replacement : { ...d }) };
        const result = simulateScenario(scenario);
        if (!result.valid || result.score <= baseline.score + 1e-10) continue;
        suggestions.push({ scenario, replacedMeasureId: old.measureId, replacedDistrictId: old.districtId,
          addedMeasureId: measure.id, addedDistrictId: districtId, score: result.score,
          scoreDelta: result.score - baseline.score, budget: result.budget });
      }
    }
  });
  suggestions.sort((a, b) => b.scoreDelta - a.scoreDelta || a.budget.used - b.budget.used);
  return { swaps: suggestions.slice(0, Math.floor(k)), gapToOptimum, currentScore: baseline.score };
}
