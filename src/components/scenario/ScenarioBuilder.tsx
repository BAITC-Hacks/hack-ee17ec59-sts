"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
import { ParetoChart } from "@/components/pareto/ParetoChart";
import { BudgetMeter } from "./BudgetMeter";
import { DecisionSlot } from "./DecisionSlot";
import type { ScenarioSlot } from "./DecisionSlot";
import { remainingMeasuresHint, ValidationSummary } from "./ValidationSummary";
import { loadOptimizedScenario, loadScenarioRank } from "./optimizerActions";

type ScenarioBuilderProps = {
  onSimulate: (result: SimulationResult, scenario: ScenarioInput) => void;
  onErrors: (errors: ValidationError[]) => void;
  initialScenario?: ScenarioInput;
  initialResult?: SimulationResult;
  onChange?: () => void;
  onScenarioChange?: () => void;
  aside?: ReactNode;
};

const SLOT_COUNT = CONFIG.n_decisions;
type OptimizationKind = "best" | "worst";
type RankResponse = Awaited<ReturnType<typeof loadScenarioRank>>["rank"];
type RankDetails = Exclude<RankResponse, { error: string }>;
const optimizedScenarioCache = new Map<OptimizationKind, ScenarioInput>();
const scenarioRankCache = new Map<string, RankDetails>();

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

