/**
 * 配置加载工具
 * 处理环境变量和 .env 文件
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";

/**
 * 加载环境变量配置
 */
export function loadConfig() {
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
}

