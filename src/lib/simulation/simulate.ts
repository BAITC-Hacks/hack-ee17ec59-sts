import { DISTRICTS, INDICATOR_WEIGHTS, MEASURE_BY_ID, SIMULATION_HORIZON, SYNERGIES } from "./data";
import type {
  DistrictId,
  IndicatorId,
  IndicatorRecord,
  InvalidSimulationResult,
  ScenarioInput,
  SimulationResult,
} from "./types";
import { validateScenario } from "./validate";

const cloneIndicators = (indicators: IndicatorRecord): IndicatorRecord => ({ ...indicators });

const clip = (value: number) => Math.max(0, Math.min(100, value));

const districtScore = (indicators: IndicatorRecord) =>
  Object.entries(INDICATOR_WEIGHTS).reduce((score, [indicatorId, weight]) => {
    return score + indicators[indicatorId as IndicatorId] * weight;
  }, 0);

const weightedAverage = (scores: Record<DistrictId, number>) =>
  DISTRICTS.reduce((sum, district) => sum + district.populationShare * scores[district.id], 0);

const weakestDistrict = (scores: Record<DistrictId, number>): DistrictId =>
  DISTRICTS.reduce((weakest, district) => scores[district.id] < scores[weakest] ? district.id : weakest, DISTRICTS[0].id);

const targetsFor = (scope: "city" | "district", districtId?: DistrictId) =>
  scope === "city" ? DISTRICTS.map((district) => district.id) : districtId ? [districtId] : [];

export function simulateScenario(input: ScenarioInput): SimulationResult | InvalidSimulationResult {
  const validation = validateScenario(input);
  if (!validation.valid) return validation;

  const before = Object.fromEntries(DISTRICTS.map((district) => [district.id, cloneIndicators(district.indicators)])) as Record<DistrictId, IndicatorRecord>;
  const after = Object.fromEntries(DISTRICTS.map((district) => [district.id, cloneIndicators(district.indicators)])) as Record<DistrictId, IndicatorRecord>;
  const contributions: SimulationResult["contributions"] = [];
  const selected = new Set(input.decisions.map((decision) => decision.measureId));

  for (const decision of input.decisions) {
    const measure = MEASURE_BY_ID.get(decision.measureId)!;
    const fraction = (SIMULATION_HORIZON - measure.lag) / SIMULATION_HORIZON;
    const realizedEffects = Object.fromEntries(
      Object.entries(measure.effects).map(([indicatorId, effect]) => [indicatorId, effect * fraction]),
    ) as Partial<Record<IndicatorId, number>>;
    for (const districtId of targetsFor(measure.scope, decision.districtId)) {
      for (const [indicatorId, effect] of Object.entries(realizedEffects)) {
        const key = indicatorId as IndicatorId;
        after[districtId][key] = clip(after[districtId][key] + (effect ?? 0));
      }
    }
    contributions.push({ measureId: measure.id, districtId: measure.scope === "district" ? decision.districtId : undefined, realizedEffects });
  }

  const activatedSynergies: string[] = [];
  for (const synergy of SYNERGIES) {
    if (!synergy.measureIds.every((measureId) => selected.has(measureId))) continue;
    const target = input.decisions.find((decision) => decision.measureId === synergy.targetMeasureId);
    if (!target?.districtId) continue;
    after[target.districtId][synergy.indicatorId] = clip(after[target.districtId][synergy.indicatorId] + synergy.bonus);
    activatedSynergies.push(synergy.key);
  }

  const beforeScores = Object.fromEntries(DISTRICTS.map((district) => [district.id, districtScore(before[district.id])])) as Record<DistrictId, number>;
  const afterScores = Object.fromEntries(DISTRICTS.map((district) => [district.id, districtScore(after[district.id])])) as Record<DistrictId, number>;
  const cityAverageBefore = weightedAverage(beforeScores);
  const cityAverageAfter = weightedAverage(afterScores);
  const criticalIndicators = DISTRICTS.flatMap((district) => Object.entries(after[district.id])
    .filter(([, value]) => value < 40)
    .map(([indicatorId, value]) => ({ districtId: district.id, indicatorId: indicatorId as IndicatorId, value })));
  const scoreBefore = 0.7 * cityAverageBefore + 0.3 * Math.min(...Object.values(beforeScores)) - DISTRICTS.flatMap((district) => Object.values(before[district.id])).filter((value) => value < 40).length;
  const score = 0.7 * cityAverageAfter + 0.3 * Math.min(...Object.values(afterScores)) - criticalIndicators.length;

  return {
    valid: true,
    budget: {
      limit: 100,
      used: input.decisions.reduce((sum, decision) => sum + MEASURE_BY_ID.get(decision.measureId)!.cost, 0),
      remaining: 100 - input.decisions.reduce((sum, decision) => sum + MEASURE_BY_ID.get(decision.measureId)!.cost, 0),
    },
    baselineScore: scoreBefore,
    score,
    scoreDelta: score - scoreBefore,
    cityAverageBefore,
    cityAverageAfter,
    weakestDistrictBefore: weakestDistrict(beforeScores),
    weakestDistrictAfter: weakestDistrict(afterScores),
    districts: DISTRICTS.map((district) => ({
      id: district.id,
      name: district.name,
      scoreBefore: beforeScores[district.id],
      scoreAfter: afterScores[district.id],
      scoreDelta: afterScores[district.id] - beforeScores[district.id],
      indicatorsBefore: before[district.id],
      indicatorsAfter: after[district.id],
      indicatorDeltas: Object.fromEntries(Object.keys(after[district.id]).map((indicatorId) => [indicatorId, after[district.id][indicatorId as IndicatorId] - before[district.id][indicatorId as IndicatorId]])),
    })),
    criticalIndicators,
    activatedSynergies,
    contributions,
  };
}

export const baselineScenario = (): ScenarioInput => ({ decisions: [] });
