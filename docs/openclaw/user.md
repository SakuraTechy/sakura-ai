# OpenClaw Docker 部署使用文档

## 目录

- [快速开始](#快速开始)
- [配置文件说明](#配置文件说明)
- [模型配置](#模型配置)
- [多人使用与会话管理](#多人使用与会话管理)
- [斜杠命令](#斜杠命令)
- [设备配对与权限控制](#设备配对与权限控制)
- [常见问题](#常见问题)

---

## 快速开始

### 1. 环境准备

复制环境变量文件并按需修改：

```bash
cp .env.example .env
```

`.env` 关键变量：

| 变量 | 说明 | 示例 |
|------|------|------|
| `OPENCLAW_CONFIG_DIR` | 配置目录 | `./.openclaw` |
| `OPENCLAW_WORKSPACE_DIR` | 工作空间目录 | `./.openclaw/workspace` |
| `OPENCLAW_GATEWAY_PORT` | Gateway 端口 | `18789` |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway 认证 Token | 随机字符串 |
| `OPENCLAW_IMAGE` | Docker 镜像 | `openclaw:local` |

### 2. 构建镜像

```bash
docker build -t openclaw:local .
```

### 3. 启动服务

```bash
docker compose up -d
```

### 4. 访问 Web UI

浏览器打开：

```
http://<服务器IP>:18789
```

首次连接时输入 `.env` 中配置的 `OPENCLAW_GATEWAY_TOKEN`。

---

## 配置文件说明

| 文件 | 用途 |
|------|------|
| `.env` | Docker 环境变量 |
| `.openclaw/openclaw.json` | Gateway 运行时主配置（Docker 容器挂载读取） |
| `openclaw-config.json` | 本地参考配置（不被容器直接使用） |
| `.openclaw/devices/paired.json` | 已配对设备列表 |

> **注意**：Docker 容器挂载的是 `.openclaw/` 目录，实际生效的配置是 `.openclaw/openclaw.json`，不是项目根目录的 `openclaw-config.json`。

---

## 模型配置

### 添加自定义模型 Provider

编辑 `.openclaw/openclaw.json`，在 `models.providers` 中添加：

```json
{
  "models": {
    "mode": "merge",
    "providers": {
      "my-provider": {
        "baseUrl": "https://api.example.com/v1",
        "apiKey": "sk-your-api-key",
        "api": "openai-completions",
        "models": [
          {
            "id": "model-id",
            "name": "显示名称",
            "api": "openai-completions",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 131072,
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}
```

### api 字段说明

`api` 字段决定请求格式，必须与上游服务兼容：

| 值 | 适用场景 |
|----|---------|
| `openai-completions` | 标准 OpenAI Chat Completions 兼容接口（大多数第三方服务） |
| `openai-responses` | OpenAI 新版 Responses API（仅 OpenAI 官方） |
| `anthropic-messages` | Anthropic Claude API |

> **重要**：第三方 OpenAI 兼容服务（如中转站、GLM、Moonshot、DeepSeek 等）必须设置 `"api": "openai-completions"`。
> 如果不设置，默认使用 `openai-responses`，会发送 `prompt_cache_key` 等不兼容字段，导致 400 错误。

### 在 Web UI 中配置

1. 打开 Web UI → Settings（齿轮图标）
2. 找到 `models` → `providers`
3. 展开对应 provider，设置 `api` 字段为 `openai-completions`
4. 保存

### 设置默认模型

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "my-provider/model-id"
      }
    }
  }
}
```

---

## 多人使用与会话管理

OpenClaw 默认是单用户设计，但可以通过会话隔离实现多人使用。

### 通过 URL 参数分配独立会话

每个用户使用不同的 `session` 参数访问，即可拥有独立会话：

```
http://<IP>:18789/chat?session=agent:main:zhangsan
http://<IP>:18789/chat?session=agent:main:lisi
http://<IP>:18789/chat?session=agent:main:wangwu
```

session key 可以是任意字符串，首次访问时自动创建。建议给每个用户分配固定的书签链接。

### 在聊天中创建新会话

在聊天输入框中输入 `/new` 即可创建新会话并自动切换。

### 在 Sessions 页面管理

Web UI 左侧导航 → Sessions 标签页：

- 查看所有活跃会话
- 点击会话 Key 跳转到对应聊天
- 设置会话标签（Label）方便识别
- 调整每个会话的 Thinking Level、Fast Mode 等参数
- 删除不需要的会话

### 注意事项

- 会话隔离是"约定隔离"，没有强制性——任何人知道 session key 都可以访问
- 所有用户共享同一套模型配置和 API Key
- 不支持用户级别的用量统计

---

## 斜杠命令

在聊天输入框中输入 `/` 可查看所有可用命令：

### 会话管理

| 命令 | 说明 |
|------|------|
| `/new` | 创建新会话 |
| `/reset` | 重置当前会话（清空上下文，保留 session key） |
| `/compact` | 压缩会话上下文（减少 token 占用） |
| `/stop` | 停止当前运行 |
| `/clear` | 清空聊天历史显示 |
| `/focus` | 切换专注模式 |

### 模型控制

| 命令 | 说明 |
|------|------|
| `/model <name>` | 查看或切换模型 |
| `/think <level>` | 设置思考级别（off / low / medium / high） |
| `/verbose <on\|off\|full>` | 切换详细模式 |
| `/fast <on\|off>` | 切换快速模式 |

### 工具与信息

| 命令 | 说明 |
|------|------|
| `/help` | 显示可用命令 |
| `/status` | 显示会话状态 |
| `/usage` | 显示 Token 用量 |
| `/export` | 导出会话为 Markdown |

### Agent 管理

| 命令 | 说明 |
|------|------|
| `/agents` | 列出所有 Agent |
| `/kill <id\|all>` | 终止子 Agent |
| `/steer <id> <msg>` | 向子 Agent 发送指令 |

---

## 设备配对与权限控制

### 前提条件

设备配对认证依赖浏览器的 `crypto.subtle` API，**必须通过 HTTPS 或 localhost 访问**。

如果使用 HTTP 访问（如 `http://172.19.1.111:18789`），设备认证不可用，只能使用 Token 认证（所有人共享相同权限）。

### 启用 HTTPS

项目已包含 nginx 反向代理配置。确保：

1. 在 `.openclaw/certs/` 目录放置 `cert.pem` 和 `key.pem`
2. 通过 `https://<IP>` 访问（nginx 监听 443 端口）

### 启用设备认证

修改 `.openclaw/openclaw.json`，移除不安全标志：

```json
{
  "gateway": {
    "controlUi": {
      "allowedOrigins": ["https://<你的IP或域名>"]
    }
  }
}
```

确保没有以下配置（或设为 false）：
- `dangerouslyDisableDeviceAuth`
- `allowInsecureAuth`

### 配对流程

1. 管理员通过 HTTPS 访问 Web UI，输入 Gateway Token 连接
2. 浏览器自动生成设备密钥对，Gateway 创建配对请求
3. 管理员在 Nodes 页面批准自己的配对请求
4. 其他用户访问时产生新的配对请求，管理员审批

### 权限 Scope 说明

| Scope | 权限范围 |
|-------|---------|
| `operator.admin` | 修改配置、管理 Agent、安装 Skill、删除会话、管理 Cron 等 |
| `operator.read` | 查看状态、会话列表、聊天历史、模型列表、日志等 |
| `operator.write` | 发送消息、聊天、调用 Agent、TTS 控制等 |
| `operator.approvals` | 处理命令执行审批请求 |
| `operator.pairing` | 管理设备配对（批准/拒绝/移除设备） |

### 为普通用户设置只读+聊天权限

批准设备后，在 Nodes 页面通过 Rotate 按钮修改 scope，或直接编辑 `.openclaw/devices/paired.json`：

```json
{
  "<device-id>": {
    "scopes": ["operator.read", "operator.write"],
    "approvedScopes": ["operator.read", "operator.write"],
    "tokens": {
      "operator": {
        "scopes": ["operator.read", "operator.write"]
      }
    }
  }
}
```

修改后重启 Gateway 生效。

### 权限配置建议

| 角色 | 推荐 Scope |
|------|-----------|
| 管理员 | `operator.admin` + `operator.read` + `operator.write` + `operator.approvals` + `operator.pairing` |
| 普通用户 | `operator.read` + `operator.write` |
| 只读用户 | `operator.read` |

---

## 常见问题

### Q: 第三方模型报错 `unknown field "prompt_cache_key"`

**原因**：未设置 `api` 字段，默认使用了 `openai-responses` 格式。

**解决**：在 provider 和 model 配置中添加 `"api": "openai-completions"`。

### Q: 多人使用时会话互相干扰

**解决**：每人使用不同的 session URL 参数：

```
http://<IP>:18789/chat?session=agent:main:<用户名>
```

### Q: Web UI 提示需要安全上下文

**原因**：设备认证需要 HTTPS。

**解决**：
- 方案 A：配置 HTTPS（推荐）
- 方案 B：在配置中设置 `"dangerouslyDisableDeviceAuth": true`（不推荐，仅内网使用）

### Q: 如何重启 Gateway

```bash
docker compose restart openclaw-gateway
```

### Q: 如何查看 Gateway 日志

```bash
docker compose logs -f openclaw-gateway
```

### Q: 如何更新版本

```bash
docker compose down
docker build -t openclaw:local .
docker compose up -d
```
