
import { runAnalysis } from "./analyzer-core";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envCandidates = [
  ".env",
  ".env.local",
  process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : undefined,
  process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}.local` : undefined,
  process.env.IMPACT_ENV_FILE,
].filter(Boolean) as string[];

for (const file of envCandidates) {
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (fs.existsSync(abs)) {
    dotenv.config({ path: abs, override: false });
  }
}


async function main() {
  const argv = process.argv.slice(2);
  
  // 检查是否是 webhook 模式
  if (argv.includes("--webhook") || argv.includes("--server")) {
    const { createWebhookServer } = await import("./webhook");
    const port = process.env.WEBHOOK_PORT ? Number(process.env.WEBHOOK_PORT) : 3000;
    const path = process.env.WEBHOOK_PATH || "/webhook";
    createWebhookServer({
      port,
      path,
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
