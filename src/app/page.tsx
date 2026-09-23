"use client";

import { useState } from "react";
import { ScenarioBuilder } from "@/components/scenario/ScenarioBuilder";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import type { SimulationResult, ValidationError } from "@/lib/simulation";

export default function Home() {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-12">
      <header>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-blue-700">
          HackAlem AI
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
          Аким на 5 часов
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Выберите пять городских инициатив, распределите бюджет и увидьте, как меняется качество жизни в районах Астаны.</p>
      </header>
      {errors.length > 0 && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-semibold">Сценарий нужно исправить:</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error, index) => <li key={`${error.code}-${index}`}>{error.message}</li>)}</ul></section>}
      <ScenarioBuilder onSimulate={setResult} onErrors={setErrors} />
      {result && <ResultsDashboard result={result} />}
    </main>
  );
}
