/**
 * 编排层：主分析流程
 * 协调各模块，实现完整的分析流程
 */

import { ensureArtifactsDir, writeReport } from "../output/report";
import { getChangedFiles, getChangedFilesWithDetails } from "../analysis/diff";
import { analyzeAST } from "../analysis/ast";
import { analyzeDependencyGraph } from "../analysis/dependency";
import { analyzeImpactWithLLM } from "../core/llm";
import { computeConfidenceScore } from "../output/confidence";
import simpleGit from "simple-git";
import path from "path";
import fs from "fs";

/**
 * 核心分析逻辑（从 analyzer-core.ts 迁移）
 */
export async function runAnalysis(options: {
  repoUrl?: string;
  base: string;
  head: string;
  allFiles?: boolean;
  exts?: string[];
  workdir?: string;
  keepClone?: boolean;
  outPath?: string;
}): Promise<string> {
  const originalCwd = process.cwd();
  let analysisCwd: string | undefined;
  let cleanupDir: string | undefined;

  try {
    console.log("AI Impact Analyzer — MVP starting...");
    ensureArtifactsDir();

    const { repoUrl, base, head, allFiles, exts, workdir, keepClone, outPath } = options;

    // If repo URL provided, clone to temp dir and run analysis within that repo
    if (repoUrl) {
      const artifactsDir = path.join(originalCwd, "artifacts");
      if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);
      const targetDir = workdir
        ? path.isAbsolute(workdir) ? workdir : path.join(originalCwd, workdir)
        : path.join(artifactsDir, `repo-${Date.now()}`);
      console.log(`Cloning repo: ${repoUrl} -> ${targetDir}`);
      const gitRoot = simpleGit();
      await gitRoot.clone(repoUrl, targetDir, ["--depth", "1", "--no-single-branch"]);
      analysisCwd = targetDir;
      process.chdir(analysisCwd);
      if (!workdir && !keepClone) cleanupDir = targetDir;
      // Ensure both refs exist locally for diff
      const repoGit = simpleGit({ baseDir: analysisCwd });
      try {
        await repoGit.fetch(["origin", base.replace(/^origin\//, ""), head.replace(/^origin\//, "")]);
      } catch (e) {
        // best-effort; ignore
      }
    }

    console.log(`Computing diff: ${base}..${head}${analysisCwd ? ` (cwd=${analysisCwd})` : ""}`);
    const changed = await getChangedFiles(base, head, { cwd: analysisCwd, allFiles, exts });
    console.log("Changed files:", changed);

    console.log("Analyzing change details...");
    const changedDetails = await getChangedFilesWithDetails(base, head, { cwd: analysisCwd, allFiles, exts });

    // AST 分析
    const { affected } = await analyzeAST(changed);
    console.log("AST analysis completed.");

    // 依赖分析
    const dependencyGraph = await analyzeDependencyGraph(analysisCwd || ".");
    console.log("Dependency analysis completed.");

    const risk = (process.env.IMPACT_RISK as any) || 'balanced';
    const maxTests = process.env.IMPACT_MAX_TESTS ? Number(process.env.IMPACT_MAX_TESTS) : 8;
    const llmResult = await analyzeImpactWithLLM(changed, affected, dependencyGraph, {
      base,
      head,
      repoUrl,
      changedDetails,
      policy: { risk_threshold: risk, max_test_suggestions: maxTests },
      project_hints: {
        routing: [],
        test_conventions: ['tests/e2e/*.cy.ts', 'tests/unit/*.spec.ts'],
        component_roots: ['src/components', 'src/pages'],
      },
    });

    const { value: confidenceValue, factors: confidenceFactors } = computeConfidenceScore({
      llmResult,
      changedFilesCount: changed.length,
    });
    llmResult.confidence = confidenceValue;
    (llmResult as any).confidence_factors = confidenceFactors;

    // Write report from original workspace to keep artifacts centralized
    if (analysisCwd) {
      process.chdir(originalCwd);
    }
    const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-");
    const defaultOut = path.join("artifacts", `report-${sanitize(base)}..${sanitize(head)}-${Date.now()}.md`);
    const finalOutPath = outPath || defaultOut;
    const report = writeReport({ changed, affected, llmResult }, { outPath: finalOutPath });

    if (cleanupDir) {
      try {
        fs.rmSync(cleanupDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`Failed to remove temp repo at ${cleanupDir}:`, err);
      }
    }

    console.log("\n=== GENERATED REPORT ===\n");
    console.log(`Report saved to: ${finalOutPath}`);

    return finalOutPath;
  } catch (err) {
    if (analysisCwd && process.cwd() !== originalCwd) {
      try {
        process.chdir(originalCwd);
      } catch (_) {
        // ignore
      }
    }
    if (cleanupDir) {
      try {
        fs.rmSync(cleanupDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn(`Cleanup error for ${cleanupDir}:`, cleanupErr);
      }
    }
    throw err;
  }
}

