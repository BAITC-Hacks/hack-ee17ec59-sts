import OpenAI from "openai";
import { z } from "zod";
import {
  buildAnalysisContext,
  buildFallbackAnalysis,
  type AnalysisResponse,
} from "@/lib/analysis";
import type { SimulationResult } from "@/lib/simulation";

export const runtime = "nodejs";

const narrativeSchema = z.object({
  strengths: z.array(z.string().trim().min(1).max(240)).min(1).max(3),
  tradeoffs: z.array(z.string().trim().min(1).max(240)).min(1).max(3),
  risks: z.array(z.string().trim().min(1).max(240)).min(1).max(3),
  recommendation: z.string().trim().min(1).max(500),
}).strict();

const narrativeJsonSchema = {
  type: "object",
  properties: {
    strengths: { type: "array", items: { type: "string" } },
    tradeoffs: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    recommendation: { type: "string" },
  },
  required: ["strengths", "tradeoffs", "risks", "recommendation"],
  additionalProperties: false,
};

const internalTerms = [
  "weakestDistrict",
  "criticalIndicators",
  "realizedEffects",
  "indicatorDeltas",
  "districtId",
  "indicatorId",
  "scoreAfter",
  "nura",
  "yesil",
  "saryarka",
  "baikonur",
  "almaty",
];

function cleanNarrativeText(value: string): string {
  let text = value.trim().replace(/\r?\n/g, " ").replace(/[ \t]+/g, " ");
  while (["•", "‣", "▪", "◦", "-", "*"].some((prefix) => text.startsWith(prefix))) {
    text = text.slice(1).trimStart();
  }
  return text;
}

function isReaderFriendly(value: string): boolean {
  const lowerCase = value.toLowerCase();
  return !/[0-9]/.test(value)
    && !/[a-z][A-Za-z]*[A-Z][A-Za-z]*/.test(value)
    && !internalTerms.some((term) => lowerCase.includes(term.toLowerCase()));
}

function parseNarrative(content: string | null | undefined) {
  if (!content) return null;
  try {
    const parsed = narrativeSchema.safeParse(JSON.parse(content));
    if (!parsed.success) return null;
    const narrative = {
      strengths: parsed.data.strengths.map(cleanNarrativeText),
      tradeoffs: parsed.data.tradeoffs.map(cleanNarrativeText),
      risks: parsed.data.risks.map(cleanNarrativeText),
      recommendation: cleanNarrativeText(parsed.data.recommendation),
    };
    const allText = [
      ...narrative.strengths,
      ...narrative.tradeoffs,
      ...narrative.risks,
      narrative.recommendation,
    ];
    return allText.every((item) => item.length > 0 && isReaderFriendly(item)) ? narrative : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid simulation result" }, { status: 400 });
  }

  const result = (body as { result?: SimulationResult } | null)?.result;
  if (!result?.valid) return Response.json({ error: "Invalid simulation result" }, { status: 400 });

  const fallback = buildFallbackAnalysis(result);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json(fallback);

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "mayor_brief_narrative",
          strict: true,
          schema: narrativeJsonSchema,
        },
      },
      messages: [
        {
          role: "system",
          content: [
            "Ты редактор короткой записки акиму. Пиши только по-русски, ясно и без канцелярита.",
            "Возвращай только JSON заданной структуры. Пункты массивов — обычные предложения без маркеров списка.",
            "Числа, Score, бюджет и точное описание слабейшего района уже рассчитаны приложением. Не пиши цифры и числовые значения: их нельзя пересчитывать или заменять.",
            "Не выводи названия полей, JSON, API, переменные, технические термины, коды районов, показателей или инициатив.",
            "Используй только названия районов, показателей и инициатив из контекста. Не утверждай эффекты, которых нет в расчёте.",
            "В рекомендации укажи следующий аналитический фокус по оставшимся проблемам; не придумывай новую инициативу.",
            "Верни strengths, tradeoffs, risks и recommendation. Executive summary и weakest district insight сформирует приложение.",
          ].join(" "),
        },
        { role: "user", content: buildAnalysisContext(result) },
      ],
    });

    const narrative = parseNarrative(completion.choices[0]?.message.content);
    if (!narrative) return Response.json(fallback);

    return Response.json({
      ...fallback,
      strengths: [fallback.strengths[0], ...narrative.strengths].slice(0, 3),
      tradeoffs: narrative.tradeoffs,
      risks: [fallback.risks[0], ...narrative.risks].slice(0, 3),
      recommendation: narrative.recommendation,
      source: "openai",
    } satisfies AnalysisResponse);
  } catch {
    return Response.json(fallback);
  }
}
