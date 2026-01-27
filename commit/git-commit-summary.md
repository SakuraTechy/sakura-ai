# Git 提交汇总

## 提交时间：2026-01-19 至 2026-01-26

---

## 一次性提交命令

```bash
git add -A
git commit -m "feat: 新增 Midscene AI 视觉识别执行引擎 + 多项优化

## 🚀 核心功能：Midscene 执行引擎集成
- feat: 新增 MidsceneTestRunner 执行器（AI视觉识别，智能定位）
- feat: 新增 MidsceneReportViewer 组件，支持查看AI执行报告
- feat: 执行引擎选择支持三种模式：MCP/Playwright/Midscene
- feat: TestRunDetail 页面集成 Midscene 报告查看器
- feat: TestRunDetailModal 弹窗添加 Midscene 标签页
- feat: 新增 logFilter 工具，支持 Midscene 统计日志过滤
- feat: 类型定义扩展支持 midscene 执行引擎

## AI 解析器优化 (aiParser.ts)
- fix: 复选框提示词统一强调文本匹配优先级
- fix: 支持多复选框场景的文本关联识别
- fix: 复合操作拆分时正确分离操作和预期结果
- fix: 等待指令明确为'等待3秒'，AI提示词新增等待检测
- fix: isAssertionStep只检查操作部分，避免预期结果误判

## 测试执行服务优化 (testExecution.ts)
- feat: 集成 MidsceneTestRunner，支持 initializeMidsceneRunner/executeWithMidsceneRunner
- fix: 新增menuitem等9种可交互元素类型
- fix: AI重新识别时构建refToElementMap映射表
- fix: 去除name中的空格和私有使用区Unicode字符

## Playwright执行器优化 (playwrightTestRunner.ts)
- fix: 新增8种role类型选择器支持
- fix: 启用文件下载功能(acceptDownloads/downloadsPath)

## 前端UI/UX优化
- fix: ExecutionEngineGuide弹窗事件冲突修复
- feat: TestPlanExecutionLogModal添加简洁/详细模式切换
- feat: TestRunDetailModal添加日志格式切换功能
- fix: CollapsibleLogMessage默认展开状态"

## 修改文件清单
### Midscene 核心文件（新增）
| 文件 | 类型 | 说明 |
|-----|------|------|
| `server/services/midsceneTestRunner.ts` | feat | Midscene 执行器 |
| `src/components/MidsceneReportViewer.tsx` | feat | 报告查看器组件 |
| `src/utils/logFilter.ts` | feat | 日志过滤工具 |

### 后端服务
| 文件 | 类型 | 说明 |
|-----|------|------|
| `server/services/testExecution.ts` | feat/fix | 集成 Midscene + 元素类型扩展 |
| `server/services/aiParser.ts` | fix | AI 解析优化 |
| `server/services/playwrightTestRunner.ts` | fix | role 类型 + 下载功能 |
| `server/services/mcpClient.ts` | fix | 下载功能 |

### 前端页面
| 文件 | 类型 | 说明 |
|-----|------|------|
| `src/pages/TestRunDetail.tsx` | feat | 集成 Midscene 报告 |
| `src/pages/TestPlanDetail.tsx` | feat | 执行引擎选择 |
| `src/pages/TestCases.tsx` | feat | 执行引擎选择 |
| `src/pages/FunctionalTestCases/index.tsx` | feat | 执行引擎选择 |

### 前端组件
| 文件 | 类型 | 说明 |
|-----|------|------|
| `src/components/TestRunDetailModal.tsx` | feat | Midscene 标签页 |
| `src/components/ExecutionEngineGuide.tsx` | fix | 弹窗事件修复 |
| `src/components/TestPlanExecutionLogModal.tsx` | feat | 模式切换 |

### 类型定义
| 文件 | 类型 | 说明 |
|-----|------|------|
| `src/types/testPlan.ts` | feat | ExecutionConfig 扩展 |
| `src/types/test.ts` | feat | TestRun 扩展 |
| `src/services/testService.ts` | feat | API 参数扩展 |
| `src/pages/FunctionalTestCases/types.ts` | fix | 类型统一 |

```

---

## 分模块提交命令

### 1. Midscene 执行引擎（核心功能）
```bash
git add server/services/midsceneTestRunner.ts src/components/MidsceneReportViewer.tsx src/utils/logFilter.ts
git commit -m "feat: 新增 Midscene AI 视觉识别执行引擎

- 新增 MidsceneTestRunner 执行器，基于AI视觉识别智能定位元素
- 新增 MidsceneReportViewer 组件，支持查看AI执行详细报告
- 新增 logFilter 工具，支持 Midscene 统计日志简洁/详细模式切换"
```

