export const INDICATOR_IDS = [
  "T1",
  "T2",
  "E1",
  "E2",
  "S1",
  "S2",
  "B1",
  "B2",
  "C1",
  "C2",
] as const;

export type IndicatorId = (typeof INDICATOR_IDS)[number];

export type Category =
  | "transport"
  | "ecology"
  | "social"
  | "safety"
  | "services";

export type DistrictId = "yesil" | "almaty" | "saryarka" | "baikonur" | "nura";

export type MeasureScope = "district" | "city";

export type IndicatorRecord = Record<IndicatorId, number>;

export type District = {
  id: DistrictId;
  name: string;
  populationShare: number;
  indicators: IndicatorRecord;
};

export type Measure = {
  id: string;
  category: Category;
  name: string;
  scope: MeasureScope;
  cost: number;
  lag: number;
  effects: Partial<Record<IndicatorId, number>>;
};

export type Decision = {
  measureId: string;
  districtId?: DistrictId;
};

export type ScenarioInput = {
  decisions: Decision[];
};

export type ValidationErrorCode =
  | "wrong-count"
  | "unknown-measure"
  | "duplicate-measure"
  | "budget"
  | "district-required"
  | "district-not-allowed"
  | "category-limit"
  | "incompatible";

export type ValidationError = {
  code: ValidationErrorCode;
  message: string;
  measureIds?: string[];
  districtId?: DistrictId;
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

export type DistrictResult = {
  id: DistrictId;
  name: string;
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  indicatorsBefore: IndicatorRecord;
  indicatorsAfter: IndicatorRecord;
  indicatorDeltas: Partial<Record<IndicatorId, number>>;
};

export type MeasureContribution = {
  measureId: string;
  districtId?: DistrictId;
  realizedEffects: Partial<Record<IndicatorId, number>>;
};

export type InvalidSimulationResult = {
  valid: false;
  errors: ValidationError[];
};

export type SimulationResult = {
  valid: true;
  budget: { limit: number; used: number; remaining: number };
  baselineScore: number;
  score: number;
  scoreDelta: number;
  cityAverageBefore: number;
  cityAverageAfter: number;
  weakestDistrictBefore: DistrictId;
  weakestDistrictAfter: DistrictId;
  districts: DistrictResult[];
  criticalIndicators: Array<{
    districtId: DistrictId;
    indicatorId: IndicatorId;
    value: number;
  }>;
  activatedSynergies: string[];
  contributions: MeasureContribution[];
};
