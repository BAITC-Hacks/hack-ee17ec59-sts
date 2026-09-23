import { z } from "zod";
import rawConfig from "../../../data/config.json";
import rawDistricts from "../../../data/districts.json";
import rawCatalogue from "../../../data/measures.json";
import { INDICATOR_IDS, type District, type Measure } from "./types";

// Validation/adaptation only: data/*.json is the sole numerical catalogue.
const districtId = z.enum(["yesil", "almaty", "saryarka", "baikonur", "nura"]);
const category = z.enum(["transport", "ecology", "social", "safety", "services"]);
const indicator = z.enum(INDICATOR_IDS);
const effects = z.partialRecord(indicator, z.number().finite());
export const CONFIG = z.object({
  budget: z.number().positive(), horizon: z.number().int().positive(),
  n_decisions: z.number().int().positive(), max_per_direction: z.number().int().positive(),
  crit_threshold: z.number(), crit_penalty: z.number().nonnegative(),
  w_avg: z.number().nonnegative(), w_min: z.number().nonnegative(),
  weights: z.record(indicator, z.number().nonnegative()),
  indicator_names: z.record(indicator, z.string()),
  directions: z.record(category, z.string()),
}).parse(rawConfig);
const districts = z.array(z.object({
  id: districtId, name: z.string(), pop: z.number().positive(),
  I: z.record(indicator, z.number().min(0).max(100)),
})).length(5).parse(rawDistricts);
const catalogue = z.object({
  measures: z.array(z.object({
    id: z.string(), dir: category, name: z.string(), scope: z.enum(["district", "city"]),
    cost: z.number().nonnegative(), lag: z.number().int().min(0).max(CONFIG.horizon), effects,
  })),
  synergies: z.array(z.object({ pair: z.tuple([z.string(), z.string()]), target: z.string(), effects })),
  conflicts: z.array(z.object({ pair: z.tuple([z.string(), z.string()]), rule: z.enum(["any", "same_district"]), reason: z.string() })),
}).parse(rawCatalogue);
const approximatelyOne = (values: number[]) => Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 1e-9;
if (!approximatelyOne(Object.values(CONFIG.weights)) || !approximatelyOne(districts.map(d => d.pop)) ||
    !approximatelyOne([CONFIG.w_avg, CONFIG.w_min])) {
  throw new Error("Сумма весов и долей населения должна равняться 1");
}
if (new Set(districts.map(d => d.id)).size !== districts.length ||
    new Set(catalogue.measures.map(m => m.id)).size !== catalogue.measures.length) {
  throw new Error("Повторяющиеся ID в каталоге");
}
export const BUDGET_LIMIT = CONFIG.budget;
export const SIMULATION_HORIZON = CONFIG.horizon;
export const INDICATOR_WEIGHTS = CONFIG.weights;
export const DISTRICTS: District[] = districts.map(d => ({
  id: d.id, name: d.name, populationShare: d.pop, indicators: d.I,
}));
export const MEASURES: Measure[] = catalogue.measures.map(m => ({
  id: m.id, category: m.dir, name: m.name, scope: m.scope, cost: m.cost, lag: m.lag, effects: m.effects,
}));
export const MEASURE_BY_ID = new Map(MEASURES.map(m => [m.id, m]));
export const SYNERGIES = catalogue.synergies.map(s => ({
  key: s.pair.join("+"), measureIds: s.pair, targetMeasureId: s.target, effects: s.effects,
}));
export const GLOBAL_INCOMPATIBILITIES = catalogue.conflicts.filter(c => c.rule === "any").map(c => c.pair);
export const LOCAL_INCOMPATIBILITIES = catalogue.conflicts.filter(c => c.rule === "same_district").map(c => c.pair);
for (const rule of [...catalogue.synergies, ...catalogue.conflicts]) {
  if (!rule.pair.every(id => MEASURE_BY_ID.has(id))) throw new Error("Неизвестная мера в правилах");
}
for (const rule of catalogue.synergies) {
  if (!rule.pair.includes(rule.target) || MEASURE_BY_ID.get(rule.target)?.scope !== "district") {
    throw new Error("Некорректная цель синергии");
  }
}
