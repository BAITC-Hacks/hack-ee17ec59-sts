"use client";

import { useMemo, useState } from "react";
import {
  CONFIG,
  DISTRICTS,
  MEASURE_BY_ID,
  REFERENCE_SCENARIO,
  baselineScenario,
  simulateScenario,
  validateScenario,
} from "@/lib/simulation";
import type { DistrictId, ScenarioInput, SimulationResult, ValidationError } from "@/lib/simulation";
import { DistrictMap } from "@/components/map/DistrictMap";
import { BudgetMeter } from "./BudgetMeter";
import { DecisionSlot } from "./DecisionSlot";
import type { ScenarioSlot } from "./DecisionSlot";
import { remainingMeasuresHint, ValidationSummary } from "./ValidationSummary";

type ScenarioBuilderProps = {
  onSimulate: (result: SimulationResult) => void;
  onErrors: (errors: ValidationError[]) => void;
  onScenarioChange?: () => void;
};

const SLOT_COUNT = CONFIG.n_decisions;

const emptySlots = (): ScenarioSlot[] => Array.from({ length: SLOT_COUNT }, () => ({}));

const baselineResult = simulateScenario(baselineScenario());
const BASELINE_DISTRICT_VALUES: Partial<Record<DistrictId, number>> = baselineResult.valid
  ? Object.fromEntries(baselineResult.districts.map((district) => [district.id, district.scoreBefore]))
  : {};

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

export function ScenarioBuilder({ onSimulate, onErrors, onScenarioChange }: ScenarioBuilderProps) {
  const [slots, setSlots] = useState<ScenarioSlot[]>(emptySlots);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<SimulationResult | null>(null);
  const [mapLayer, setMapLayer] = useState<"after" | "delta">("after");
  const input = useMemo(() => toScenarioInput(slots), [slots]);
  const validation = useMemo(() => validateScenario(input), [input]);
  const selectedCount = input.decisions.length;
  const remainingCount = slots.length - selectedCount;
  const visibleErrors = validation.valid ? [] : validation.errors.filter((error) => error.code !== "wrong-count");
  const buttonHint = remainingCount > 0
    ? `${remainingMeasuresHint(remainingCount)}${visibleErrors.length > 0 ? " и исправьте отмеченные ошибки" : ""}, чтобы рассчитать сценарий.`
    : "Исправьте отмеченные ошибки, чтобы рассчитать сценарий.";
  const activeSlot = activeSlotIndex === null ? undefined : slots[activeSlotIndex];
  const activeMeasure = activeSlot?.measureId ? MEASURE_BY_ID.get(activeSlot.measureId) : undefined;
  const activeDistrictMeasure = activeMeasure?.scope === "district" ? activeMeasure : undefined;
  const disabledDistrictReasons = useMemo(() => {
    if (activeSlotIndex === null || !activeDistrictMeasure) return {};
    const reasons: Partial<Record<DistrictId, string>> = {};
    for (const district of DISTRICTS) {
      const candidateSlots = slots.map((slot, index) => index === activeSlotIndex
        ? { ...slot, districtId: district.id }
        : slot);
      const candidate = validateScenario(toScenarioInput(candidateSlots));
      if (candidate.valid) continue;
      const conflict = candidate.errors.find((error) =>
        error.code === "incompatible"
        && error.measureIds?.includes(activeDistrictMeasure.id)
        && (!error.districtId || error.districtId === district.id),
      );
      if (conflict) reasons[district.id] = conflict.message;
    }
    return reasons;
  }, [activeDistrictMeasure, activeSlotIndex, slots]);
  const mapValues: Partial<Record<DistrictId, number>> = lastResult
    ? Object.fromEntries(lastResult.districts.map((district) => [
      district.id,
      mapLayer === "delta" ? district.scoreDelta : district.scoreAfter,
    ]))
    : BASELINE_DISTRICT_VALUES;

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
    setActiveSlotIndex(index);
    setLastResult(null);
    setMapLayer("after");
    onErrors([]);
    onScenarioChange?.();
  }

  function loadReference() {
    setSlots(Array.from({ length: SLOT_COUNT }, (_, index) => {
      const decision = REFERENCE_SCENARIO.decisions[index];
      return decision ? { ...decision } : {};
    }));
    const firstDistrictIndex = REFERENCE_SCENARIO.decisions.findIndex((decision) =>
      MEASURE_BY_ID.get(decision.measureId)?.scope === "district",
    );
    setActiveSlotIndex(firstDistrictIndex >= 0 ? firstDistrictIndex : null);
    setLastResult(null);
    setMapLayer("after");
    onErrors([]);
    onScenarioChange?.();
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
    setLastResult(result);
    setMapLayer("after");
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

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="grid min-w-0 gap-3">
          {slots.map((slot, index) => (
            <DecisionSlot
              key={index}
              number={index + 1}
              slot={slot}
              active={activeSlotIndex === index}
              errors={errorsForSlot(slot)}
              selectedElsewhere={new Set(slots.flatMap((item, itemIndex) =>
                itemIndex !== index && item.measureId ? [item.measureId] : [],
              ))}
              onActivate={() => setActiveSlotIndex(index)}
              onChange={(next) => updateSlot(index, next)}
              onClear={() => updateSlot(index, {})}
            />
          ))}
        </div>
        <div className="min-w-0 lg:sticky lg:top-4">
          <h3 className="text-lg font-semibold text-slate-950">Районы Астаны</h3>
          <p className="mb-3 mt-1 text-sm leading-6 text-slate-600">
            {activeDistrictMeasure && activeSlotIndex !== null
              ? `Решение ${activeSlotIndex + 1}: ${activeDistrictMeasure.name}. Выберите район на карте или в списке.`
              : "Выберите районную меру в слоте, затем укажите район на карте."}
          </p>
          {lastResult && (
            <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Слой карты">
              {(["after", "delta"] as const).map((layer) => (
                <button
                  key={layer}
                  type="button"
                  onClick={() => setMapLayer(layer)}
                  aria-pressed={mapLayer === layer}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${mapLayer === layer
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
                >
                  {layer === "after" ? "D после" : "Изменение D"}
                </button>
              ))}
            </div>
          )}
          <DistrictMap
            values={mapValues}
            layer={lastResult ? mapLayer : "before"}
            selectedDistrictId={activeDistrictMeasure ? activeSlot?.districtId : undefined}
            highlightedDistrictIds={DISTRICTS.filter((district) => disabledDistrictReasons[district.id]).map((district) => district.id)}
            disabledDistrictReasons={disabledDistrictReasons}
            onDistrictClick={activeDistrictMeasure && activeSlotIndex !== null
              ? (districtId) => updateSlot(activeSlotIndex, { measureId: activeDistrictMeasure.id, districtId })
              : undefined}
          />
          <p className="mt-2 text-xs text-slate-500">
            {lastResult
              ? mapLayer === "delta" ? "Цвет показывает изменение D после выбранных мер." : "Цвет показывает оценку D после выбранных мер."
              : "Цвет показывает исходную оценку района D до выбора мер."}
          </p>
        </div>
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
