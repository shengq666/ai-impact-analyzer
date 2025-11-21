/**
 * 依赖分析模块
 * 使用 madge 构建模块依赖关系图
 */

import madge from "madge";

/**
 * 分析模块依赖关系
 * @param baseDir 项目根目录
 * @returns 依赖关系图 { [file]: [dependencies] }
 */
export async function analyzeDependencyGraph(baseDir: string = "."): Promise<Record<string, string[]>> {
  let dependencyGraph: Record<string, string[]> = {};
  try {
    const res = await madge("src", { baseDir, includeNpm: false });
    dependencyGraph = res.obj();
  } catch (e) {
    console.warn("madge 依赖分析失败:", e);
    dependencyGraph = {};
  }
  return dependencyGraph;
}

