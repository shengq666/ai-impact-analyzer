
# AI Impact Analyzer — MVP

This repository contains a minimal MVP for an AI-assisted change impact analysis system for frontend projects.

## What it does
- Extracts changed files (via `simple-git` or environment variables from CI)
- Performs lightweight AST inspection using `ts-morph`
- Builds a module dependency snapshot with `madge`
- Calls an LLM (OpenAI) if `OPENAI_API_KEY` is provided, otherwise uses a heuristic mock
- Generates a Markdown impact report at `artifacts/report.md`

## Quick start (locally)
1. Clone repo
2. `npm ci`
3. Run against your branch:
   - `npm run analyze` (default computes `git diff` between `HEAD` and `origin/main`)
   - Or explicitly set base/head (支持分支间对比):
     - CLI 参数：`npm run analyze -- --base origin/master --head origin/feature/my_branch`
     - 环境变量：`GITHUB_BASE_REF=origin/master GITHUB_HEAD_REF=origin/feature/my_branch npm run analyze`
     - 也可使用自定义变量名：`IMPACT_BASE=origin/master IMPACT_HEAD=origin/feature/my_branch npm run analyze`
4. Review `artifacts/report.md`

## 以“仓库 URL”方式运行（无需手动进入目标仓库）
你可以直接传入仓库地址，工具会在本项目的 `artifacts/` 下创建临时目录、clone 并在该目录内完成分析，然后把报告输出到本项目的 `artifacts/report.md`：
```
npm run analyze -- --repo http://git.kukahome.com/pubsouce/unified-admin-front \
  --base origin/master \
  --head origin/gj_feature_xag_1113_RLAM-1317
```
可选项：
- 自定义克隆目录：`--workdir /tmp/impact-repo`（默认使用 `artifacts/repo-<timestamp>`）
- 也可用环境变量传入：`IMPACT_REPO_URL`
- 包含所有文件（不按扩展名过滤）：`--all-files` 或 `IMPACT_ALL_FILES=true`
- 自定义扩展名白名单：`--exts .ts,.tsx,.js,.json`（默认包含 ts/tsx/js/jsx/json/css/scss/less/md/yml/yaml/vue/graphql/gql）
- 自定义报告输出路径：`--out artifacts/my-report.md` 或 `IMPACT_REPORT=artifacts/my-report.md`
  - 默认：`artifacts/report-<base>..<head>-<timestamp>.md`
- 默认会在分析结束后删除临时克隆目录；若需要保留，请加 `--keep-clone` 或设置 `IMPACT_KEEP_CLONE=true`
- LLM 接入：默认使用 DeepSeek Chat
  - `IMPACT_API_KEY` / `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `OPENAI_API_KEY_ALT` 均可使用（按顺序优先级）
  - 自定义模型与接口：`IMPACT_LLM_BASE_URL`、`IMPACT_LLM_MODEL`
- 环境变量加载顺序：`.env` → `.env.local` → `.env.<NODE_ENV>` → `.env.<NODE_ENV>.local` → `IMPACT_ENV_FILE`（若指定）

## In CI (GitHub Actions)
The `.github/workflows/impact-analysis.yml` is pre-configured to run on PRs.

## 在 GitLab CI 中使用（示例）
在 GitLab CI 中，你可以添加如下 Job（示例使用 Node 18）：
```
impact_analysis:
  image: node:18
  variables:
    REPO_URL: "http://git.kukahome.com/pubsouce/unified-admin-front"
    BASE_REF: "origin/master"
    HEAD_REF: "origin/gj_feature_xag_1113_RLAM-1317"
  script:
    - npm ci
    - npm run analyze -- --repo "$REPO_URL" --base "$BASE_REF" --head "$HEAD_REF"
  artifacts:
    when: always
    paths:
      - artifacts/report.md
```
注意：
- 如果是私有仓库，请在 CI 中配置访问凭证（如 HTTP 用户名密码或 Token，或在 Runner 上预配置 SSH key，并把 `REPO_URL` 替换为 SSH 地址）。
- 该 Job 会把报告保存在当前项目的 `artifacts/report.md`。

## Notes
- This is an MVP template. LLM integration is intentionally minimal: if no API key is set it will return a deterministic heuristic result.
- You need Node 18+.

## Example: compare feature branch to target branch
If your repo is hosted elsewhere (e.g. a self-hosted Git service) and you want to compare a feature branch to a target branch before merging:

1) Ensure the repository is checked out and both refs are fetched:
```
git fetch origin master
git fetch origin gj_feature_xag_1113_RLAM-1317
```

2) Run analyzer specifying base/head:
```
 npm run analyze --  --repo http://git.kukahome.com/img-manager/kuka-img-pad --base origin/master --head origin/feature/demo --all-files
```

This will compute diff for `origin/master..origin/gj_feature_xag_1113_RLAM-1317` and generate `artifacts/report.md`.

## 在 GitLab CI/CD 中自动运行（合并请求触发）
如果你使用 GitLab CI/CD，可以在项目根目录添加 `.gitlab-ci.yml`，在合并请求（Merge Request）管道中自动运行分析。以下是一个示例配置：

```
stages:
  - analyze

impact_analysis:
  stage: analyze
  image: node:18
  variables:
    # 根据需要自定义 LLM/Repo 等环境变量
    IMPACT_LLM_BASE_URL: "https://api.deepseek.com"
    IMPACT_LLM_MODEL: "deepseek-chat"
  before_script:
    - npm ci
  script:
    # GitLab MR 管道中可直接使用 CI_MERGE_REQUEST_SOURCE_BRANCH_NAME 等变量
    - export SOURCE_BRANCH="origin/${CI_MERGE_REQUEST_SOURCE_BRANCH_NAME:-$CI_COMMIT_REF_NAME}"
    - export TARGET_BRANCH="origin/${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-master}"
    - npm run analyze -- --base "$TARGET_BRANCH" --head "$SOURCE_BRANCH" --all-files
  artifacts:
    when: always
    paths:
      - artifacts/
    expire_in: 7 days
  only:
    - merge_requests
```

说明：
- `CI_MERGE_REQUEST_SOURCE_BRANCH_NAME`/`CI_MERGE_REQUEST_TARGET_BRANCH_NAME` 在合并请求管道中自动可用；若在分支管道中运行，则会退回到当前提交分支。
- 如果需要克隆其他仓库（例如 monorepo 外的代码），可以设置 `--repo` 参数，并在 CI 中配置凭证。
- 若想把分析结果自动评论到 MR，可在 GitLab 的 Integrations 中配置 Webhook（详见 `GITLAB_WEBHOOK_SETUP.md`），或者在脚本中调用 API。
