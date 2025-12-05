# 项目架构说明

## 目录结构

```
src/
├── core/                    # 核心 MVP 模块（最底层，不依赖其他业务模块）
│   ├── llm.ts              # LLM 调用（单次，无分批逻辑）
│   ├── prompt.ts           # Prompt 构建
│   └── types.ts            # 核心类型定义（StrictJSONShape, InputPayload）
│
├── analysis/                # 分析相关模块
│   ├── diff.ts             # Git diff 处理，获取变更文件和详情
│   ├── ast.ts              # AST 分析，提取导出、组件、函数等信息
│   └── dependency.ts       # 依赖分析，使用 madge 构建依赖关系图
│
├── output/                  # 输出相关模块
│   ├── report.ts           # 生成 Markdown 报告
│   └── confidence.ts       # 计算分析置信度
│
├── orchestration/           # 编排层（协调各模块）
│   └── analyzer.ts         # 主分析流程
│                              - 调用 analysis/ 获取数据
│                              - 调用 core/llm.ts 进行分析
│                              - 调用 output/ 生成报告
│
├── entry/                   # 入口层（处理输入输出）
│   ├── cli.ts              # CLI 入口（解析命令行参数）
│   └── webhook.ts          # Webhook 入口（处理 HTTP 请求）
│
└── utils/                   # 工具函数
    └── config.ts           # 配置加载（环境变量、.env 文件）
```

## 模块职责

### 1. `core/` - 核心 MVP 模块

**职责**：最底层的核心功能，不依赖其他业务模块

- `llm.ts`: 单次 LLM API 调用，无分批逻辑
- `prompt.ts`: 构建发送给 LLM 的 prompt
- `types.ts`: 核心类型定义

**特点**：
- 不依赖 `analysis/`, `output/` 等模块
- 可以被任何上层模块调用
- 保持简洁，只做一件事

### 2. `analysis/` - 分析相关模块

**职责**：代码分析相关功能

- `diff.ts`: Git diff 处理
- `ast.ts`: AST 分析
- `dependency.ts`: 依赖关系分析

**特点**：
- 可以依赖 `core/` 模块
- 不依赖 `output/` 模块
- 专注于代码分析

### 3. `output/` - 输出相关模块

**职责**：结果输出和格式化

- `report.ts`: 生成 Markdown 报告
- `confidence.ts`: 计算分析置信度

**特点**：
- 可以依赖 `core/` 模块
- 不依赖 `analysis/` 模块
- 专注于输出格式

### 4. `orchestration/` - 编排层

**职责**：协调各模块，实现完整的分析流程

- `analyzer.ts`: 主分析流程
  - 调用 `analysis/` 获取数据
  - 调用 `core/llm.ts` 进行分析
  - 调用 `output/` 生成报告

**特点**：
- 可以依赖所有下层模块
- 实现完整的业务流程
- 不包含具体的业务逻辑

### 5. `entry/` - 入口层

**职责**：程序入口，处理命令行参数和环境变量

- `cli.ts`: CLI 入口
- `webhook.ts`: Webhook 入口

**特点**：
- 只依赖 `orchestration/` 模块
- 处理输入输出（命令行、HTTP）
- 不包含业务逻辑

### 6. `utils/` - 工具函数

**职责**：通用工具函数

- `config.ts`: 配置加载

**特点**：
- 不依赖任何业务模块
- 可以被任何模块使用

## 依赖关系

```
entry/
  └─> orchestration/
        └─> analysis/ ──┐
        │     └─> core/ ─┘
        └─> output/
              └─> core/
        └─> core/
```

## 数据流

```
1. entry/cli.ts 或 entry/webhook.ts
   ↓
2. orchestration/analyzer.ts
   ↓
3. analysis/diff.ts → 获取变更文件
   ↓
4. analysis/ast.ts → AST 分析
   ↓
5. analysis/dependency.ts → 依赖分析
   ↓
6. core/llm.ts → LLM 分析
   ↓
7. output/confidence.ts → 计算置信度
   ↓
8. output/report.ts → 生成报告
```

## 设计原则

1. **分层清晰**：从底层到上层，依赖关系明确
2. **职责单一**：每个模块只做一件事
3. **易于扩展**：新功能可以轻松添加到对应层级
4. **易于测试**：可以单独测试每个模块
5. **易于维护**：修改某个功能时，只需要关注对应的模块

## 未来扩展

当需要添加 token 超出处理功能时，可以：

1. 创建 `processing/` 目录
2. 添加 `token-estimator.ts`、`batch-processor.ts`、`merge-report.ts`
3. 在 `orchestration/analyzer.ts` 中集成这些模块

这样不会影响现有的核心 MVP 逻辑。

