import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/agent/route";
import * as engine from "../src/lib/simulation/tools";
import * as analysis from "../src/lib/analysis";
import { REFERENCE_SCENARIO, simulateScenario } from "../src/lib/simulation";

const fetchMock = vi.fn<typeof fetch>();
const request = (body: unknown) => new Request("http://localhost/api/agent", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const payload = (mode = "chat", message = "без Есиля до 80") => ({ mode, message, scenario: REFERENCE_SCENARIO });
const completion = (content: string | null, tool_calls?: unknown[]) => Response.json({
  choices: [{ message: { role: "assistant", content, ...(tool_calls ? { tool_calls } : {}) } }],
});
const call = (name: string, args: unknown, id = "call_1") => ({
  id, type: "function", function: { name, arguments: JSON.stringify(args) },
});

beforeEach(() => {
  vi.stubEnv("LLM_API_KEY", undefined);
  vi.stubEnv("LLM_BASE_URL", undefined);
  vi.stubEnv("LLM_MODEL", undefined);
  vi.stubEnv("OPENAI_API_KEY", undefined);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("agent route", () => {
  it("executes the model's budget/district constraints and sends tool results back", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_BASE_URL", "https://example.invalid/v1/");
    vi.stubEnv("LLM_MODEL", "test-model");
    const execute = vi.spyOn(engine, "executeTool");
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const args = { constraints: { avoidDistricts: ["yesil"], budgetMax: 80 } };
    fetchMock.mockResolvedValueOnce(completion(null, [call("find_best", args)]))
      .mockResolvedValueOnce(completion("Вот лучший набор по ограничениям бюджета и района."));
    const response = await POST(request(payload()));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("llm");
    expect(execute).toHaveBeenCalledWith("find_best", args);
    expect(body.trace).toEqual([expect.objectContaining({ tool: "find_best", args, summary: expect.any(String) })]);
    const results = JSON.parse(body.trace[0].summary);
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.cost).toBeLessThanOrEqual(80);
      expect(result.scenario.decisions.every((decision: { districtId?: string }) => decision.districtId !== "yesil")).toBe(true);
    }
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.invalid/v1/chat/completions");
    expect(options?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer test-key" }));
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(30_000);
    const first = JSON.parse(String(options?.body));
    expect(first.model).toBe("test-model");
    expect(first.tools).toEqual(engine.engineTools);
    expect(first.messages[0].content).toContain("советник акима Астаны");
    const second = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(second.messages.at(-1)).toEqual({ role: "tool", tool_call_id: "call_1", content: body.trace[0].summary });
  });

  it("returns default find_best in chat fallback without a key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "legacy-key-is-not-agent-key");
    const execute = vi.spyOn(engine, "executeTool");
    const response = await POST(request(payload()));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("fallback");
    expect(body.answer).toContain("LLM не подключён");
    expect(body.answer).toContain("не учитывает условия вопроса");
    expect(execute).toHaveBeenCalledWith("find_best", {});
    expect(body.trace[0].tool).toBe("find_best");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("supplies initiative, district and indicator names before answering a named-initiative question", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    fetchMock.mockResolvedValueOnce(completion("Проверю Центр семейного здоровья в Нуре."));
    await POST(request(payload("chat", "Подбери набор с Центром семейного здоровья в Нуре")));
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const context = sent.messages.filter((message: { role: string }) => message.role === "system")
      .map((message: { content: string }) => message.content).join("\n");
    expect(context).toContain('"id":"M8","name":"Центр семейного здоровья"');
    expect(context).toContain('"id":"nura","name":"Нура"');
    expect(context).toContain('"id":"S1","name":"Школы и детсады"');
  });

  it("reuses the existing explain fallback with three initial tools and a real positive swap", async () => {
    const fallback = vi.spyOn(analysis, "buildFallbackAnalysis");
    const response = await POST(request(payload("explain")));
    const body = await response.json();
    const result = simulateScenario(REFERENCE_SCENARIO);
    if (!result.valid) throw new Error("Invalid reference");
    expect(response.status).toBe(200);
    expect(body.mode).toBe("fallback");
    expect(fallback).toHaveBeenCalledWith(result);
    expect(body.answer).toContain(analysis.buildFallbackAnalysis(result).executiveSummary);
    expect(body.trace.map((item: { tool: string }) => item.tool)).toEqual(["evaluate_scenario", "suggest_swaps", "score_rank"]);
    for (const heading of ["Итог", "Сильные стороны", "Риски", "Рекомендации"]) expect(body.answer).toContain(heading);
    const swap = JSON.parse(body.trace[1].summary).swaps[0];
    expect(swap.scoreDelta).toBeGreaterThan(0);
    expect(body.answer).toContain(`Замена ${swap.replaced.id}`);
    expect(body.answer).toContain(`прирост Score +${swap.scoreDelta}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the three explain tool results before the first LLM request", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    fetchMock.mockResolvedValueOnce(completion("Итог / Сильные стороны / Риски / Рекомендации"));
    const body = await (await POST(request(payload("explain")))).json();
    expect(body.mode).toBe("llm");
    const messages = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages;
    expect(messages.filter((message: { role: string }) => message.role === "tool")).toHaveLength(3);
    expect(body.trace).toHaveLength(3);
  });

  it("evaluates both what-if variants and records every call in a multi-tool turn", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    const changed = { decisions: REFERENCE_SCENARIO.decisions.map(decision => decision.measureId === "M5"
      ? { measureId: "M13", districtId: "almaty" } : decision) };
    fetchMock.mockResolvedValueOnce(completion(null, [
      call("evaluate_scenario", { scenario: REFERENCE_SCENARIO }, "before"),
      call("evaluate_scenario", { scenario: changed }, "after"),
    ])).mockResolvedValueOnce(completion("Сравнение рассчитано движком."));
    const body = await (await POST(request(payload("chat", "Заменить M5 на M13 в Алматы")))).json();
    expect(body.trace.map((item: { args: unknown }) => item.args)).toEqual([
      { scenario: REFERENCE_SCENARIO }, { scenario: changed },
    ]);
    expect(JSON.parse(body.trace[0].summary).cost).toBe(95);
    expect(JSON.parse(body.trace[1].summary).cost).toBe(98);
    expect(JSON.parse(body.trace[0].summary).districts).not.toEqual(JSON.parse(body.trace[1].summary).districts);
  });

  it.each(["http", "network", "timeout", "malformed", "empty"])("falls back after %s failure with existing trace preserved", async failure => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    if (failure === "http") fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("network failed"));
    if (failure === "timeout") fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    if (failure === "malformed") fetchMock.mockResolvedValueOnce(Response.json({ choices: [] }));
    if (failure === "empty") fetchMock.mockResolvedValueOnce(completion(" "));
    const response = await POST(request(payload("explain")));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("fallback");
    expect(body.answer).toContain("Итог");
    expect(body.trace).toHaveLength(3);
    expect(body.answer).not.toContain("test-key");
  });

  it("limits tools to six rounds and requests a final answer with tool_choice none", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    const execute = vi.spyOn(engine, "executeTool");
    for (let index = 0; index < 6; index++) {
      fetchMock.mockResolvedValueOnce(completion(null, [call("evaluate_scenario", { scenario: REFERENCE_SCENARIO }, `call_${index}`)]));
    }
    fetchMock.mockResolvedValueOnce(completion("Итог по полученным результатам."));
    const body = await (await POST(request(payload()))).json();
    expect(body.mode).toBe("llm");
    expect(execute).toHaveBeenCalledTimes(6);
    expect(body.trace).toHaveLength(6);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    const last = JSON.parse(String(fetchMock.mock.calls[6][1]?.body));
    expect(last.tool_choice).toBe("none");
  });

  it("returns tool errors to the LLM for invalid JSON and unknown tools", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    const malformed = call("find_best", {});
    malformed.function.arguments = "{";
    fetchMock.mockResolvedValueOnce(completion(null, [malformed, call("unknown_tool", {}, "unknown")]))
      .mockResolvedValueOnce(completion("Нужны корректные параметры."));
    const body = await (await POST(request(payload()))).json();
    expect(body.trace).toHaveLength(2);
    for (const item of body.trace) expect(JSON.parse(item.summary).error).toEqual(expect.any(String));
    expect(body.mode).toBe("llm");
  });

  it("preserves an empty constrained search so the model can explain infeasibility", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    fetchMock.mockResolvedValueOnce(completion(null, [call("find_best", { constraints: { budgetMax: 0 } })]))
      .mockResolvedValueOnce(completion("Ограничение бюджета 0 невыполнимо для полного набора."));
    const body = await (await POST(request(payload("chat", "Бюджет 0")))).json();
    expect(body.trace[0].summary).toBe("[]");
    expect(body.answer).toContain("невыполнимо");
  });

  it.each([null, {}, { mode: "wrong", scenario: REFERENCE_SCENARIO }, { mode: "chat", scenario: null }])
    ("rejects malformed input without 500: %j", async input => {
      const response = await POST(request(input));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ answer: expect.any(String), trace: [], mode: "fallback" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

  it("handles malformed JSON and invalid scenarios without 500", async () => {
    const malformed = await POST(new Request("http://localhost/api/agent", { method: "POST", body: "{" }));
    expect(malformed.status).toBe(400);
    const response = await POST(request({ mode: "explain", scenario: { decisions: [REFERENCE_SCENARIO.decisions[0]] } }));
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("fallback");
  });
});
