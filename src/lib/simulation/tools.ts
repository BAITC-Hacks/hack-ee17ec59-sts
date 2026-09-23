import { z } from "zod";
import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";
import { CONFIG, DISTRICTS, MEASURES } from "./data";
import { findBest, findWorst, pareto, scoreRank, suggestSwaps } from "./optimizer";
import { simulateScenario } from "./simulate";
import { timeline } from "./timeline";
import { validateScenario } from "./validate";
import type { SimulationResult } from "./types";

const district = z.enum(DISTRICTS.map(d => d.id));
const id = z.enum(MEASURES.map(m => m.id));
const scenario = z.strictObject({ decisions: z.array(z.strictObject({
  measureId: id, districtId: district.optional(),
})).max(MEASURES.length) });
const constraints = z.strictObject({
  budgetMax: z.number().min(0).max(CONFIG.budget).optional(),
  mustInclude: z.array(id).max(MEASURES.length).optional(),
  exclude: z.array(id).max(MEASURES.length).optional(),
  mustIncludePlaced: z.array(z.strictObject({ id, district })).max(CONFIG.n_decisions).optional(),
  avoidDistricts: z.array(district).max(DISTRICTS.length).optional(),
  minDistrictScore: z.number().min(0).max(100).optional(),
});
const scenarioArgs = z.strictObject({ scenario });
const searchArgs = z.strictObject({ topN: z.number().int().min(1).max(10).optional(), constraints: constraints.optional() });
const swapsArgs = z.strictObject({ scenario, k: z.number().int().min(1).max(10).optional() });
const paretoArgs = z.strictObject({ step: z.number().int().min(1).max(100).optional() });

function define<S extends z.ZodType>(description: string, schema: S, run: (args: z.infer<S>) => unknown) {
  return { description, schema, execute: (args: unknown) => run(schema.parse(args)) };
}
const failure = (errors: { message: string }[]) => ({ error: errors.map(e => e.message).join(" ") });
function compactEvaluation(result: SimulationResult) {
  return {
    score: result.score, baselineScore: result.baselineScore, scoreDelta: result.scoreDelta,
    cost: result.budget.used, remaining: result.budget.remaining, dAvg: result.cityAverageAfter,
    dMin: Math.min(...result.districts.map(d => d.scoreAfter)), nCrit: result.criticalIndicators.length,
    weakestDistrict: result.weakestDistrictAfter, synergies: result.activatedSynergies,
    districts: result.districts.map(d => ({ id: d.id, before: d.scoreBefore, after: d.scoreAfter, delta: d.scoreDelta,
      changes: Object.fromEntries(Object.entries(d.indicatorDeltas).filter(([, value]) => value !== 0)),
    })),
  };
}

const definitions = {
  evaluate_scenario: define("Вызови для расчёта Score, бюджета и последствий конкретного сценария. Пустой список решений даёт baseline. Не вычисляй числа самостоятельно.", scenarioArgs, ({ scenario }) => {
    const result = simulateScenario(scenario);
    return result.valid ? compactEvaluation(result) : failure(result.errors);
  }),
  validate_scenario: define("Вызови перед расчётом или применением совета, чтобы проверить 5 мер, бюджет, районы и конфликты; верни пользователю причины ошибок.", scenarioArgs, ({ scenario }) => validateScenario(scenario)),
  find_best: define("Вызови для подбора лучших валидных наборов с ограничениями бюджета, обязательных/запрещённых мер, размещений и районов. По умолчанию 5, максимум 10; [] означает, что решений нет.", searchArgs, ({ topN, constraints }) => findBest(topN ?? 5, constraints)),
  find_worst: define("Вызови, когда пользователь просит худший допустимый сценарий или сравнение с ним. Те же ограничения, что find_best; по умолчанию 1, максимум 10.", searchArgs, ({ topN, constraints }) => findWorst(topN ?? 1, constraints)),
  suggest_swaps: define("Вызови для улучшения текущих пяти решений одной заменой меры или её района. Возвращает только положительные улучшения и отставание от оптимума; по умолчанию 3 совета.", swapsArgs, ({ scenario, k }) => {
    const valid = validateScenario(scenario);
    if (!valid.valid) return failure(valid.errors);
    const advice = suggestSwaps(scenario, k ?? 3);
    return { currentScore: advice.currentScore, gapToOptimum: advice.gapToOptimum,
      swaps: advice.swaps.map(s => ({ scenario: s.scenario, score: s.score, scoreDelta: s.scoreDelta, cost: s.budget.used,
        replaced: { id: s.replacedMeasureId, district: s.replacedDistrictId }, added: { id: s.addedMeasureId, district: s.addedDistrictId } })),
    };
  }),
  pareto: define("Вызови для сравнения лучшего Score при разных бюджетах от 40 до 100. Шаг по умолчанию 5. Возвращает только budget/score/cost; недостижимые бюджеты пропущены.", paretoArgs, ({ step }) => pareto(step ?? 5).map(p => ({ budget: p.budget, score: p.score, cost: p.cost }))),
  timeline: define("Вызови для объяснения задержек эффекта. score[q] — Score в квартале q=0…8; byMeasure[id][q] — доля эффекта меры. Возвращает только эти два поля.", scenarioArgs, ({ scenario }) => {
    const line = timeline(scenario);
    return line.valid ? { score: line.score, byMeasure: line.byMeasure } : failure(line.errors);
  }),
  score_rank: define("Вызови для места сценария среди всех валидных наборов: rank 1 — лучший, total — худший; percentile — процент строго худших наборов.", scenarioArgs, ({ scenario }) => scoreRank(scenario)),
};

// Chat Completions format used by the existing OpenAI-compatible API route.
// Optional arguments require non-strict mode; local Zod validation is mandatory.
export const engineTools: ChatCompletionFunctionTool[] = Object.entries(definitions).map(([name, definition]) => ({
  type: "function", function: {
    name, description: definition.description, parameters: z.toJSONSchema(definition.schema, { target: "draft-7" }), strict: false,
  },
}));

function rounded(value: unknown): unknown {
  if (typeof value === "number") return Number(value.toFixed(2));
  if (Array.isArray(value)) return value.map(rounded);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).map(([key, item]) => [key, rounded(item)]));
  return value;
}

/** Accept parsed arguments or the JSON string from tool_call.function.arguments. */
export function executeTool(name: string, args: unknown): unknown {
  if (!Object.hasOwn(definitions, name)) return { error: "Неизвестный инструмент движка." };
  try {
    const parsed: unknown = typeof args === "string" ? JSON.parse(args) : args;
    return rounded(definitions[name as keyof typeof definitions].execute(parsed));
  } catch (error) {
    if (error instanceof SyntaxError) return { error: "Аргументы инструмента должны быть корректным JSON." };
    if (error instanceof z.ZodError) {
      const field = error.issues[0]?.path.join(".") || "параметры";
      return { error: `Неверные аргументы: ${field}. Проверьте обязательные поля, типы и допустимые значения в схеме инструмента.` };
    }
    return { error: "Не удалось выполнить инструмент. Проверьте сценарий и параметры; вызов разрешён только на сервере." };
  }
}
