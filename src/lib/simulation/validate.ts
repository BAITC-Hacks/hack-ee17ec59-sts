import {
  BUDGET_LIMIT,
  CONFIG,
  DISTRICTS,
  GLOBAL_INCOMPATIBILITIES,
  LOCAL_INCOMPATIBILITIES,
  MEASURE_BY_ID,
} from "./data";
import type { ScenarioInput, ValidationError, ValidationResult } from "./types";

export function validateScenario({ decisions }: ScenarioInput): ValidationResult {
  const errors: ValidationError[] = [];

  if (decisions.length !== CONFIG.n_decisions) {
    errors.push({ code: "wrong-count", message: `Нужно выбрать ровно ${CONFIG.n_decisions} разных мер.` });
  }

  const measures = decisions.map((decision) => MEASURE_BY_ID.get(decision.measureId));
  decisions.forEach((decision, index) => {
    if (!measures[index]) {
      errors.push({ code: "unknown-measure", message: `Мера ${decision.measureId} не найдена.`, measureIds: [decision.measureId] });
    }
  });

  const duplicateIds = decisions
    .map((decision) => decision.measureId)
    .filter((measureId, index, all) => all.indexOf(measureId) !== index);
  if (duplicateIds.length > 0) {
    errors.push({ code: "duplicate-measure", message: "Одну меру нельзя выбрать дважды.", measureIds: [...new Set(duplicateIds)] });
  }

  const knownMeasures = measures.filter((measure): measure is NonNullable<typeof measure> => Boolean(measure));
  const used = knownMeasures.reduce((sum, measure) => sum + measure.cost, 0);
  if (used > BUDGET_LIMIT) {
    errors.push({ code: "budget", message: `Бюджет превышен на ${used - BUDGET_LIMIT} единиц.` });
  }

  decisions.forEach((decision, index) => {
    const measure = measures[index];
    if (!measure) return;
    if (measure.scope === "district" && !decision.districtId) {
      errors.push({ code: "district-required", message: `${measure.id} требует выбора района.`, measureIds: [measure.id] });
    }
    if (measure.scope === "district" && decision.districtId && !DISTRICTS.some(d => d.id === decision.districtId)) {
      errors.push({ code: "district-invalid", message: `${measure.id}: неизвестный район.`, measureIds: [measure.id] });
    }
    if (measure.scope === "city" && decision.districtId) {
      errors.push({ code: "district-not-allowed", message: `${measure.id} действует на весь город и не принимает район.`, measureIds: [measure.id] });
    }
  });

  const categoryCounts = new Map<string, number>();
  knownMeasures.forEach((measure) => categoryCounts.set(measure.category, (categoryCounts.get(measure.category) ?? 0) + 1));
  categoryCounts.forEach((count, category) => {
    if (count > CONFIG.max_per_direction) {
      errors.push({ code: "category-limit", message: `В направлении ${CONFIG.directions[category as keyof typeof CONFIG.directions]} нельзя выбрать больше ${CONFIG.max_per_direction} мер.` });
    }
  });

  for (const [left, right] of GLOBAL_INCOMPATIBILITIES) {
    if (decisions.some((decision) => decision.measureId === left) && decisions.some((decision) => decision.measureId === right)) {
      errors.push({ code: "incompatible", message: `${left} и ${right} несовместимы в одном сценарии.`, measureIds: [left, right] });
    }
  }

  for (const [left, right] of LOCAL_INCOMPATIBILITIES) {
    const leftDecision = decisions.find((decision) => decision.measureId === left);
    const rightDecision = decisions.find((decision) => decision.measureId === right);
    if (leftDecision?.districtId && leftDecision.districtId === rightDecision?.districtId) {
      errors.push({ code: "incompatible", message: `${left} и ${right} нельзя выбрать в одном районе.`, measureIds: [left, right], districtId: leftDecision.districtId });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
