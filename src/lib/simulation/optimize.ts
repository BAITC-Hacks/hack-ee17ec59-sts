import { DISTRICTS, MEASURES, MEASURE_BY_ID } from "./data";
import { simulateScenario } from "./simulate";
import type { Decision, ScenarioInput, SimulationResult } from "./types";

export type ScenarioSwap = {
  scenario: ScenarioInput;
  replacedMeasureId: string;
  addedMeasureId: string;
  addedDistrictId?: Decision["districtId"];
  score: number;
  scoreDelta: number;
  budget: SimulationResult["budget"];
};

const candidateDecisions = (measureId: string): Decision[] => {
  const measure = MEASURE_BY_ID.get(measureId);
  if (!measure) return [];
  if (measure.scope === "city") return [{ measureId }];
  return DISTRICTS.map((district) => ({ measureId, districtId: district.id }));
};

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

const scenarioKey = (scenario: ScenarioInput) =>
  scenario.decisions.map((decision) => `${decision.measureId}:${decision.districtId ?? "-"}`).join("|");

/**
 * Evaluate one-measure replacements around a valid scenario.
 *
 * The engine remains the only source of numeric results: every candidate is
 * validated and simulated through simulateScenario. This keeps the helper
 * deterministic and cheap enough for an interactive "what could we swap?"
 * panel while avoiding a full catalogue-wide search in the browser.
 */
export function suggestSwaps(input: ScenarioInput, limit = 3): ScenarioSwap[] {
  const baseline = simulateScenario(input);
  const requestedLimit = Math.max(0, Math.floor(limit));
  if (!baseline.valid || requestedLimit === 0) return [];

  const selectedIds = new Set(input.decisions.map((decision) => decision.measureId));
  const suggestions: ScenarioSwap[] = [];

  input.decisions.forEach((decision, index) => {
    for (const measure of MEASURES) {
      if (selectedIds.has(measure.id)) continue;

      for (const replacement of candidateDecisions(measure.id)) {
        const decisions = input.decisions.map((current, decisionIndex) =>
          decisionIndex === index ? replacement : { ...current },
        );
        const result = simulateScenario({ decisions });
        if (!result.valid) continue;

        suggestions.push({
          scenario: { decisions },
          replacedMeasureId: decision.measureId,
          addedMeasureId: measure.id,
          addedDistrictId: replacement.districtId,
          score: result.score,
          scoreDelta: result.score - baseline.score,
          budget: result.budget,
        });
      }
    }
  });

  return suggestions
    .sort((left, right) =>
      right.score - left.score
      || right.scoreDelta - left.scoreDelta
      || left.budget.used - right.budget.used
      || compareText(left.addedMeasureId, right.addedMeasureId)
      || compareText(left.addedDistrictId ?? "", right.addedDistrictId ?? "")
      || compareText(scenarioKey(left.scenario), scenarioKey(right.scenario)),
    )
    .slice(0, requestedLimit);
}
