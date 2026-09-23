"use client";

import { useEffect, useState } from "react";
import type { SimulationResult } from "@/lib/simulation";
import { loadParetoFront } from "./paretoActions";
import type { ParetoPreview } from "./paretoActions";

const WIDTH = 600;
const HEIGHT = 300;
const LEFT = 52;
const RIGHT = 20;
const TOP = 24;
const BOTTOM = 46;

let cachedFront: ParetoPreview[] | null = null;

export function ParetoChart({ result }: { result: SimulationResult }) {
  const [points, setPoints] = useState<ParetoPreview[] | null>(() => cachedFront);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cachedFront) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadParetoFront().then(({ points: front }) => {
        cachedFront = front;
        if (!cancelled) setPoints(front);
      }).catch(() => {
        if (!cancelled) setError(true);
      });
    }, 50);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  if (error) return <p role="alert" className="text-sm text-red-700">Не удалось загрузить график Парето.</p>;
  if (!points) return <p role="status" className="text-sm text-slate-600">Строим график Парето…</p>;
  if (points.length === 0) return <p className="text-sm text-slate-600">Для графика нет допустимых наборов.</p>;

  const budgets = points.map((point) => point.budget);
  const scores = [...points.map((point) => point.score), result.score];
  const minBudget = Math.min(...budgets);
  const maxBudget = Math.max(...budgets);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const scorePadding = Math.max((maxScore - minScore) * 0.1, 0.1);
  const scoreFloor = minScore - scorePadding;
  const scoreCeiling = maxScore + scorePadding;
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const x = (budget: number) => LEFT + (budget - minBudget) / (maxBudget - minBudget || 1) * plotWidth;
  const y = (score: number) => TOP + (scoreCeiling - score) / (scoreCeiling - scoreFloor) * plotHeight;
  const bestAtBudget = [...points].reverse().find((point) => point.budget <= result.budget.used);
  const gap = bestAtBudget ? Math.max(0, Math.round((bestAtBudget.score - result.score) * 100) / 100) : null;
  const scoreFormat = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <section aria-labelledby="pareto-heading" className="rounded-2xl border border-slate-200 bg-white p-4 print:break-inside-avoid sm:p-5">
      <h3 id="pareto-heading" className="text-lg font-semibold text-slate-950">Бюджет и лучший Score</h3>
      <p className="mt-1 text-sm text-slate-600">Линия показывает лучшие допустимые наборы при каждом бюджете.</p>
      <svg className="mt-4 h-auto w-full" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="График Парето: бюджет по горизонтали, лучший Score по вертикали, ваш набор выделен оранжевым">
        <line x1={LEFT} y1={TOP} x2={LEFT} y2={HEIGHT - BOTTOM} stroke="#94a3b8" />
        <line x1={LEFT} y1={HEIGHT - BOTTOM} x2={WIDTH - RIGHT} y2={HEIGHT - BOTTOM} stroke="#94a3b8" />
        <text x={LEFT - 8} y={TOP + 4} textAnchor="end" className="fill-slate-600 text-xs">{scoreFormat.format(maxScore)}</text>
        <text x={LEFT - 8} y={HEIGHT - BOTTOM + 4} textAnchor="end" className="fill-slate-600 text-xs">{scoreFormat.format(minScore)}</text>
        <text x={LEFT} y={HEIGHT - 17} textAnchor="middle" className="fill-slate-600 text-xs">{minBudget}</text>
        <text x={WIDTH - RIGHT} y={HEIGHT - 17} textAnchor="middle" className="fill-slate-600 text-xs">{maxBudget}</text>
        <polyline points={points.map((point) => `${x(point.budget)},${y(point.score)}`).join(" ")} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" />
        {points.map((point) => (
          <circle key={point.budget} cx={x(point.budget)} cy={y(point.score)} r="3" fill="#2563eb" tabIndex={0} aria-label={`Бюджет ${point.budget}, лучший Score ${scoreFormat.format(point.score)}`}>
            <title>Бюджет {point.budget} · Score {scoreFormat.format(point.score)}</title>
          </circle>
        ))}
        <circle cx={x(result.budget.used)} cy={y(result.score)} r="7" fill="#ea580c" stroke="white" strokeWidth="2" tabIndex={0} aria-label={`Ваш набор: бюджет ${result.budget.used}, Score ${scoreFormat.format(result.score)}`}>
          <title>Ваш набор · бюджет {result.budget.used} · Score {scoreFormat.format(result.score)}</title>
        </circle>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
        <span><span className="mr-1 text-blue-600">●</span> Лучшие наборы</span>
        <span><span className="mr-1 text-orange-600">●</span> Ваш набор</span>
      </div>
      {gap !== null && <p className="mt-3 text-sm font-medium text-slate-800">
        {gap === 0 ? "Ваш набор оптимален для этого бюджета" : `До оптимума при вашем бюджете: +${scoreFormat.format(gap)}`}
      </p>}
    </section>
  );
}
