
import http from "http";
import { URL } from "url";
import { runAnalysis } from "../orchestration/analyzer";

/**
 * GitLab Merge Request Webhook Payload 类型定义
 */
interface GitLabMRWebhook {
  object_kind: "merge_request";
  event_type: "merge_request";
  user: {
    name: string;
    username: string;
  };
  project: {
    id: number;
    name: string;
    web_url: string;
    git_http_url: string;
    git_ssh_url: string;
  };
  object_attributes: {
    id: number;
    iid: number;
    title: string;
    description: string;
    state: "opened" | "closed" | "merged";
    merge_status: "unchecked" | "checking" | "can_be_merged" | "cannot_be_merged";
    source_branch: string;
    target_branch: string;
    source: {
      name: string;
      web_url: string;
      git_http_url: string;
      git_ssh_url: string;
    };
    target: {
      name: string;
      web_url: string;
      git_http_url: string;
      git_ssh_url: string;
    };
    url: string;
    action: "open" | "close" | "reopen" | "update" | "approved" | "unapproved" | "approval" | "unapproval" | "merge";
  };
}

/**
 * 解析 GitLab Webhook 请求体
 */
function parseRequestBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        // GitLab 可能发送 form-urlencoded 格式
        if (req.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams(body);
          const payload = params.get("payload");
          if (payload) {
            resolve(JSON.parse(payload));
          } else {
            resolve(JSON.parse(body));
          }
        } else {
          resolve(JSON.parse(body));
        }
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/**
 * 验证 GitLab Webhook Token（可选，但推荐）
 */
function verifyWebhookToken(req: http.IncomingMessage, token?: string): boolean {
  if (!token) return true; // 如果没有配置 token，跳过验证
  const providedToken = req.headers["x-gitlab-token"] as string;
  return providedToken === token;
}

/**
 * 创建 GitLab Webhook HTTP 服务器
 */
export function createWebhookServer(options: {
  port?: number;
  path?: string;
  secretToken?: string;
  gitlabToken?: string; // GitLab API Token，用于添加 MR 评论
}) {
  const port = options.port || 3000;
  const path = options.path || "/webhook";
  const secretToken = options.secretToken || process.env.GITLAB_WEBHOOK_TOKEN;
  const gitlabToken = options.gitlabToken || process.env.GITLAB_API_TOKEN;

  const server = http.createServer(async (req, res) => {
    // 设置 CORS 头（如果需要）
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Gitlab-Token");

    // 处理 OPTIONS 请求
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // 只处理 POST 请求到指定路径
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (req.method !== "POST" || url.pathname !== path) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
      return;
    }

    try {
      // 验证 Token
      if (!verifyWebhookToken(req, secretToken)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized: Invalid token" }));
        return;
      }

      // 解析请求体
      const payload = await parseRequestBody(req);
      console.log("Received GitLab Webhook:", payload.object_kind, payload.object_attributes?.action);

      // 只处理 Merge Request 事件
      if (payload.object_kind !== "merge_request") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Not a merge request event, ignoring" }));
        return;
      }

      const mrData = payload as GitLabMRWebhook;
      const action = mrData.object_attributes.action;

      // 只处理 opened 和 update 事件（避免重复分析）
      if (action !== "open" && action !== "update") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: `MR ${action} event, skipping analysis` }));
        return;
      }

      // 提取仓库和分支信息
      const repoUrl = mrData.object_attributes.source.git_http_url || mrData.project.git_http_url;
      const sourceBranch = mrData.object_attributes.source_branch;
      const targetBranch = mrData.object_attributes.target_branch;
      const mrIid = mrData.object_attributes.iid;
      const projectId = mrData.project.id;
      const mrUrl = mrData.object_attributes.url;

      console.log(`Processing MR #${mrIid}: ${sourceBranch} -> ${targetBranch}`);

      // 异步执行分析（不阻塞响应）
      runAnalysis({
        repoUrl,
        base: `origin/${targetBranch}`,
        head: `origin/${sourceBranch}`,
        allFiles: true,
      })
        .then(async (reportPath) => {
          console.log(`Analysis completed, report saved to: ${reportPath}`);

          // 可选：将报告作为评论添加到 MR
          if (gitlabToken && projectId && mrIid) {
            try {
              await addMRComment(projectId, mrIid, reportPath, gitlabToken);
              console.log(`Comment added to MR #${mrIid}`);
            } catch (err) {
              console.error("Failed to add MR comment:", err);
            }
          }
        })
        .catch((err) => {
          console.error("Analysis failed:", err);
        });

      // 立即返回响应（不等待分析完成）
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          message: "Webhook received, analysis started",
          mr: `#${mrIid}`,
          branches: `${sourceBranch} -> ${targetBranch}`,
        })
      );
    } catch (err: any) {
      console.error("Webhook processing error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "Internal server error" }));
    }
  });

  server.listen(port, () => {
    console.log(`GitLab Webhook server listening on http://localhost:${port}${path}`);
    console.log(`Configure this URL in GitLab: Settings > Integrations > Webhooks`);
    console.log(`Trigger: Merge request events`);
    if (secretToken) {
      console.log(`Secret token configured (X-Gitlab-Token header)`);
    }
  });

  return server;
}

/**
 * 将分析报告作为评论添加到 GitLab MR
 */
async function addMRComment(
  projectId: number,
  mrIid: number,
  reportPath: string,
  gitlabToken: string
): Promise<void> {
  const fs = await import("fs");
  const https = await import("https");
  const http = await import("http");
  const { URL } = await import("url");
  
  const reportContent = fs.readFileSync(reportPath, "utf-8");

  // GitLab API 端点
  const apiUrl = process.env.GITLAB_API_URL || "https://gitlab.com";
  const apiUrlObj = new URL(`${apiUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes`);

  // 将 Markdown 报告转换为 GitLab 评论格式（限制长度，避免超过 GitLab 评论限制）
  const maxLength = 50000; // GitLab 评论最大长度约为 1MB，我们限制为 50KB
  const truncatedContent = reportContent.length > maxLength 
    ? reportContent.slice(0, maxLength) + "\n\n... (报告过长，已截断)"
    : reportContent;
  
  const comment = `## 🤖 AI 变更影响分析报告\n\n<details>\n<summary>点击查看详细分析报告</summary>\n\n\`\`\`markdown\n${truncatedContent}\n\`\`\`\n\n</details>`;

  const postData = JSON.stringify({
    body: comment,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: apiUrlObj.hostname,
      port: apiUrlObj.port || (apiUrlObj.protocol === "https:" ? 443 : 80),
      path: apiUrlObj.pathname + apiUrlObj.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PRIVATE-TOKEN": gitlabToken,
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const client = apiUrlObj.protocol === "https:" ? https : http;
    const req = client.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`GitLab API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

