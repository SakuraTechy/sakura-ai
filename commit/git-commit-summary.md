# Git 提交汇总

## 2026-02-03

### fix: 恢复 migrate diff 自动检测方案，优化错误提示说明

**问题：** 
- 之前移除了自动 `db push`，但表被删除后不会自动修复
- 用户反馈：虽然 `db push` 会报重复键错误，但实际不影响服务运行

**修复：** 
- 恢复使用 `migrate diff` 检测差异的方案
- 优化错误提示，明确告知用户可以忽略 Prisma 的重复键错误
- 权衡：选择"自动修复 + 可忽略的错误提示"而不是"手动修复 + 无错误提示"

**提交命令：**
```bash
git add scripts/start.cjs commit/git-commit-log.md commit/git-commit-summary.md
git commit -m "fix: 恢复 migrate diff 自动检测方案，优化错误提示说明"
```

---

### fix: 修复启动时 db push 重复创建外键的问题，仅在迁移失败时使用

**问题：** `migrate deploy` 成功后仍执行 `db push`，导致重复创建外键错误

**修复：** 只在 `migrate deploy` 失败时才使用 `db push` 作为修复手段，成功则直接完成

**提交命令：**
```bash
git add scripts/start.cjs commit/git-commit-log.md commit/git-commit-summary.md
git commit -m "fix: 修复启动时 db push 重复创建外键的问题，仅在迁移失败时使用"
```

---

### fix: 增强启动脚本的数据库同步能力，自动修复表结构不一致

**问题：** `migrate deploy` 只应用新迁移，不检测结构一致性，表被删除或修改后不会自动修复

**修复：** 在 `migrate deploy` 后执行 `db push --accept-data-loss`，自动同步结构差异

**提交命令：**
```bash
git add scripts/start.cjs commit/git-commit-log.md commit/git-commit-summary.md
git commit -m "fix: 增强启动脚本的数据库同步能力，自动修复表结构不一致"
```

---

### refactor: 优化启动脚本的数据库迁移逻辑，支持标准 Prisma 迁移

**问题：** 之前完全跳过迁移不够灵活，日常启动应该可以安全执行迁移

**优化：** 智能检测标准迁移目录，有则执行 `migrate deploy`（幂等），无则跳过（避免 `db push`）

**提交命令：**
```bash
git add scripts/start.cjs commit/git-commit-log.md commit/git-commit-summary.md
git commit -m "refactor: 优化启动脚本的数据库迁移逻辑，支持标准 Prisma 迁移"
```

---

### fix: 彻底移除启动时的数据库迁移，避免重复创建外键错误

**问题：** 第二次启动持续报错 `Can't write; duplicate key in table`，迁移目录结构不标准导致 `db push` 重复执行

**修复：** 完全跳过启动时的数据库迁移，改为手动执行 `npx prisma db push`

**提交命令：**
```bash
git add scripts/start.cjs commit/git-commit-log.md commit/git-commit-summary.md
git commit -m "fix: 彻底移除启动时的数据库迁移，避免重复创建外键错误"
```

---

### fix: 修复第二次启动时 Prisma db push 重复创建外键导致的错误

**问题：** 第二次启动报错 `Can't write; duplicate key in table`，`migrate deploy` 后总是执行 `db push` 导致重复创建外键

**修复：** 修改启动脚本逻辑，`migrate deploy` 成功后不再执行 `db push`，只在失败时回退

**提交命令：**
```bash
git add scripts/start.cjs commit/git-commit-log.md commit/git-commit-summary.md
git commit -m "fix: 修复第二次启动时 Prisma db push 重复创建外键导致的错误"
```

---

### fix: 修复 Settings.tsx 中 selectedModel 为 null 时的空指针错误

**问题：** `selectedModel.provider` 访问导致 `TypeError: Cannot read properties of null`

**修复：** 所有 `selectedModel.provider` 改为 `selectedModel?.provider`（15 处）

**提交命令：**
```bash
git add src/pages/Settings.tsx commit/git-commit-log.md commit/git-commit-summary.md
git commit -m "fix: 修复 Settings.tsx 中 selectedModel 为 null 时访问 provider 属性导致的错误"
```

---

### fix: 修复 Prisma schema 中 AI 缓存表 expires_at 字段的默认值问题

**问题：** MySQL TIMESTAMP 字段必须有默认值或设置为可空

**修复：** 将三个 AI 缓存表的 `expires_at` 字段改为可空（`DateTime?`）

**同步方式：** `npx prisma db push`（无需 shadow database 权限）

**提交命令：**
```bash
git add prisma/schema.prisma commit/git-commit-log.md commit/git-commit-summary.md
git commit -m "fix: 修复 Prisma schema 中 AI 缓存表 expires_at 字段的默认值问题"
```

---

```bash
git add README.md commit/git-commit-log.md commit/git-commit-summary.md
git commit -m "docs: 添加 Windows 系统 Docker 安装说明

- 在 README.md 中新增 Windows 平台 Docker 安装指南
- 提供 Docker Desktop（推荐）和 WSL2 两种安装方式
- 完善跨平台部署文档（支持 CentOS、Ubuntu、Windows）"
```

---

**近期更新（2026-01-28 ~ 2026-02-03）**

- Windows Docker 安装说明
- NewApi 模型配置支持

- NewApi 模型配置支持
- README GitHub 样式修复
- Docker Debian 完整部署（文档+脚本+Chromium路径）
- Vite 构建排除 server 依赖
- LLM 配置（本地模型+容错）
- Playwright 方案（Alpine→Debian）
- 性能优化（构建93MB→5MB+数据库索引）

详细日志：`commit/git-commit-log.md`

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
