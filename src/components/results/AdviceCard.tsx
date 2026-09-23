"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { CONFIG, DISTRICTS, MEASURE_BY_ID } from "@/lib/simulation/data";
import { INDICATOR_IDS } from "@/lib/simulation/types";
import { compareAdvice, type AdviceComparison, type AdviceProposal } from "@/lib/simulation/advice";
import type { Decision, ScenarioInput } from "@/lib/simulation/types";

const responseSchema = z.object({
  proposal: z.unknown(),
  explanation: z.string().min(1).max(2000),
  source: z.enum(["openai", "fallback"]),
});

type AdviceState =
  | { kind: "idle" | "loading" }
  | { kind: "error" | "empty"; message: string }
  | { kind: "ready"; comparison: AdviceComparison; explanation: string; source: "openai" | "fallback" };

const decisionLabel = (decision: Decision) => {
  const measure = MEASURE_BY_ID.get(decision.measureId);
  const district = decision.districtId ? DISTRICTS.find(item => item.id === decision.districtId)?.name : "Весь город";
  return `${measure?.name ?? decision.measureId} · ${district}`;
};

export function AdviceCard({ scenario, onApply }: {
  scenario: ScenarioInput;
  onApply: (proposal: AdviceProposal) => void;
}) {
  const [state, setState] = useState<AdviceState>({ kind: "idle" });
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, []);

  async function requestAdvice() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Advice unavailable");
      const next = responseSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      if (next.proposal === null) {
        setState({ kind: "empty", message: next.explanation });
        return;
      }
      // Recompute the preview locally: network/model numbers are never applied.
      const checked = compareAdvice(scenario, next.proposal);
      if (!checked.valid) { setState({ kind: "error", message: checked.message }); return; }
      setState({ kind: "ready", comparison: checked.comparison, explanation: next.explanation, source: next.source });
    } catch {
      if (pending.current === controller) setState({ kind: "error", message: "Не удалось получить совет. Текущий сценарий сохранён — попробуйте ещё раз." });
    } finally {
      clearTimeout(timeout);
    }
  }

  const comparison = state.kind === "ready" ? state.comparison : null;
  const districtChanges = comparison?.after.districts.map(after => ({
    ...after,
    previous: comparison.before.districts.find(before => before.id === after.id)!.scoreAfter,
  })) ?? [];
  const reduced = districtChanges.filter(district => district.scoreAfter < district.previous - 1e-9);
  const reducedIndicators = comparison?.after.districts.flatMap(after => {
    const before = comparison.before.districts.find(district => district.id === after.id)!;
    return INDICATOR_IDS.filter(id => after.indicatorsAfter[id] < before.indicatorsAfter[id] - 1e-9)
      .map(id => ({ key: `${after.id}-${id}`, district: after.name, name: CONFIG.indicator_names[id], before: before.indicatorsAfter[id], after: after.indicatorsAfter[id] }));
  }) ?? [];

  return (
    <section aria-labelledby="advice-heading" className={`rounded-3xl border border-blue-200 bg-blue-50/60 p-5 sm:p-7 ${state.kind === "ready" ? "" : "print:hidden"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">AI-заместитель акима</p>
          <h2 id="advice-heading" className="mt-2 text-2xl font-semibold text-slate-950">Одна замена — проверенный результат</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Найдём улучшение Score без увеличения расходов. Вы увидите последствия до применения.</p>
        </div>
        {state.kind === "ready" && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700">
          {state.source === "openai" ? "AI-объяснение" : "Объяснение по расчёту"}
        </span>}
      </div>

      {state.kind !== "ready" && <div className="mt-5" aria-live="polite">
        {(state.kind === "error" || state.kind === "empty") && <p role={state.kind === "error" ? "alert" : "status"} className="mb-4 text-sm text-slate-700">{state.message}</p>}
        <button type="button" onClick={requestAdvice} disabled={state.kind === "loading" || state.kind === "empty"}
          className="rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
          {state.kind === "loading" ? "Проверяем варианты…" : state.kind === "error" ? "Повторить поиск совета" : "Получить совет"}
        </button>
      </div>}

      {state.kind === "ready" && comparison && <div className="mt-5 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Сейчас · решение {comparison.changedIndex + 1}</p><p className="mt-2 text-sm font-medium text-slate-900">{decisionLabel(comparison.baseScenario.decisions[comparison.changedIndex])}</p></div>
          <div className="rounded-2xl border border-blue-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-blue-700">Предлагаем</p><p className="mt-2 text-sm font-medium text-slate-900">{decisionLabel(comparison.scenario.decisions[comparison.changedIndex])}</p></div>
        </div>
        <dl className="grid gap-3 rounded-2xl bg-white p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-slate-500">Score: сейчас → после</dt><dd className="mt-1 text-lg font-semibold text-emerald-700">{comparison.before.score.toFixed(2)} → {comparison.after.score.toFixed(2)}</dd></div>
          <div><dt className="text-slate-500">Расходы: сейчас → после</dt><dd className="mt-1 text-lg font-semibold text-slate-900">{comparison.before.budget.used} → {comparison.after.budget.used}</dd></div>
          <div><dt className="text-slate-500">Критические показатели</dt><dd className="mt-1 text-lg font-semibold text-slate-900">{comparison.before.criticalIndicators.length} → {comparison.after.criticalIndicators.length}</dd></div>
        </dl>
        <p className="text-sm leading-6 text-slate-800">{state.explanation}</p>
        <div className="text-sm leading-6 text-slate-700">
          <p className="font-semibold text-slate-950">Компромисс относительно вашего плана</p>
          {reduced.length > 0
            ? <ul className="mt-1 space-y-1">{reduced.map(district => <li key={district.id}>{district.name}: {district.previous.toFixed(2)} → {district.scoreAfter.toFixed(2)}. Районный балл станет ниже.</li>)}</ul>
            : <p>Районные баллы не снижаются относительно текущего сценария.</p>}
          {reducedIndicators.length > 0 && <details className="mt-2">
            <summary className="cursor-pointer font-medium">Показатели со снижением: {reducedIndicators.length}</summary>
            <ul className="mt-2 space-y-1">{reducedIndicators.map(item => <li key={item.key}>{item.district} · {item.name}: {item.before.toFixed(2)} → {item.after.toFixed(2)}</li>)}</ul>
          </details>}
        </div>
        <p className="text-xs leading-5 text-slate-500">Проверено: пять разных мер, бюджет, районы и совместимость. Это улучшение одной заменой; общий оптимум может требовать нескольких изменений.</p>
        <button type="button" onClick={() => onApply({ baseScenario: comparison.baseScenario, scenario: comparison.scenario })}
          className="rounded-full bg-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">Применить совет</button>
        <p className="text-xs text-slate-500">Обновит решения и сразу пересчитает результат. Изменение можно отменить.</p>
      </div>}
    </section>
  );
}
