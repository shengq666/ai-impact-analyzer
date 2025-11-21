# GitLab Webhook 配置指南

本指南说明如何将 AI Impact Analyzer 配置为 GitLab Webhook，以便在 Merge Request 事件时自动触发分析。

## 前置条件

1. 确保分析服务已部署并可访问（本地开发或服务器）
2. 获取 GitLab API Token（用于将分析结果作为评论添加到 MR）

## 步骤 1: 启动 Webhook 服务器

### 方式 1: 开发模式（使用 ts-node）

```bash
npm run webhook
```

### 方式 2: 生产模式（需要先构建）

```bash
npm run build
npm run start:webhook
```

服务器默认监听 `http://localhost:3000/webhook`

### 配置环境变量

创建 `.env` 文件或设置环境变量：

```bash
# Webhook 服务器配置
WEBHOOK_PORT=3000              # Webhook 服务器端口（可选，默认 3000）
WEBHOOK_PATH=/webhook          # Webhook 路径（可选，默认 /webhook）
GITLAB_WEBHOOK_TOKEN=your_secret_token  # Webhook 安全 Token（可选，但推荐）

# GitLab API 配置（用于添加 MR 评论）
GITLAB_API_TOKEN=your_gitlab_api_token  # GitLab Personal Access Token 或 Project Access Token
GITLAB_API_URL=https://gitlab.com       # GitLab 实例 URL（如果是自建 GitLab，改为对应地址）

# LLM API 配置
OPENAI_API_KEY=your_llm_api_key         # 或其他支持的 LLM API Key
IMPACT_LLM_BASE_URL=https://api.deepseek.com  # LLM API Base URL
IMPACT_LLM_MODEL=deepseek-chat          # LLM 模型名称
```

## 步骤 2: 配置 GitLab Webhook

1. 进入你的 GitLab 项目
2. 导航到 **Settings > Integrations**（或 **Settings > Webhooks**）
3. 点击 **Add webhook** 或 **New webhook**
4. 填写以下信息：

   - **URL**: `http://your-server:3000/webhook`
     - 如果是本地开发，可以使用内网穿透工具（如 ngrok）：
       ```bash
       ngrok http 3000
       # 使用 ngrok 提供的 URL，如: https://xxxx.ngrok.io/webhook
       ```
   
   - **Secret token**: 与 `.env` 中的 `GITLAB_WEBHOOK_TOKEN` 保持一致（如果设置了）
   
   - **Trigger**: 勾选 **Merge request events**
     - 可选：也可以勾选 **Push events**（如果需要分析 push 事件）
   
   - **Enable SSL verification**: 
     - 生产环境：建议启用
     - 开发环境（使用 ngrok 等）：可以禁用

5. 点击 **Add webhook** 保存

## 步骤 3: 测试 Webhook

1. 创建一个新的 Merge Request
2. 查看 Webhook 服务器日志，应该看到：
   ```
   Received GitLab Webhook: merge_request open
   Processing MR #123: feature-branch -> master
   AI Impact Analyzer — MVP starting...
   ...
   ```

3. 分析完成后，如果配置了 `GITLAB_API_TOKEN`，分析报告会自动作为评论添加到 MR

## 步骤 4: 获取 GitLab API Token

### 方式 1: Personal Access Token（推荐用于个人项目）

1. 进入 GitLab：**User Settings > Access Tokens**
2. 创建新 Token：
   - **Token name**: `ai-impact-analyzer`
   - **Scopes**: 勾选 `api`
   - **Expiration date**: 设置过期时间（可选）
3. 点击 **Create personal access token**
4. 复制生成的 Token，保存到 `.env` 文件的 `GITLAB_API_TOKEN`

### 方式 2: Project Access Token（推荐用于团队项目）

1. 进入项目：**Settings > Access Tokens**
2. 创建新 Token：
   - **Token name**: `ai-impact-analyzer`
   - **Role**: `Developer` 或 `Maintainer`
   - **Scopes**: 勾选 `api`
3. 点击 **Create project access token**
4. 复制生成的 Token，保存到 `.env` 文件的 `GITLAB_API_TOKEN`

## 部署到服务器

### 使用 PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 构建项目
npm run build

# 启动 Webhook 服务器
pm2 start dist/index.js --name "ai-impact-analyzer" -- --webhook

# 查看日志
pm2 logs ai-impact-analyzer

# 设置开机自启
pm2 startup
pm2 save
```

### 使用 systemd（Linux）

创建 `/etc/systemd/system/ai-impact-analyzer.service`:

```ini
[Unit]
Description=AI Impact Analyzer Webhook Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/ai-impact-analyzer
Environment="NODE_ENV=production"
EnvironmentFile=/path/to/ai-impact-analyzer/.env
ExecStart=/usr/bin/node /path/to/ai-impact-analyzer/dist/index.js --webhook
Restart=always

[Install]
WantedBy=multi-user.target
```

然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable ai-impact-analyzer
sudo systemctl start ai-impact-analyzer
sudo systemctl status ai-impact-analyzer
```

## 安全建议

1. **使用 HTTPS**: 生产环境必须使用 HTTPS，配置反向代理（如 Nginx）
2. **设置 Secret Token**: 在 GitLab Webhook 和服务器中都设置相同的 `GITLAB_WEBHOOK_TOKEN`
3. **限制访问**: 使用防火墙限制 Webhook 端点的访问来源
4. **保护 API Token**: 不要将 Token 提交到代码仓库，使用环境变量或密钥管理服务

## 故障排查

### Webhook 未触发

1. 检查服务器是否运行：`curl http://localhost:3000/webhook`（应该返回 404，说明服务器在运行）
2. 检查 GitLab Webhook 配置中的 URL 是否正确
3. 查看 GitLab 项目的 **Settings > Webhooks > Recent events**，查看是否有错误信息

### 分析未执行

1. 查看服务器日志，检查是否有错误信息
2. 确认环境变量（特别是 LLM API Key）是否正确设置
3. 检查仓库 URL 和分支名称是否正确

### MR 评论未添加

1. 确认 `GITLAB_API_TOKEN` 已设置且有效
2. 确认 Token 有 `api` 权限
3. 如果是自建 GitLab，确认 `GITLAB_API_URL` 配置正确
4. 查看服务器日志中的错误信息

## 示例：使用 Nginx 反向代理

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /webhook {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

然后在 GitLab Webhook 配置中使用：`https://your-domain.com/webhook`

