# Axure自动生成测试用例功能 - 数据库迁移指南

## 功能概述

本功能允许用户上传Axure导出的HTML原型文件,通过AI自动解析页面结构,生成完整的功能测试用例库。

## 数据库迁移步骤

### 1. 确保MySQL正在运行

```bash
# Windows
net start MySQL

# 或检查服务状态
sc query MySQL
```

### 2. 运行Prisma迁移

```bash
# 应用数据库迁移(创建新表)
npx prisma migrate dev --name add_functional_test_cases

# 生成Prisma客户端
npx prisma generate
```

### 3. 验证表已创建

登录MySQL查看:

```sql
USE automation_testing;

-- 查看功能测试用例表
DESCRIBE functional_test_cases;

-- 查看AI生成会话表
DESCRIBE ai_generation_sessions;

-- 确认枚举类型
SHOW COLUMNS FROM functional_test_cases LIKE 'priority';
SHOW COLUMNS FROM functional_test_cases LIKE 'status';
SHOW COLUMNS FROM functional_test_cases LIKE 'source';
```

## 新增的数据库表

### 1. functional_test_cases (功能测试用例表)

完全独立于UI自动化测试用例(test_cases),存储AI生成的功能测试用例。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键 |
| name | VARCHAR(255) | 用例名称 |
| description | TEXT | 用例描述 |
| steps | TEXT | 测试步骤(JSON格式) |
| assertions | TEXT | 验证点(JSON格式) |
| system | VARCHAR(100) | 所属系统 |
| module | VARCHAR(100) | 所属模块 |
| priority | ENUM | 优先级(high/medium/low) |
| tags | VARCHAR(500) | 标签 |
| status | ENUM | 状态(DRAFT/PUBLISHED/ARCHIVED) |
| source | ENUM | 来源(AI_GENERATED/MANUAL/IMPORTED) |
| ai_session_id | VARCHAR(100) | AI生成会话ID |
| creator_id | INT | 创建人ID |
| department_id | INT | 部门ID(权限控制) |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 2. ai_generation_sessions (AI生成会话表)

跟踪每次Axure文件的AI生成过程。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(100) | 会话ID |
| user_id | INT | 用户ID |
| axure_filename | VARCHAR(255) | 上传的文件名 |
| requirement_doc | TEXT | 生成的需求文档 |
| page_count | INT | 页面数量 |
| total_generated | INT | 生成的用例总数 |
| total_saved | INT | 保存的用例总数 |
| batches | JSON | 批次信息 |
| metadata | JSON | 其他元数据 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 3. 新增枚举类型

```prisma
enum functional_test_priority {
  high
  medium
  low
}

enum functional_test_status {
  DRAFT      // 草稿(前端未保存)
  PUBLISHED  // 已发布
  ARCHIVED   // 已归档
}

enum functional_test_source {
  AI_GENERATED  // AI生成
  MANUAL        // 手动创建
  IMPORTED      // 导入
}
```

## 功能访问路径

### 前端路由
- 功能测试用例列表: `/functional-test-cases`
- AI生成器: `/functional-test-cases/generator`

### API端点
- `POST /api/v1/axure/parse` - 解析Axure文件
- `POST /api/v1/axure/generate-requirement` - 生成需求文档
- `POST /api/v1/axure/plan-batches` - 规划批次策略
- `POST /api/v1/axure/generate-batch` - 生成单批次用例
- `POST /api/v1/axure/regenerate-cases` - 重新生成用例
- `GET /api/v1/functional-test-cases` - 获取用例列表
- `POST /api/v1/functional-test-cases/batch-save` - 批量保存用例
- `PUT /api/v1/functional-test-cases/:id` - 更新用例
- `DELETE /api/v1/functional-test-cases/:id` - 删除用例

## AI服务集成

### 已集成功能
✅ 配置管理器集成 - 使用项目统一的LLM配置
✅ 需求文档生成 - 基于Axure原型和项目信息
✅ 批次策略规划 - 智能划分测试场景
✅ 测试用例生成 - 详细的步骤和验证点
✅ 用例优化重生成 - 根据指令改进用例

