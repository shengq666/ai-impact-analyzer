
import simpleGit from "simple-git";
import path from "path";

/**
 * getChangedFiles(base, head)
 * For CI, pass GITHUB_BASE_REF and GITHUB_HEAD_REF as env vars.
 * Locally it uses `git diff --name-only origin/main..HEAD`.
 */
export async function getChangedFiles(
  base: string,
  head: string,
  options?: { cwd?: string; allFiles?: boolean; exts?: string[] }
): Promise<string[]> {
  const git = simpleGit({ baseDir: options?.cwd });
  try {
    // Try to fetch remote refs to ensure origin/main exists (best-effort; may fail in restricted CI)
    await git.fetch();
  } catch (e) {
    // ignore fetch errors
  }

  // We use name-only diff; fallback to checking staged/unstaged changes if diff is empty.
  let files: string[] = [];
  try {
    const raw = await git.diff([`${base}..${head}`, "--name-only"]);
    files = raw.split("\n").map(s => s.trim()).filter(Boolean);
  } catch (e) {
    // Fallback: list files changed in HEAD (last commit)
    const last = await git.show(["--name-only", "--pretty=format:", "HEAD"]);
    files = last.split("\n").map(s => s.trim()).filter(Boolean);
  }

  // Filtering strategy:
  // - By default keep common text/code files in any folder
  // - If allFiles=true, keep everything
  // - If exts provided, use that list
  if (!options?.allFiles) {
    const allowedExts = (options?.exts && options.exts.map(e => e.toLowerCase())) || [
      ".ts", ".tsx", ".js", ".jsx",
      ".json", ".css", ".scss", ".less",
      ".md", ".yml", ".yaml",
      ".vue", ".graphql", ".gql"
    ];
    files = files.filter(f => allowedExts.includes(path.extname(f).toLowerCase()));
  }

  return files;
}

/**
 * 从代码变更中提取函数、方法、属性等细粒度变更
 */
function extractFineGrainedChanges(hunks: string[], filePath: string): {
  functions: string[];
  methods: string[];
  properties: string[];
  components: string[];
  features: string[];
  routes: string[];
} {
  const functions: string[] = [];
  const methods: string[] = [];
  const properties: string[] = [];
  const components: string[] = [];
  const features: string[] = [];
  const routes: string[] = [];

  const functionPattern = /(?:function|const|let|var)\s+(\w+)\s*[=:\(]/g;
  const methodPattern = /(\w+)\s*[:\(]\s*(?:\(|=>|function)/g;
  const propertyPattern = /(?:\.|\[['"])(\w+)(?:['"]\])?\s*[:=]/g;
  const componentPattern = /(?:export\s+default\s+|export\s+)?(?:const|function|class)\s+(\w+)(?:Component|Page|View)?/gi;

  const looksLikeRouter = /router|routes/i.test(filePath);

  for (const hunk of hunks) {
    const lines = hunk.split("\n");
    for (const line of lines) {
      // 跳过 diff 标记行
      if (line.startsWith("@@") || line.startsWith("+++") || line.startsWith("---")) continue;
      
      const codeLine = line.replace(/^[+\-]/, "").trim();
      if (!codeLine || codeLine.startsWith("//") || codeLine.startsWith("*")) continue;

      // 提取函数
      let match;
      while ((match = functionPattern.exec(codeLine)) !== null) {
        const name = match[1];
        if (name && !functions.includes(name)) {
          functions.push(name);
        }
      }

      // 提取方法
      while ((match = methodPattern.exec(codeLine)) !== null) {
        const name = match[1];
        if (name && !methods.includes(name)) {
          methods.push(name);
        }
      }

      // 提取属性
      while ((match = propertyPattern.exec(codeLine)) !== null) {
        const name = match[1];
        if (name && !properties.includes(name)) {
          properties.push(name);
        }
      }

      // 提取组件
      while ((match = componentPattern.exec(codeLine)) !== null) {
        const name = match[1];
        if (name && !components.includes(name)) {
          components.push(name);
        }
      }

      // 尝试识别功能点（基于常见模式）
      if (codeLine.includes("单选") || codeLine.includes("多选") || codeLine.includes("select")) {
        features.push("选择器功能");
      }
      if (codeLine.includes("search") || codeLine.includes("搜索")) {
        features.push("搜索功能");
      }
      if (codeLine.includes("filter") || codeLine.includes("筛选")) {
        features.push("筛选功能");
      }
      if (codeLine.includes("validate") || codeLine.includes("验证")) {
        features.push("验证功能");
      }

      // 路由路径
      if (looksLikeRouter) {
        const routePathMatch = codeLine.match(/path\s*:\s*['"]([^'"]+)['"]/);
        if (routePathMatch && !routes.includes(routePathMatch[1])) {
          routes.push(routePathMatch[1]);
        }
        const namedRouteMatch = codeLine.match(/name\s*:\s*['"]([^'"]+)['"]/);
        if (namedRouteMatch && !routes.includes(namedRouteMatch[1])) {
          routes.push(namedRouteMatch[1]);
        }
      }
    }
  }

  return { functions, methods, properties, components, features, routes };
}

/**
 * getChangedFilesWithDetails - 获取变更文件及其详细差异信息（增强版）
 */
export async function getChangedFilesWithDetails(
  base: string,
  head: string,
  options?: { cwd?: string; allFiles?: boolean; exts?: string[] }
): Promise<Array<{
  file: string;
  added: number;
  deleted: number;
  hunks: string[];
  fineGrained?: {
    functions: string[];
    methods: string[];
    properties: string[];
    components: string[];
    features: string[];
  };
}>> {
  const files = await getChangedFiles(base, head, options);
  const git = simpleGit({ baseDir: options?.cwd });
  const results: Array<{
    file: string;
    added: number;
    deleted: number;
    hunks: string[];
    fineGrained?: {
      functions: string[];
      methods: string[];
      properties: string[];
      components: string[];
      features: string[];
    };
  }> = [];

  for (const file of files) {
    try {
      const diffOutput = await git.diff([`${base}..${head}`, "--", file]);
      const lines = diffOutput.split("\n");
      let added = 0;
      let deleted = 0;
      const hunks: string[] = [];
      let currentHunk: string[] = [];

      for (const line of lines) {
        if (line.startsWith("@@")) {
          if (currentHunk.length > 0) {
            hunks.push(currentHunk.join("\n"));
            currentHunk = [];
          }
          currentHunk.push(line);
        } else if (line.startsWith("+") && !line.startsWith("+++")) {
          added++;
          if (currentHunk.length < 20) currentHunk.push(line); // 增加上下文行数
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          deleted++;
          if (currentHunk.length < 20) currentHunk.push(line);
        } else if (currentHunk.length > 0 && currentHunk.length < 20) {
          currentHunk.push(line);
        }
      }
      if (currentHunk.length > 0) {
        hunks.push(currentHunk.join("\n"));
      }

      // 提取细粒度变更
      const fineGrained = extractFineGrainedChanges(hunks, file);

      results.push({
        file,
        added,
        deleted,
        hunks: hunks.slice(0, 5), // 最多保留5个hunk
        fineGrained,
      });
    } catch (e) {
      results.push({ file, added: 0, deleted: 0, hunks: [] });
    }
  }

  return results;
}
