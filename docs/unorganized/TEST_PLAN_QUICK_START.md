# 测试计划模块 - 快速开始指南

## 概述

测试计划模块已经完全集成到系统中，提供了完整的测试计划管理功能。

## 已完成的工作

### ✅ 1. 数据库设计
- 创建了3个数据表：
  - `test_plans` - 测试计划主表
  - `test_plan_cases` - 测试计划与用例关联表
  - `test_plan_executions` - 测试计划执行记录表
- 定义了相关枚举类型（计划状态、计划类型）
- 文件位置：`prisma/schema.prisma`

### ✅ 2. 类型定义
- 创建了完整的TypeScript类型定义
- 包含：TestPlan, TestPlanCase, TestPlanExecution等
- 文件位置：`src/types/testPlan.ts`

### ✅ 3. 后端API
- 创建了完整的后端服务层：`server/services/testPlanService.ts`
- 创建了RESTful API路由：`server/routes/testPlan.ts`
- 在服务器中注册了路由：`server/index.ts`
- API基础路径：`/api/v1/test-plans`

### ✅ 4. 前端服务
- 创建了前端服务层：`src/services/testPlanService.ts`
- 封装了所有API调用

### ✅ 5. 前端页面
创建了3个主要页面：
- `TestPlans.tsx` - 测试计划列表页面
- `TestPlanForm.tsx` - 测试计划创建/编辑页面
- `TestPlanDetail.tsx` - 测试计划详情页面

### ✅ 6. 路由配置
- 在 `src/App.tsx` 中添加了测试计划路由
- 路由路径：
  - `/test-plans` - 列表页面
  - `/test-plans/create` - 创建页面
  - `/test-plans/:id` - 详情页面
  - `/test-plans/:id/edit` - 编辑页面

### ✅ 7. 导航菜单
- 在 `src/components/Layout.tsx` 中添加了测试计划导航项
- 图标：Target
- 位置：UI自动化和测试执行之间

### ✅ 8. 文档
- 创建了完整的使用说明文档：`docs/TEST_PLAN_MODULE.md`
- 创建了数据库迁移脚本：`prisma/migrations/add_test_plan_tables.sql`

## 部署步骤

### 步骤1: 数据库迁移

```bash
# 方式1: 使用Prisma迁移
npx prisma generate
npx prisma db push

# 方式2: 直接执行SQL脚本
mysql -u root -p sakura_ai < prisma/migrations/add_test_plan_tables.sql
```

### 步骤2: 重启服务器

```bash
# 重启后端服务
npm run dev

# 或者如果使用PM2
pm2 restart server
```

### 步骤3: 刷新前端

```bash
# 清理缓存并重新构建（如果需要）
npm run build

# 或者在开发模式下直接刷新浏览器即可
```

## 使用指南

### 创建测试计划

1. 登录系统
2. 点击左侧导航栏的"测试计划"
3. 点击"新建计划"按钮
4. 填写计划信息：
   - 计划名称（必填）
   - 计划类型（必填）：功能测试/UI自动化/混合测试等
   - 所属项目
   - 计划描述
   - 开始/结束日期
5. 点击"创建计划"

### 添加测试用例

1. 进入测试计划详情页面
2. 在"测试用例"标签页中点击"添加用例"
3. 选择用例类型：
   - 功能测试用例
   - UI自动化用例
4. 选择要添加的用例
5. 确认添加

### 执行测试计划

#### 功能测试执行
1. 在测试计划详情页面点击"执行功能测试"
2. 按照提示手动执行每个测试用例
3. 记录执行结果（通过/失败/阻塞/跳过）
4. 查看执行结果汇总

#### UI自动化执行
1. 在测试计划详情页面点击"执行UI自动化"
2. 系统自动执行所有UI自动化用例
3. 查看实时执行日志和进度
4. 查看执行结果汇总

### 查看统计数据

在测试计划详情页面的"统计分析"标签页中可以查看：
- 用例总数
- 通过率
- 执行率
- 失败/阻塞用例数
- 执行次数

## 功能特性

### 🎯 测试计划管理
- ✅ 创建、编辑、删除测试计划
- ✅ 支持多种计划类型（功能、UI自动化、混合、回归、冒烟、集成）
- ✅ 支持计划状态管理（草稿、进行中、已完成、已取消、已归档）
- ✅ 支持项目分类
- ✅ 支持时间范围设置

### 📋 用例管理
- ✅ 添加功能测试用例到计划
- ✅ 添加UI自动化用例到计划
- ✅ 移除用例
- ✅ 用例排序
- ✅ 查看用例执行状态和结果

### 🚀 执行管理
- ✅ 功能测试手动执行
- ✅ UI自动化批量执行
- ✅ 执行历史记录
- ✅ 执行结果汇总
- ✅ 执行进度跟踪

