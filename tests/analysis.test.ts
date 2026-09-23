import { describe, expect, it } from "vitest";
import { buildAnalysisContext, buildFallbackAnalysis } from "../src/lib/analysis";
import { simulateScenario } from "../src/lib/simulation";

const worstScenario = {
  decisions: [
    { measureId: "M8", districtId: "baikonur" as const },
    { measureId: "M9", districtId: "baikonur" as const },
    { measureId: "M10", districtId: "baikonur" as const },
    { measureId: "M11", districtId: "almaty" as const },
    { measureId: "M13", districtId: "baikonur" as const },
  ],
};

const appliedAdviceScenario = {
  decisions: [
    { measureId: "M8", districtId: "baikonur" as const },
    { measureId: "M9", districtId: "baikonur" as const },
    { measureId: "M10", districtId: "baikonur" as const },
    { measureId: "M11", districtId: "almaty" as const },
    { measureId: "M2" },
  ],
};

function resultFixture() {
  const result = simulateScenario(worstScenario);
  if (!result.valid) throw new Error("Expected a valid analysis fixture");
  return result;
}

function appliedAdviceResultFixture() {
  const result = simulateScenario(appliedAdviceScenario);
  if (!result.valid) throw new Error("Expected a valid applied-advice fixture");
  return result;
}

describe("mayor memo facts", () => {
  it("formats calculated values to two decimals and uses readable district and indicator names", () => {
    const result = resultFixture();
    const analysis = buildFallbackAnalysis(result);
    const copy = [
      analysis.executiveSummary,
      ...analysis.strengths,
      ...analysis.tradeoffs,
      ...analysis.risks,
      analysis.weakestDistrictInsight,
      analysis.recommendation,
    ].join(" ");

    expect(analysis.executiveSummary).toContain(result.baselineScore.toFixed(2));
    expect(analysis.executiveSummary).toContain(result.score.toFixed(2));
    expect(copy).toContain("Байконур");
    expect(copy).toContain("Нура");
    expect(analysis.weakestDistrictInsight).toContain("Школы и детсады");
    expect(analysis.weakestDistrictInsight).toContain("38.00");
    expect(analysis.weakestDistrictInsight).toContain("Поликлиники");
    expect(analysis.weakestDistrictInsight).toContain("35.00");
    expect(copy).not.toMatch(/[0-9]+\.[0-9]{3,}/);
    expect(copy).not.toMatch(/weakestDistrictAfter|criticalIndicators|realizedEffects|districtId|indicatorId|\bnura\b|\bbaikonur\b|\bS1\b|\bS2\b/i);
  });

  it("gives the model localized, rounded evidence instead of raw engine properties and IDs", () => {
    const context = buildAnalysisContext(resultFixture());

    expect(context).toContain("Нура");
    expect(context).toContain("Байконур");
    expect(context).toContain("Школы и детсады");
    expect(context).toContain("Поликлиники");
    expect(context).toContain("38.00");
    expect(context).not.toMatch(/weakestDistrictAfter|criticalIndicators|realizedEffects|indicatorDeltas|districtId|indicatorId|\bnura\b|\bbaikonur\b|\bS1\b|\bS2\b|\bM13\b/i);
    expect(context).not.toMatch(/[0-9]+\.[0-9]{3,}/);
  });

  it("rounds the exact applied-advice scenario that produced the confusing memo", () => {
    const result = appliedAdviceResultFixture();
    const analysis = buildFallbackAnalysis(result);

    expect(analysis.executiveSummary).toContain("52.56");
    expect(analysis.executiveSummary).toContain("53.45");
    expect(analysis.executiveSummary).toContain("56.86");
    expect(analysis.executiveSummary).toContain("57.92");
    expect(analysis.executiveSummary).not.toMatch(/[0-9]+\.[0-9]{3,}/);
    expect(analysis.weakestDistrictInsight).toContain("Нура");
    expect(analysis.weakestDistrictInsight).toContain("Школы и детсады");
    expect(analysis.weakestDistrictInsight).toContain("Поликлиники");
  });
});
