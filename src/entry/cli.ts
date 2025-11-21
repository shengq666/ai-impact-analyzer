/**
 * CLI 入口
 * 处理命令行参数，调用编排层进行分析
 */

import { runAnalysis } from "../orchestration/analyzer";
import { loadConfig } from "../utils/config";

loadConfig();

async function main() {
  const argv = process.argv.slice(2);
  
  // 检查是否是 webhook 模式
  if (argv.includes("--webhook") || argv.includes("--server")) {
    const { createWebhookServer } = await import("./webhook");
    const port = process.env.WEBHOOK_PORT ? Number(process.env.WEBHOOK_PORT) : 3000;
    const webhookPath = process.env.WEBHOOK_PATH || "/webhook";
    createWebhookServer({
      port,
      path: webhookPath,
      secretToken: process.env.GITLAB_WEBHOOK_TOKEN,
      gitlabToken: process.env.GITLAB_API_TOKEN,
    });
    return; // 服务器会一直运行
  }

  // CLI 模式
  const getArg = (name: string) => {
    const idx = argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
    if (idx === -1) return undefined;
    const token = argv[idx];
    if (token.includes("=")) return token.split("=").slice(1).join("=") || undefined;
    return argv[idx + 1];
  };
  const cliBase = getArg("base");
  const cliHead = getArg("head");
  const repoUrl = getArg("repo") || process.env.IMPACT_REPO_URL;
  const workdirArg = getArg("workdir");
  const allFilesFlag = argv.includes("--all-files") || process.env.IMPACT_ALL_FILES === "true";
  const extsArg = getArg("exts");
  const parsedExts = extsArg ? extsArg.split(",").map(s => s.trim()).filter(Boolean) : undefined;
  const outArg = getArg("out") || process.env.IMPACT_REPORT;
  const keepClone = argv.includes("--keep-clone") || process.env.IMPACT_KEEP_CLONE === "true";

  const base = cliBase || process.env.GITHUB_BASE_REF || process.env.IMPACT_BASE || "origin/master";
  const head = cliHead || process.env.GITHUB_HEAD_REF || process.env.IMPACT_HEAD || "HEAD";

  try {
    const reportPath = await runAnalysis({
      repoUrl,
      base,
      head,
      allFiles: allFilesFlag,
      exts: parsedExts,
      workdir: workdirArg,
      keepClone,
      outPath: outArg,
    });

    console.log(`\nReport saved to: ${reportPath}`);
    process.exit(0);
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(2);
  }
}

main();

