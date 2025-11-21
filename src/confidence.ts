type Risk = { severity?: string; item?: string };

function collectRisks(from: any[]): Risk[] {
  if (!Array.isArray(from)) return [];
  return from.flatMap(block => block?.risks || []);
}

export function computeConfidenceScore(params: {
  llmResult: any;
  changedFilesCount: number;
}) {
  const { llmResult, changedFilesCount } = params;
  const factors: string[] = [];

  // Base score inspired by industry playbooks (start high, subtract for risks/unknowns)
  let value = 0.94;

  // Adjust based on change size
  if (changedFilesCount > 30) {
    value -= 0.15;
    factors.push("一次涉及 30+ 个文件的大改动");
  } else if (changedFilesCount > 15) {
    value -= 0.1;
    factors.push("涉及 15-30 个文件的较大改动");
  } else if (changedFilesCount > 5) {
    value -= 0.05;
    factors.push("涉及 5-15 个文件的中等改动");
  } else {
    factors.push("改动范围较小（≤5 个文件）");
  }

  const pageRisks = collectRisks(llmResult?.page_impacts || []);
  const publicCompRisks = collectRisks(llmResult?.public_components || []);
  const publicModRisks = collectRisks(llmResult?.public_modules || []);
  const rootRisks = Array.isArray(llmResult?.risks) ? llmResult.risks : [];
  const allRisks: Risk[] = [...pageRisks, ...publicCompRisks, ...publicModRisks, ...rootRisks];

  const highRiskCount = allRisks.filter(r => (r?.severity || "").toLowerCase() === "high").length;
  if (highRiskCount > 0) {
    const penalty = Math.min(0.25, highRiskCount * 0.1);
    value -= penalty;
    factors.push(`检测到 ${highRiskCount} 个高风险项`);
  }

  const mediumRiskCount = allRisks.filter(r => (r?.severity || "").toLowerCase() === "medium").length;
  if (mediumRiskCount > 0) {
    const penalty = Math.min(0.15, mediumRiskCount * 0.05);
    value -= penalty;
    factors.push(`检测到 ${mediumRiskCount} 个中风险项`);
  }

  const unknownCount = Array.isArray(llmResult?.unknowns) ? llmResult.unknowns.length : 0;
  if (unknownCount > 0) {
    const penalty = Math.min(0.15, unknownCount * 0.05);
    value -= penalty;
    factors.push(`存在 ${unknownCount} 个待确认事项`);
  }

  if (!llmResult?.page_impacts || llmResult.page_impacts.length === 0) {
    value -= 0.05;
    factors.push("LLM 未能识别到明确的页面影响");
  }

  value = Math.min(0.98, Math.max(0.3, value));

  // Round to two decimals for consistency
  value = Math.round(value * 100) / 100;

  return { value, factors };
}