export function ScenarioBuilder({ onSimulate, onErrors, initialScenario, initialResult, onChange, onScenarioChange, aside }: ScenarioBuilderProps) {
  const [slots, setSlots] = useState<ScenarioSlot[]>(() => initialScenario
    ? Array.from({ length: SLOT_COUNT }, (_, index) => {
      const decision = initialScenario.decisions[index];
      return decision ? { ...decision } : {};
    })
    : emptySlots());
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(() => {
    if (!initialScenario) return null;
    const index = initialScenario.decisions.findIndex((decision) =>
      MEASURE_BY_ID.get(decision.measureId)?.scope === "district",
    );
    return index >= 0 ? index : null;
  });
  const [lastResult, setLastResult] = useState<SimulationResult | null>(initialResult ?? null);
  const [mapLayer, setMapLayer] = useState<"after" | "delta">("after");
  const [loadingOptimization, setLoadingOptimization] = useState<OptimizationKind | null>(null);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const [rank, setRank] = useState<RankDetails | null>(null);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  const hasAside = Boolean(aside);

  useEffect(() => {
    const column = rightColumnRef.current;
    if (!column) return;
    if (!lastResult) {
      column.scrollTop = 0;
      return;
    }
    const target = asideRef.current;
    if (!hasAside || !target || !window.matchMedia("(min-width: 1200px)").matches) return;
    const columnTop = column.getBoundingClientRect().top;
    const targetInside = target.getBoundingClientRect().top - columnTop + column.scrollTop;
    column.scrollTop = Math.max(0, targetInside - (80 - columnTop));
  }, [lastResult, hasAside]);
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
    requestVersion.current += 1;
    setSlots((current) => current.map((item, itemIndex) => itemIndex === index ? slot : item));
    setActiveSlotIndex(index);
    setLastResult(null);
    setMapLayer("after");
    setRank(null);
    setRankLoading(false);
    setRankError(null);
    setLoadingOptimization(null);
    setOptimizationError(null);
    onErrors([]);
    onChange?.();
    onScenarioChange?.();
  }

  function loadScenario(scenario: ScenarioInput) {
    requestVersion.current += 1;
    setSlots(Array.from({ length: SLOT_COUNT }, (_, index) => {
      const decision = scenario.decisions[index];
      return decision ? { ...decision } : {};
    }));
    const firstDistrictIndex = scenario.decisions.findIndex((decision) =>
      MEASURE_BY_ID.get(decision.measureId)?.scope === "district",
    );
    setActiveSlotIndex(firstDistrictIndex >= 0 ? firstDistrictIndex : null);
    setLastResult(null);
    setMapLayer("after");
    setRank(null);
    setRankLoading(false);
    setRankError(null);
    setLoadingOptimization(null);
    setOptimizationError(null);
    onErrors([]);
    onChange?.();
    onScenarioChange?.();
  }

  async function loadOptimized(kind: OptimizationKind) {
    const cached = optimizedScenarioCache.get(kind);
    if (cached) {
      loadScenario(cached);
      return;
    }
    const version = ++requestVersion.current;
    setLoadingOptimization(kind);
    setOptimizationError(null);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      if (requestVersion.current !== version) return;
      const { scenario } = await loadOptimizedScenario(kind);
      optimizedScenarioCache.set(kind, scenario);
      if (requestVersion.current === version) loadScenario(scenario);
    } catch {
      if (requestVersion.current === version) setOptimizationError("Не удалось загрузить сценарий. Попробуйте ещё раз.");
    } finally {
      if (requestVersion.current === version) setLoadingOptimization(null);
    }
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
    onSimulate(result, scenario);
    const version = ++requestVersion.current;
    const key = JSON.stringify(scenario.decisions);
    const cachedRank = scenarioRankCache.get(key);
    setRank(cachedRank ?? null);
    setRankLoading(!cachedRank);
    setRankError(null);
    if (cachedRank) return;
    void loadScenarioRank(scenario).then(({ rank: nextRank }) => {
      if ("error" in nextRank) {
        if (requestVersion.current === version) setRankError(nextRank.error);
      } else {
        scenarioRankCache.set(key, nextRank);
        if (requestVersion.current === version) setRank(nextRank);
      }
    }).catch(() => {
      if (requestVersion.current === version) setRankError("Не удалось определить место сценария.");
    }).finally(() => {
      if (requestVersion.current === version) setRankLoading(false);
    });
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadScenario(REFERENCE_SCENARIO)}
            className="rounded-full border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            Загрузить эталонный сценарий
          </button>
          {(["best", "worst"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => void loadOptimized(kind)}
              disabled={loadingOptimization !== null}
              aria-busy={loadingOptimization === kind}
              className="rounded-full border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
            >
              {loadingOptimization === kind
                ? kind === "best" ? "Ищу лучший из ~694 тыс. наборов…" : "Ищу худший из ~694 тыс. наборов…"
                : kind === "best" ? "Лучший сценарий" : "Худший сценарий"}
            </button>
          ))}
        </div>
      </div>
      {optimizationError && <p role="alert" className="mt-3 text-sm text-red-700">{optimizationError}</p>}

      <div className="mt-6 grid min-w-0 items-start gap-6 min-[1200px]:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] print:block">
        <div className="min-w-0">
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
        </div>
        <div ref={rightColumnRef} className="min-w-0 min-[1200px]:sticky min-[1200px]:top-4 min-[1200px]:max-h-[calc(100vh-2rem)] min-[1200px]:overflow-y-auto min-[1200px]:pr-1 print:static print:mt-6 print:max-h-none print:overflow-visible print:pr-0">
          <h3 className="text-lg font-semibold text-slate-950">Районы Астаны</h3>
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
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {activeDistrictMeasure && activeSlotIndex !== null
              ? `Решение ${activeSlotIndex + 1}: ${activeDistrictMeasure.name}. Выберите район на карте или в списке.`
              : "Выберите районную меру в слоте, затем укажите район на карте."}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {lastResult
              ? mapLayer === "delta" ? "Цвет показывает изменение D после выбранных мер." : "Цвет показывает оценку D после выбранных мер."
              : "Цвет показывает исходную оценку района D до выбора мер."}
          </p>
          {lastResult && <div className="mt-6"><ParetoChart result={lastResult} /></div>}
          {(aside || lastResult) && <div ref={asideRef} className="mt-6 min-w-0">
            {lastResult && <p className="mb-3 text-sm font-medium text-slate-700" aria-live="polite">
              {rankLoading ? "Определяем место среди возможных сценариев…" : rank
                ? `Лучше, чем ${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(rank.percentile)}% из ${new Intl.NumberFormat("ru-RU").format(rank.total)} наборов · место ${new Intl.NumberFormat("ru-RU").format(rank.rank)}`
                : rankError}
            </p>}
            {aside}
          </div>}
        </div>
      </div>
    </section>
  );
}
