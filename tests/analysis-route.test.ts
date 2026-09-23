import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/analyze/route";
import { buildAnalysisContext, buildFallbackAnalysis } from "../src/lib/analysis";
import { simulateScenario } from "../src/lib/simulation";

const { createCompletion, clientOptions } = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  clientOptions: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createCompletion } };
    constructor(options: unknown) { clientOptions(options); }
  },
}));

const worstScenario = {
  decisions: [
    { measureId: "M8", districtId: "baikonur" as const },
    { measureId: "M9", districtId: "baikonur" as const },
    { measureId: "M10", districtId: "baikonur" as const },
    { measureId: "M11", districtId: "almaty" as const },
    { measureId: "M13", districtId: "baikonur" as const },
  ],
};

function resultFixture() {
  const result = simulateScenario(worstScenario);
  if (!result.valid) throw new Error("Expected a valid analysis fixture");
  return result;
}

function request(body: unknown) {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const narrative = {
  strengths: ["• Байконур получил наибольшую поддержку по сравнению с другими районами."],
  tradeoffs: ["Результаты распределены по районам неравномерно."],
  risks: ["В Нуре сохраняются проблемы с доступностью социальных услуг."],
  recommendation: "Следующую итерацию посвятить социальным услугам в Нуре.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", undefined);
  vi.stubEnv("OPENAI_MODEL", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("mayor memo route", () => {
  it("returns polished deterministic facts when no OpenAI key is configured", async () => {
    const result = resultFixture();
    const response = await POST(request({ result }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(buildFallbackAnalysis(result));
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it("uses localized rounded context and keeps numeric facts deterministic", async () => {
    const result = resultFixture();
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    createCompletion.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(narrative) } }] });

    const response = await POST(request({ result }));
    const body = await response.json();
    const call = createCompletion.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
      response_format: { type: string; json_schema: { strict: boolean; schema: { additionalProperties: boolean } } };
    };

    expect(response.status).toBe(200);
    expect(body.source).toBe("openai");
    expect(body.executiveSummary).toBe(buildFallbackAnalysis(result).executiveSummary);
    expect(body.weakestDistrictInsight).toBe(buildFallbackAnalysis(result).weakestDistrictInsight);
    expect(body.strengths[1]).toBe("Байконур получил наибольшую поддержку по сравнению с другими районами.");
    expect(body.strengths[1]).not.toMatch(/[•*-]/);
    expect(call.messages[1].content).toBe(buildAnalysisContext(result));
    expect(call.messages[1].content).toContain("Школы и детсады");
    expect(call.messages[1].content).not.toMatch(/weakestDistrictAfter|criticalIndicators|realizedEffects|\bnura\b|\bS1\b/i);
    expect(call.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true, schema: { additionalProperties: false } },
    });
  });

  it.each([
    { ...narrative, risks: ["Значение равно 52.04091625."] },
    { ...narrative, risks: ["Поле weakestDistrictAfter = nura."] },
    { ...narrative, recommendation: "Применить realizedEffects к району." },
    { ...narrative, strengths: ["S1 и S2 требуют внимания."] },
  ])("falls back when the model returns numeric values, IDs, or internal field names", async unsafeNarrative => {
    const result = resultFixture();
    const fallback = buildFallbackAnalysis(result);
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    createCompletion.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(unsafeNarrative) } }] });

    const response = await POST(request({ result }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(fallback);
  });

  it("uses the polished fallback if the model call fails", async () => {
    const result = resultFixture();
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    createCompletion.mockRejectedValueOnce(new Error("upstream unavailable"));

    const response = await POST(request({ result }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(buildFallbackAnalysis(result));
  });

  it("rejects malformed requests before attempting analysis", async () => {
    const response = await POST(request({ result: { valid: false } }));

    expect(response.status).toBe(400);
    expect(createCompletion).not.toHaveBeenCalled();
  });
});
