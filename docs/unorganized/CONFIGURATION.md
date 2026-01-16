# ⚙️ 配置详解

Sakura AI 完整环境变量配置说明。

---

## 📋 完整配置示例 (.env)

```bash
# ========== 数据库配置 ==========
# ⚠️ 重要：必须包含时区配置，确保时间存储正确
DATABASE_URL="mysql://username:password@localhost:3306/Sakura AI?timezone=Asia/Shanghai"

# ========== 应用配置 ==========
NODE_ENV=development               # 环境: development / production
PORT=3001                          # 后端端口
VITE_PORT=5173                     # 前端端口（Vite 开发服务器）
VITE_API_PORT=3001                 # 后端 API 端口（前端可访问，用于生产环境）
SERVER_HOST=0.0.0.0                # 服务器监听地址: 0.0.0.0(所有接口) / 127.0.0.1(仅本地)

# ========== JWT 认证 ==========
JWT_SECRET=your_jwt_secret_key_here_change_in_production
JWT_EXPIRES_IN=7d                  # Token 过期时间

# ========== Playwright 配置 ==========
PLAYWRIGHT_HEADLESS=true           # 无头模式: true / false
PLAYWRIGHT_BROWSER=chromium        # 浏览器: chromium / firefox / webkit

# ========== MCP 浏览器配置 ==========
MCP_BROWSER_FULLSCREEN=true        # MCP模式浏览器全屏: true / false (默认: true)
MCP_BROWSER_MAXIMIZED=true         # MCP模式浏览器最大化: true / false (默认: true)
MCP_BROWSER_WINDOW_SIZE=1920,1080  # MCP模式浏览器窗口大小 (默认: 1920,1080)

# ========== 测试执行配置 ==========
TEST_TIMEOUT=600000                # 测试超时: 10 分钟
MAX_CONCURRENT_TESTS=6             # 最大并发数

# ========== AI 模型配置 ==========
# OpenRouter 配置 (支持 GPT-4o, DeepSeek, Claude)
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_MODEL=openai/gpt-4o        # 默认模型
DEFAULT_TEMPERATURE=0.3
DEFAULT_MAX_TOKENS=4000

# 本地 Gemini API 配置 (可选)
GEMINI_LOCAL_BASE_URL=http://localhost:3000/v1
GEMINI_LOCAL_API_KEY=your_local_api_key_here

# 代理配置 (可选)
HTTP_PROXY=http://127.0.0.1:10808
HTTPS_PROXY=http://127.0.0.1:10808

# ========== RAG 知识库配置 ==========
QDRANT_URL=http://localhost:6333   # Qdrant 向量数据库地址
EMBEDDING_PROVIDER=aliyun          # Embedding 提供商: aliyun / gemini / openai
EMBEDDING_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_API_KEY=your_aliyun_key  # 阿里云通义千问 API Key
EMBEDDING_MODEL=text-embedding-v4  # 1024维向量模型

# ========== 日志配置 ==========
LOG_LEVEL=info                     # 日志级别: debug / info / warn / error
LOG_FULL_PROMPT=false              # 是否记录完整 AI Prompt
```

---

## 📊 配置项详解

### 数据库配置

| 配置项 | 说明 | 默认值 | 示例 |
|-------|------|--------|------|
| `DATABASE_URL` | MySQL 连接字符串（**必须包含时区配置**） | 无 | `mysql://user:pass@localhost:3306/Sakura AI?timezone=Asia/Shanghai` |

**格式**：`mysql://用户名:密码@主机:端口/数据库名?timezone=时区`

**⚠️ 时区配置说明：**
- **必须添加** `?timezone=Asia/Shanghai` 参数，确保时间存储和显示正确
- 如果不添加时区参数，会导致数据库存储的时间与实际时间相差8小时
- 中国地区请使用 `Asia/Shanghai`（UTC+8）

### 应用配置

| 配置项 | 说明 | 默认值 | 可选值 |
|-------|------|--------|--------|
| `NODE_ENV` | 运行环境 | development | development, production |
| `PORT` | 后端服务端口 | 3001 | 任意可用端口 |
| `VITE_PORT` | 前端开发端口 | 5173 | 任意可用端口 |
| `SERVER_HOST` | 服务器监听地址 | 0.0.0.0 | 0.0.0.0, 127.0.0.1 |