### 2. 测试执行服务集成 Midscene
```bash
git add server/services/testExecution.ts
git commit -m "feat: testExecution 集成 Midscene 执行引擎

- 导入 MidsceneTestRunner
- 新增 initializeMidsceneRunner 初始化方法
- 新增 executeWithMidsceneRunner 执行方法
- 新增 cleanupMidsceneRunner 清理方法
- 支持三种执行引擎切换：MCP/Playwright/Midscene"
```

### 3. 前端页面集成 Midscene
```bash
git add src/pages/TestRunDetail.tsx src/pages/TestPlanDetail.tsx src/pages/TestCases.tsx src/pages/FunctionalTestCases/index.tsx
git commit -m "feat: 前端页面集成 Midscene 执行引擎

- TestRunDetail 集成 MidsceneReportViewer，实时画面自动切换
- 执行引擎下拉框新增 Midscene Runner 选项
- executionConfig 状态类型添加 midscene 支持"
```

### 4. 类型定义扩展
```bash
git add src/types/testPlan.ts src/types/test.ts src/services/testService.ts src/pages/FunctionalTestCases/types.ts
git commit -m "feat: 类型定义扩展支持 Midscene

- ExecutionConfig 接口添加 midscene 执行引擎类型
- TestRun 接口添加 executionEngine 字段
- testService 执行方法支持 midscene 参数"
```

### 5. AI 解析器优化
```bash
git add server/services/aiParser.ts
git commit -m "fix: AI解析器多项优化

- 复选框提示词统一强调文本匹配优先级
- 支持多复选框场景的兄弟节点文本关联
- 复合操作拆分时分离操作和预期结果
- 等待指令明确为'等待3秒'
- isAssertionStep只检查操作部分"
```

### 6. Playwright 执行器优化
```bash
git add server/services/playwrightTestRunner.ts server/services/mcpClient.ts
git commit -m "fix: Playwright执行器优化

- 新增8种role类型选择器支持(menuitem/menu/menubar/listitem/option/tab/searchbox/spinbutton)
- 启用文件下载功能(acceptDownloads/downloadsPath)"
```

### 7. 前端组件优化
```bash
git add src/components/TestRunDetailModal.tsx src/components/ExecutionEngineGuide.tsx src/components/TestPlanExecutionLogModal.tsx
git commit -m "feat: 前端组件优化

- TestRunDetailModal 添加 Midscene 报告查看器和日志格式切换
- ExecutionEngineGuide 修复 pointerdown 事件冲突
- TestPlanExecutionLogModal 添加简洁/详细模式切换
- CollapsibleLogMessage 默认展开"
```

---

## 修改文件清单

### Midscene 核心文件（新增）
| 文件 | 类型 | 说明 |
|-----|------|------|
| `server/services/midsceneTestRunner.ts` | feat | Midscene 执行器 |
| `src/components/MidsceneReportViewer.tsx` | feat | 报告查看器组件 |
| `src/utils/logFilter.ts` | feat | 日志过滤工具 |

### 后端服务
| 文件 | 类型 | 说明 |
|-----|------|------|
| `server/services/testExecution.ts` | feat/fix | 集成 Midscene + 元素类型扩展 |
| `server/services/aiParser.ts` | fix | AI 解析优化 |
| `server/services/playwrightTestRunner.ts` | fix | role 类型 + 下载功能 |
| `server/services/mcpClient.ts` | fix | 下载功能 |

### 前端页面
| 文件 | 类型 | 说明 |
|-----|------|------|
| `src/pages/TestRunDetail.tsx` | feat | 集成 Midscene 报告 |
| `src/pages/TestPlanDetail.tsx` | feat | 执行引擎选择 |
| `src/pages/TestCases.tsx` | feat | 执行引擎选择 |
| `src/pages/FunctionalTestCases/index.tsx` | feat | 执行引擎选择 |

### 前端组件
| 文件 | 类型 | 说明 |
|-----|------|------|
| `src/components/TestRunDetailModal.tsx` | feat | Midscene 标签页 |
| `src/components/ExecutionEngineGuide.tsx` | fix | 弹窗事件修复 |
| `src/components/TestPlanExecutionLogModal.tsx` | feat | 模式切换 |

### 类型定义
| 文件 | 类型 | 说明 |
|-----|------|------|
| `src/types/testPlan.ts` | feat | ExecutionConfig 扩展 |
| `src/types/test.ts` | feat | TestRun 扩展 |
| `src/services/testService.ts` | feat | API 参数扩展 |
| `src/pages/FunctionalTestCases/types.ts` | fix | 类型统一 |
