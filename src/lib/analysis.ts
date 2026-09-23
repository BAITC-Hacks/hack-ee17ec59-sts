import { CONFIG, DISTRICTS, MEASURE_BY_ID } from "./simulation";
import type { DistrictId, IndicatorId, SimulationResult } from "./simulation";

export type AnalysisResponse = {
  executiveSummary: string;
  strengths: string[];
  tradeoffs: string[];
  risks: string[];
  weakestDistrictInsight: string;
  recommendation: string;
  source: "openai" | "fallback";
};

function rounded(value: number): number {
  const valueRounded = Number(value.toFixed(2));
  return valueRounded === 0 ? 0 : valueRounded;
}

const formatNumber = (value: number) => rounded(value).toFixed(2);
const formatDelta = (value: number) => {
  const valueRounded = rounded(value);
  return valueRounded > 0
    ? "+" + valueRounded.toFixed(2)
    : valueRounded < 0
      ? "−" + Math.abs(valueRounded).toFixed(2)
      : "0.00";
};

function districtName(id: DistrictId): string {
  return DISTRICTS.find((district) => district.id === id)?.name ?? "Неизвестный район";
}

function indicatorName(id: IndicatorId): string {
  return CONFIG.indicator_names[id] ?? "неизвестный показатель";
}

function criticalDescription(item: SimulationResult["criticalIndicators"][number]): string {
  return districtName(item.districtId) + " — «" + indicatorName(item.indicatorId) + "» (" + formatNumber(item.value) + ")";
}

function negativeIndicatorChanges(result: SimulationResult) {
  return result.districts.flatMap((district) =>
    (Object.entries(district.indicatorDeltas) as [IndicatorId, number][])
      .filter(([, value]) => rounded(value) < 0)
      .map(([indicatorId, value]) => ({
        district: district.name,
        indicator: indicatorName(indicatorId),
        delta: value,
      })),
  ).sort((left, right) => left.delta - right.delta);
}

/** Human-readable evidence for the LLM; internal IDs and unrounded floats stay server-side. */
export function buildAnalysisContext(result: SimulationResult): string {
  const criticalIndicators = result.criticalIndicators.map((item) => ({
    Район: districtName(item.districtId),
    Показатель: indicatorName(item.indicatorId),
    Значение: formatNumber(item.value),
  }));
  const districtChanges = result.districts.map((district) => ({
    Район: district.name,
    "Балл до": formatNumber(district.scoreBefore),
    "Балл после": formatNumber(district.scoreAfter),
    Изменение: formatDelta(district.scoreDelta),
  }));
  const indicatorChanges = negativeIndicatorChanges(result).map((item) => ({
    Район: item.district,
    Показатель: item.indicator,
    Изменение: formatDelta(item.delta),
  }));
  const initiativeEffects = result.contributions.map((contribution) => ({
    Инициатива: MEASURE_BY_ID.get(contribution.measureId)?.name ?? "Неизвестная инициатива",
    Территория: contribution.districtId ? districtName(contribution.districtId) : "Весь город",
    Эффекты: (Object.entries(contribution.realizedEffects) as [IndicatorId, number][])
      .filter(([, value]) => rounded(value) !== 0)
      .map(([indicatorId, value]) => ({
        Показатель: indicatorName(indicatorId),
        Изменение: formatDelta(value),
      })),
  }));

  return JSON.stringify({
    "Городской результат": {
      "Score до": formatNumber(result.baselineScore),
      "Score после": formatNumber(result.score),
      "Изменение Score": formatDelta(result.scoreDelta),
      "Средний балл районов до": formatNumber(result.cityAverageBefore),
      "Средний балл районов после": formatNumber(result.cityAverageAfter),
      "Бюджет использован": result.budget.used + " из " + result.budget.limit,
    },
    "Самый слабый район до плана": districtName(result.weakestDistrictBefore),
    "Самый слабый район после плана": districtName(result.weakestDistrictAfter),
    "Результаты по районам": districtChanges,
    "Критические показатели после плана": criticalIndicators,
    "Показатели, которые снизились": indicatorChanges,
    "Фактические эффекты инициатив": initiativeEffects,
  }, null, 2);
}

export function buildFallbackAnalysis(result: SimulationResult): AnalysisResponse {
  const weakest = result.districts.find((district) => district.id === result.weakestDistrictAfter);
  const strongest = [...result.districts].sort((left, right) => right.scoreDelta - left.scoreDelta)[0];
  const improvedDistrictCount = result.districts.filter((district) => rounded(district.scoreDelta) > 0).length;
  const weakestCriticalIndicators = result.criticalIndicators.filter((item) => item.districtId === result.weakestDistrictAfter);
  const negativeChanges = negativeIndicatorChanges(result);
  const scoreChange = rounded(result.scoreDelta);
  const scoreAction = scoreChange > 0 ? "повысил" : scoreChange < 0 ? "снизил" : "не изменил";

  const criticalText = result.criticalIndicators.length > 0
    ? "После плана критическими остаются: " + result.criticalIndicators.slice(0, 4).map(criticalDescription).join("; ") + "."
    : "После плана критических показателей ниже порога не осталось.";

  return {
    executiveSummary:
      "План " + scoreAction + " городской Score с " + formatNumber(result.baselineScore) +
      " до " + formatNumber(result.score) + " (" + formatDelta(result.scoreDelta) +
      "). Средний балл районов изменился с " + formatNumber(result.cityAverageBefore) +
      " до " + formatNumber(result.cityAverageAfter) + ". Использовано " +
      result.budget.used + " из " + result.budget.limit + " единиц бюджета.",
    strengths: [
      strongest && rounded(strongest.scoreDelta) > 0
        ? "Наибольший прирост районного балла — в районе " + strongest.name + ": " + formatDelta(strongest.scoreDelta) + "."
        : "Положительного прироста районного балла не выявлено.",
      "Районный балл улучшился в " + improvedDistrictCount + " из " + result.districts.length + " районов.",
    ],
    tradeoffs: negativeChanges.length > 0
      ? negativeChanges.slice(0, 3).map((item) =>
        "В районе " + item.district + " снизился показатель «" + item.indicator + "» (" + formatDelta(item.delta) + ").",
      )
      : ["Отрицательных изменений отдельных показателей не выявлено."],
    risks: result.criticalIndicators.length > 0
      ? [criticalText]
      : ["Перед запуском следует проверить стоимость и сроки реализации мер."],
    weakestDistrictInsight: weakest
      ? weakest.name + " остаётся слабейшим районом после плана (районный балл " + formatNumber(weakest.scoreAfter) + "). " +
        (weakestCriticalIndicators.length > 0
          ? "Критические показатели: " + weakestCriticalIndicators.map((item) =>
            "«" + indicatorName(item.indicatorId) + "» (" + formatNumber(item.value) + ")",
          ).join("; ") + "."
          : "Критических показателей ниже порога в этом районе не осталось.")
      : "Данные о слабейшем районе недоступны.",
    recommendation: weakestCriticalIndicators.length > 0
      ? "Следующую итерацию направить на " + (weakest?.name ?? "слабейший район") +
        " и его критические показатели: " + weakestCriticalIndicators.map((item) => "«" + indicatorName(item.indicatorId) + "»").join(", ") + "."
      : "Следующую итерацию сравнить по районной сбалансированности и стоимости.",
    source: "fallback",
  };
}