**`SERVER_HOST` 说明**：
- `0.0.0.0`: 监听所有网络接口，允许从局域网和其他设备访问（推荐用于开发和生产环境）
- `127.0.0.1`: 仅监听本地回环地址，只能从本机访问（用于安全限制场景）

**使用场景**：
- **开发环境**：使用 `0.0.0.0`，方便从其他设备（如手机、平板）访问测试
- **生产环境**：根据安全需求选择，如果需要外部访问则使用 `0.0.0.0`，配合防火墙规则
- **安全限制**：如果只需要本地访问，使用 `127.0.0.1`

### JWT 认证

| 配置项 | 说明 | 默认值 | 示例 |
|-------|------|--------|------|
| `JWT_SECRET` | JWT 签名密钥 | 无（必填） | 随机字符串，至少 32 位 |
| `JWT_EXPIRES_IN` | Token 过期时间 | 7d | 7d, 24h, 30m |

**安全提示**：生产环境务必修改 `JWT_SECRET`！

### Playwright 配置

| 配置项 | 说明 | 默认值 | 可选值 |
|-------|------|--------|--------|
| `PLAYWRIGHT_HEADLESS` | 无头模式 | true | true, false |
| `PLAYWRIGHT_BROWSER` | 浏览器类型 | chromium | chromium, firefox, webkit |

**说明**：
- `true`: 后台运行，不显示浏览器窗口
- `false`: 显示浏览器窗口（调试时使用）

### MCP 浏览器配置

| 配置项 | 说明 | 默认值 | 示例 |
|-------|------|--------|------|
| `MCP_BROWSER_FULLSCREEN` | MCP模式浏览器全屏模式 | true | true, false |
| `MCP_BROWSER_MAXIMIZED` | MCP模式浏览器最大化窗口 | true | true, false |
| `MCP_BROWSER_WINDOW_SIZE` | MCP模式浏览器窗口大小 | 1920,1080 | 1920,1080, 1366,768 |

**说明**：
- `MCP_BROWSER_FULLSCREEN=true`: 启用全屏模式（kiosk模式，无标题栏和工具栏）
- `MCP_BROWSER_FULLSCREEN=false`: 使用普通窗口模式
- `MCP_BROWSER_MAXIMIZED=true`: 窗口最大化启动
- `MCP_BROWSER_WINDOW_SIZE`: 设置窗口大小，格式为 `宽度,高度`

### 测试执行配置

| 配置项 | 说明 | 默认值 | 单位 |
|-------|------|--------|------|
| `TEST_TIMEOUT` | 单个测试超时时间 | 600000 | 毫秒 (10 分钟) |
| `MAX_CONCURRENT_TESTS` | 最大并发测试数 | 6 | 数量 |

---

## 🤖 AI 模型配置

### OpenRouter 配置

