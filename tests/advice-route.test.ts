import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/advice/route";
import { compareAdvice } from "../src/lib/simulation/advice";
import { CONFIG, DISTRICTS, MEASURES, REFERENCE_SCENARIO, findBest, suggestSwaps } from "../src/lib/simulation";

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

function request(body: unknown) {
  return new Request("http://localhost/api/advice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "OPENAI_API_KEY", "OPENAI_MODEL"]) {
    vi.stubEnv(key, undefined);
  }
});
afterEach(() => vi.unstubAllEnvs());

describe("verified advice route", () => {
  it.each([
    null,
    {},
    { scenario: { decisions: [] } },
    { scenario: { decisions: [{ measureId: "M7", districtId: "unknown" }, ...REFERENCE_SCENARIO.decisions.slice(1)] } },
    { scenario: { decisions: [REFERENCE_SCENARIO.decisions[1], ...REFERENCE_SCENARIO.decisions.slice(1)] } },
  ])("rejects malformed or invalid input before any model call: %j", async body => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual(expect.any(String));
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it("rejects unreadable JSON", async () => {
    const response = await POST(new Request("http://localhost/api/advice", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it("returns the highest ranked applicable engine candidate without increasing spending", async () => {
    const scenario = structuredClone(REFERENCE_SCENARIO);
    const all = suggestSwaps(scenario, CONFIG.n_decisions * MEASURES.length * (DISTRICTS.length + 1));
    const expected = all.swaps.find(swap => compareAdvice(scenario, { baseScenario: scenario, scenario: swap.scenario }).valid);
    expect(expected).toBeDefined();
    const response = await POST(request({ scenario }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe("fallback");
    expect(body.proposal).toEqual({ baseScenario: scenario, scenario: expected!.scenario });
    const checked = compareAdvice(scenario, body.proposal);
    expect(checked.valid).toBe(true);
    if (!checked.valid) throw new Error(checked.message);
    expect(checked.comparison.after.budget.used).toBeLessThanOrEqual(checked.comparison.before.budget.used);
    expect(Number(checked.comparison.after.score.toFixed(2))).toBeGreaterThan(Number(checked.comparison.before.score.toFixed(2)));
    expect(scenario).toEqual(REFERENCE_SCENARIO);
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it("returns no proposal and makes no model call when no improvement exists", async () => {
    vi.stubEnv("LLM_API_KEY", "test-only");
    const response = await POST(request({ scenario: findBest(1)[0].scenario }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.proposal).toBeNull();
    expect(body.explanation).toContain("нет улучшения");
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it("keeps the exact applicable proposal after an upstream failure", async () => {
    const payload = { scenario: REFERENCE_SCENARIO };
    const offline = await (await POST(request(payload))).json();
    vi.stubEnv("LLM_API_KEY", "test-only");
    createCompletion.mockRejectedValueOnce(new Error("upstream unavailable"));
    const response = await POST(request(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(offline);
    expect(clientOptions).toHaveBeenCalledWith(expect.objectContaining({ timeout: 8000, maxRetries: 0 }));
  });

  it.each(["not JSON", "{}", '{"explanation":42}', '{"explanation":"Score вырастет до 999"}'])
    ("falls back safely for a malformed or numeric model explanation: %s", async content => {
      const payload = { scenario: REFERENCE_SCENARIO };
      const offline = await (await POST(request(payload))).json();
      vi.stubEnv("OPENAI_API_KEY", "test-only");
      createCompletion.mockResolvedValueOnce({ choices: [{ message: { content } }] });
      const response = await POST(request(payload));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(offline);
    });

  it("uses the configured provider and only accepts structured prose for its unchanged proposal", async () => {
    vi.stubEnv("LLM_API_KEY", "test-only-provider");
    vi.stubEnv("LLM_BASE_URL", "https://example.invalid/v1");
    vi.stubEnv("LLM_MODEL", "test-model");
    const explanation = "Предложенная замена улучшает общий результат при прежнем бюджете.";
    createCompletion.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ explanation }) } }] });
    const response = await POST(request({ scenario: REFERENCE_SCENARIO }));
    const body = await response.json();
    expect(body.source).toBe("openai");
    expect(body.explanation).toBe(explanation);
    expect(compareAdvice(REFERENCE_SCENARIO, body.proposal).valid).toBe(true);
    expect(clientOptions).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "test-only-provider", baseURL: "https://example.invalid/v1" }));
    expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({
      model: "test-model",
      response_format: expect.objectContaining({ type: "json_schema" }),
    }));
  });
});
