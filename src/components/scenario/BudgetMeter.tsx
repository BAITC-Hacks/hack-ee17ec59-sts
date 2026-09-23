import { BUDGET_LIMIT, MEASURES } from "@/lib/simulation";

type BudgetMeterProps = {
  selectedMeasureIds: readonly string[];
};

export function BudgetMeter({ selectedMeasureIds }: BudgetMeterProps) {
  const budgetUsed = selectedMeasureIds.reduce(
    (sum, measureId) => sum + (MEASURES.find((measure) => measure.id === measureId)?.cost ?? 0),
    0,
  );
  const remaining = BUDGET_LIMIT - budgetUsed;
  const cheapestMeasureCost = Math.min(...MEASURES.map((measure) => measure.cost));
  const exceeded = remaining < 0;
  const nearlySpent = !exceeded && remaining < cheapestMeasureCost;
  const fill = Math.min(budgetUsed / BUDGET_LIMIT, 1);
  const color = exceeded ? "bg-rose-500" : nearlySpent ? "bg-amber-500" : "bg-blue-600";
  const statusColor = exceeded ? "text-rose-700" : nearlySpent ? "text-amber-700" : "text-slate-900";

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-slate-700">Потрачено {budgetUsed} из {BUDGET_LIMIT}</span>
        <span className={`font-semibold ${statusColor}`}>
          {exceeded ? `Превышение на ${Math.abs(remaining)}` : `Остаток ${remaining}`}
        </span>
      </div>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label="Использованный бюджет"
        aria-valuenow={Math.min(budgetUsed, BUDGET_LIMIT)}
        aria-valuemin={0}
        aria-valuemax={BUDGET_LIMIT}
      >
        <div className={`h-full w-full origin-left rounded-full ${color}`} style={{ transform: `scaleX(${fill})` }} />
      </div>
    </div>
  );
}
