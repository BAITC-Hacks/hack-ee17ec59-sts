"use client";

import { useEffect, useState } from "react";
import { buildFallbackAnalysis, type AnalysisResponse } from "@/lib/analysis";
import type { SimulationResult } from "@/lib/simulation";

export function MayorBrief({ result }: { result: SimulationResult }) {
  const [response, setResponse] = useState<{ result: SimulationResult; analysis: AnalysisResponse } | null>(null);
  const loading = response?.result !== result;
  const analysis = response?.result === result ? response.analysis : buildFallbackAnalysis(result);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((nextAnalysis: AnalysisResponse | null) => {
        if (!cancelled) setResponse({ result, analysis: nextAnalysis ?? buildFallbackAnalysis(result) });
      });
    return () => { cancelled = true; };
  }, [result]);

  return (
    <section className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5 print:break-inside-avoid sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">03 / AI brief</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Записка акиму</h2>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700">{loading ? "AI анализирует" : analysis.source === "openai" ? "OpenAI" : "Fallback"}</span>
      </div>
      <p className="mt-5 text-base leading-7 text-slate-800">{analysis.executiveSummary}</p>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div><h3 className="text-sm font-semibold text-slate-950">Сильные стороны</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{analysis.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><h3 className="text-sm font-semibold text-slate-950">Компромиссы</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{analysis.tradeoffs.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><h3 className="text-sm font-semibold text-slate-950">Риски</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{analysis.risks.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><h3 className="text-sm font-semibold text-slate-950">Следующий шаг</h3><p className="mt-2 text-sm leading-6 text-slate-700">{analysis.recommendation}</p></div>
      </div>
      <p className="mt-6 border-t border-blue-100 pt-4 text-sm leading-6 text-slate-700"><span className="font-semibold">Слабейший район:</span> {analysis.weakestDistrictInsight}</p>
    </section>
  );
}