**获取 API Key**：
1. 访问 [OpenRouter](https://openrouter.ai)
2. 注册账号
3. 创建 API Key

| 配置项 | 说明 | 示例 |
|-------|------|------|
| `OPENROUTER_API_KEY` | OpenRouter API 密钥 | sk-or-v1-xxxxx |
| `OPENROUTER_BASE_URL` | API 基础 URL | https://openrouter.ai/api/v1 |
| `DEFAULT_MODEL` | 默认模型 | openai/gpt-4o |
| `DEFAULT_TEMPERATURE` | 温度参数 | 0.3 |
| `DEFAULT_MAX_TOKENS` | 最大 Token 数 | 4000 |

**支持的模型**：
- `openai/gpt-4o` - GPT-4o (高性能)
- `deepseek/deepseek-chat-v3` - DeepSeek Chat V3 (高性价比)
- `anthropic/claude-sonnet-4.5` - Claude Sonnet 4.5 (长上下文)

### 本地 Gemini API 配置

| 配置项 | 说明 | 示例 |
|-------|------|------|
| `GEMINI_LOCAL_BASE_URL` | 本地 API 地址 | http://localhost:3000/v1 |
| `GEMINI_LOCAL_API_KEY` | 本地 API 密钥 | your_api_key |

**使用场景**：本地部署的 Gemini 2.5 Flash 模型，支持离线使用。

### 代理配置

| 配置项 | 说明 | 示例 |
|-------|------|------|
| `HTTP_PROXY` | HTTP 代理地址 | http://127.0.0.1:10808 |
| `HTTPS_PROXY` | HTTPS 代理地址 | http://127.0.0.1:10808 |

**使用场景**：访问国外 API 时需要代理。

---

## 🧠 RAG 知识库配置

### Qdrant 配置

| 配置项 | 说明 | 示例 |
|-------|------|------|
| `QDRANT_URL` | Qdrant 数据库地址 | http://localhost:6333 |

**启动 Qdrant**：
```bash
docker run -d -p 6333:6333 qdrant/qdrant
```

### Embedding API 配置

| 配置项 | 说明 | 可选值 | 推荐 |
|-------|------|--------|------|
| `EMBEDDING_PROVIDER` | Embedding 提供商 | aliyun, gemini, openai | aliyun |
| `EMBEDDING_API_BASE_URL` | API 基础 URL | - | - |
| `EMBEDDING_API_KEY` | API 密钥 | - | - |
| `EMBEDDING_MODEL` | 向量模型 | - | text-embedding-v4 |

**阿里云配置**：
```bash
EMBEDDING_PROVIDER=aliyun
EMBEDDING_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_API_KEY=sk-xxxxx
EMBEDDING_MODEL=text-embedding-v4
```

**获取阿里云 API Key**：
- 访问 [阿里云 DashScope 控制台](https://dashscope.console.aliyun.com/apiKey)

---

## 📝 日志配置

| 配置项 | 说明 | 可选值 | 默认值 |
|-------|------|--------|--------|
| `LOG_LEVEL` | 日志级别 | debug, info, warn, error | info |
| `LOG_FULL_PROMPT` | 记录完整 AI Prompt | true, false | false |

**日志级别说明**：
- `debug`: 详细调试信息
- `info`: 一般信息
- `warn`: 警告信息
- `error`: 错误信息

**`LOG_FULL_PROMPT=true` 用途**：
- 调试 AI 生成质量
- 查看 RAG 知识注入效果
- 分析 AI 决策过程

---

## 🎯 推荐配置

### 开发环境

```bash
NODE_ENV=development
PORT=3001
SERVER_HOST=0.0.0.0        # 允许从局域网访问
PLAYWRIGHT_HEADLESS=false  # 显示浏览器，方便调试
LOG_LEVEL=debug
LOG_FULL_PROMPT=true       # 查看完整 Prompt
```

### 生产环境

```bash
NODE_ENV=production
PORT=3001
SERVER_HOST=0.0.0.0        # 根据安全需求选择，配合防火墙规则
PLAYWRIGHT_HEADLESS=true
LOG_LEVEL=info
LOG_FULL_PROMPT=false
JWT_SECRET=your_random_256_bit_secret_here  # 务必修改！
```

### 测试环境

```bash
NODE_ENV=test
PLAYWRIGHT_HEADLESS=true
LOG_LEVEL=warn
TEST_TIMEOUT=300000  # 5 分钟，加快测试速度
```

---

## 🔧 配置优先级

1. **环境变量**：直接设置的环境变量优先级最高
2. **`.env` 文件**：项目根目录的 `.env` 文件
3. **默认值**：代码中的默认值

**示例**：
```bash
# 方式 1：环境变量（优先级最高）
PORT=3002 npm run dev

# 方式 2：.env 文件
echo "PORT=3002" >> .env
npm run dev

# 方式 3：代码默认值
# 如果未配置，使用代码中的默认值 3001
```

---

## 🔗 相关文档

- [安装指南](INSTALLATION.md) - 详细安装步骤
- [RAG 配置](RAG_SETUP.md) - RAG 知识库配置
- [故障排除](TROUBLESHOOTING.md) - 配置问题解决

---

**返回**: [README](../README.md)
