import OpenAI from "openai";
import { buildFallbackAnalysis, type AnalysisResponse } from "@/lib/analysis";
import type { SimulationResult } from "@/lib/simulation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { result?: SimulationResult };
    if (!body.result?.valid) return Response.json({ error: "Invalid simulation result" }, { status: 400 });

    const fallback = buildFallbackAnalysis(body.result);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return Response.json(fallback);

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Ты городской policy analyst. Используй только JSON результата. Не пересчитывай и не изменяй Score, не придумывай числа или эффекты. Верни JSON с полями executiveSummary, strengths, tradeoffs, risks, weakestDistrictInsight, recommendation.",
        },
        { role: "user", content: JSON.stringify(body.result) },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message.content || "{}") as Partial<Omit<AnalysisResponse, "source">>;
    const stringArray = (value: unknown, fallbackValue: string[]) =>
      Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallbackValue;
    return Response.json({
      executiveSummary: typeof parsed.executiveSummary === "string" ? parsed.executiveSummary : fallback.executiveSummary,
      strengths: stringArray(parsed.strengths, fallback.strengths),
      tradeoffs: stringArray(parsed.tradeoffs, fallback.tradeoffs),
      risks: stringArray(parsed.risks, fallback.risks),
      weakestDistrictInsight: typeof parsed.weakestDistrictInsight === "string" ? parsed.weakestDistrictInsight : fallback.weakestDistrictInsight,
      recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation : fallback.recommendation,
      source: "openai",
    } satisfies AnalysisResponse);
  } catch {
    return Response.json({ error: "AI analysis unavailable" }, { status: 503 });
  }
}
