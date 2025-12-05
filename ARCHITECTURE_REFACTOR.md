# 架构重构方案

## 当前问题

1. **模块职责不清晰**：文件散落在 `src/` 根目录，缺乏组织
2. **缺乏分层**：核心逻辑、处理逻辑、入口逻辑混在一起
3. **难以扩展**：添加新功能时不知道应该放在哪里

## 重构目标

1. **清晰的分层架构**：核心层、分析层、处理层、输出层、编排层、入口层
2. **模块化设计**：每个模块职责单一，易于测试和维护
3. **易于扩展**：新功能可以轻松添加到对应层级

## 新的目录结构

```
src/
├── core/                    # 核心 MVP 模块（最底层，不依赖其他业务模块）
│   ├── llm.ts              # LLM 调用（单次，无分批逻辑）
│   ├── prompt.ts           # Prompt 构建
│   └── types.ts            # 核心类型定义（StrictJSONShape 等）
│
├── analysis/                # 分析相关模块
│   ├── diff.ts             # Git diff 处理（从 diff.ts 移动）
│   ├── ast.ts              # AST 分析（重命名 analyze.ts）
│   └── dependency.ts       # 依赖分析（从 analyze.ts 拆分）
│
├── processing/              # 处理相关模块（分批、合并等）
│   ├── token-estimator.ts  # Token 估算
│   ├── batch-processor.ts  # 分批处理
│   └── merge-report.ts     # 结果合并
│
├── output/                  # 输出相关模块
│   ├── report.ts           # 报告生成（从 report.ts 移动）
│   └── confidence.ts       # 置信度计算（从 confidence.ts 移动）
│
├── orchestration/           # 编排层（协调各模块）
│   └── analyzer.ts         # 主分析流程（重命名 analyzer-core.ts）
│
├── entry/                   # 入口层
│   ├── cli.ts              # CLI 入口（从 index.ts 拆分）
│   └── webhook.ts           # Webhook 入口（从 webhook.ts 移动）
│
└── utils/                   # 工具函数
    └── config.ts           # 配置加载（环境变量等）
```

## 模块职责说明

### 1. `core/` - 核心 MVP 模块

**职责**：最底层的核心功能，不依赖其他业务模块

- `llm.ts`: 单次 LLM API 调用，无分批逻辑
- `prompt.ts`: 构建发送给 LLM 的 prompt
- `types.ts`: 核心类型定义（StrictJSONShape, InputPayload 等）

**特点**：
- 不依赖 `analysis/`, `processing/`, `output/` 等模块
- 可以被任何上层模块调用
- 保持简洁，只做一件事

### 2. `analysis/` - 分析相关模块

**职责**：代码分析相关功能

- `diff.ts`: Git diff 处理，获取变更文件和详情
- `ast.ts`: AST 分析，提取导出、组件、函数等信息
- `dependency.ts`: 依赖关系分析，构建依赖图

**特点**：
- 可以依赖 `core/` 模块
- 不依赖 `processing/` 和 `output/` 模块
- 专注于代码分析

### 3. `processing/` - 处理相关模块

**职责**：数据处理和优化

- `token-estimator.ts`: Token 估算
- `batch-processor.ts`: 分批处理（在 diff 阶段分组）
- `merge-report.ts`: 结果合并（合并多个批次的结果）

**特点**：
- 可以依赖 `core/` 和 `analysis/` 模块
- 不依赖 `output/` 模块
- 专注于数据处理

### 4. `output/` - 输出相关模块

**职责**：结果输出和格式化

- `report.ts`: 生成 Markdown 报告
- `confidence.ts`: 计算分析置信度

**特点**：
- 可以依赖 `core/` 模块
- 不依赖 `analysis/` 和 `processing/` 模块
- 专注于输出格式

### 5. `orchestration/` - 编排层

**职责**：协调各模块，实现完整的分析流程

- `analyzer.ts`: 主分析流程
  - 调用 `analysis/` 获取数据
  - 调用 `processing/` 判断是否需要分批
  - 调用 `core/llm.ts` 进行分析
  - 调用 `output/` 生成报告

**特点**：
- 可以依赖所有下层模块
- 实现完整的业务流程
- 不包含具体的业务逻辑

### 6. `entry/` - 入口层

**职责**：程序入口，处理命令行参数和环境变量

- `cli.ts`: CLI 入口
  - 解析命令行参数
  - 加载环境变量
  - 调用 `orchestration/analyzer.ts`
- `webhook.ts`: Webhook 入口
  - 处理 HTTP 请求
  - 调用 `orchestration/analyzer.ts`

**特点**：
- 只依赖 `orchestration/` 模块
- 处理输入输出（命令行、HTTP）
- 不包含业务逻辑

### 7. `utils/` - 工具函数

**职责**：通用工具函数

- `config.ts`: 配置加载（环境变量、.env 文件等）

**特点**：
- 不依赖任何业务模块
- 可以被任何模块使用

## 依赖关系图

```
entry/
  └─> orchestration/
        └─> processing/
        │     └─> analysis/
        │           └─> core/
        └─> output/
              └─> core/
        └─> analysis/
              └─> core/
        └─> core/
```

## 迁移计划

### 阶段 1：创建新目录结构
1. 创建所有新目录
2. 创建 `core/types.ts` 统一管理类型

### 阶段 2：迁移核心模块
1. `llm.ts` → `core/llm.ts`
2. `prompt.ts` → `core/prompt.ts`
3. 提取类型到 `core/types.ts`

### 阶段 3：迁移分析模块
1. `diff.ts` → `analysis/diff.ts`
2. `analyze.ts` → `analysis/ast.ts` + `analysis/dependency.ts`

### 阶段 4：创建处理模块
1. 创建 `processing/token-estimator.ts`
2. 创建 `processing/batch-processor.ts`
3. 创建 `processing/merge-report.ts`

### 阶段 5：迁移输出模块
1. `report.ts` → `output/report.ts`
2. `confidence.ts` → `output/confidence.ts`

### 阶段 6：重构编排层
1. `analyzer-core.ts` → `orchestration/analyzer.ts`
2. 集成所有模块

### 阶段 7：重构入口层
1. `index.ts` → `entry/cli.ts`
2. `webhook.ts` → `entry/webhook.ts`
3. 创建 `utils/config.ts`

### 阶段 8：更新导入和测试
1. 更新所有导入路径
2. 运行测试确保功能正常
3. 删除废弃文件

## 重构后的优势

1. **清晰的职责划分**：每个模块职责单一，易于理解
2. **易于测试**：可以单独测试每个模块
3. **易于扩展**：新功能可以轻松添加到对应层级
4. **易于维护**：修改某个功能时，只需要关注对应的模块
5. **符合单一职责原则**：每个模块只做一件事

## 注意事项

1. **保持向后兼容**：在迁移过程中，保持现有功能正常工作
2. **逐步迁移**：不要一次性重构所有代码
3. **充分测试**：每个阶段完成后都要测试
4. **更新文档**：及时更新 README 和文档

