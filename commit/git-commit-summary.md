# Git 提交汇总

## 最新提交：2026-02-02

### 提交命令

```bash
git add README.md docs/DOCKER_DEBIAN_DEPLOYMENT.md commit/git-commit-log.md commit/git-commit-summary.md
git commit -m "docs: 完善 Docker Debian 部署文档

新增/修改：
1. README.md - 扩展 Docker 部署章节
   - Docker 部署优势对比表
   - 详细的前置要求和安装步骤
   - 四步快速部署流程
   - 完整的服务管理命令
   - 可选服务启用（RAG、Nginx）
   - 监控维护和数据备份恢复
   - 常见问题诊断和解决方案

2. docs/DOCKER_DEBIAN_DEPLOYMENT.md - 创建完整部署文档
   - 为什么选择 Debian + Docker
   - 前置要求和 Docker 安装
   - 快速部署四步流程
   - 服务管理（脚本 + Docker Compose）
   - 可选服务启用
   - 监控和维护
   - 更新应用
   - 常见问题（5个详细案例）
   - 安全加固
   - 性能优化

效果：
- 用户可在 README 中快速了解部署流程
- DOCKER_DEBIAN_DEPLOYMENT.md 提供详细的部署指南
- 完整的故障排除和最佳实践
- 提升用户部署体验"
```

### 修改文件

| 文件 | 说明 |
|-----|------|
| `README.md` | 扩展 Docker 部署章节，添加详细的部署和管理说明 |
| `docs/DOCKER_DEBIAN_DEPLOYMENT.md` | 创建完整的 Debian Docker 部署指南 |

---

## 历史提交汇总

---

### 2026-02-02：修正 docker-compose.yml 构建配置

**问题：**
- 镜像名称重复：`sakura-ai-sakura-ai:latest`
- 构建上下文错误：无法访问项目根目录

**修复：**
- 构建上下文改为项目根目录：`context: ../..`
- 显式指定镜像名称：`image: sakura-ai:latest`
- 移除废弃的 `version` 字段

**效果：**
- 镜像名称简洁清晰
- 构建上下文正确
- 符合 Dockerfile 的文件访问需求

---

### 2026-02-02：修复 Debian Docker 中系统 Chromium 路径错误

**问题：**
- 使用系统 Chromium 时报错：`executable doesn't exist at /usr/bin/chromium-browser`
- Debian 系统中 Chromium 的实际路径是 `/usr/bin/chromium`

**修复：**
- 修正环境变量：`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`
- 添加构建时验证步骤
- 更新 docker-compose.yml 环境变量

**不同系统的 Chromium 路径：**
- Debian/Ubuntu: `/usr/bin/chromium`
- Alpine Linux: `/usr/bin/chromium-browser`

---

### 2026-02-02：修复 Vite 构建时解析 server 依赖错误

**问题：**
- Docker 构建时 Vite 报错：`PrismaClient is not exported`
- 原因：`llmConfigManager.ts` 动态导入 server 模块，Vite 静态分析时解析整个依赖链

**修复：**
- 在 `vite.config.ts` 中添加 `build.rollupOptions.external` 配置
- 排除所有 server 目录的导入（`/^\.\.\/\.\.\/server\//` 等）

**效果：**
- Vite 构建时不再解析 server 代码
- 动态 import 在后端运行时仍然有效
- 前端构建成功，前后端共享代码正常工作

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

#### 3. Docker 管理脚本优化

**新增功能：**
- `install` - 首次安装
- `start/stop/restart` - 服务管理
- `status` - 查看服务状态
- `logs` - 查看日志
- `backup/restore` - 数据库备份恢复
- `clean` - 清理所有数据
- 自动转换 Windows 换行符

---

## 问题解决对比

| 问题 | 修复前 | 修复后 |
|------|--------|--------|
| **Chromium 路径** | ❌ /usr/bin/chromium-browser | ✅ /usr/bin/chromium |
| **Vite 构建错误** | ❌ Prisma 导出错误 | ✅ 成功构建 |
| **LLM配置管理** | ❌ 后端加载错误配置 | ✅ 正确加载数据库配置 |
| **本地模型验证** | ❌ 强制要求API密钥 | ✅ API密钥可选 |
| **服务启动** | ❌ 配置缺失无法启动 | ✅ 回退到默认配置 |
| **前端UI提示** | ❌ 提示不明确 | ✅ 清晰区分本地/云端 |
| **Chromium 启动** | ❌ ENOENT 错误 | ✅ 正常启动 |
| **Headless 模式** | ❌ Missing X server | ✅ 强制启用 |
| **视口大小** | ❌ 不确定（~800x600）| ✅ 1920x1080 |
| **页面显示** | ❌ 右侧截断 | ✅ 完整显示 |
| **Docker 构建** | ❌ 依赖冲突/超时 | ✅ 完整兼容 |
