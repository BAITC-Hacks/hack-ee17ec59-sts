"use client";

import { useMemo, useState } from "react";
import {
  DISTRICTS,
  MEASURES,
  REFERENCE_SCENARIO,
  simulateScenario,
  validateScenario,
} from "@/lib/simulation";
import type { Decision, DistrictId, SimulationResult, ValidationError } from "@/lib/simulation";

type DraftDecision = Decision & { measureId: string };

type ScenarioBuilderProps = {
  onSimulate: (result: SimulationResult) => void;
  onErrors: (errors: ValidationError[]) => void;
};

const emptyDecisions = (): DraftDecision[] => Array.from({ length: 5 }, () => ({ measureId: "" }));

export function ScenarioBuilder({ onSimulate, onErrors }: ScenarioBuilderProps) {
  const [decisions, setDecisions] = useState<DraftDecision[]>(emptyDecisions);

  const selectedMeasures = useMemo(
    () => decisions.map((decision) => MEASURES.find((measure) => measure.id === decision.measureId)),
    [decisions],
  );
  const filled = selectedMeasures.filter(Boolean).length;
  const budgetUsed = selectedMeasures.reduce((sum, measure) => sum + (measure?.cost ?? 0), 0);
  const budgetRemaining = 100 - budgetUsed;
  const localErrors = useMemo(() => {
    if (filled !== 5) return [];
    const validation = validateScenario({ decisions });
    return validation.valid ? [] : validation.errors;
  }, [decisions, filled]);

  function updateDecision(index: number, patch: Partial<DraftDecision>) {
    const next = decisions.map((decision, decisionIndex) =>
      decisionIndex === index ? { ...decision, ...patch } : decision,
    );
    setDecisions(next);
    onErrors([]);
  }

  function loadReference() {
    setDecisions(REFERENCE_SCENARIO.decisions.map((decision) => ({ ...decision })));
    onErrors([]);
  }

  function calculate() {
    if (filled !== 5) {
      const errors: ValidationError[] = [{ code: "wrong-count", message: "Заполните все пять решений." }];
      onErrors(errors);
      return;
    }
    const result = simulateScenario({ decisions });
    if (!result.valid) {
      onErrors(result.errors);
      return;
    }
    onErrors([]);
    onSimulate(result);
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">01 / Решения</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Соберите городской сценарий</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Выберите ровно пять разных мер. Районные инициативы требуют района, городские применяются ко всем.
          </p>
        </div>
        <button
          type="button"
          onClick={loadReference}
          className="rounded-full border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
        >
          Загрузить эталонный сценарий
        </button>
      </div>

      <div className="mt-6 grid gap-3">
        {decisions.map((decision, index) => {
          const measure = selectedMeasures[index];
          return (
            <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[56px_minmax(0,1fr)_220px] md:items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">{index + 1}</div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={`measure-${index}`}>
                  Инициатива
                </label>
                <select
                  id={`measure-${index}`}
                  value={decision.measureId}
                  onChange={(event) => updateDecision(index, { measureId: event.target.value, districtId: undefined })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-200 transition focus:ring-4"
                >
                  <option value="">Выберите меру</option>
                  {MEASURES.map((option) => (
                    <option key={option.id} value={option.id}>{option.id} · {option.name}</option>
                  ))}
                </select>
                {measure && (
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {measure.category} · {measure.cost} ед. · лаг {measure.lag} кв. · {Object.entries(measure.effects).map(([id, effect]) => `${id} ${effect > 0 ? "+" : ""}${effect}`).join(", ")}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={`district-${index}`}>
                  Район
                </label>
                <select
                  id={`district-${index}`}
                  value={decision.districtId ?? ""}
                  disabled={!measure || measure.scope === "city"}
                  onChange={(event) => updateDecision(index, { districtId: (event.target.value || undefined) as DistrictId | undefined })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-200 transition focus:ring-4 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">{measure?.scope === "city" ? "Весь город" : "Выберите район"}</option>
                  {DISTRICTS.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-600">Выбрано: <span className="font-semibold text-slate-950">{filled} / 5</span></p>
          <p className={`mt-1 text-sm font-semibold ${budgetRemaining < 0 ? "text-rose-600" : "text-emerald-700"}`}>
            Потрачено {budgetUsed} · Остаток {budgetRemaining}
          </p>
          {localErrors.length > 0 && <p className="mt-2 text-xs text-rose-600">{localErrors[0].message}</p>}
        </div>
        <button
          type="button"
          onClick={calculate}
          className="rounded-full bg-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={filled !== 5}
        >
          Рассчитать сценарий
        </button>
      </div>
    </section>
  );
}
