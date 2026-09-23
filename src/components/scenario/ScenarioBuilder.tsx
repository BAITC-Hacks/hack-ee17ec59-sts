"use client";

import { useMemo, useState } from "react";
import {
  CONFIG,
  MEASURE_BY_ID,
  REFERENCE_SCENARIO,
  simulateScenario,
  validateScenario,
} from "@/lib/simulation";
import type { ScenarioInput, SimulationResult, ValidationError } from "@/lib/simulation";
import { BudgetMeter } from "./BudgetMeter";
import { DecisionSlot } from "./DecisionSlot";
import type { ScenarioSlot } from "./DecisionSlot";
import { remainingMeasuresHint, ValidationSummary } from "./ValidationSummary";

type ScenarioBuilderProps = {
  onSimulate: (result: SimulationResult) => void;
  onErrors: (errors: ValidationError[]) => void;
};

const SLOT_COUNT = CONFIG.n_decisions;

const emptySlots = (): ScenarioSlot[] => Array.from({ length: SLOT_COUNT }, () => ({}));

export function toScenarioInput(slots: readonly ScenarioSlot[]): ScenarioInput {
  const decisions: ScenarioInput["decisions"] = [];

  for (const slot of slots) {
    const measure = slot.measureId ? MEASURE_BY_ID.get(slot.measureId) : undefined;
    if (!measure) continue;

    decisions.push(
      measure.scope === "district" && slot.districtId
        ? { measureId: measure.id, districtId: slot.districtId }
        : { measureId: measure.id },
    );
  }

  return { decisions };
}

export function ScenarioBuilder({ onSimulate, onErrors }: ScenarioBuilderProps) {
  const [slots, setSlots] = useState<ScenarioSlot[]>(emptySlots);
  const input = useMemo(() => toScenarioInput(slots), [slots]);
  const validation = useMemo(() => validateScenario(input), [input]);
  const selectedCount = input.decisions.length;
  const remainingCount = slots.length - selectedCount;
  const visibleErrors = validation.valid ? [] : validation.errors.filter((error) => error.code !== "wrong-count");
  const buttonHint = remainingCount > 0
    ? `${remainingMeasuresHint(remainingCount)}${visibleErrors.length > 0 ? " и исправьте отмеченные ошибки" : ""}, чтобы рассчитать сценарий.`
    : "Исправьте отмеченные ошибки, чтобы рассчитать сценарий.";

  function errorsForSlot(slot: ScenarioSlot): ValidationError[] {
    return visibleErrors.filter((error) => {
      if (error.measureIds?.length) {
        return Boolean(slot.measureId && error.measureIds.includes(slot.measureId))
          && (!error.districtId || slot.districtId === error.districtId);
      }
      return Boolean(error.districtId && slot.districtId === error.districtId);
    });
  }

  function updateSlot(index: number, slot: ScenarioSlot) {
    setSlots((current) => current.map((item, itemIndex) => itemIndex === index ? slot : item));
    onErrors([]);
  }

  function loadReference() {
    setSlots(Array.from({ length: SLOT_COUNT }, (_, index) => {
      const decision = REFERENCE_SCENARIO.decisions[index];
      return decision ? { ...decision } : {};
    }));
    onErrors([]);
  }

  function calculate() {
    const scenario = toScenarioInput(slots);
    const checked = validateScenario(scenario);
    if (!checked.valid) {
      onErrors(checked.errors);
      return;
    }

    const result = simulateScenario(scenario);
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
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Решения</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Соберите городской сценарий</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Выберите ровно пять разных мер. Для районной меры укажите район.
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
        {slots.map((slot, index) => (
          <DecisionSlot
            key={index}
            number={index + 1}
            slot={slot}
            errors={errorsForSlot(slot)}
            selectedElsewhere={new Set(slots.flatMap((item, itemIndex) =>
              itemIndex !== index && item.measureId ? [item.measureId] : [],
            ))}
            onChange={(next) => updateSlot(index, next)}
            onClear={() => updateSlot(index, {})}
          />
        ))}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <p className="shrink-0 text-sm text-slate-700">Выбрано <strong>{selectedCount} из {slots.length}</strong></p>
          <BudgetMeter selectedMeasureIds={input.decisions.map((decision) => decision.measureId)} />
        </div>
        <ValidationSummary errors={visibleErrors} remainingCount={remainingCount} valid={validation.valid} />
        <div className="mt-5 flex flex-col items-start gap-2 sm:items-end">
          {!validation.valid && (
            <p id="calculate-hint" className="text-sm text-slate-600">
              {buttonHint}
            </p>
          )}
          <button
            type="button"
            onClick={calculate}
            disabled={!validation.valid}
            aria-describedby={!validation.valid ? "calculate-hint" : undefined}
            className="rounded-full bg-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            Рассчитать сценарий
          </button>
        </div>
      </div>
    </section>
  );
}