### AI配置
AI服务使用项目现有的LLM配置管理器(`llmConfigManager`),支持:
- OpenRouter API (默认使用 openai/gpt-4o)
- Anthropic Claude API
- OpenAI API

配置文件: `.env` 或通过前端配置页面

### 回退机制
所有AI服务都包含回退方案,即使AI API不可用也能生成基础的测试用例模板。

## 使用流程

### 1. 准备Axure文件
导出Axure原型为HTML文件(最大50MB)

### 2. 上传并生成
1. 进入"功能测试用例" → 点击"AI生成器"
2. 上传Axure HTML文件
3. 填写项目信息(项目名、系统类型、业务规则等)
4. 点击"解析Axure"

### 3. 审核需求文档
AI生成需求文档后,可以在线编辑修改

### 4. 分批生成用例
1. AI规划批次策略
2. 逐批次生成测试用例
3. 在草稿箱中预览编辑
4. 选择性保存到用例库

### 5. 优化和管理
- 重新生成: 根据指令优化选定用例
- 补充生成: 追加新的测试场景
- 用例管理: 在列表页查看、编辑、删除

## 权限控制

### 数据隔离
- 普通用户: 只能看到本部门的功能测试用例
- 超级管理员: 可以看到所有用例

### 操作权限
- 创建人: 可以编辑、删除自己创建的用例
- 部门管理员: 可以管理本部门的所有用例
- 超级管理员: 全部权限

## 技术架构

### 后端
- Express + TypeScript
- Prisma ORM
- MySQL数据库
- Multer文件上传
- Cheerio HTML解析
- AI API集成(OpenRouter/Anthropic/OpenAI)

### 前端
- React 18 + TypeScript
- Ant Design UI组件
- Tailwind CSS
- React Router
- Axios API客户端

### 文件组织
```
server/
├── routes/
│   ├── axure.ts                    # Axure相关API
│   └── functionalTestCase.ts      # 用例CRUD API
├── services/
│   ├── axureParseService.ts       # Axure解析
│   ├── functionalTestCaseAIService.ts  # AI生成服务
│   └── functionalTestCaseCRUDService.ts # CRUD服务
├── middleware/
│   └── upload.ts                   # 文件上传中间件
└── types/
    └── axure.ts                    # Axure类型定义

src/
├── pages/
│   ├── FunctionalTestCases.tsx         # 用例列表页
│   └── FunctionalTestCaseGenerator.tsx # AI生成器页
├── services/
│   └── functionalTestCaseService.ts    # 前端API服务
└── components/
    └── Layout.tsx                       # 导航菜单(已添加)

prisma/
└── schema.prisma                   # 数据库schema(已更新)
```

## 故障排查

### 问题1: 迁移失败 "Can't reach database"
**原因**: MySQL未启动
**解决**: `net start MySQL` (Windows)

### 问题2: AI生成失败
**原因**: API配置错误或网络问题
**解决**:
1. 检查 `.env` 中的 `AI_MODEL_PROVIDER` 配置
2. 验证API密钥有效性
3. 功能会自动回退到基础模板

### 问题3: 文件上传失败
**原因**: 文件过大或格式错误
**解决**:
1. 确保文件 ≤ 50MB
2. 只接受 .html 或 .htm 格式
3. 检查 `uploads/axure/` 目录权限

### 问题4: Prisma客户端类型错误
**原因**: 未生成最新的Prisma客户端
**解决**: `npx prisma generate`

## 下一步计划

### 短期优化
- [ ] 添加用例详情页和编辑页
- [ ] 支持导出测试用例(Excel/Word)
- [ ] 批量操作(批量删除、批量更新)
- [ ] 用例版本历史

### 长期规划
- [ ] 用例执行记录关联
- [ ] 测试结果统计分析
- [ ] 用例质量评分
- [ ] 与UI自动化用例联动

## 联系支持

如有问题,请查看项目文档或提Issue。
