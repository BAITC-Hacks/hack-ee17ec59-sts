import type { SimulationResult } from "@/lib/simulation";
import { INDICATOR_LABELS } from "@/lib/simulation/labels";
import { MayorBrief } from "./MayorBrief";

const deltaClass = (value: number) => value >= 0 ? "text-emerald-700" : "text-rose-700";

export function ResultsDashboard({ result }: { result: SimulationResult }) {
  return (
    <section className="space-y-5 print:space-y-4">
      <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm print:break-inside-avoid print:border print:border-slate-200 print:bg-white print:text-slate-950 print:shadow-none sm:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300 print:text-blue-700">02 / Score</p>
            <h2 className="mt-2 text-2xl font-semibold">Astana Quality of Life Score</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 print:text-slate-700">
              Итог объединяет общий городской результат, слабейший район и штраф за показатели ниже 40.
            </p>
          </div>
          <div className="md:text-right">
            <p className="text-5xl font-semibold tracking-tight">{result.score.toFixed(2)}</p>
            <p className={`mt-2 text-sm font-semibold ${result.scoreDelta >= 0
              ? "text-emerald-300 print:text-emerald-800"
              : "text-rose-300 print:text-rose-800"}`}>
              {result.scoreDelta >= 0 ? "+" : ""}{result.scoreDelta.toFixed(2)} к baseline {result.baselineScore.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="mt-7 grid gap-3 border-t border-white/10 pt-5 print:border-slate-200 sm:grid-cols-3">
          <div><p className="text-xs uppercase tracking-wide text-slate-400 print:text-slate-600">Бюджет</p><p className="mt-1 text-lg font-semibold">{result.budget.used} / {result.budget.limit}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400 print:text-slate-600">Городской балл</p><p className="mt-1 text-lg font-semibold">{result.cityAverageAfter.toFixed(2)}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400 print:text-slate-600">Критические значения</p><p className="mt-1 text-lg font-semibold">{result.criticalIndicators.length}</p></div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:break-inside-avoid sm:p-7">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Районы</p><h2 className="mt-2 text-2xl font-semibold text-slate-950">Кому стало лучше</h2></div>
          <p className="text-right text-xs text-slate-500">до → после</p>
        </div>
        <div className="mt-5 space-y-4">
          {result.districts.map((district) => (
            <div key={district.id}>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold text-slate-800">{district.name}</span>
                <span className={`font-semibold ${deltaClass(district.scoreDelta)}`}>
                  {district.scoreBefore.toFixed(1)} → {district.scoreAfter.toFixed(1)} ({district.scoreDelta >= 0 ? "+" : ""}{district.scoreDelta.toFixed(1)})
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, district.scoreAfter)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 print:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:break-inside-avoid sm:p-7">
          <h2 className="text-lg font-semibold text-slate-950">Сработавшие синергии</h2>
          {result.activatedSynergies.length > 0
            ? <div className="mt-4 flex flex-wrap gap-2">{result.activatedSynergies.map((synergy) => <span key={synergy} className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">{synergy}</span>)}</div>
            : <p className="mt-4 text-sm text-slate-500">В этом сценарии синергий нет.</p>}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:break-inside-avoid sm:p-7">
          <h2 className="text-lg font-semibold text-slate-950">Критические показатели</h2>
          {result.criticalIndicators.length > 0
            ? <ul className="mt-4 space-y-2 text-sm text-rose-700">{result.criticalIndicators.map((item) => (
              <li key={`${item.districtId}-${item.indicatorId}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-rose-50 px-3 py-2">
                <span>{result.districts.find((district) => district.id === item.districtId)?.name ?? item.districtId} · {INDICATOR_LABELS[item.indicatorId]}</span>
                <strong>{item.value.toFixed(1)}</strong>
              </li>
            ))}</ul>
            : <p className="mt-4 text-sm text-emerald-700">Критических значений ниже 40 не осталось.</p>}
        </div>
      </div>

      <MayorBrief result={result} />
    </section>
  );
}
