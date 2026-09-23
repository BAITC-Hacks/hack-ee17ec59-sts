"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import demoQuestions from "@/lib/agent/demo-questions.json";
import type { ScenarioInput } from "@/lib/simulation";

const responseSchema = z.object({
  answer: z.string(),
  mode: z.enum(["llm", "fallback"]),
  trace: z.array(z.object({ tool: z.string(), args: z.unknown(), summary: z.string() })),
});

const buttonClass = "rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50";

export function AgentPanel({ scenario }: { scenario: ScenarioInput }) {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<z.infer<typeof responseSchema> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  async function ask(mode: "explain" | "chat", message = question) {
    if (pending.current || (mode === "chat" && !message.trim())) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    setResponse(null);
    try {
      const result = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, scenario, ...(mode === "chat" ? { message: message.trim() } : {}) }),
        signal: controller.signal,
      });
      if (!result.ok) throw new Error("Не удалось получить ответ агента. Попробуйте ещё раз.");
      const parsed = responseSchema.safeParse(await result.json());
      if (!parsed.success) throw new Error("Агент вернул некорректный ответ. Попробуйте ещё раз.");
      if (!controller.signal.aborted) setResponse(parsed.data);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Ошибка соединения с агентом.");
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section aria-label="AI-советник" aria-busy={loading} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-slate-950">AI-советник</h2>
        {response && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{response.mode === "llm" ? "LLM" : "fallback"}</span>}
      </div>
      <button type="button" disabled={loading} onClick={() => void ask("explain")} className={buttonClass}>Разобрать сценарий</button>
      <form onSubmit={event => { event.preventDefault(); void ask("chat"); }} className="space-y-3">
        <label htmlFor="agent-question" className="block text-sm font-semibold text-slate-800">Вопрос агенту</label>
        <textarea id="agent-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={8000} rows={3} disabled={loading} placeholder="Что можно улучшить в моём сценарии?" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-blue-600 disabled:opacity-50" />
        <button type="submit" disabled={loading || !question.trim()} className={buttonClass}>Спросить</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {demoQuestions.slice(0, 3).map(message => <button key={message} type="button" disabled={loading} onClick={() => { setQuestion(message); void ask("chat", message); }} className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-left text-sm text-blue-900 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{message}</button>)}
      </div>
      {loading && <p role="status" className="text-sm text-slate-600">Агент готовит ответ…</p>}
      {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {response && <div className="space-y-4" aria-live="polite">
        <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{response.answer}</p>
        <details className="rounded-2xl border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Ход рассуждений агента</summary>
          <p className="mt-3 text-xs text-slate-500">Вызовы инструментов и результаты расчётов.</p>
          {response.trace.length ? <ol className="mt-3 space-y-3">{response.trace.map((step, index) => {
            const args = JSON.stringify(step.args) ?? "{}";
            return <li key={`${index}-${step.tool}`} className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-900">{index + 1}. {step.tool}</p>
              <p className="mt-1 break-words font-mono text-xs text-slate-500">{args.length > 240 ? `${args.slice(0, 240)}…` : args}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-slate-700">{step.summary}</p>
            </li>;
          })}</ol> : <p className="mt-3 text-sm text-slate-500">Вызовов инструментов нет.</p>}
        </details>
      </div>}
    </section>
  );
}
