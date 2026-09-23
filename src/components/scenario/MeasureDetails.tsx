import { INDICATOR_IDS } from "@/lib/simulation";
import type { Measure } from "@/lib/simulation";
import { CATEGORY_LABELS, INDICATOR_LABELS, SCOPE_LABELS } from "@/lib/simulation/labels";

type MeasureDetailsProps = {
  measure: Measure;
};

export function MeasureDetails({ measure }: MeasureDetailsProps) {
  const effects = INDICATOR_IDS.flatMap((indicatorId) => {
    const value = measure.effects[indicatorId];
    return value === undefined ? [] : [{ indicatorId, value }];
  });

  return (
    <div className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-700">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>Направление: <strong>{CATEGORY_LABELS[measure.category]}</strong></span>
        <span>Тип: <strong>{SCOPE_LABELS[measure.scope]}</strong></span>
        <span>Стоимость: <strong>{measure.cost} ед.</strong></span>
        <span>Лаг: <strong>{measure.lag} кв.</strong></span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Эффекты меры">
        {effects.map(({ indicatorId, value }) => (
          <li key={indicatorId} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
            {INDICATOR_LABELS[indicatorId]} {value < 0 ? "−" : "+"}{Math.abs(value)}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">Эффекты указаны до учёта лага</p>
    </div>
  );
}
