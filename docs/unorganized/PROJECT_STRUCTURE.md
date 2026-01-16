# Sakura AI 项目结构说明

> 最后更新: 2025-11-10

## 📁 目录结构

```
Sakura AI/
├── 📁 src/                      # 前端源代码
│   ├── components/              # React组件
│   ├── pages/                   # 页面组件
│   ├── services/                # API服务
│   ├── types/                   # TypeScript类型定义
│   ├── utils/                   # 工具函数
│   ├── contexts/                # React Context
│   └── assets/                  # 静态资源
│
├── 📁 server/                   # 后端源代码
│   ├── routes/                  # Express路由
│   ├── services/                # 业务逻辑服务
│   ├── types/                   # 后端类型定义
│   └── index.ts                 # 服务器入口
│
├── 📁 prisma/                   # 数据库
│   ├── schema.prisma            # 数据库模型定义
│   └── migrations/              # 数据库迁移文件
│
├── 📁 public/                   # 公共静态资源
│   └── assets/                  # 图片、图标等
│
├── 📁 scripts/                  # 构建和工具脚本
│   ├── start.cjs                # 一键启动脚本
│   └── ...                      # 其他脚本
│
├── 📁 tests/                    # 测试文件
│   └── ...                      # Jest/Playwright测试
│
├── 📁 docs/                     # 📌 文档目录
│   ├── tech-docs/               # 技术文档
│   │   ├── AI_CONFIG_OPTIMIZATION.md
│   │   ├── MCP_DEPLOYMENT_GUIDE.md
│   │   ├── TEST_EXECUTION_PERFORMANCE_OPTIMIZATION.md
│   │   └── ...
│   └── archived/                # 归档文档
│
├── 📁 lib/                      # 第三方库和工具
│
├── 📁 migrations/               # 额外的迁移脚本
│
├── 📁 tasks/                    # 任务定义文件
│
├── 📁 bmad/                     # BMAD相关文件
│
├── 📁 node_modules/             # ❌ NPM依赖（不提交到Git）
├── 📁 dist/                     # ❌ 构建产物（不提交）
├── 📁 artifacts/                # ❌ 测试截图和证据（不提交）
├── 📁 logs/                     # ❌ 运行日志（不提交）
├── 📁 temp/                     # ❌ 临时文件（不提交）
├── 📁 uploads/                  # ❌ 用户上传文件（不提交）
│
├── 📄 package.json              # ✅ NPM配置
├── 📄 vite.config.ts            # ✅ Vite构建配置
├── 📄 tsconfig.json             # ✅ TypeScript配置
├── 📄 tailwind.config.js        # ✅ Tailwind CSS配置
├── 📄 playwright.config.js      # ✅ E2E测试配置
├── 📄 jest.config.js            # ✅ 单元测试配置
├── 📄 eslint.config.js          # ✅ 代码检查配置
├── 📄 index.html                # ✅ 入口HTML
├── 📄 .gitignore                # ✅ Git忽略规则
├── 📄 README.md                 # ✅ 项目说明
├── 📄 CLAUDE.md                 # ✅ Claude Code指南
├── 📄 TYPOGRAPHY_GUIDE.md       # ✅ 字体使用规范
├── 📄 PROJECT_STRUCTURE.md      # ✅ 本文件
└── 📄 CHANGES.md                # ✅ 更新日志
```

---

## 🎯 核心目录说明

### 前端 (`src/`)
- **components/** - React UI组件
  - `ui/` - 基础UI组件（Button, Input等）
  - `dashboard/` - Dashboard专用组件
  - `ai-generator/` - AI生成器组件
- **pages/** - 页面级组件，对应路由
- **services/** - API调用封装
- **types/** - TypeScript类型定义

### 后端 (`server/`)
- **routes/** - API路由定义
- **services/** - 核心业务逻辑
  - `testExecution.ts` - 测试执行服务
  - `mcpClient.ts` - MCP协议客户端
  - `aiBulkUpdateService.ts` - AI批量更新
- **types/** - 后端类型定义

### 数据库 (`prisma/`)
- `schema.prisma` - 数据模型定义
- `migrations/` - 数据库版本迁移

---

## 📚 文档位置

### 开发文档（根目录）
- `README.md` - 项目介绍和快速开始
- `CLAUDE.md` - Claude Code使用指南
- `TYPOGRAPHY_GUIDE.md` - 字体设计规范
- `CHANGES.md` - 版本更新日志

### 技术文档 (`docs/tech-docs/`)
- `MCP_DEPLOYMENT_GUIDE.md` - MCP部署指南
- `TEST_EXECUTION_PERFORMANCE_OPTIMIZATION.md` - 性能优化
- `AI_CONFIG_OPTIMIZATION.md` - AI配置优化
- `Sakura AI系统功能介绍文档.md` - 功能说明
- 等等...

---

## 🚫 不应出现在根目录的文件

以下文件类型会被 `.gitignore` 自动排除：

### 临时测试脚本
```
test-*.js
test-*.html
*-demo.js
check-*.js
debug-*.js
```

### 临时优化脚本
```
*-optimization.ts
*-patch.ts
update_*.py
```

### 临时配置和数据
```
defaultProfile.*
mcp-config.json
screenshot-config.json
*.sql (根目录)
testfile.txt
```

---

## 📝 开发规范

### 1. 文件放置规则
- ✅ **测试脚本** → `tests/` 或 `scripts/temp/`
- ✅ **文档** → `docs/tech-docs/`
- ✅ **工具脚本** → `scripts/`
- ✅ **临时文件** → `temp/` (会被gitignore)
- ❌ **不要在根目录创建临时文件**

### 2. 命名规范
- 源代码: `camelCase.ts` 或 `PascalCase.tsx`
- 配置文件: `lowercase.config.js`
- 文档: `UPPERCASE_WITH_UNDERSCORES.md`
- 组件: `PascalCase.tsx`

### 3. 提交规范
- 不提交 `node_modules/`, `dist/`, `artifacts/`, `logs/`
- 不提交临时测试脚本和配置文件
- 提交前运行 `git status` 检查

---

## 🛠️ 常用命令

### 开发
```bash
npm run dev              # 启动开发服务器
npm run dev:frontend     # 仅前端
npm run dev:server       # 仅后端
```

### 测试
```bash
npm test                 # 运行测试
npm run lint             # 代码检查
```

### 构建
```bash
npm run build            # 构建生产版本
npm run preview          # 预览构建结果
```

### 数据库
```bash
npx prisma migrate dev   # 应用迁移
npx prisma generate      # 生成客户端
npx prisma studio        # 数据库可视化
```

---

## 🔍 快速查找文件

### 查找源代码
```bash
# 查找React组件
find src/components -name "*.tsx"

# 查找API路由
find server/routes -name "*.ts"
```

### 查找文档
```bash
# 查找所有Markdown文档
find docs -name "*.md"

# 搜索文档内容
grep -r "关键词" docs/
```

---

## 📞 需要帮助？

- 查看 [README.md](README.md) - 项目介绍
- 查看 [CLAUDE.md](CLAUDE.md) - AI助手指南
- 查看 `docs/tech-docs/` - 技术文档
- 提Issue到项目仓库

---

**保持项目结构整洁，让协作更高效！** ✨
