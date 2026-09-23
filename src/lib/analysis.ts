import type { SimulationResult } from "./simulation";

export type AnalysisResponse = {
  executiveSummary: string;
  strengths: string[];
  tradeoffs: string[];
  risks: string[];
  weakestDistrictInsight: string;
  recommendation: string;
  source: "openai" | "fallback";
};

const formatDelta = (delta: number) => `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;

export function buildFallbackAnalysis(result: SimulationResult): AnalysisResponse {
  const weakest = result.districts.find((district) => district.id === result.weakestDistrictAfter);
  const scoreDirection = result.scoreDelta >= 0 ? "вырос" : "снизился";
  const criticalText = result.criticalIndicators.length === 0
    ? "Критических показателей ниже 40 не осталось."
    : `Осталось критических значений: ${result.criticalIndicators.length}.`;

  return {
    executiveSummary: `Score ${scoreDirection} на ${formatDelta(result.scoreDelta)} и составил ${result.score.toFixed(2)}. Потрачено ${result.budget.used} из ${result.budget.limit} единиц бюджета.`,
    strengths: [
      `Самый слабый район после решений: ${weakest?.name ?? result.weakestDistrictAfter}.`,
      `Улучшения рассчитаны для ${result.districts.filter((district) => district.scoreDelta > 0).length} из 5 районов.`,
      criticalText,
    ],
    tradeoffs: [
      `Средневзвешенный городской балл изменился с ${result.cityAverageBefore.toFixed(2)} до ${result.cityAverageAfter.toFixed(2)}.`,
      result.activatedSynergies.length > 0
        ? `Сработали синергии: ${result.activatedSynergies.join(", ")}.`
        : "Синергии не активированы.",
    ],
    risks: result.criticalIndicators.length > 0
      ? ["Некоторые показатели все еще ниже критического порога 40.", "Нужно проверить, не осталось ли слишком много ресурсов в сильных районах."]
      : ["Следует проверить стоимость и сроки реализации мер перед практическим запуском."],
    weakestDistrictInsight: weakest
      ? `${weakest.name} имеет итоговый районный балл ${weakest.scoreAfter.toFixed(2)}. Его изменение составило ${formatDelta(weakest.scoreDelta)}.`
      : "Данные слабейшего района недоступны.",
    recommendation: result.criticalIndicators.length > 0
      ? "Следующий сценарий стоит направить на устранение оставшихся критических показателей, сохранив бюджетный лимит."
      : "Следующий сценарий можно сравнить по устойчивости результата и стоимости, а не только по максимальному Score.",
    source: "fallback",
  };
}
