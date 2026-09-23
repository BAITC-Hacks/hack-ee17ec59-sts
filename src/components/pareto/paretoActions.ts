"use server";

import { pareto } from "@/lib/simulation";
import type { ParetoPoint } from "@/lib/simulation";

export type ParetoPreview = Pick<ParetoPoint, "budget" | "score" | "cost">;

let cachedFront: ParetoPreview[] | null = null;

export async function loadParetoFront() {
  const started = performance.now();
  cachedFront ??= pareto(1).map(({ budget, score, cost }) => ({ budget, score, cost }));
  return { points: cachedFront, elapsedMs: performance.now() - started };
}