### 📊 统计分析
- ✅ 用例统计（总数、功能用例、UI自动化用例）
- ✅ 执行统计（执行率、通过率）
- ✅ 结果统计（通过、失败、阻塞、跳过）
- ✅ 执行次数统计

### 🔍 查询筛选
- ✅ 按项目筛选
- ✅ 按计划类型筛选
- ✅ 按状态筛选
- ✅ 关键词搜索
- ✅ 分页显示

## API端点

### 测试计划

```
GET    /api/v1/test-plans                        # 获取测试计划列表
GET    /api/v1/test-plans/:id                    # 获取测试计划详情
POST   /api/v1/test-plans                        # 创建测试计划
PUT    /api/v1/test-plans/:id                    # 更新测试计划
DELETE /api/v1/test-plans/:id                    # 删除测试计划（软删除）
```

### 用例管理

```
POST   /api/v1/test-plans/:id/cases              # 添加用例到测试计划
DELETE /api/v1/test-plans/:id/cases/:caseId     # 从测试计划中移除用例
PUT    /api/v1/test-plans/:id/cases/:caseId/status  # 更新用例执行状态
```

### 执行管理

```
POST   /api/v1/test-plans/:id/execute            # 开始执行测试计划
GET    /api/v1/test-plans/:id/executions         # 获取执行历史
PUT    /api/v1/test-plans/executions/:executionId  # 更新执行状态
```

## 数据模型

### TestPlan (测试计划)
```typescript
{
  id: number;
  name: string;              // 计划名称
  short_name?: string;       // 计划简称
  description?: string;      // 计划描述
  project?: string;          // 所属项目
  plan_type: TestPlanType;   // 计划类型
  status: TestPlanStatus;    // 计划状态
  members?: number[];        // 成员列表
  owner_id: number;          // 主负责人ID
  owner_name?: string;       // 主负责人姓名
  start_date?: string;       // 开始日期
  end_date?: string;         // 结束日期
  created_at: string;        // 创建时间
  updated_at: string;        // 更新时间
}
```

### TestPlanCase (测试计划用例)
```typescript
{
  id: number;
  plan_id: number;           // 测试计划ID
  case_id: number;           // 用例ID
  case_type: 'functional' | 'ui_auto';  // 用例类型
  case_name: string;         // 用例名称
  sort_order: number;        // 排序号
  is_executed: boolean;      // 是否已执行
  execution_result?: 'pass' | 'fail' | 'block' | 'skip';  // 执行结果
  created_at: string;        // 添加时间
}
```

### TestPlanExecution (测试计划执行)
```typescript
{
  id: string;                // 执行ID (UUID)
  plan_id: number;           // 测试计划ID
  plan_name: string;         // 计划名称
  executor_id: number;       // 执行者ID
  executor_name: string;     // 执行者姓名
  execution_type: 'functional' | 'ui_auto';  // 执行类型
  status: ExecutionStatus;   // 执行状态
  progress: number;          // 执行进度 (0-100)
  total_cases: number;       // 总用例数
  completed_cases: number;   // 已完成数
  passed_cases: number;      // 通过数
  failed_cases: number;      // 失败数
  blocked_cases: number;     // 阻塞数
  skipped_cases: number;     // 跳过数
  started_at: string;        // 开始时间
  finished_at?: string;      // 结束时间
  duration_ms?: number;      // 执行时长（毫秒）
  execution_results?: TestPlanCaseResult[];  // 执行结果详情
  error_message?: string;    // 错误信息
}
```

## 注意事项

1. **权限要求**：所有测试计划API都需要用户认证
2. **数据安全**：删除操作为软删除，数据可恢复
3. **并发执行**：UI自动化支持批量执行，注意资源限制
4. **数据关联**：删除测试计划会级联删除相关用例和执行记录

## 问题排查

### 问题1: 测试计划页面无法访问
- 检查路由是否正确配置
- 检查导航菜单是否添加
- 检查用户是否已登录

### 问题2: 创建测试计划失败
- 检查数据库表是否已创建
- 检查后端服务是否正常运行
- 查看浏览器控制台和服务器日志

### 问题3: 添加用例失败
- 确认用例ID是否有效
- 确认用例类型是否正确
- 检查是否已存在相同用例

## 下一步计划

- [ ] 实现测试计划执行页面（功能测试手动执行）
- [ ] 实现测试计划执行页面（UI自动化批量执行）
- [ ] 添加用例选择页面（支持批量选择）
- [ ] 实现测试计划导出功能（PDF/Excel）
- [ ] 添加测试计划模板功能
- [ ] 实现测试计划复制功能
- [ ] 添加执行结果图表展示
- [ ] 实现团队协作功能（评论、审批）

## 技术支持

如有问题，请查看：
- 详细文档：`docs/TEST_PLAN_MODULE.md`
- 数据库脚本：`prisma/migrations/add_test_plan_tables.sql`
- API文档：检查 `server/routes/testPlan.ts`

---

✨ **测试计划模块已经就绪，开始使用吧！**

