"use server";

import { findBest, findWorst, scoreRank } from "@/lib/simulation";
import type { ScenarioInput } from "@/lib/simulation";

export async function loadOptimizedScenario(kind: "best" | "worst") {
  if (kind !== "best" && kind !== "worst") throw new Error("Неизвестный тип сценария");
  const started = performance.now();
  const optimized = kind === "best" ? findBest()[0] : findWorst()[0];
  if (!optimized) throw new Error("Не удалось подобрать сценарий");
  return {
    scenario: optimized.scenario,
    score: optimized.score,
    elapsedMs: performance.now() - started,
  };
}

export async function loadScenarioRank(input: ScenarioInput) {
  const started = performance.now();
  const rank = scoreRank(input);
  return { rank, elapsedMs: performance.now() - started };
}
