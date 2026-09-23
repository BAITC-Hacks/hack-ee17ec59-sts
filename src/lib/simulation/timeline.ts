import { CONFIG, MEASURE_BY_ID } from "./data";
import { effectShare } from "./numeric";
import { simulateWithShare } from "./simulate";
import type { InvalidSimulationResult, ScenarioInput } from "./types";

export type TimelineResult = {
  valid: true; quarters: number[]; score: number[]; dAvg: number[]; dMin: number[];
  byMeasure: Record<string, number[]>; baseScore: number;
};

export function timeline(input: ScenarioInput): TimelineResult | InvalidSimulationResult {
  const quarters = Array.from({ length: CONFIG.horizon + 1 }, (_, q) => q);
  const score: number[] = [], dAvg: number[] = [], dMin: number[] = [];
  for (const q of quarters) {
    const result = simulateWithShare(input, measure => effectShare(measure, q));
    if (!result.valid) return result;
    score.push(result.score); dAvg.push(result.cityAverageAfter);
    dMin.push(Math.min(...result.districts.map(d => d.scoreAfter)));
  }
  return {
    valid: true, quarters, score, dAvg, dMin, baseScore: score[0],
    byMeasure: Object.fromEntries(input.decisions.map(d => [d.measureId, quarters.map(q => effectShare(MEASURE_BY_ID.get(d.measureId)!, q))])),
  };
}
