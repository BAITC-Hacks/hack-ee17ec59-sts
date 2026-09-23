"use client";

import { useMemo, useState } from "react";
import {
  MEASURE_BY_ID,
  REFERENCE_SCENARIO,
  simulateScenario,
  validateScenario,
} from "@/lib/simulation";
import type { ScenarioInput, SimulationResult, ValidationError } from "@/lib/simulation";
import { BudgetMeter } from "./BudgetMeter";
import { DecisionSlot } from "./DecisionSlot";
import type { ScenarioSlot } from "./DecisionSlot";

type ScenarioBuilderProps = {
  onSimulate: (result: SimulationResult) => void;
  onErrors: (errors: ValidationError[]) => void;
};

const SLOT_COUNT = 5;

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
  const [attempted, setAttempted] = useState(false);
  const input = useMemo(() => toScenarioInput(slots), [slots]);
  const validation = useMemo(() => validateScenario(input), [input]);
  const selectedCount = input.decisions.length;
  const visibleErrors = validation.valid
    ? []
    : validation.errors.filter((error) => attempted || error.code !== "wrong-count");

  function updateSlot(index: number, slot: ScenarioSlot) {
    setSlots((current) => current.map((item, itemIndex) => itemIndex === index ? slot : item));
    setAttempted(false);
    onErrors([]);
  }

  function loadReference() {
    setSlots(Array.from({ length: SLOT_COUNT }, (_, index) => {
      const decision = REFERENCE_SCENARIO.decisions[index];
      return decision ? { ...decision } : {};
    }));
    setAttempted(false);
    onErrors([]);
  }

  function calculate() {
    setAttempted(true);
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
        {visibleErrors.length > 0 && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            <p className="font-semibold">Проверьте сценарий:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {visibleErrors.map((error, index) => <li key={`${error.code}-${index}`}>{error.message}</li>)}
            </ul>
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={calculate}
            className="rounded-full bg-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
          >
            Рассчитать сценарий
          </button>
        </div>
      </div>
    </section>
  );
}
