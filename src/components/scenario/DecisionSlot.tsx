import { DISTRICTS, MEASURE_BY_ID, MEASURES } from "@/lib/simulation";
import type { Category, DistrictId, ValidationError } from "@/lib/simulation";
import { CATEGORY_LABELS } from "@/lib/simulation/labels";
import { MeasureDetails } from "./MeasureDetails";
import { slotValidationMessage } from "./ValidationSummary";

export type ScenarioSlot = {
  measureId?: string;
  districtId?: DistrictId;
};

type DecisionSlotProps = {
  number: number;
  slot: ScenarioSlot;
  active?: boolean;
  errors: readonly ValidationError[];
  selectedElsewhere: ReadonlySet<string>;
  onActivate?: () => void;
  onChange: (slot: ScenarioSlot) => void;
  onClear: () => void;
};

const categories = Object.keys(CATEGORY_LABELS) as Category[];

export function DecisionSlot({ number, slot, active, errors, selectedElsewhere, onActivate, onChange, onClear }: DecisionSlotProps) {
  const measure = slot.measureId ? MEASURE_BY_ID.get(slot.measureId) : undefined;

  return (
    <article
      onFocusCapture={onActivate}
      onClick={onActivate}
      className={`rounded-2xl border p-4 sm:p-5 ${errors.length > 0 ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-50"} ${active ? "ring-2 ring-blue-300" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">
            {number}
          </span>
          <h3 className="text-sm font-semibold text-slate-900">Решение {number}</h3>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={!slot.measureId && !slot.districtId}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Очистить
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={`measure-${number}`} className="mb-1.5 block text-sm font-medium text-slate-700">
            Инициатива
          </label>
          <select
            id={`measure-${number}`}
            value={slot.measureId ?? ""}
            onChange={(event) => {
              const nextMeasure = MEASURE_BY_ID.get(event.target.value);
              onChange(nextMeasure ? { measureId: nextMeasure.id } : {});
            }}
            className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">Выберите меру</option>
            {categories.map((category) => (
              <optgroup key={category} label={CATEGORY_LABELS[category]}>
                {MEASURES.filter((option) => option.category === category).map((option) => (
                  <option key={option.id} value={option.id} disabled={selectedElsewhere.has(option.id)}>
                    {option.name} · {option.cost} ед.
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {measure?.scope === "district" && (
          <div>
            <label htmlFor={`district-${number}`} className="mb-1.5 block text-sm font-medium text-slate-700">
              Район
            </label>
            <select
              id={`district-${number}`}
              value={slot.districtId ?? ""}
              onChange={(event) => {
                const district = DISTRICTS.find((option) => option.id === event.target.value);
                onChange({ measureId: measure.id, districtId: district?.id });
              }}
              className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">Выберите район</option>
              {DISTRICTS.map((district) => (
                <option key={district.id} value={district.id}>{district.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {measure && <MeasureDetails measure={measure} />}
      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm font-medium text-rose-700">
          {errors.map((error, index) => (
            <li key={`${error.code}-${index}`}>{slotValidationMessage(error)}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
