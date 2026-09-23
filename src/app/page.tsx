"use client";

import { useState } from "react";
import { ScenarioBuilder } from "@/components/scenario/ScenarioBuilder";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import { AdviceCard } from "@/components/results/AdviceCard";
import { AgentPanel } from "@/components/agent-panel/AgentPanel";
import { compareAdvice, scenarioKey, type AdviceProposal } from "@/lib/simulation/advice";
import { simulateScenario } from "@/lib/simulation/simulate";
import type { ScenarioInput, SimulationResult, ValidationError } from "@/lib/simulation";

type CalculatedScenario = { scenario: ScenarioInput; result: SimulationResult };

export default function Home() {
  const [calculated, setCalculated] = useState<CalculatedScenario | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [editor, setEditor] = useState<{ revision: number; initialScenario?: ScenarioInput }>({ revision: 0 });
  const [undo, setUndo] = useState<ScenarioInput | null>(null);
  const [notice, setNotice] = useState("");

  function invalidateResult() {
    setCalculated(null);
    setUndo(null);
    setNotice("");
  }

  function applyAdvice(proposal: AdviceProposal) {
    if (!calculated) return;
    const checked = compareAdvice(calculated.scenario, proposal);
    if (!checked.valid) { setNotice(checked.message); return; }
    const { scenario, after } = checked.comparison;
    setUndo(structuredClone(calculated.scenario));
    setEditor(current => ({ revision: current.revision + 1, initialScenario: scenario }));
    setCalculated({ scenario, result: after });
    setErrors([]);
    setNotice("Совет применён: решения, бюджет и Score пересчитаны.");
  }

  function undoAdvice() {
    if (!undo) return;
    const result = simulateScenario(undo);
    if (!result.valid) return;
    setEditor(current => ({ revision: current.revision + 1, initialScenario: undo }));
    setCalculated({ scenario: undo, result });
    setUndo(null);
    setErrors([]);
    setNotice("Предыдущий сценарий восстановлен.");
  }

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
      <ScenarioBuilder
        key={editor.revision}
        initialScenario={editor.initialScenario}
        initialResult={calculated?.result}
        onSimulate={(result, scenario) => { setCalculated({ result, scenario }); if (!undo) setNotice(""); }}
        onErrors={setErrors}
        onChange={invalidateResult}
        aside={notice || calculated ? <div className="space-y-5">
          {notice && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
            <p>{notice}</p>
            {undo && <button type="button" onClick={undoAdvice} className="rounded-full border border-blue-300 bg-white px-4 py-2 font-semibold hover:bg-blue-100">Отменить совет</button>}
          </div>}
          {calculated && <>
            <AdviceCard key={scenarioKey(calculated.scenario)} scenario={calculated.scenario} onApply={applyAdvice} />
            <ResultsDashboard result={calculated.result} />
            <AgentPanel key={scenarioKey(calculated.scenario)} scenario={calculated.scenario} />
          </>}
        </div> : null}
      />
    </main>
  );
}
