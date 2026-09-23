import OpenAI from "openai";
import { z } from "zod";
import {
  CONFIG,
  DISTRICTS,
  MEASURES,
  MEASURE_BY_ID,
  suggestSwaps,
  validateScenario,
  type Decision,
} from "@/lib/simulation";
import { compareAdvice, type AdviceProposal } from "@/lib/simulation/advice";

export const runtime = "nodejs";

const requestSchema = z.object({
  scenario: z.object({
    decisions: z.array(z.object({
      measureId: z.string().min(1).max(80),
      districtId: z.enum(DISTRICTS.map(district => district.id)).optional(),
    }).strict()).length(CONFIG.n_decisions),
  }).strict(),
}).strict();

// Numbers are rendered from the engine separately, never from generated prose.
const explanationSchema = z.object({
  explanation: z.string().trim().min(1).max(1200).refine(text => !/[0-9\u0660-\u0669\u06f0-\u06f9\uff10-\uff19]/.test(text)),
}).strict();
type Comparison = Extract<ReturnType<typeof compareAdvice>, { valid: true }>["comparison"];

function describeDecision(decision: Decision) {
  const measure = MEASURE_BY_ID.get(decision.measureId)!;
  const placement = decision.districtId
    ? DISTRICTS.find(district => district.id === decision.districtId)!.name
    : "весь город";
  return `${measure.name} (${placement})`;
}

function fallbackExplanation(comparison: Comparison) {
  const previous = comparison.baseScenario.decisions[comparison.changedIndex];
  const proposed = comparison.scenario.decisions[comparison.changedIndex];
  const reducedDistricts = comparison.after.districts.filter(district => {
    const before = comparison.before.districts.find(item => item.id === district.id)!;
    return district.scoreAfter < before.scoreAfter - 1e-10;
  });
  const reducedIndicators = comparison.after.districts.flatMap(district => {
    const before = comparison.before.districts.find(item => item.id === district.id)!;
    return Object.entries(district.indicatorsAfter).flatMap(([id, value]) => {
      const indicator = id as keyof typeof district.indicatorsAfter;
      return value < before.indicatorsAfter[indicator] - 1e-10
        ? [`${CONFIG.indicator_names[indicator]} (${district.name})`]
        : [];
    });
  });
  const tradeoff = reducedDistricts.length
    ? `По сравнению с вашим планом районный балл станет ниже: ${reducedDistricts.map(district => district.name).join(", ")}.`
    : reducedIndicators.length
      ? `Районные баллы не снизятся, но отдельные показатели станут ниже, в том числе: ${reducedIndicators.slice(0, 3).join(", ")}.`
      : "Районные баллы и показатели не снизятся по сравнению с вашим планом.";
  return `Замените «${describeDecision(previous)}» на «${describeDecision(proposed)}». Расчёт подтверждает рост итогового Score без увеличения расходов. ${tradeoff}`;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Не удалось прочитать сценарий. Отправьте корректный JSON." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: `Нужен сценарий из ${CONFIG.n_decisions} решений с корректными мерами и районами.` }, { status: 400 });
  }
  const scenario = parsed.data.scenario;
  const validation = validateScenario(scenario);
  if (!validation.valid) {
    return Response.json({ error: validation.errors.map(error => error.message).join(" ") }, { status: 400 });
  }

  // Examine every single replacement before applying the no-extra-spending filter.
  const candidateLimit = CONFIG.n_decisions * MEASURES.length * (DISTRICTS.length + 1);
  const candidates = suggestSwaps(scenario, candidateLimit).swaps;
  let comparison: Comparison | undefined;
  for (const candidate of candidates) {
    const checked = compareAdvice(scenario, { baseScenario: scenario, scenario: candidate.scenario });
    if (checked.valid) {
      comparison = checked.comparison;
      break;
    }
  }
  if (!comparison) {
    return Response.json({
      proposal: null,
      explanation: "Среди проверенных одиночных замен нет улучшения отображаемого Score без увеличения расходов. Текущий план сохранён.",
      source: "fallback",
    });
  }

  const proposal: AdviceProposal = { baseScenario: comparison.baseScenario, scenario: comparison.scenario };
  const fallback = { proposal, explanation: fallbackExplanation(comparison), source: "fallback" as const };
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json(fallback);

  try {
    const client = new OpenAI({
      apiKey,
      ...(process.env.LLM_BASE_URL ? { baseURL: process.env.LLM_BASE_URL } : {}),
      timeout: 8000,
      maxRetries: 0,
    });
    const completion = await client.chat.completions.create({
      model: process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      max_completion_tokens: 450,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "verified_advice_explanation",
          strict: true,
          schema: {
            type: "object",
            properties: { explanation: { type: "string" } },
            required: ["explanation"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content: "Ты помощник акима. Кратко, по-русски объясни уже проверенную замену меры. Используй только предоставленные расчёты и названия. Не предлагай других мер, не меняй сценарий, не считай Score, не придумывай последствия и причины. Укажи компромисс, если районный балл или отдельный показатель снизится по сравнению с текущим планом. Числа показаны рядом в интерфейсе: не используй цифры, проценты, числовые значения и ID мер в объяснении. Не называй вариант глобальным оптимумом: проверены только одиночные замены без увеличения расходов. Верни JSON с единственным полем explanation.",
        },
        {
          role: "user",
          content: JSON.stringify({
            replaced: describeDecision(comparison.baseScenario.decisions[comparison.changedIndex]),
            proposed: describeDecision(comparison.scenario.decisions[comparison.changedIndex]),
            before: comparison.before,
            after: comparison.after,
          }),
        },
      ],
    });
    const explanation = explanationSchema.parse(JSON.parse(completion.choices[0]?.message.content || "{}"));
    return Response.json({ proposal, explanation: explanation.explanation, source: "openai" });
  } catch {
    // A failed explanation must never discard the already verified action.
    return Response.json(fallback);
  }
}
