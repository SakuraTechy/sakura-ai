# Git 提交汇总

## 最新提交：2026-02-02

### 提交命令

```bash
git add src/services/llmConfigManager.ts src/utils/llmSettingsValidation.ts server/services/aiParser.ts src/pages/Settings.tsx commit/git-commit-log.md
git commit -m "fix: 修复LLM配置管理器环境服务调用、本地模型验证和前端UI提示

- 后端环境使用错误的设置服务，导致加载错误的模型配置
- 本地模型API密钥验证错误，强制要求所有模型都必须有API密钥
- 配置管理器初始化失败导致服务无法启动
- 前端UI提示不明确，部分模型超链接缺失

修复内容：
- llmConfigManager.ts：添加环境检测，动态选择前端/后端服务
- llmSettingsValidation.ts：本地模型允许空密钥，云端模型必填
- aiParser.ts：配置未就绪时回退到默认配置而不是抛出错误
- Settings.tsx：优化本地模型提示，修复所有厂商超链接

效果：
- 本地模型（Ollama/LM Studio）无需API密钥即可正常使用
- 云端模型仍然要求有效的API密钥
- 后端启动时即使API密钥未配置也能正常启动
- 前端UI清晰提示本地模型API密钥是可选的"
```

### 修改文件

| 文件 | 说明 |
|-----|------|
| `src/services/llmConfigManager.ts` | 添加环境检测和动态服务加载 |
| `src/utils/llmSettingsValidation.ts` | 本地模型允许空密钥 |
| `server/services/aiParser.ts` | 配置未就绪时回退到默认配置 |
| `src/pages/Settings.tsx` | 优化UI提示和超链接 |

---

## 历史提交汇总

---

### 2026-02-02：修复LLM配置管理器环境服务调用、本地模型验证和前端UI提示

**问题：**
- 后端环境使用错误的设置服务，导致加载错误的模型配置
- 本地模型API密钥验证错误，强制要求所有模型都必须有API密钥
- 配置管理器初始化失败导致服务无法启动
- 前端UI提示不明确，部分模型超链接缺失

**修复内容：**
- llmConfigManager.ts：添加环境检测，动态选择前端/后端服务
- llmSettingsValidation.ts：本地模型允许空密钥，云端模型必填
- aiParser.ts：配置未就绪时回退到默认配置而不是抛出错误
- Settings.tsx：优化本地模型提示，修复所有厂商超链接

**修改文件：**
- `src/services/llmConfigManager.ts`
- `src/utils/llmSettingsValidation.ts`
- `server/services/aiParser.ts`
- `src/pages/Settings.tsx`

---

### 2026-01-31：Docker 构建优化

**问题：** Docker 构建时 Vite 解析 server 依赖导致 Prisma 导出错误

**修复：**
- 创建前端独立的 `dateUtils.ts`，避免导入 server 模块
- 修改 docker-compose.yml 构建上下文为项目根目录
- 优化 Dockerfile 中 Prisma 客户端生成顺序

**修改文件：**
- `src/pages/TestPlanDetail.tsx`
- `src/utils/dateUtils.ts`
- `docker/Debian Linux/docker-compose.yml`
- `docker/Debian Linux/Dockerfile.debian`

---

### 2026-01-30：性能优化

**1. 修复执行历史查询 MySQL sort buffer 溢出**
- 将 `include` 改为 `select`，只查询需要的字段
- 添加复合索引：`@@index([test_case_id, executed_at(sort: Desc)])`

**2. 修复中文注释乱码**
- 修复 server 目录下 6 个文件的中文注释乱码问题

---

### 2026-01-28：Debian Linux Docker 完整部署方案

#### 1. Docker 构建性能优化

**新增文件：**
- `.dockerignore` - 排除不必要的构建文件
- `docker/daemon.json` - Docker 镜像加速配置

**性能提升：**
- 构建上下文：93.52MB → ~5-10MB
- 镜像拉取速度：提升 3-5 倍
- 首次构建：5-10 分钟
- 增量构建：1-3 分钟

#### 2. Playwright 浏览器完整解决方案

**关键修复：**
1. 改用 `node:20-slim`（Debian）解决 Playwright 兼容性
2. 安装完整浏览器组件：chromium + chromium-headless-shell + ffmpeg
3. 配置 Debian 国内镜像源解决网络超时
4. 统一 Playwright 版本为 1.56.1
5. 强制 sharp 从源码编译
6. 手动安装 rollup Linux 原生模块
7. 调整构建顺序：先 prisma generate 再 vite build

**修改文件：**
- `Dockerfile.alpine` → 改用 Debian slim
- `server/services/playwrightTestRunner.ts`
- `server/services/midsceneTestRunner.ts`
- `scripts/start.cjs`
- `package.json`

#### 3. Docker 管理脚本优化

**新增功能：**
- `install` - 首次安装
- `start/stop/restart` - 服务管理
- `status` - 查看服务状态
- `logs` - 查看日志
- `backup/restore` - 数据库备份恢复
- `clean` - 清理所有数据
- 自动转换 Windows 换行符

**修改文件：**
- `docker/Debian Linux/docker-install.sh`
- `docker/Alpine Linux/docker-install.sh`

---

## 问题解决对比

| 问题 | 修复前 | 修复后 |
|------|--------|--------|
| **LLM配置管理** | ❌ 后端加载错误配置 | ✅ 正确加载数据库配置 |
| **本地模型验证** | ❌ 强制要求API密钥 | ✅ API密钥可选 |
| **服务启动** | ❌ 配置缺失无法启动 | ✅ 回退到默认配置 |
| **前端UI提示** | ❌ 提示不明确 | ✅ 清晰区分本地/云端 |
| **Chromium 启动** | ❌ ENOENT 错误 | ✅ 正常启动 |
| **Headless 模式** | ❌ Missing X server | ✅ 强制启用 |
| **视口大小** | ❌ 不确定（~800x600）| ✅ 1920x1080 |
| **页面显示** | ❌ 右侧截断 | ✅ 完整显示 |
| **Docker 构建** | ❌ 依赖冲突/超时 | ✅ 完整兼容 |
