
import { Project, SyntaxKind, Node } from "ts-morph";
import fs from "fs";
import path from "path";
import madge from "madge";

/**
 * 从 Vue 文件中提取 <script> 部分的内容
 */
function extractVueScriptContent(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    // 匹配 <script> 标签（支持 lang="ts" 等属性）
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      return scriptMatch[1];
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 提取函数、方法、组件等信息（框架无关）
 */
function extractCodeEntities(sourceFile: any): {
  functions: string[];
  methods: string[];
  exports: string[];
  components: string[];
} {
  const functions: string[] = [];
  const methods: string[] = [];
  const exports: string[] = [];
  const components: string[] = [];

  try {
    // 获取所有导出
    const exportedDecls = sourceFile.getExportedDeclarations();
    const exportKeys = Array.from(exportedDecls.keys()).filter((k): k is string => typeof k === 'string');
    exports.push(...exportKeys);

    // 遍历所有子节点
    sourceFile.forEachChild((node: any) => {
      try {
        const kind = node.getKind?.();
        
        // 函数声明
        if (kind === SyntaxKind.FunctionDeclaration) {
          const name = node.getName?.();
          if (name) {
            functions.push(name);
            // 如果是导出，也可能是组件
            if (node.isExported?.()) {
              components.push(name);
            }
          }
        }
        
        // 变量声明（可能是组件、函数等）
        if (kind === SyntaxKind.VariableDeclaration) {
          const name = node.getName?.();
          if (name && typeof name === 'string') {
            const initializer = node.getInitializer?.();
            if (initializer) {
              const initKind = initializer.getKind?.();
              // 箭头函数或函数表达式
              if (initKind === SyntaxKind.ArrowFunction || initKind === SyntaxKind.FunctionExpression) {
                functions.push(name);
                if (node.isExported?.()) {
                  components.push(name);
                }
              }
            }
          }
        }
        
        // 类声明（Vue2 选项式 API、React Class 组件）
        if (kind === SyntaxKind.ClassDeclaration) {
          const name = node.getName?.();
          if (name) {
            components.push(name);
            // 提取类方法
            node.getMembers?.().forEach((member: any) => {
              const memberName = member.getName?.();
              if (memberName) methods.push(`${name}.${memberName}`);
            });
          }
        }
        
        // 对象字面量（Vue3 setup、React Hooks）
        if (kind === SyntaxKind.ObjectLiteralExpression) {
          node.getProperties?.().forEach((prop: any) => {
            const propName = prop.getName?.();
            if (propName) {
              // 可能是 methods, computed, setup 等
              methods.push(propName);
            }
          });
        }
      } catch (e) {
        // 忽略解析错误
      }
    });
  } catch (e) {
    // 忽略整体错误
  }

  return { functions, methods, exports, components };
}

/**
 * analyzeDependencies(files)
 * - Build a small AST snapshot with ts-morph for changed files.
 * - Support Vue2/Vue3/React/Node.js (framework-agnostic)
 * - Run madge over src/ to build a module dependency object (lightweight).
 */
export async function analyzeDependencies(files: string[]) {
  let project: Project;
  if (fs.existsSync("tsconfig.json")) {
    project = new Project({
      tsConfigFilePath: "tsconfig.json",
    });
  } else {
    project = new Project({
      compilerOptions: {
        allowJs: true,
        skipLibCheck: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        jsx: "preserve",
      } as any,
    });
  }

  // Add all files under src to project to get correct resolution
  project.addSourceFilesAtPaths("src/**/*.ts");
  project.addSourceFilesAtPaths("src/**/*.tsx");
  project.addSourceFilesAtPaths("src/**/*.js");
  project.addSourceFilesAtPaths("src/**/*.jsx");

  const affected = [];

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    
    // 处理 Vue 文件
    if (ext === ".vue") {
      const scriptContent = extractVueScriptContent(f);
      if (scriptContent) {
        // 创建临时文件用于解析
        const tempPath = f.replace(/\.vue$/, ".vue.temp.ts");
        try {
          const tempFile = project.createSourceFile(tempPath, scriptContent || "", { overwrite: true });
          const entities = extractCodeEntities(tempFile);
          affected.push({
            file: f,
            exportNames: entities.exports,
            components: entities.components,
            functions: entities.functions,
            methods: entities.methods,
            note: "Vue file - extracted from <script> tag",
          });
          // 清理临时文件
          project.removeSourceFile(tempFile);
        } catch (e) {
          affected.push({ file: f, note: `Vue file parsing error: ${String(e)}` });
        }
      } else {
        affected.push({ file: f, note: "Vue file - no <script> tag found" });
      }
      continue;
    }

    // 处理 TS/JS/TSX/JSX 文件
    const sf = project.getSourceFile(f);
    if (!sf) {
      affected.push({ file: f, note: "file not in ts-morph project" });
      continue;
    }

    const entities = extractCodeEntities(sf);
    affected.push({
      file: f,
      exportNames: entities.exports,
      components: entities.components,
      functions: entities.functions,
      methods: entities.methods,
    });
  }

  // Build dependency graph using madge (scans disk)
  let dependencyGraph = {};
  try {
    const res = await madge("src", { baseDir: ".", includeNpm: false });
    dependencyGraph = res.obj();
  } catch (e) {
    dependencyGraph = { error: "madge failed to analyze - ensure src/ exists" };
  }

  return { affected, dependencyGraph };
}
