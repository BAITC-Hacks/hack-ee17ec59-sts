import type { District, IndicatorId, Measure } from "./types";

export const BUDGET_LIMIT = 100;
export const SIMULATION_HORIZON = 8;

export const INDICATOR_WEIGHTS: Record<IndicatorId, number> = {
  T1: 0.1,
  T2: 0.1,
  E1: 0.09,
  E2: 0.11,
  S1: 0.11,
  S2: 0.11,
  B1: 0.09,
  B2: 0.09,
  C1: 0.1,
  C2: 0.1,
};

export const DISTRICTS: District[] = [
  {
    id: "yesil",
    name: "Есиль",
    populationShare: 0.27,
    indicators: { T1: 45, T2: 62, E1: 68, E2: 72, S1: 48, S2: 55, B1: 78, B2: 60, C1: 75, C2: 70 },
  },
  {
    id: "almaty",
    name: "Алматы",
    populationShare: 0.24,
    indicators: { T1: 40, T2: 75, E1: 50, E2: 55, S1: 60, S2: 65, B1: 62, B2: 52, C1: 50, C2: 60 },
  },
  {
    id: "saryarka",
    name: "Сарыарка",
    populationShare: 0.2,
    indicators: { T1: 50, T2: 70, E1: 42, E2: 40, S1: 62, S2: 68, B1: 58, B2: 55, C1: 45, C2: 55 },
  },
  {
    id: "baikonur",
    name: "Байконур",
    populationShare: 0.13,
    indicators: { T1: 52, T2: 68, E1: 55, E2: 50, S1: 58, S2: 60, B1: 52, B2: 58, C1: 55, C2: 58 },
  },
  {
    id: "nura",
    name: "Нура",
    populationShare: 0.16,
    indicators: { T1: 55, T2: 40, E1: 45, E2: 65, S1: 38, S2: 35, B1: 55, B2: 50, C1: 60, C2: 50 },
  },
];

export const MEASURES: Measure[] = [
  { id: "M1", category: "transport", name: "Выделенные полосы для автобусов", scope: "district", cost: 18, lag: 2, effects: { T1: 6, T2: 9 } },
  { id: "M2", category: "transport", name: "Умные светофоры", scope: "city", cost: 22, lag: 2, effects: { T1: 4, B2: 3 } },
  { id: "M3", category: "transport", name: "Линия ЛРТ или расширение", scope: "district", cost: 30, lag: 4, effects: { T1: 16, T2: 20, E2: 4 } },
  { id: "M4", category: "ecology", name: "Парк или сквер", scope: "district", cost: 15, lag: 2, effects: { E1: 12, E2: 3, B1: 2 } },
  { id: "M5", category: "ecology", name: "Чистое топливо для частного сектора", scope: "district", cost: 25, lag: 3, effects: { E2: 14, C1: 4 } },
  { id: "M6", category: "ecology", name: "Озеленение и ветрозащитные полосы", scope: "city", cost: 20, lag: 4, effects: { E1: 5, E2: 3 } },
  { id: "M7", category: "social", name: "Школа и детсад", scope: "district", cost: 24, lag: 3, effects: { S1: 16 } },
  { id: "M8", category: "social", name: "Центр семейного здоровья", scope: "district", cost: 20, lag: 3, effects: { S2: 14 } },
  { id: "M9", category: "social", name: "Дворовые спорт хабы", scope: "district", cost: 10, lag: 1, effects: { S1: 3, S2: 3, B1: 3 } },
  { id: "M10", category: "safety", name: "Освещение и камеры Safe City", scope: "district", cost: 12, lag: 1, effects: { B1: 12, B2: 2 } },
  { id: "M11", category: "safety", name: "Безопасные переходы и школьные зоны", scope: "district", cost: 10, lag: 1, effects: { B2: 12, T1: -2 } },
  { id: "M12", category: "services", name: "Единая платформа обращений", scope: "city", cost: 14, lag: 1, effects: { C2: 5 } },
  { id: "M13", category: "services", name: "Модернизация тепло- и водосетей", scope: "district", cost: 28, lag: 4, effects: { C1: 18, E2: 2 } },
  { id: "M14", category: "services", name: "Аварийные бригады и раннее оповещение", scope: "city", cost: 16, lag: 1, effects: { C1: 5, C2: 2 } },
];

export const MEASURE_BY_ID = new Map(MEASURES.map((measure) => [measure.id, measure]));

export const SYNERGIES = [
  { key: "M1+M2", measureIds: ["M1", "M2"], indicatorId: "T1" as const, bonus: 2, targetMeasureId: "M1" },
  { key: "M10+M12", measureIds: ["M10", "M12"], indicatorId: "B1" as const, bonus: 2, targetMeasureId: "M10" },
  { key: "M5+M6", measureIds: ["M5", "M6"], indicatorId: "E2" as const, bonus: 2, targetMeasureId: "M5" },
];

export const GLOBAL_INCOMPATIBILITIES = [["M1", "M3"]] as const;
export const LOCAL_INCOMPATIBILITIES = [["M4", "M7"], ["M5", "M13"]] as const;
