
import fs from "fs";
import path from "path";

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(markdown: string | undefined, heading: string): string | null {
  if (!markdown) return null;
  const pattern = new RegExp(`(^|\\n)${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const match = markdown.match(pattern);
  if (!match) return null;
  const content = match[2].trim();
  return content.length > 0 ? content : null;
}

export function ensureArtifactsDir() {
  const dir = path.join(process.cwd(), "artifacts");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
}

export function writeReport(payload: any, options?: { outPath?: string }): string {
  const lines: string[] = [];
  const r = payload.llmResult || payload.llm || {};
  const hasLLMMarkdown = Boolean(r.markdown_report && r.markdown_report.trim());
  const hasStructuredContent =
    (Array.isArray(r.page_impacts) && r.page_impacts.length > 0) ||
    (Array.isArray(r.public_components) && r.public_components.length > 0) ||
    (Array.isArray(r.public_modules) && r.public_modules.length > 0) ||
    (Array.isArray(r.test_suggestions) && r.test_suggestions.length > 0) ||
    (Array.isArray(r.unknowns) && r.unknowns.some(Boolean)) ||
    Boolean(r.change_motivation);

  lines.push("# 🤖 AI 变更影响分析报告");
  lines.push("");

  if (hasStructuredContent) {
    lines.push("### 一、总体变更分析");
    lines.push("");
    if (r.change_motivation && r.change_motivation.trim().length > 0) {
      lines.push(r.change_motivation);
    } else {
      lines.push("⚠️ 未获取到总体变更分析信息");
    }
    lines.push("");
    
    lines.push("");
    lines.push("### 二、影响面分析（按页面维度）");
    lines.push("");
    
    if (r.page_impacts && r.page_impacts.length > 0) {
      for (const pageImpact of r.page_impacts) {
        lines.push(`### ${pageImpact.page_name || pageImpact.page}`);
        lines.push("");
        lines.push(`**页面路径**: \`${pageImpact.page}\``);
        lines.push("");
        lines.push("**路由信息**:");
        if (pageImpact.routes && pageImpact.routes.length > 0) {
          for (const route of pageImpact.routes) {
            lines.push(`- ${route}`);
          }
        } else if (pageImpact.page) {
          lines.push(`- ${pageImpact.page}（按页面路径推断）`);
        } else {
          lines.push("- ⚠️ 未识别到路由定义");
        }
        lines.push("");
        
        // 变更文件列表
        if (pageImpact.changed_files && pageImpact.changed_files.length > 0) {
          lines.push("**变更文件**:");
          for (const file of pageImpact.changed_files) {
            lines.push(`- ${file}`);
          }
          lines.push("");
        }
        
        // 受影响组件（非公共）
        if (pageImpact.affected_components && pageImpact.affected_components.length > 0) {
          lines.push("**受影响组件**:");
          for (const comp of pageImpact.affected_components) {
            lines.push(`- **${comp.component}**`);
            if (comp.affected_functions && comp.affected_functions.length > 0) {
              lines.push(`  - 受影响函数/方法: ${comp.affected_functions.join(', ')}`);
            }
            if (comp.affected_features && comp.affected_features.length > 0) {
              lines.push(`  - 受影响功能点: ${comp.affected_features.join(', ')}`);
            }
          }
          lines.push("");
        }
        
        // 受影响模块（非公共）
        if (pageImpact.affected_modules && pageImpact.affected_modules.length > 0) {
          lines.push("**受影响模块**:");
          for (const mod of pageImpact.affected_modules) {
            lines.push(`- **${mod.module}**`);
            if (mod.affected_functions && mod.affected_functions.length > 0) {
              lines.push(`  - 受影响函数/方法: ${mod.affected_functions.join(', ')}`);
            }
          }
          lines.push("");
        }
        
        // 受影响业务流程
        if (pageImpact.business_flows && pageImpact.business_flows.length > 0) {
          lines.push("**受影响业务流程**:");
          for (const flow of pageImpact.business_flows) {
            lines.push(`- ${flow}`);
          }
          lines.push("");
        }
        
        // 业务功能逻辑（合并到页面中）
        if (pageImpact.business_logic && pageImpact.business_logic.trim().length > 0) {
          lines.push("**业务功能逻辑**:");
          lines.push("");
          lines.push(pageImpact.business_logic);
          lines.push("");
        }
        
        // 风险评估（合并到页面中）
        if (pageImpact.risks && pageImpact.risks.length > 0) {
          lines.push("**风险评估**:");
          for (const risk of pageImpact.risks) {
            if (!risk) continue;
            if (typeof risk === "string") {
              lines.push(risk);
              continue;
            }
            const title = risk.item || risk.description || risk.raw || "未命名风险";
            lines.push(`- ${title}`);
            if (risk.affected_feature) {
              lines.push(`  - 关联功能点: ${risk.affected_feature}`);
            }
            if (risk.evidence) {
              lines.push(`  - 证据: ${risk.evidence}`);
            }
          }
          lines.push("");
        }
        
        lines.push("---");
        lines.push("");
      }
    } else {
      lines.push("⚠️ 未获取到页面维度的影响面分析信息");
      lines.push("");
    }
    
    // 公共组件
    if (r.public_components && r.public_components.length > 0) {
      lines.push("### 公共组件影响分析");
      lines.push("");
      for (const pubComp of r.public_components) {
        lines.push(`#### ${pubComp.component}`);
        lines.push("");
        if (pubComp.affected_pages && pubComp.affected_pages.length > 0) {
          lines.push("**可能影响的页面**:");
          for (const page of pubComp.affected_pages) {
            lines.push(`- ${page}`);
          }
          lines.push("");
        }
        if (pubComp.affected_functions && pubComp.affected_functions.length > 0) {
          lines.push(`**受影响函数/方法**: ${pubComp.affected_functions.join(', ')}`);
          lines.push("");
        }
        if (pubComp.affected_features && pubComp.affected_features.length > 0) {
          lines.push(`**受影响功能点**: ${pubComp.affected_features.join(', ')}`);
          lines.push("");
        }
        if (pubComp.business_logic && pubComp.business_logic.trim().length > 0) {
          lines.push("**业务功能逻辑**:");
          lines.push("");
          lines.push(pubComp.business_logic);
          lines.push("");
        }
        if (pubComp.risks && pubComp.risks.length > 0) {
          lines.push("**风险评估**:");
          for (const risk of pubComp.risks) {
            if (!risk) continue;
            if (typeof risk === "string") {
              lines.push(risk);
              continue;
            }
            const title = risk.item || risk.description || risk.raw || "未命名风险";
            lines.push(`- ${title}`);
            if (risk.evidence) {
              lines.push(`  - 证据: ${risk.evidence}`);
            }
          }
          lines.push("");
        }
        lines.push("---");
        lines.push("");
      }
    }
    
    // 公共模块
    if (r.public_modules && r.public_modules.length > 0) {
      lines.push("### 公共模块影响分析");
      lines.push("");
      for (const pubMod of r.public_modules) {
        lines.push(`#### ${pubMod.module}`);
        lines.push("");
        if (pubMod.affected_pages && pubMod.affected_pages.length > 0) {
          lines.push("**可能影响的页面**:");
          for (const page of pubMod.affected_pages) {
            lines.push(`- ${page}`);
          }
          lines.push("");
        }
        if (pubMod.affected_functions && pubMod.affected_functions.length > 0) {
          lines.push(`**受影响函数/方法**: ${pubMod.affected_functions.join(', ')}`);
          lines.push("");
        }
        if (pubMod.business_logic && pubMod.business_logic.trim().length > 0) {
          lines.push("**业务功能逻辑**:");
          lines.push("");
          lines.push(pubMod.business_logic);
          lines.push("");
        }
        if (pubMod.risks && pubMod.risks.length > 0) {
          lines.push("**风险评估**:");
          for (const risk of pubMod.risks) {
            if (!risk) continue;
            if (typeof risk === "string") {
              lines.push(risk);
              continue;
            }
            const title = risk.item || risk.description || risk.raw || "未命名风险";
            lines.push(`- ${title}`);
            if (risk.evidence) {
              lines.push(`  - 证据: ${risk.evidence}`);
            }
          }
          lines.push("");
        }
        lines.push("---");
        lines.push("");
      }
    }
    
    const testSectionRaw = extractSection(r.markdown_report, "## 三、测试建议");
    lines.push("### 三、测试建议");
    lines.push("");
    if (testSectionRaw) {
      lines.push(testSectionRaw);
      lines.push("");
    } else if (Array.isArray(r.test_suggestions) && r.test_suggestions.length > 0) {
      for (const entry of r.test_suggestions) {
        if (typeof entry === "string") {
          lines.push(entry);
        } else if (entry?.raw) {
          lines.push(entry.raw);
        } else if (entry) {
          lines.push(JSON.stringify(entry, null, 2));
        }
      }
      lines.push("");
    } else if (hasLLMMarkdown) {
      lines.push("⚠️ 未提供结构化测试建议（请参考附录原文）");
      lines.push("");
    } else {
      lines.push("⚠️ 未提供测试建议");
      lines.push("");
    }
    
    // 不确定项
    const unknownSectionRaw = extractSection(r.markdown_report, "## 四、不确定项与验证方法");
    const normalizedUnknowns = Array.isArray(r.unknowns) ? r.unknowns.filter(Boolean) : [];
    if (unknownSectionRaw) {
      lines.push("### 四、不确定项与验证方法");
      lines.push("");
      lines.push(unknownSectionRaw);
      lines.push("");
    } else if (normalizedUnknowns.length > 0) {
      lines.push("### 四、不确定项与验证方法");
      lines.push("");
      for (const item of normalizedUnknowns) {
        if (typeof item === "string") {
          lines.push(item);
          continue;
        }
        if (item?.raw) {
          lines.push(item.raw);
          continue;
        }
        const question = item.question || item.title || item.description;
        const why = item.why_it_matters || item.why || item.reason;
        const how = item.how_to_verify || item.solution || item.action;
        if (question) lines.push(`- ${question}`);
        if (why) lines.push(`  - 重要性: ${why}`);
        if (how) lines.push(`  - 验证方法: ${how}`);
        if (!question && !why && !how) {
          lines.push(JSON.stringify(item, null, 2));
        }
      }
      lines.push("");
    } else if (hasLLMMarkdown) {
      lines.push("### 四、不确定项与验证方法");
      lines.push("");
      lines.push("⚠️ 未提供结构化不确定项（请参考附录原文）");
      lines.push("");
    }
  } else if (!hasLLMMarkdown) {
    // 无结构化且无 LLM 内容，回退为最基础信息
    lines.push("## 📋 变更文件列表");
    lines.push("");
    for (const f of payload.changed || []) {
      lines.push(`- ${f}`);
    }
    lines.push("");
    lines.push("## 🔍 AST 快照信息");
    lines.push("");
    for (const a of payload.affected || []) {
      const exports = a.exportNames || [];
      const components = a.components || [];
      const functions = a.functions || [];
      const methods = a.methods || [];
      lines.push(`- **${a.file}**:`);
      if (exports.length) lines.push(`  - 导出: ${exports.join(', ')}`);
      if (components.length) lines.push(`  - 组件: ${components.join(', ')}`);
      if (functions.length) lines.push(`  - 函数: ${functions.join(', ')}`);
      if (methods.length) lines.push(`  - 方法: ${methods.join(', ')}`);
      if (!exports.length && !components.length && !functions.length && !methods.length) {
        lines.push(`  - ⚠️ 未识别到代码实体（可能是Vue文件解析问题或其他原因）`);
      }
    }
    lines.push("");
    lines.push("## 🔍 AST 快照信息");
    lines.push("");
    for (const a of payload.affected || []) {
      const exports = a.exportNames || [];
      const components = a.components || [];
      const functions = a.functions || [];
      const methods = a.methods || [];
      lines.push(`- **${a.file}**:`);
      if (exports.length) lines.push(`  - 导出: ${exports.join(', ')}`);
      if (components.length) lines.push(`  - 组件: ${components.join(', ')}`);
      if (functions.length) lines.push(`  - 函数: ${functions.join(', ')}`);
      if (methods.length) lines.push(`  - 方法: ${methods.join(', ')}`);
      if (!exports.length && !components.length && !functions.length && !methods.length) {
        lines.push(`  - ⚠️ 未识别到代码实体（可能是Vue文件解析问题或其他原因）`);
      }
    }
    lines.push("");
  }
  
  // 错误信息（如果有）
  if (r.source === 'openai_error' && r.error) {
    lines.push("## ⚠️ LLM 调用错误");
    lines.push("");
    lines.push(`**错误信息**:`);
    lines.push("```");
    lines.push(r.error);
    lines.push("```");
    lines.push("");
  }

  // 分析置信度与数据来源（位于底部，二者并列展示）
  lines.push("## 分析置信度与数据来源");
  lines.push("");
  const confidenceText = r.confidence !== undefined ? `${(r.confidence * 100).toFixed(1)}%` : "n/a";
  lines.push(`- **分析置信度**: ${confidenceText}`);
  if (Array.isArray(r.confidence_factors) && r.confidence_factors.length) {
    lines.push(`  - 依据: ${r.confidence_factors.join("；")}`);
  }
  lines.push(`- **数据来源**: ${r.source || "未知"}`);
  lines.push("");

  // LLM 原始输出折叠在附录
  if (hasLLMMarkdown) {
    lines.push("## 附录：LLM 原始输出");
    lines.push("");
    lines.push("<details>");
    lines.push("<summary>点击展开/收起 LLM 原文</summary>");
    lines.push("");
    lines.push(r.markdown_report.trim());
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  const out = lines.join("\n");
  const target = (() => {
    if (options?.outPath) {
      const p = path.isAbsolute(options.outPath) ? options.outPath : path.join(process.cwd(), options.outPath);
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return p;
    }
    const defaultDir = path.join(process.cwd(), "artifacts");
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
    return path.join(defaultDir, "report.md");
  })();
  fs.writeFileSync(target, out, "utf-8");
  return out;
}

