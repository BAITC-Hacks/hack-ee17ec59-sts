import { z } from "zod";
import { CONFIG, DISTRICTS } from "./data";
import { simulateScenario } from "./simulate";
import type { ScenarioInput, SimulationResult } from "./types";
import { validateScenario } from "./validate";

export type AdviceProposal = {
  baseScenario: ScenarioInput;
  scenario: ScenarioInput;
};

export type AdviceComparison = AdviceProposal & {
  before: SimulationResult;
  after: SimulationResult;
  changedIndex: number;
};

export type AdviceComparisonResult =
  | { valid: true; comparison: AdviceComparison }
  | { valid: false; message: string };

const scenarioSchema = z.object({
  decisions: z.array(z.object({
    measureId: z.string().min(1),
    districtId: z.enum(DISTRICTS.map(district => district.id)).optional(),
  })).length(CONFIG.n_decisions),
});

const proposalSchema = z.object({
  baseScenario: scenarioSchema,
  scenario: scenarioSchema,
});

/** Includes slot order and placement so a response cannot replace newer edits. */
export function scenarioKey(scenario: ScenarioInput): string {
  return JSON.stringify(scenario.decisions.map(decision => [
    decision.measureId,
    decision.districtId ?? null,
  ]));
}

/** Rechecks an untrusted proposal at both preview and apply time. */
export function compareAdvice(current: unknown, proposal: unknown): AdviceComparisonResult {
  const parsedCurrent = scenarioSchema.safeParse(current);
  const parsedProposal = proposalSchema.safeParse(proposal);
  if (!parsedCurrent.success || !parsedProposal.success) {
    return { valid: false, message: `Совет должен содержать исходный и новый сценарий из ${CONFIG.n_decisions} корректных решений.` };
  }

  const currentScenario = parsedCurrent.data;
  const { baseScenario, scenario } = parsedProposal.data;
  if (scenarioKey(currentScenario) !== scenarioKey(baseScenario)) {
    return { valid: false, message: "Сценарий изменился после получения совета. Запросите новый совет." };
  }

  for (const input of [currentScenario, scenario]) {
    const validation = validateScenario(input);
    if (!validation.valid) return { valid: false, message: validation.errors[0].message };
  }

  const changedIndices = currentScenario.decisions.flatMap((decision, index) => {
    const replacement = scenario.decisions[index];
    return decision.measureId !== replacement.measureId || decision.districtId !== replacement.districtId
      ? [index]
      : [];
  });
  if (changedIndices.length !== 1) {
    return { valid: false, message: "Совет должен менять ровно одно решение." };
  }

  // Numerical fields from an API or an LLM are deliberately ignored.
  const before = simulateScenario(currentScenario);
  const after = simulateScenario(scenario);
  if (!before.valid) return { valid: false, message: before.errors[0].message };
  if (!after.valid) return { valid: false, message: after.errors[0].message };
  if (after.budget.used > before.budget.used) {
    return { valid: false, message: "Совет увеличивает расходы. Нужна замена в пределах текущих затрат." };
  }
  if (Number(after.score.toFixed(2)) <= Number(before.score.toFixed(2))) {
    return { valid: false, message: "Эта замена не улучшает отображаемый Score." };
  }

  return {
    valid: true,
    comparison: { baseScenario, scenario, before, after, changedIndex: changedIndices[0] },
  };
}
