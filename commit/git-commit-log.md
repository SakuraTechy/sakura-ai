# Git 提交记录总结

本文档汇总了所有开发过程中的代码提交记录，按日期和功能模块分类整理。

---

## 2025-01-04

### fix: 修复测试执行停止功能无法生效的问题

**问题描述**：
在测试执行详情页面点击停止测试后，测试无法停止，会继续执行。从日志可以看到"测试已被用户取消"的消息，但测试仍然继续执行后续步骤。

**根本原因**：
1. `cancelTest` 方法只更新了测试运行状态为 `cancelled`，但没有调用 `queueService.cancelTask(runId)` 通知队列服务取消任务
2. 执行循环只在循环开始时检查一次取消状态，但在异步操作（如 AI 解析、步骤执行、等待）过程中没有再次检查
3. 执行循环只检查队列服务的取消状态，没有检查测试运行状态，导致即使状态被更新，执行循环也无法及时检测到

**修复方案**：
1. **修复 `cancelTest` 方法** (`server/services/testExecution.ts:2903`)
   - 在更新测试运行状态前，先调用 `queueService.cancelTask(runId)` 通知队列服务取消任务
   - 确保执行循环能够通过 `queueService.isCancelled()` 检测到取消状态

2. **增强执行循环的取消检查** (`server/services/testExecution.ts`)
   - **操作步骤循环**：在循环开始、AI 解析后、步骤执行前后、步骤间等待前后都检查取消状态
   - **断言执行循环**：在循环开始和每个断言执行前都检查取消状态（MCP 和 Playwright 两种执行器）
   - **双重检查机制**：同时检查队列服务取消状态 (`queueService.isCancelled()`) 和测试运行状态 (`testRun.status === 'cancelled'`)

**修改位置**：
- `cancelTest()`: 添加 `queueService.cancelTask()` 调用
- `executeWithMcpClient()`: 
  - 操作步骤循环：添加取消检查
  - 步骤间等待：在等待前后都检查取消状态
  - 断言执行循环：添加取消检查
- `executeWithPlaywrightRunner()`: 
  - 操作步骤循环：在循环开始、AI 解析后、步骤执行前后都检查取消状态
  - 步骤间等待：在等待前后都检查取消状态
  - 断言执行循环：添加取消检查

**关键改进**：
- 在异步操作前后都检查取消状态，确保能够及时响应取消请求
- 双重检查机制确保即使队列服务检查失败，也能通过测试运行状态检测到取消

**测试建议**：
1. 启动一个长时间运行的测试（包含多个步骤和断言）
2. 在测试执行过程中（特别是在 AI 解析、步骤执行、等待等异步操作期间）点击停止按钮
3. 验证测试能够立即停止，不再继续执行后续步骤
4. 检查日志确认取消消息及时出现

---

## 2025-01-04

### fix: 修复测试执行详情页开始时间和结束时间不使用日志时间的问题

**问题描述**：
测试执行详情页的 `started_at` 和 `finished_at` 时间不是基于日志时间。从日志来看：
- 最后一条日志是 "测试执行完成" 在 2026-01-04 16:13:12.322
- 但是 `finished_at` 显示的是 2026-01-04 16:13:12.169
- `started_at` 也没有使用日志第一条记录的时间

**根本原因**：
1. **结束时间问题**：在 `updateTestRunStatus` 方法中，`finishedAt` 是在添加日志之前设置的。执行流程是：
   - 保存测试证据（16:13:12.169）
   - 调用 `updateTestRunStatus(runId, 'completed', '测试执行完成')`
   - 在 `updateTestRunStatus` 中，先设置 `testRun.finishedAt = new Date()`（此时是 16:13:12.169）
   - 然后添加日志 "测试执行完成"（此时是 16:13:12.322）
   - 因此 `finished_at` 被设置为保存证据的时间，而不是最后一条日志的时间

2. **开始时间问题**：在 `finalizeTestRun` 和 `syncFromTestRun` 中，优先使用 `actualStartedAt`，而不是日志第一条记录的时间。日志时间是最准确的，因为它记录了实际的第一条操作日志。

**修复方案**：

1. **修复结束时间**：
   - 在 `updateTestRunStatus` 方法中，将 `finishedAt` 的设置逻辑移到 `addLog` 调用之后
   - 确保 `finishedAt` 使用当前时间（即最后一条日志的时间戳）

2. **修复开始时间**：
   - 在 `finalizeTestRun` 方法中，优先使用日志第一条记录的时间，并更新 `actualStartedAt` 为日志时间
   - 在 `syncFromTestRun` 方法中，优先使用日志第一条记录的时间，其次使用 `actualStartedAt`
   - 确保开始时间使用日志第一条记录的时间

3. **统一时间优先级**：
   - 开始时间：日志第一条记录时间 > actualStartedAt > startedAt
   - 结束时间：日志最后一条记录时间 > actualEndedAt > endedAt

**具体改动**：

1. **server/services/testExecution.ts**：
   - `updateTestRunStatus` 方法：将 `finishedAt` 设置移到添加日志之后
   - `finalizeTestRun` 方法：优先使用日志第一条记录的时间作为 `actualStartedAt`

2. **server/services/testCaseExecutionService.ts**：
   - `syncFromTestRun` 方法：优先使用日志第一条记录的时间作为 `dbStartedAt`
   - `syncFromTestRun` 方法：优先使用日志最后一条记录的时间作为 `dbFinishedAt`
   - 更新数据源判断逻辑，日志时间标记为"最准确"

**涉及文件**：
- `server/services/testExecution.ts` - 修复 `updateTestRunStatus` 和 `finalizeTestRun` 方法，优先使用日志时间
- `server/services/testCaseExecutionService.ts` - 修复 `syncFromTestRun` 方法，优先使用日志时间

---

## 2024-12-31

### fix: 修复测试计划执行时测试执行页面开始时间显示不正确的问题

**问题描述**：
测试计划执行时，测试执行页面显示的开始时间不正确。虽然之前已经修复了同步到 `test_case_executions` 表的问题，但开始时间仍然显示不正确。

**根本原因**：
1. 在 `finalizeTestRun` 方法中，虽然从日志中提取了开始时间，但没有将提取的时间设置回 `testRun.actualStartedAt`
2. 当调用 `syncTestRunToDatabase` 时，`syncFromTestRun` 方法会再次从日志中提取时间，但如果日志为空，它会使用 `actualStartedAt`，而 `actualStartedAt` 可能没有被正确设置
3. 如果 `actualStartedAt` 没有被设置，`syncFromTestRun` 会回退到使用 `startedAt`（加入队列的时间），而不是实际开始执行的时间

**修复方案**：

1. **在 `finalizeTestRun` 中确保 `actualStartedAt` 被正确设置**：
   - 如果从日志中提取到了开始时间，优先使用日志时间并设置到 `testRun.actualStartedAt`
   - 如果没有日志时间但 `actualStartedAt` 已存在，保持现有值
   - 如果都没有，使用 `startedAt` 作为后备值
   - 确保在调用 `syncTestRunToDatabase` 之前，`actualStartedAt` 已经被正确设置

2. **在 `syncFromTestRun` 中添加调试日志**：
   - 对于测试计划执行（存在 `planExecutionId`），添加详细的调试日志
   - 记录时间选择逻辑：日志时间、`actualStartedAt`、`startedAt` 的可用性和最终选择
   - 便于排查测试计划执行时开始时间不正确的问题

**涉及文件**：
- `server/services/testExecution.ts` - 修复 `finalizeTestRun` 方法，确保 `actualStartedAt` 被正确设置
- `server/services/testCaseExecutionService.ts` - 在 `syncFromTestRun` 中添加测试计划执行的调试日志

---

## 2024-12-30

### fix: 修复测试计划UI自动化执行进度实时更新和用例状态显示问题（第二次修复）

**问题描述**：
之前的修复没有完全解决问题2和问题3：
- 问题2：执行进度无法根据实际执行的状态更新，例如2条用例必须要等待1条执行完成后进度条才会变成50%
- 问题3：批量执行和执行所有的操作单次只会生成1条记录，正常应该显示多条（1条执行中，其他状态为队列中）

**根本原因**：
1. 后端 `updateTestPlanExecution` 函数更新数据库后，没有发送 WebSocket 消息通知前端
2. 虽然前端有 WebSocket 监听和轮询机制，但由于后端没有主动广播，前端只能依赖轮询获取更新
3. 进度计算公式没有考虑正在执行的用例，只有用例完成后进度才会变化

**修复方案**：

1. **新增全局 WebSocket 广播机制 - websocket.ts**：
   - 添加 `setGlobalWsManager` 和 `getGlobalWsManager` 函数管理全局实例
   - 添加 `broadcastTestPlanExecutionUpdate` 函数专门用于广播测试计划执行状态更新

2. **在服务器入口设置全局 WebSocket 管理器 - index.ts**：
   - 导入并调用 `setGlobalWsManager(wsManager)` 设置全局实例

3. **修复进度实时更新 - testPlanService.ts**：
   - 导入 `broadcastTestPlanExecutionUpdate` 函数
   - 在 `updateTestPlanExecution` 函数中添加 WebSocket 广播，通知前端执行状态变化
   - 修改进度计算公式：当用例开始执行时，进度 = (已完成用例数 + 0.5) / 总用例数 * 100
   - 这样当第一个用例开始执行时，进度会立即从0%变为约25%（2条用例的情况）

4. **确保用例状态正确显示**：
   - 批量执行时初始化所有用例状态为 `queued`（队列中）
   - 开始执行某个用例时，将其状态更新为 `running`（执行中）
   - 通过 WebSocket 实时广播状态变化，前端可以立即看到更新

**涉及文件**：
- `server/services/websocket.ts` - 新增全局 WebSocketManager 实例管理和广播函数
- `server/index.ts` - 初始化时设置全局 WebSocketManager
- `server/services/testPlanService.ts` - 在 updateTestPlanExecution 中添加 WebSocket 广播和进度计算优化

---

### fix: 修复测试计划UI自动化执行的三个核心问题

**问题描述**：
1. 在测试计划列表点击执行计划，提示"没有找到要执行的用例"，且没有跳转到执行详情页的执行历史tab
2. 执行进度无法根据实际执行的状态更新，例如2条用例必须要等待1条执行完成后进度条才会变成50%
3. 批量执行和执行所有的操作单次只会生成1条记录，应该每个用例都有独立状态显示

**问题1根本原因**：
- `TestPlans.tsx` 中 `handleExecutePlan` 函数直接跳转 `/test-plans/${plan.id}/execute`，没有携带 `type` 参数
- `TestPlanExecute.tsx` 默认使用 `functional` 类型，导致 UI 自动化计划找不到用例

**问题2和3根本原因**：
- 创建执行记录时所有用例初始状态都是 `pending`，用户无法区分"待执行"和"队列中"
- 执行每个用例前没有将当前用例状态更新为 `running`（执行中）
- 只有用例完成后才更新数据库，导致进度无法实时反映

**修复方案**：

1. **修复问题1 - TestPlans.tsx**：
   - 根据测试计划类型判断跳转目标：
     - UI自动化计划：跳转到详情页执行历史tab，让用户选择执行方式
     - 混合类型计划：跳转到详情页用例tab，让用户选择
     - 功能测试计划：直接跳转到执行页面，携带 `type=functional`

2. **修复问题1 - TestPlanExecute.tsx**：
   - 添加智能类型判断：如果 URL 没有 `type` 参数，根据计划类型和用例情况自动选择
   - 找不到用例时跳转到详情页让用户手动选择

3. **修复问题2和3 - testPlanService.ts**：
   - 批量执行时初始化所有用例状态为 `queued`（队列中），单个用例用 `pending`
   - 执行每个用例前，先将该用例状态更新为 `running`（执行中），并立即同步到数据库
   - 这样前端可以实时看到：1条正在执行，其他排队中

**涉及文件**：
- `src/pages/TestPlans.tsx` - 修复 handleExecutePlan 函数，根据计划类型智能跳转
- `src/pages/TestPlanExecute.tsx` - 添加智能执行类型判断逻辑
- `server/services/testPlanService.ts` - 修复批量执行时用例状态初始化和实时更新

---

### fix: 修复测试用例成功率计算逻辑，改为基于步骤通过率

**问题描述**：
测试用例列表中的成功率（success_rate）计算错误，显示为66%，但实际上最新执行结果是通过的。

**根本原因**：
原有逻辑将成功率计算为"历史执行次数的通过率"（通过次数 / 总执行次数），而不是用户期望的"当前用例步骤的通过率"。

**修复方案**：
修改 `enhanceTestCasesWithRunData` 方法：
1. 数据来源从 `test_run_results` 表改为 `test_case_executions` 表
2. 成功率计算公式改为：`passed_steps / total_steps * 100`
3. 获取每个用例最新的已完成执行记录
4. 执行结果根据步骤统计判断：
   - 有失败步骤 → fail
   - 全部通过 → pass
   - 部分通过 → block

**涉及文件**：
- `server/services/testExecution.ts` - 修改 `enhanceTestCasesWithRunData` 方法的成功率计算逻辑

---

### fix: 修复测试计划详情页 UI 自动化用例类型显示时的空值检查

**问题描述**：
在测试计划详情页，当 UI 自动化用例的 `case_detail` 为 `undefined` 时，访问 `(caseItem.case_detail as any).case_type` 会抛出 `TypeError: Cannot read properties of undefined (reading 'case_type')` 错误。

**根本原因**：
第 1778 行对于 `ui_auto` 类型的条件判断没有先检查 `caseItem.case_detail` 是否存在，而第 1776 行对于 `functional` 类型已经正确添加了 `caseItem.case_detail && (caseItem.case_detail as any).case_type` 的检查。

**修复方案**：
为 `ui_auto` 分支添加与 `functional` 分支相同的空值检查。

**涉及文件**：
- `src/pages/TestPlanDetail.tsx` - 添加 `case_detail` 空值检查

---

### fix: 修复测试计划执行用例时污染功能用例和UI自动化模块执行记录的问题

**问题描述**：
测试计划模块关联的用例执行后，功能用例模块的执行日志和UI自动化模块的执行记录会同步更新。正常情况下应该完全独立，测试计划使用单独的记录。

**根本原因**：

1. **功能用例**：在 `TestPlanExecute.tsx` 的 `handleSaveCurrentCase` 函数中，测试计划执行功能用例时调用了 `functionalTestCaseService.saveExecutionResult()` 接口，这会在 `functional_test_executions` 表中创建记录。

2. **UI自动化用例**：在 `testExecution.ts` 的测试完成处理中，无论是单独执行还是测试计划执行，都会调用 `syncTestRunToDatabase()`，这会在 `test_case_executions` 表中创建记录。

**修复方案**：

1. **功能用例**：测试计划执行功能用例时，不再调用功能用例模块的 `saveExecutionResult` 接口。执行结果只保存在测试计划自己的 `execution_results` JSON 字段中。

2. **UI自动化用例**：根据是否存在 `planExecutionId` 决定同步目标：
   - 存在 `planExecutionId`（测试计划执行）：只调用 `syncToTestPlanExecution()`，同步到 `test_plan_executions` 表
   - 不存在 `planExecutionId`（单独执行）：只调用 `syncTestRunToDatabase()`，同步到 `test_case_executions` 表

**具体改动**：

1. `src/pages/TestPlanExecute.tsx`：
   - 移除 `handleSaveCurrentCase` 中对 `functionalTestCaseService.saveExecutionResult()` 的调用
   - 移除相关的 `execution_id` 变量和引用

2. `server/services/testExecution.ts`：
   - 修改测试完成时的数据同步逻辑
   - 测试计划执行时只写入 `test_plan_executions` 表，不写入 `test_case_executions` 表
   - 单独执行时只写入 `test_case_executions` 表

**涉及文件**：
- `src/pages/TestPlanExecute.tsx` - 移除对功能用例模块保存接口的调用
- `server/services/testExecution.ts` - 修改数据同步逻辑，实现测试计划和UI自动化模块的数据隔离
- `server/services/testPlanService.ts` - 移除从 `test_case_executions` 表读取UI自动化用例执行记录的步骤2，确保测试计划详情页只使用自己的 `execution_results` 数据

---

### fix: 修复测试计划批量或全部执行功能测试用例时记录丢失的问题

**问题描述**：
当执行测试计划中的功能测试用例时，初始 `execution_results` 有2条 pending 记录，但执行完第一条后只剩1条 completed 记录，另一条 pending 记录被丢弃了。

**根本原因**：
1. **前端 `TestPlanExecute.tsx`**：构建 `executionResults` 时使用了 `filter` 只包含已完成的用例（`state.completed === true`），导致未执行的用例被过滤掉
2. **服务端 `testPlanService.ts`**：UI 自动化批量执行时，`results` 数组被初始化为空数组，而不是复用 `initialExecutionResults`，导致每次更新时覆盖了之前初始化的 pending 状态记录
3. **服务端 `testExecution.ts`**：`completedCases` 计算为 `updatedResults.length`，但现在包含 pending 状态的记录，需要改为只统计有结果的记录

**修复方案**：

1. **前端 `TestPlanExecute.tsx`**：
   - `handleSaveCurrentCase` 函数：移除 `filter` 逻辑，保留所有用例记录
   - `handleSkipCurrentCase` 函数：同样移除 `filter` 逻辑，保留所有用例记录
   - `handleConfirmExit` 函数：同样修复构建逻辑
   - 对于已完成的用例使用最新状态
   - 对于未执行的用例保持 pending 状态

2. **服务端 `testPlanService.ts`**：
   - 将 `results` 初始化改为 `initialExecutionResults` 的副本
   - 执行完成后更新对应用例的状态（使用 `findIndex` + 替换），而不是 push 新记录

3. **服务端 `testExecution.ts`**：
   - 修改 `completedCases` 计算逻辑，只统计 `result !== ''` 的记录

4. **类型定义 `src/types/testPlan.ts`**：
   - `ExecutionResult` 类型添加空字符串 `''`，表示未执行
   - `execution_status` 添加 `'pending'` 状态

**涉及文件**：
- `src/pages/TestPlanExecute.tsx` - 修复 handleSaveCurrentCase、handleSkipCurrentCase、handleConfirmExit 中的 executionResults 构建逻辑
- `server/services/testPlanService.ts` - 修复 UI 自动化批量执行结果更新逻辑
- `server/services/testExecution.ts` - 修复 completedCases 统计逻辑
- `src/types/testPlan.ts` - 扩展 ExecutionResult 和 execution_status 类型

---

### fix: 修复开发环境下局域网其他电脑无法访问后端API的问题

**问题描述**：
在开发环境下，`getBackendHost()` 函数返回硬编码的 `'localhost'`，导致局域网内其他电脑访问前端时无法连接后端。

**根本原因**：
1. 用户A在本机（如 `172.19.1.111`）启动开发服务器
2. 用户B从另一台电脑通过 `http://172.19.1.111:5173` 访问前端
3. 前端代码在用户B的浏览器中执行，`getBackendHost()` 返回 `'localhost'`
4. 前端尝试连接 `http://localhost:3001` 作为后端地址
5. 但对于用户B的浏览器来说，`localhost` 指向的是用户B自己的电脑，而不是服务器
6. 因此后端连接失败

**修复方案**：
统一使用 `window.location.hostname`，无论开发环境还是生产环境都从浏览器地址栏获取主机名：
- 本地访问 → hostname = `localhost` → 连接 `localhost:3001` ✅
- 局域网访问 → hostname = `172.19.1.111` → 连接 `172.19.1.111:3001` ✅
- 任何其他IP访问都能正常工作 ✅

**涉及文件**：
- `src/config/api.ts` - `getBackendHost()` 函数简化为直接返回 `window.location.hostname`

---

### feat: 测试计划列表支持显示跳过用例数并判断全部跳过状态

**改进内容**：
为测试计划列表添加跳过用例数（skipped_cases）的支持，并在判断执行结果时增加"全部跳过"的逻辑。

**具体改动**：

1. **后端服务 (`testPlanService.ts`)**：
   - 在获取测试计划列表时，从最新执行记录中读取 `skipped_cases` 字段
   - 返回数据中新增 `latest_execution_skipped_cases` 字段
   - result 筛选逻辑增加对 `skip` 结果的判断：当 `skippedCases >= totalCases` 时判定为跳过

2. **前端类型定义 (`testPlan.ts`)**：
   - `TestPlan` 接口新增 `latest_execution_skipped_cases?: number` 字段

3. **前端页面 (`TestPlans.tsx`)**：
   - `getPlanResult` 函数新增 `skippedCases` 和 `totalCases` 变量
   - 执行结果判断增加：当 `totalCases > 0 && skippedCases >= totalCases` 时，结果为 'skip'
   - Tooltip 中增加跳过用例数的显示

**涉及文件**：
- `server/services/testPlanService.ts`
- `src/types/testPlan.ts`
- `src/pages/TestPlans.tsx`

---

## 2024-12-29

### UI自动化测试计划执行状态同步修复

#### fix: 修复UI自动化执行完成后测试计划状态不同步的问题

**问题描述**：
1. 测试计划列表中，执行UI自动化完成后，计划状态没有同步更新
2. 测试计划详情中，执行UI自动化后 `test_plan_executions` 表中 `execution_results` 为空，导致看不到用例执行详情
3. 测试计划详情中，测试用例的UI自动化列表的执行状态和结果使用的不是最新值

**修复方案**：

1. **在 `syncToTestPlanExecution` 完成后调用 `updateTestPlanStatusFromLatestExecution`**：
   - 当单个UI自动化测试用例完成执行并同步到 `test_plan_executions` 后，自动更新 `test_plans` 表的状态
   - 确保测试计划列表能实时反映最新的执行状态

2. **修复 `getTestPlanDetail` 中 `caseExecutionMap` 的构建逻辑**：
   - 增加第二步：从 `test_case_executions` 表获取UI自动化用例的最新执行状态
   - 对于单个UI自动化执行（可能 `execution_results` 为空），直接从执行记录表获取状态
   - 确保 `pending` 状态的用例不被标记为已执行

3. **修复 `startTestPlanExecution` 初始化 `execution_results`**：
   - 创建执行记录时，为每个用例初始化 `pending` 状态的记录
   - 即使测试被中断，用户也能看到完整的用例状态列表

**涉及文件**：
- `server/services/testExecution.ts` - `syncToTestPlanExecution` 函数添加状态同步调用
- `server/services/testPlanService.ts` - `getTestPlanDetail` 增强执行状态获取逻辑

---

### LLM模型配置功能修复

#### 添加 API 地址自定义输入框
- **feat: 在模型名称上方添加 API 地址输入框**
  - 新增 API 地址配置输入框，位于模型信息卡片和模型名称选择之间
  - 显示当前配置的 baseUrl，允许用户自定义修改
  - 提示信息显示默认地址，方便用户参考
  - 测试连接、保存设置、AI调用都使用此自定义地址

- **feat: 获取厂商模型列表支持自定义 baseUrl**
  - 前端 autoFetchProviderModels 函数新增 customBaseUrl 参数
  - 后端 /api/config/available-models 接口支持 baseUrl 查询参数
  - 优先使用用户自定义地址，否则使用模型默认配置
  - 添加日志输出，标识是否使用自定义地址

#### 修复保存设置接口重复调用和添加连接测试前置检查
- **fix: 修复保存设置后调用2次API接口的问题**
  - 移除handleSave函数中重复的fetch('/api/config/llm')调用
  - settingsService.saveLLMSettings()内部已包含API同步逻辑，无需再次调用
  - 优化保存流程，减少不必要的网络请求

- **feat: 保存设置前必须先测试连接通过**
  - 添加connectionResult?.success检查，未通过连接测试不允许保存
  - 保存按钮在连接测试未通过时显示为禁用状态
  - 添加title提示"请先测试连接并确保连接成功"
  - 提升配置保存的安全性，避免保存无效配置

- **fix: 修复测试连接未使用用户选择的模型名称的问题**
  - 前端llmConfigManager.testConnection()传递customModelName参数
  - 后端/test-connection接口优先使用customModelName，其次使用默认openRouterModel
  - 增加详细的日志输出，显示测试的实际模型名称
  - 返回testedModel字段，便于前端确认测试的模型

- **fix: 修复llmConfigManager.updateConfig未使用settings.baseUrl的问题**
  - updateConfig方法现在优先使用settings.baseUrl，其次使用modelInfo.customBaseUrl
  - 确保从数据库加载的baseUrl和customModelName能被后续AI调用正确使用
  - 增强日志输出，显示配置来源（settings或modelInfo）

- **fix: 修复保存和测试连接时baseUrl被覆盖的问题**
  - handleSave和handleTestConnection现在优先使用formData.baseUrl
  - 添加详细的日志输出，便于调试配置保存和加载流程
  - 后端settingsService添加日志输出，显示从数据库加载的原始数据和合并后数据

- **feat: 优化模型名称选择体验，自动获取厂商模型列表**
  - 页面初始化时自动获取厂商可用模型列表（如果有apiKey）
  - 切换模型时自动获取对应厂商的模型列表
  - 新增autoFetchProviderModels函数，支持传入参数独立获取
  - 选择模式下添加"当前配置"选项，确保保存的模型在列表加载前也能显示
  - 保留手动刷新按钮作为备用选项

#### 涉及文件
- `src/pages/Settings.tsx`: 修复handleSave、handleTestConnection函数和模型名称选择显示逻辑
- `src/services/llmConfigManager.ts`: testConnection方法传递customModelName，updateConfig方法使用settings.baseUrl
- `src/services/settingsService.ts`: 添加API响应日志
- `server/services/settingsService.ts`: 添加数据库加载和合并日志
- `server/routes/config.ts`: /test-connection接口使用customModelName进行测试

---

### LLM模型配置功能增强

#### 自定义模型名称选择功能
- **feat: 添加自定义模型名称选择功能**
  - 在LLMSettings接口中添加customModelName字段，支持用户自定义模型名称
  - 在Settings.tsx中添加模型名称输入框，显示在模型信息卡片和API密钥之间
  - 当用户选择模型时，自动填充默认的openRouterModel作为初始值
  - 用户可以手动修改模型名称，以适配不同提供商的具体模型版本
  - llmConfigManager优先使用customModelName，如果未设置则使用默认的openRouterModel
  - 在初始化设置时自动填充customModelName，确保向后兼容
  - 增强日志输出，显示是使用自定义模型名称还是默认模型名称
  - 保存和测试连接时都使用用户选择的模型名称

- **feat: 支持从厂商API获取可用模型列表**
  - 新增后端API `/api/config/available-models` 获取厂商可用模型列表
  - 支持OpenAI兼容的 `/v1/models` 端点
  - 前端添加选择框+手动输入混合模式
  - 点击刷新按钮可从厂商API获取可用模型列表
  - 支持模式切换：选择模式和手动输入模式
  - 获取失败时自动切换到手动输入模式
  - 显示已获取的模型数量

- **feat: 为各厂商添加"系列"模型，支持自动获取所有可用模型**
  - DeepSeek 系列：可自动获取deepseek-chat、deepseek-coder等
  - 通义千问系列：可自动获取qwen-turbo、qwen-plus、qwen-max等
  - Kimi 系列：可自动获取moonshot-v1-8k、moonshot-v1-32k、moonshot-v1-128k等
  - GLM 系列：可自动获取glm-4、glm-4-flash、glm-4v等
  - OpenRouter 全部模型：可获取OpenAI、Anthropic、Google、Meta等多家厂商模型
  - Zenmux 全部模型：可获取Google Gemini系列等多家厂商模型
  - 系列模型带有 'model-list' capability 标识

- **fix: 修复模型列表获取问题**
  - 添加厂商过滤逻辑：阿里云只显示qwen模型，DeepSeek只显示deepseek模型等
  - 智谱AI使用预定义模型列表（其API不支持标准/models端点）
  - 月之暗面Kimi使用预定义模型列表（其API不公开模型列表端点）
  - DeepSeek使用预定义模型列表（其API不公开模型列表端点）
  - 支持的智谱AI模型：glm-4、glm-4-plus、glm-4-air、glm-4v、glm-z1系列等
  - 支持的Kimi模型：moonshot-v1-8k/32k/128k、kimi-latest等
  - 支持的DeepSeek模型：deepseek-chat、deepseek-coder、deepseek-reasoner

#### 涉及文件
- `src/services/settingsService.ts`: 扩展LLMSettings接口，添加customModelName字段
- `src/services/llmConfigManager.ts`: 优先使用customModelName构建LLMConfig
- `src/pages/Settings.tsx`: 添加模型名称选择框UI，支持从厂商获取模型列表
- `src/services/modelRegistry.ts`: 为各厂商添加系列模型定义
- `server/routes/config.ts`: 新增获取厂商可用模型列表的API端点

---

## 2024-12-27

### 测试计划执行功能完善

#### 继续执行和重新执行功能
- **区分继续执行和重新执行两种模式**
  - 继续执行（cancelled/running状态）：保留历史数据，只执行未完成的用例
  - 重新执行（completed状态）：完全重置所有数据，执行所有用例
  - 修复继续执行时完全恢复已完成用例的执行状态（包括stepResults）
  - 修复继续执行时传递所有用例以便在执行页面显示完整列表
  - 修复继续执行状态同步和测试计划列表状态显示
  - 修复继续执行时未重置执行进度和时间字段的问题

#### 执行状态和时间管理
- **修复执行历史running状态缺少实时耗时和刷新后数据未更新的问题**
  - 后端自动根据execution_results同步更新started_at、finished_at、duration_ms
  - running状态的执行记录实时显示已运行时长（前端计算）
  - 执行详情弹窗正确检测数据变化并更新界面
- **修复时间字段精度问题**
  - 修复test_plan_executions时间字段精度问题（Timestamp(0)改为Timestamp(3)）
  - 修复执行详情查询时覆盖原始时间和耗时数据的问题
  - 确保重新执行时同步更新test_plan_executions的时间字段
  - 修复返回上一个用例后执行时长应重新计时

#### 执行流程优化
- **修复跳过用例导致执行记录被误删除的问题**
  - 跳过用例时标记已提交结果防止执行记录被删除
- **修复中途退出执行时缺失时间字段的问题**
  - 退出确认时保存完整的执行结果时间字段
- **修复超时自动取消时缺失duration_ms的问题**
  - 超时自动取消执行记录时正确计算耗时
- **增强执行状态更新支持和调试日志**
  - 支持更新started_at字段并添加调试日志
- **修复重新执行逻辑完全重置执行状态**
  - 重新执行时完全重置所有执行结果和统计数据
  - 修复重新执行时用例数量不正确的问题

---

## 2024-12-26

### 测试计划执行功能增强

#### 执行状态和结果管理
- **用例执行完成后自动更新测试计划状态 + 执行详情WebSocket实时更新**
  - 添加updateTestPlanStatusFromLatestExecution函数，自动更新test_plans表状态
  - TestPlanExecutionLogModal添加WebSocket监听和轮询机制实时更新执行详情
- **扩展执行详情存储实际执行状态（execution_status）**
  - 后端返回execution_status（UI自动化用例）
  - 前端构建execution_status（功能测试用例）
  - 前端显示实际状态，支持：执行中、已完成、已失败、已取消、执行错误、排队中
- **修复UI自动化用例执行详情缺少步骤统计数据的问题**
  - waitForTestCompletion函数返回步骤统计
  - syncToTestPlanExecution添加步骤统计
- **修复UI自动化测试断言步骤成功后未计入passedSteps导致结果被误判为block的问题**
  - 断言步骤成功后更新passedSteps

#### 单个用例执行优化
- **修复单个UI自动化用例执行时执行历史记录不完整的问题**
  - 统一执行逻辑，使用autoExecute: true
  - 统一切换到执行历史tab，查看执行进度
- **优化并增强单个UI自动化用例执行时的数据获取逻辑**
  - 增强日志系统，添加详细日志
  - 修复执行时间获取逻辑
  - 增强决策逻辑可见性
  - 完善统计信息
- **实现单个用例执行时自动同步结果到测试计划执行记录**
  - 恢复单个用例执行跳转详情页逻辑，传递planExecutionId
  - runTestCase方法增加planExecutionId参数
  - 测试完成时自动同步结果到test_plan_executions表

#### 执行配置和路由修复
- **修复后端路由未接收autoExecute参数导致的执行重复问题**
  - 添加autoExecute和executionConfig类型定义
  - 后端路由正确接收参数
  - 根据autoExecute参数决定是否自动执行

#### UI优化
- **为执行状态添加背景色显示**
  - getExecutionStatusText函数返回带背景色的Tag组件
- **修复：last_execution.status应从execution_results中获取**
  - 优先从result.execution_status获取每个用例的执行状态

#### 执行流程功能
- **feat: 添加测试计划执行中途退出确认功能**
  - 添加popstate事件监听阻止浏览器后退按钮
  - 添加beforeunload事件监听阻止页面关闭/刷新
  - 添加退出确认弹窗组件，显示当前执行进度
  - 确认退出时更新执行状态为cancelled，保存已完成的执行结果
- **feat: 添加测试计划继续执行功能**
  - 对于中途退出或取消的测试计划执行，可以在执行历史中点击"继续"按钮继续执行未完成的用例
  - 继续执行模式下复用之前的执行记录ID
  - 获取之前执行详情并恢复已完成用例的状态

#### 测试计划详情页面优化
- **2025-12-26 测试计划详情页面离开确认和自动清理超时执行记录**
  - 添加isExecutingLocally本地状态跟踪正在执行的操作
  - beforeunload事件处理器使用navigator.sendBeacon发送取消请求
  - 新增handleBackToList函数，在有活跃执行时弹出确认对话框
  - 在getTestPlanDetail中添加自动清理逻辑，超过2分钟的queued执行记录自动标记为cancelled

#### 功能用例执行优化
- **fix: 修复功能用例批量执行跳过时执行结果数据不完整的问题**
  - 重构handleSkipCurrentCase中executionResults构建逻辑
  - 为跳过的用例添加时间字段
  - 统一所有分支的时间字段处理
- **fix: 修复测试用例执行时间记录不准确的问题**
  - 添加caseStartTimeRef跟踪当前用例开始时间
  - 在loadCaseDetails函数中记录开始时间
  - 修改handleSaveCurrentCase和handleSkipCurrentCase使用真实时间
- **fix: 修复测试计划执行总耗时计算错误的问题**
  - 使用executionResults.reduce()累加每条用例的duration_ms
- **fix: 修复执行详情查询时覆盖原始时间和耗时数据的问题**
  - 优先保留原始result中的值，只在缺失时才使用数据库值

#### 性能优化
- **perf: 优化WebSocket/轮询刷新导致的页面闪烁问题**
  - 区分首次加载和刷新更新
  - 静默刷新模式
  - 添加局部刷新指示器
  - 数据对比优化

#### 其他修复
- **fix: 修复Ant Design bodyStyle已弃用警告**
  - 将所有使用bodyStyle的地方替换为styles属性
- **fix: 从执行历史tab继续执行后返回应保持在执行历史tab**
  - 在导航URL中添加fromTab参数
  - 返回时携带activeTab状态

### 测试计划UI自动化用例执行流程优化

- **修复UI自动化执行流程和统计数据准确性**
  - 恢复执行配置对话框，修复返回逻辑，修改详情打开方式
  - 添加waitForTestCompletion函数，修复执行结果统计
  - 执行详情表格中点击"日志"按钮，UI自动化用例在新标签页打开详细日志
- **优化测试计划UI自动化用例执行流程**
  - 单个UI自动化用例执行后跳转到测试执行详情页
  - 批量/全部UI自动化执行后提示并跳转到执行历史tab
  - UI自动化执行历史和统计数据正确展示
- **功能用例选择模态框添加"已关联"标记**
- **修复UI自动化用例选择模态框显示问题和筛选器配置**
- **修复添加UI自动化用例时版本信息无法显示的问题**
- **为UI自动化用例添加case_type字段支持**
- **修复UI自动化用例版本字段无法获取的问题**

---

## 2024-12-25

### 测试计划功能完善

- **测试计划详情页添加UI自动化用例执行配置功能**
- **优化UI自动化测试计划用例数据获取和显示**
- **完善测试计划搜索栏计划结果筛选功能**
- **修复测试计划删除确认对话框React渲染错误**
- **修复测试计划状态选项不一致问题**
- **测试计划列表统一样式，添加通过、失败、阻塞、计划结果列**
- **测试计划列表新增计划进度列**

### 测试用例和执行功能

- **支持测试用例ID搜索**
- **修复测试执行筛选功能，改为精确匹配并统一执行结果值格式**
- **过滤已删除用例的测试运行记录**
- **修复测试执行筛选功能，添加分页重置逻辑**
- **修复测试用例模块搜索栏所有筛选功能（状态、创建者、执行状态、执行结果）**
- **修复测试用例模块搜索栏执行状态和执行结果筛选功能**
- **统一执行结果和执行状态的命名规范**
- **测试用例和测试执行模块新增执行状态和执行结果筛选**
- **完整实现测试用例执行结果统计**
- **修复测试用例统计数据栏显示内容（已废弃）**
- **调整搜索栏位置到统计数据栏下方**
- **优化测试用例Tab布局结构，参考测试执行页面排版**
- **为测试用例Tab添加3种视图模式切换**
- **优化测试执行页面布局，参考功能用例页面排版**
- **修复TestRunsTable复选框勾选时的页面抖动问题**
- **为测试执行页面添加完整的筛选功能**
- **优化测试执行页面UI布局和按钮位置**
- **为测试执行页面添加搜索和筛选功能**
- **在测试用例页面新增测试执行标签页**

### 测试运行功能

- **修复测试运行表格排序功能**
- **修复前后端排序不一致问题**
- **修复表格视图宽度和滚动问题**
- **修复UI自动化测试计划用例执行和统计问题**
- **修复测试计划用例列表实时更新和执行历史时长精度问题**
- **确保测试计划用例执行状态和结果完全基于执行历史**
- **优化测试计划用例列表实时更新机制**
- **修复单个UI自动化用例执行时数据来源问题**
- **修复单个用例执行时重复调用接口的问题**
- **优化测试计划执行历史记录创建机制**

---

## 2024-12-24

### 测试运行功能优化

- **修复：测试运行列表排序功能未生效**
  - 后端支持动态排序参数（sortBy、sortOrder）
  - 前端传递排序参数到后端
  - 支持按startedAt或finishedAt排序，支持升序/降序

- **修复：测试运行时间无法正常显示的问题**
  - 修复字段名不一致问题（startTime/endTime → startedAt/finishedAt）
  - 增强safeFormat函数支持Date对象和ISO字符串两种格式
  - 更新接口定义和排序逻辑

- **重构：统一测试运行时间字段，简化API返回数据**
  - 删除冗余字段（startTime、endTime、actualStartedAt、endedAt）
  - 统一使用startedAt和finishedAt字段
  - 前后端字段完全一致

- **修复：测试运行列表时间显示错误和排序功能**
  - 优化TestRuns.tsx数据加载逻辑，使用testService.getAllTestRuns()方法
  - 修复时间字段使用优先级（优先使用startedAt）
  - 添加自动排序功能（默认按startedAt降序）

- **功能增强：测试运行列表支持前端排序**
  - getAllTestRuns()方法支持可选的排序参数
  - 可按startedAt、finishedAt、startTime字段排序
  - 支持升序（asc）或降序（desc）排列

- **优化：测试运行进度条增加动画效果**
  - 运行中的测试进度条显示从左到右滑动的渐变动画
  - 使用蓝色到浅蓝色的渐变效果
  - 修复Tailwind配置格式兼容性问题
  - 修复进度条动画不显示问题

### 开发环境优化

- **修复：解决开发服务器热重载失效和端口占用问题**
  - 创建智能开发服务器启动脚本（scripts/dev-server.cjs）
  - 自动端口清理功能
  - 优雅关闭处理
  - 跨平台支持（Windows和Unix）
  - 增强服务器错误处理

### 缓存统计功能

- **优化：修复缓存统计页面数据显示问题**
  - 修复趋势图数据显示问题
  - 统一hitRate数据类型处理
  - 优化饼图数据处理
  - 代码重构和优化

### 文档处理功能

- **修复：过滤文档中的base64图片，优化AI输入长度**
  - HTML文件：自动过滤<img>标签中的base64图片
  - DOCX文件：改用mammoth.convertToHtml()转换为HTML，然后过滤base64图片
  - Markdown文件：过滤base64图片
  - PDF文件：使用pdf-parse提取纯文本
  - 完善文本输入的图片过滤（第二次修复）

---

## 总结

本次开发周期主要完成了以下功能模块：

### 核心功能
1. **测试计划执行功能**：继续执行、重新执行、中途退出确认、实时状态更新
2. **测试计划UI自动化用例**：执行配置、执行流程优化、统计数据准确性
3. **测试用例和执行**：筛选功能、统计功能、视图模式切换
4. **测试运行**：排序功能、时间显示、进度条动画

### 技术优化
1. **开发环境**：热重载修复、端口占用处理
2. **性能优化**：WebSocket/轮询刷新优化、页面闪烁问题
3. **数据精度**：时间字段精度修复、执行耗时计算优化
4. **代码质量**：统一字段命名、修复弃用警告、增强错误处理

### 用户体验
1. **实时更新**：WebSocket实时更新执行状态
2. **视觉反馈**：进度条动画、状态标签背景色
3. **操作流程**：继续执行、重新执行、退出确认
4. **数据准确性**：执行结果统计、时间记录、步骤统计

---

**提交记录总数**：约80+个功能点和修复点

**涉及文件**：
- 前端：`src/pages/TestPlanDetail.tsx`、`src/pages/TestPlanExecute.tsx`、`src/components/TestPlanExecutionLogModal.tsx`等
- 后端：`server/services/testPlanService.ts`、`server/services/testExecution.ts`、`server/routes/testPlan.ts`等
- 配置：`prisma/schema.prisma`、`tailwind.config.cjs`、`scripts/dev-server.cjs`等

---

## 2024-12-29 模型选择器修复

### fix(settings): 修复模型名称下拉选择无法选择其他模型的问题

**问题描述**：
在设置页面的模型名称选择模式下，当获取厂商模型列表后，选择一个模型会导致该模型从下拉列表中消失，无法再选择其他模型。

**根本原因**：
`providerModels.map` 中的过滤条件 `model.id !== formData.customModelName` 会将当前选中的模型从列表中过滤掉，导致 `<select>` 的 value 指向一个不存在的 `<option>`。

**修复方案**：
移除错误的过滤条件，只保留 `model.id !== selectedModel?.openRouterModel` 以避免与默认模型选项重复。

**涉及文件**：
- `src/pages/Settings.tsx`

---

### feat(settings): 模型名称选择器支持搜索功能

**改进内容**：
将模型名称选择器从原生 `<select>` 升级为 Ant Design `Select` 组件，支持搜索过滤功能。

**具体改动**：
1. 导入 Ant Design `Select` 组件
2. 添加 `showSearch` 启用搜索
3. 添加 `optionFilterProp="label"` 和 `filterOption` 实现模糊搜索
4. 添加 `loading` 状态显示加载指示器
5. 使用 `status` 属性显示错误状态

**涉及文件**：
- `src/pages/Settings.tsx`

---

## feat: 添加 Ollama 本地模型 API 格式兼容支持

**提交说明**：
为本地模型（Ollama）添加完整的 API 格式兼容支持，解决使用本地模型时出现 404 错误的问题。

**问题分析**：
- 原有代码统一使用 OpenAI 兼容格式（`/chat/completions` 端点 + `messages` 数组）
- Ollama 本地服务使用原生 API 格式（`/api/generate` 端点 + `prompt` 字段）
- 导致调用本地模型时返回 404 错误

**具体改动**：
1. **类型定义扩展**：
   - `ModelDefinition` 接口添加 `apiFormat?: 'openai' | 'ollama'` 字段
   - `LLMConfig` 接口添加 `apiFormat?: 'openai' | 'ollama'` 字段

2. **模型配置更新**：
   - `local-series` 模型设置 `apiFormat: 'ollama'`
   - 更新默认端口为 Ollama 标准端口 `11434`

3. **API 调用逻辑兼容**：
   - 根据 `apiFormat` 动态选择端点（`/api/generate` 或 `/chat/completions`）
   - 根据 `apiFormat` 构建不同的请求体格式
   - 根据 `apiFormat` 解析不同的响应格式

4. **错误处理增强**：
   - 为 Ollama 格式的 404 错误提供更友好的提示信息
   - 网络错误时提示检查 Ollama 服务是否运行

**涉及文件**：
- `src/services/modelRegistry.ts` - 添加 apiFormat 字段和 local-series 配置
- `src/types/llm.ts` - LLMConfig 接口添加 apiFormat
- `src/services/llmConfigManager.ts` - 配置构建时传递 apiFormat
- `server/routes/config.ts` - 测试连接支持 Ollama 格式
- `server/services/aiParser.ts` - AI 调用支持 Ollama 格式
- `server/services/aiPreAnalysisService.ts` - 预分析服务支持 Ollama 格式
- `server/services/functionalTestCaseAIService.ts` - 功能测试用例 AI 服务支持 Ollama 格式

---

## feat: 添加详细的 AI 模型配置日志

**提交说明**：
为测试执行服务添加更详细的 AI 模型配置日志，便于调试和监控 AI 模型使用情况。

**具体改动**：

1. **AIParser 新增 getDetailedModelInfoAsync 方法**：
   - 返回详细的模型配置信息，包括：
     - `modelName`：模型名称
     - `modelId`：模型ID
     - `provider`：提供商
     - `mode`：运行模式
     - `baseUrl`：API端点
     - `apiModel`：实际调用的 API 模型名称（如 qwen-plus）
     - `apiKeyStatus`：API Key 状态（脱敏显示）
     - `temperature`：温度参数
     - `maxTokens`：最大令牌数
     - `costLevel`：成本级别
     - `capabilities`：模型能力列表
     - `apiFormat`：API 格式（openai/ollama）
     - `isInitialized`：初始化状态

2. **testExecution.ts 日志增强**：
   - `logAIParserInfo()` 方法添加格式化输出框架
   - `executeTestCase()` 方法使用 `getDetailedModelInfoAsync()` 输出完整配置
   - 控制台和执行日志同时记录详细配置信息

**日志输出示例**：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 [runId] AI解析器配置信息:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📦 模型: 通义千问系列 (ID: qwen-series)
   🏢 提供商: 阿里云
   ⚙️ 运行模式: 配置管理器模式
   🌐 API端点: https://dashscope.aliyuncs.com/compatible-mode/v1
   🤖 API模型: qwen-plus
   🔑 API Key: 已设置 (sk-xxxxx...)
   📡 API格式: openai
   🌡️ Temperature: 0.3
   📊 Max Tokens: 4000
   💰 成本级别: low
   🎯 模型能力: code, analysis, chat
   ✅ 初始化状态: 已初始化
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**涉及文件**：
- `server/services/aiParser.ts` - 新增 getDetailedModelInfoAsync 方法
- `server/services/testExecution.ts` - 增强日志输出格式和内容

---

## fix: 测试执行详情页返回功能修复

**提交说明**：
修复从多个入口进入测试执行详情页后，点击"返回列表"无法返回原页面的问题。

**问题分析**：
进入测试执行详情页 `/test-runs/:id/detail` 共有5个入口：
1. 测试执行列表 (`TestRuns.tsx`) - ❌ 缺少返回参数
2. 测试计划详情 (`TestPlanDetail.tsx`) - ✅ 已有返回参数
3. 测试计划执行日志 (`TestPlanExecutionLogModal.tsx`) - 新标签页打开（无需处理）
4. UI自动化用例 (`TestCases.tsx`) - ❌ 缺少返回参数
5. 功能用例 (`FunctionalTestCases/index.tsx`) - ❌ 缺少返回参数

由于缺少 `state` 参数，详情页的 `handleGoBack()` 函数无法获取来源信息，只能默认返回到 `/test-runs`。

**修复方案**：
为所有导航到详情页的入口添加 `state` 参数，包含 `from` 和 `caseName` 信息。

**具体改动**：

1. **TestRuns.tsx** - 测试执行列表：
   ```javascript
   navigate(`/test-runs/${run.id}/detail`, {
     state: { from: '/test-runs', caseName: run.name }
   });
   ```

2. **TestCases.tsx** - UI自动化用例：
   ```javascript
   navigate(`/test-runs/${response.runId}/detail`, {
     state: { from: '/test-cases', caseName: pendingTestCase.name }
   });
   ```

3. **FunctionalTestCases/index.tsx** - 功能用例：
   ```javascript
   navigate(`/test-runs/${response.runId}/detail`, {
     state: { from: '/functional-test-cases', caseName: pendingTestCase.name }
   });
   ```

**涉及文件**：
- `src/pages/TestRuns.tsx` - 添加返回参数
- `src/pages/TestCases.tsx` - 添加返回参数
- `src/pages/FunctionalTestCases/index.tsx` - 添加返回参数

---

## fix: 测试执行详情页不再创建新Tab标签

**提交说明**：
优化测试执行详情页的Tab行为，进入时不创建新Tab，返回时自动保持在原Tab。

**改进内容**：

1. **TabContext.tsx**：
   - 测试执行详情页 `/test-runs/:id/detail` 返回 `null`，不创建独立Tab
   - 添加 `isTestRunDetailRoute` 特殊处理逻辑
   - 进入详情页时复用 `/test-runs` 的Tab（类似测试计划详情页的处理方式）
   - 如果测试执行列表Tab不存在，自动创建并激活

**行为变化**：
- 之前：每次进入详情页都创建新Tab "测试执行详情"
- 现在：复用"测试执行"Tab，路由切换但Tab不变
- 返回时：直接导航回原页面，无需关闭Tab

**涉及文件**：
- `src/contexts/TabContext.tsx` - 添加测试执行详情页的特殊处理逻辑

---

## feat: 测试执行记录页面增加搜索栏和筛选器

**提交说明**：
为测试执行记录页面 (`TestRuns.tsx`) 添加搜索栏和筛选器功能，优化布局使其与 UI 自动化测试执行页面保持一致。

**具体改动**：

1. **添加本地搜索和筛选状态**：
   - 新增 `localSearchTerm`、`localStatusFilter`、`localResultFilter` 等本地状态
   - 新增 `localSystemFilter`、`localVersionFilter`、`localModuleFilter` 筛选状态
   - 新增 `localFilterOptions` 存储从数据中提取的筛选选项
   - 添加 `isLocalMode` 判断逻辑，独立使用时使用本地状态，嵌入时使用外部传入的参数

2. **修改 Header 区域布局**：
   - 视图切换器（表格视图、详细表格、卡片视图）移至左侧
   - 停止所有按钮移至右侧
   - 移除原列表区域内的视图切换器（避免重复）

3. **添加搜索栏和筛选器 UI**：
   - 搜索输入框：支持按测试用例 ID 或名称搜索
   - 项目筛选：下拉选择项目
   - 版本筛选：依赖于项目选择，未选择项目时显示"请先选择项目"
   - 模块筛选：下拉选择模块
   - 状态筛选：执行中、已完成、失败、队列中、已取消
   - 结果筛选：通过、失败、跳过
   - 筛选按钮、重置按钮、刷新按钮

4. **添加重置筛选功能**：
   - 新增 `handleResetFilters` 函数，重置所有筛选条件并回到第一页

5. **更新筛选逻辑**：
   - `filteredTestRuns` 使用 `effective*` 变量进行筛选
   - 从加载的测试运行数据中提取筛选选项（项目、版本、模块）

**涉及文件**：
- `src/pages/TestRuns.tsx` - 添加搜索栏、筛选器 UI 和相关状态处理逻辑

---

## feat: 测试执行记录页面增加标签、优先级、环境、执行者筛选功能

**提交说明**：
为测试执行记录页面补充缺失的筛选功能：标签、优先级、环境、执行者。

**具体改动**：

1. **添加新的筛选状态**：
   - `localTagFilter` - 标签筛选
   - `localPriorityFilter` - 优先级筛选
   - `localEnvironmentFilter` - 环境筛选
   - `localExecutorFilter` - 执行者筛选

2. **扩展筛选选项数据结构**：
   - `localFilterOptions` 新增 `tags`、`environments`、`executors` 字段
   - 数据加载时从测试运行数据中提取这些选项

3. **添加第二行筛选器 UI**：
   - 标签筛选下拉框（带标签提示）
   - 优先级筛选下拉框（高/中/低）
   - 环境筛选下拉框
   - 执行者筛选下拉框

4. **更新筛选逻辑**：
   - `filteredTestRuns` 使用 `effectiveTagFilter`、`effectivePriorityFilter`、`effectiveEnvironmentFilter`、`effectiveExecutorFilter` 进行筛选
   - 更新 `handleResetFilters` 函数重置所有筛选条件

**涉及文件**：
- `src/pages/TestRuns.tsx` - 添加标签、优先级、环境、执行者筛选功能

---

## feat: 高级筛选默认隐藏，点击筛选按钮展开/收起

**提交说明**：
优化测试执行记录页面的高级筛选区域（标签、优先级、环境、执行者），默认隐藏，点击"筛选"按钮时展开/收起。

**具体改动**：

1. **添加展开/收起状态**：
   - 新增 `showAdvancedFilters` 状态变量，默认为 `false`

2. **修改筛选按钮行为**：
   - 点击筛选按钮切换 `showAdvancedFilters` 状态
   - 展开时按钮样式变为蓝色高亮

3. **添加展开/收起动画**：
   - 使用 `AnimatePresence` 和 `motion.div` 包装高级筛选区域
   - 添加 `height` 和 `opacity` 动画效果
   - 参考 `TestCases.tsx` 中的实现方式

**涉及文件**：
- `src/pages/TestRuns.tsx` - 添加高级筛选展开/收起功能

---

## fix: 修复搜索栏输入或选择后失去焦点的问题

**提交说明**：
修复测试执行记录页面 (`TestRuns.tsx`) 搜索栏在输入或选择后失去焦点状态的问题。

**问题分析**：
`ErrorFallback` 组件被定义在 `TestRuns` 函数内部（第 1663-1695 行）。在 React 中，每次父组件状态变化重新渲染时，内部定义的组件都会被视为一个新的组件类型，导致整个子树重新挂载，从而导致输入框失去焦点。

**修复方案**：
将 `ErrorFallback` 组件从 `TestRuns` 函数内部移到外部定义，这样组件类型引用保持稳定，不会在每次渲染时重新创建。

**具体改动**：

1. **将 ErrorFallback 移到组件外部**：
   - 在 `export function TestRuns` 之前定义 `ErrorFallback` 组件
   - 添加 `onRetry` prop 用于传递重试回调函数

2. **更新 ErrorFallback 使用方式**：
   - 使用时传入 `onRetry={loadTestRuns}` 参数

**涉及文件**：
- `src/pages/TestRuns.tsx` - 将 ErrorFallback 组件移到函数外部

---

## fix: 修复测试执行记录分页排序问题，最新记录应显示在第一页

**提交说明**：
修复测试执行记录页面分页时，最新的测试运行记录没有显示在第一页最前面的问题。

**问题分析**：
在 `TestRuns.tsx` 第 339-341 行，代码注释说明应该"按 startedAt 降序排列，最新的测试显示在最前面"，但实际 API 调用传入的是 `sortOrder: 'asc'`（升序），导致最**旧**的数据显示在第一页。

```javascript
// 错误的代码
const apiData = await testService.getAllTestRuns({
  sortBy: 'startedAt',
  sortOrder: 'asc'  // ❌ 升序 = 最旧的在前面
});
```

作为对比，`TestCases.tsx` 正确地使用了 `sortOrder: 'desc'`（降序）。

**修复方案**：
将 `sortOrder: 'asc'` 改为 `sortOrder: 'desc'`，使最新的测试执行记录显示在第一页的最前面。

```javascript
// 正确的代码
const apiData = await testService.getAllTestRuns({
  sortBy: 'startedAt',
  sortOrder: 'desc'  // ✅ 降序 = 最新的在前面
});
```

**涉及文件**：
- `src/pages/TestRuns.tsx` - 修复 getAllTestRuns 的 sortOrder 参数从 'asc' 改为 'desc'

---

## fix: 日志区域最大高度自适应浏览器窗口

**提交说明**：
修复测试执行详情页日志区域的最大高度问题，使其能够根据浏览器窗口大小自适应，底部保留10px距离。

**问题分析**：
原有代码使用固定的 `max-h-96`（384px）作为日志区域的最大高度，在不同屏幕尺寸下无法充分利用可用空间。

**修复方案**：
1. 添加 `logsMaxHeight` 状态变量存储动态计算的最大高度
2. 添加 `useEffect` 钩子监听窗口大小变化
3. 使用 `requestAnimationFrame` 确保 DOM 完全渲染后再计算高度
4. 根据元素位置动态计算最大高度（窗口高度 - 元素顶部位置 - 10px底部间距）
5. 设置高度限制：最小200px，最大为视口高度的80%，避免无限变大
6. 移除固定的 `max-h-96`，改用动态 `style={{ maxHeight: logsMaxHeight }}`
7. 监听 `resize` 事件和 `fullscreenchange` 事件，支持全屏模式自适应
8. 监听 `scroll` 事件（捕获阶段），支持页面滚动时自适应变大
9. 添加防抖处理避免频繁更新（resize 50ms，scroll 16ms ≈ 60fps）
10. Safari 兼容：监听 `webkitfullscreenchange` 事件

**涉及文件**：
- `src/pages/TestRunDetail.tsx` - 添加日志区域动态高度计算逻辑

---

## fix: 测试执行详情页使用纯CSS flex布局实现自适应高度

**提交说明**：
重构测试执行详情页的布局，使用纯 CSS flex 布局替代 JavaScript 动态计算高度，解决页面出现不必要滚动的问题，实现真正的全屏自适应。

**问题分析**：
之前的方案使用 JavaScript 动态计算日志区域的 `maxHeight`，但由于外层布局未使用正确的 flex 布局，导致：
1. 页面内容超出视口时出现不必要的滚动条
2. 内容区域无法正确填充剩余空间
3. 只有在全屏时才应该出现滚动，但实际上非全屏也会出现

**修复方案**：
使用纯 CSS flex 布局链来实现自适应，关键点如下：

1. **外层容器**：`h-screen flex flex-col overflow-hidden`
   - 固定高度为视口高度，使用 flex 列布局

2. **内容容器**：添加 `flex flex-col flex-1 min-h-0`
   - `flex-1` 填充剩余空间
   - `min-h-0` 允许元素缩小到比内容更小（flex 布局关键属性）

3. **固定区域**：添加 `flex-shrink-0`
   - 顶部导航栏不被压缩
   - 统计信息卡片不被压缩
   - 标签页头部不被压缩

4. **标签页容器**：添加 `flex-1 flex flex-col min-h-0 overflow-hidden`
   - 填充剩余空间并允许内部滚动

5. **日志区域**：移除 `style={{ maxHeight: logsMaxHeight }}`，添加 `min-h-0`
   - 使用 CSS 自动计算高度，无需 JavaScript

6. **清理冗余代码**：
   - 移除 `logsMaxHeight` 状态变量
   - 移除计算高度的 `useEffect` 钩子
   - 移除 resize、scroll、fullscreenchange 事件监听

**技术要点**：
`min-h-0` 在 flex 布局中非常重要。默认情况下，flex 子元素的最小高度是其内容高度（`min-height: auto`）。这意味着即使设置了 `overflow: auto`，如果内容很长，元素也会撑开而不是出现滚动条。添加 `min-h-0` 可以覆盖这个默认行为，让元素可以缩小到比其内容更小的尺寸，从而允许内部滚动。

**涉及文件**：
- `src/pages/TestRunDetail.tsx` - 重构布局使用纯 CSS flex 布局

---

## fix: 修复测试执行详情页高度计算，考虑 Layout 嵌套结构

**提交说明**：
修复测试执行详情页由于嵌套在 Layout 组件中，使用 `h-screen` 导致内容超出可见区域的问题。

**问题分析**：
TestRunDetail 组件被嵌套在 Layout 组件中，Layout 包含：
- 顶部导航栏：`h-20`（80px）
- TabBar：`h-12`（48px）
- main 元素的 padding：`p-8`（上下各32px）

使用 `h-screen`（100vh）会忽略这些已占用的空间，导致内容超出可见区域并出现滚动条。

**修复方案**：
使用 CSS `calc` 函数计算正确的可用高度：
```css
height: calc(100vh - 192px)
```

其中 192px = 80px（顶部导航栏）+ 48px（TabBar）+ 32px（padding-top）+ 32px（padding-bottom）

**涉及文件**：
- `src/pages/TestRunDetail.tsx` - 使用 calc 计算正确的可用高度

---

## feat: 测试执行详情页支持全屏时高度自适应

**提交说明**：
优化测试执行详情页在全屏模式下的高度计算，使其能够根据全屏状态自动调整。

**问题分析**：
Layout 组件的全屏模式会隐藏顶部导航栏和 TabBar，此时可用高度变为 100vh，但之前的固定 `calc(100vh - 160px)` 无法适应这一变化。

**修复方案**：

1. **添加全屏状态监听**：
   - 新增 `isFullscreen` 状态，初始值从 `document.fullscreenElement` 获取
   - 添加 `useEffect` 监听 `fullscreenchange` 和 `webkitfullscreenchange` 事件
   - 全屏变化时自动更新状态

2. **动态计算高度**：
   ```tsx
   const containerHeight = isFullscreen ? '100vh' : 'calc(100vh - 160px)';
   ```
   - 非全屏：减去顶部导航栏、TabBar 和 padding 的高度
   - 全屏：使用完整视口高度

**涉及文件**：
- `src/pages/TestRunDetail.tsx` - 添加全屏状态监听和动态高度计算

---

## feat: 测试计划执行日志中的用例日志改为弹窗显示

**提交说明**：
将测试计划执行日志弹窗中的"查看执行日志"操作从跳转新页面改为弹窗显示，提升用户体验。

**问题分析**：
原来点击 UI 自动化用例的"日志"按钮会 `window.open()` 打开新标签页跳转到测试执行详情页，用户需要在多个标签页之间切换，体验不佳。

**修复方案**：

1. **创建 TestRunDetailModal 弹窗组件**：
   - 复用 TestRunDetail 页面的核心内容和逻辑
   - 接收 `isOpen`、`onClose`、`runId` 作为 props
   - 移除路由相关逻辑（useParams、useNavigate 等）
   - 使用 Ant Design Modal 作为容器
   - 保留执行日志、实时视图、测试证据三个标签页
   - 保留停止测试功能
   - 保留 WebSocket 实时更新功能

2. **修改 handleViewLogs 函数**：
   - UI 自动化用例：改为打开 TestRunDetailModal 弹窗
   - 功能测试用例：保持原有的 TestPlanCaseExecutionLogModal 弹窗

3. **添加弹窗状态管理**：
   - 新增 `testRunDetailModalOpen` 状态控制弹窗显示
   - 新增 `currentExecutionId` 状态保存当前查看的执行 ID

**涉及文件**：
- `src/components/TestRunDetailModal.tsx` - 新增测试执行详情弹窗组件
- `src/components/TestPlanExecutionLogModal.tsx` - 修改 handleViewLogs 函数为弹窗显示

---

## fix: 优化按钮组件点击后边框和图标按钮缩放问题

**提交说明**：
修复按钮组件（Button）在点击后出现明显边框环以及图标按钮 hover/tap 时缩放过大的问题。

**问题分析**：
1. **点击后边框问题**：按钮使用 `focus:ring-2 focus:ring-offset-2` 会在鼠标点击后显示明显的聚焦边框环
2. **图标按钮缩放问题**：`whileHover={{ scale: 1.02 }}` 动画对于小尺寸图标按钮效果不佳
3. **ghost 变体聚焦环**：ghost 按钮作为轻量级操作按钮，聚焦环太明显影响视觉

**修复方案**：

1. **将 `focus:` 改为 `focus-visible:`**：
   - 只在键盘聚焦时显示边框环，鼠标点击后不显示
   - 保持键盘无障碍访问体验

2. **ghost 变体设置 `focus-visible:ring-transparent`**：
   - ghost 按钮点击后完全不显示聚焦环
   - 适合工具栏、表格操作等场景

3. **新增 `icon-sm` 和 `icon-xs` 尺寸**：
   - `icon-sm`: h-8 w-8
   - `icon-xs`: h-7 w-7
   - 提供更小的图标按钮尺寸选项

4. **图标按钮和 ghost 变体禁用 hover 缩放动画**：
   - `hoverAnimation = {}` 不使用 scale 动画
   - `tapAnimation = { scale: 0.95 }` 只使用轻微的点击缩小效果
   - 避免小按钮 hover 时视觉跳动

5. **图标按钮使用较小的圆角**：
   - 图标按钮: `rounded-lg`
   - 普通按钮: `rounded-xl`

**涉及文件**：
- `src/components/ui/button.tsx` - 优化按钮组件样式和动画逻辑
- `src/components/StepTableEditor.tsx` - 将操作按钮改为使用 `size="icon-xs"`

---

## fix: 修复测试步骤失败时 failedSteps 未正确计数导致执行结果误判为 block 的问题

**提交说明**：
修复 Playwright 和 MCP 测试执行器中，测试步骤或断言失败时未更新 `failedSteps` 计数器，导致执行结果被错误计算为 `block` 而不是 `fail` 的问题。

**问题分析**：
用户执行测试用例后，日志明确显示 `❌ 步骤 2 失败: 点击失败: 无法找到元素`，但：
1. `failedSteps: 0` 没有正确计数
2. `executionResult: "block"` 应该是 `"fail"`

根本原因是执行结果判断逻辑：
```javascript
if (failedSteps > 0) {
  result = 'fail';
} else if (totalSteps > 0 && passedSteps < totalSteps) {
  result = 'block';  // 由于 failedSteps = 0，走到了这个分支
}
```

因为 `failedSteps` 始终为 0，所以即使有失败步骤，也被误判为 `block`（阻塞）。

**问题定位**：

1. **Playwright 执行器（操作步骤失败）**：
   - 成功步骤有 `testRun.passedSteps++` 更新（第 6484-6487 行）
   - 失败步骤**缺少** `testRun.failedSteps++` 更新，直接 `return` 了

2. **Playwright 执行器（断言失败）**：
   - 成功断言有 `testRun.passedSteps++` 更新
   - 失败断言**缺少** `testRun.failedSteps++` 更新，直接 `return` 了

3. **MCP 执行器（断言失败/异常）**：
   - 完全没有更新 `passedSteps` 和 `failedSteps` 的逻辑

**修复方案**：

1. **Playwright 执行器 - 操作步骤失败时**：
   - 在 `updateTestRunStatus(runId, 'failed', ...)` 之前添加 `failedSteps` 更新

2. **Playwright 执行器 - 断言失败时**：
   - 在 `updateTestRunStatus(runId, 'failed', ...)` 之前添加 `failedSteps` 更新

3. **MCP 执行器 - 断言失败/异常时**：
   - 添加 `failedSteps` 更新逻辑
   - 同时补充成功断言的 `passedSteps` 更新逻辑

**涉及文件**：
- `server/services/testExecution.ts`
  - Playwright 执行器操作步骤失败处理（约 6449 行）
  - Playwright 执行器断言失败处理（约 6900 行）
  - MCP 执行器断言失败/异常/成功处理（约 5701-5714 行）

---

## fix: 移除步骤/断言失败时重复的日志输出

**提交说明**：
修复步骤或断言失败时出现两条重复失败日志的问题。

**问题分析**：
用户反馈失败日志出现两条：
1. `❌ 步骤 2 失败: 点击失败: 无法找到元素: 百度一下按钮`
2. `步骤 2 失败: 点击失败: 无法找到元素: 百度一下按钮`

原因是代码中先调用了 `this.addLog()` 添加失败日志，然后又调用 `updateTestRunStatus()` 方法，该方法内部也会调用 `this.addLog()` 添加传入的 message。

**修复方案**：
移除步骤/断言失败时的第一条 `addLog` 调用，由 `updateTestRunStatus` 统一添加失败日志，并在 message 中添加 ❌ 前缀保持格式一致。

**涉及文件**：
- `server/services/testExecution.ts` - 移除重复的 addLog 调用，统一由 updateTestRunStatus 添加日志

---

## fix: 修复测试执行详情页步骤和断言数量统计不准确的问题

**提交说明**：
修复测试执行详情页（TestRunDetail）中执行进度和执行结果的步骤数量、断言数量统计不准确的问题。

**问题分析**：
用户提供的测试用例数据显示：
- `steps: "1. 打开百度搜索页面 -> 进入百度搜索页面\n2. 点击百度一下搜索按钮 -> 页面出现默认的搜索内容"`（2个步骤）
- `assertions: "页面出现默认的搜索内容"`（1个断言）

但页面显示的统计数据不准确，因为原有的 `calculateStepAndAssertionStats` 函数是从以下来源获取数据的：
1. `testRun.steps` - 运行时的结构化步骤数组（可能为空或不准确）
2. `testRun.logs` - 日志中的步骤/断言信息（通过正则匹配提取，可能不完整）
3. `testRun.totalSteps` - 后端返回的总步骤数（可能不准确）

这些数据源都不够可靠，应该从测试用例的原始定义中获取准确的步骤和断言数量。

**修复方案**：

1. **添加测试用例状态**：
   - 新增 `testCase` 状态存储测试用例详情
   - 在 `loadTestRun` 中使用 `testRun.testCaseId` 获取测试用例详情

2. **添加解析函数**：
   - `parseStepsFromTestCase(stepsText)`: 解析测试用例 `steps` 字段，按换行符分隔统计有效步骤数
   - `parseAssertionsFromTestCase(assertionsText)`: 解析测试用例 `assertions` 字段，按换行符分隔统计有效断言数

3. **重构 `calculateStepAndAssertionStats` 函数**：
   - **步骤1**: 优先从测试用例原始定义中计算总步骤数和总断言数
   - **步骤2**: 如果测试用例数据不可用，回退到从日志和运行时数据中提取
   - **步骤3**: 从执行日志中统计通过/失败/完成的数量（匹配日志消息模式）

**计算逻辑**：
- 总步骤数：从 `testCase.steps` 文本解析，按换行符分隔统计
- 总断言数：从 `testCase.assertions` 文本解析，按换行符分隔统计
- 已完成步骤数：通过数 + 失败数
- 通过步骤数：匹配日志 `步骤 X 执行成功` 或 `✅ 步骤 X`
- 失败步骤数：匹配日志 `步骤 X 失败` 或 `❌ 步骤 X`
- 断言统计：类似逻辑匹配 `断言 X 通过/失败` 模式

**涉及文件**：
- `src/pages/TestRunDetail.tsx`
  - 新增 `testCase` 状态和 `TestCase` 类型导入
  - `loadTestRun` 函数中添加获取测试用例详情的逻辑
  - 新增 `parseStepsFromTestCase` 和 `parseAssertionsFromTestCase` 解析函数
  - 重构 `calculateStepAndAssertionStats` 函数，优先使用测试用例原始数据

---

## fix: 修复测试执行详情弹窗与详情页断言统计不一致的问题

**提交说明**：
修复 `TestRunDetailModal` 弹窗组件与 `TestRunDetail` 页面的断言统计数据不一致的问题。

**问题分析**：
用户反馈同一个测试执行记录：
- 详情页（`TestRunDetail.tsx`）显示：断言 1/1，全部通过
- 弹窗（`TestRunDetailModal.tsx`）显示：断言 2/1，失败

**根本原因**：
`TestRunDetail.tsx` 在加载测试运行数据后，会额外通过 `testCaseId` 获取测试用例详情 (`testCase`)，然后在计算统计数据时，优先从 `testCase` 的 `steps` 和 `assertions` 字段解析准确的总步骤数和总断言数。

而 `TestRunDetailModal.tsx` 没有获取 `testCase` 数据，只能从日志中推断统计数据，导致：
1. `totalAssertions` 可能从日志中提取的最大断言编号（不准确）
2. `completedAssertions` = `passedAssertions` + `failedAssertions`，如果日志匹配不精确，会导致计数错误
3. 当 `completedAssertions > totalAssertions` 时，显示异常（如 2/1）

**修复方案**：
让 `TestRunDetailModal.tsx` 也获取 `testCase` 数据，并使用与 `TestRunDetail.tsx` 完全相同的统计计算逻辑。

**具体改动**：

1. **导入 TestCase 类型**：
   ```typescript
   import type { TestRun as TestRunType, TestCase } from '../types/test';
   ```

2. **添加 testCase 状态**：
   ```typescript
   const [testCase, setTestCase] = useState<TestCase | null>(null);
   ```

3. **在 loadTestRun 中获取测试用例详情**：
   ```typescript
   if (processedRun.testCaseId) {
     try {
       const caseDetail = await testService.getTestCaseById(processedRun.testCaseId);
       setTestCase(caseDetail);
     } catch (error) {
       console.warn('⚠️ Modal: 获取测试用例详情失败:', error);
     }
   }
   ```

4. **添加解析函数**：
   - `parseStepsFromTestCase(stepsText)`: 解析步骤文本，统计有效步骤数
   - `parseAssertionsFromTestCase(assertionsText)`: 解析断言文本，统计有效断言数

5. **重构 calculateStepAndAssertionStats 函数**：
   - **步骤1**: 优先从 `testCase` 原始定义中计算 `totalOperationSteps` 和 `totalAssertions`
   - **步骤2**: 如果 `testCase` 没有数据，回退到从日志和运行时数据中提取
   - **步骤3**: 从日志中统计执行结果（通过/失败/完成），与 `TestRunDetail.tsx` 完全一致

**涉及文件**：
- `src/components/TestRunDetailModal.tsx`
  - 导入 `TestCase` 类型
  - 新增 `testCase` 状态
  - `loadTestRun` 函数中添加获取测试用例详情的逻辑
  - 新增 `parseStepsFromTestCase` 和 `parseAssertionsFromTestCase` 解析函数
  - 重构 `calculateStepAndAssertionStats` 函数，与 `TestRunDetail.tsx` 保持一致

---

## fix: 修复断言失败数统计条件过于宽泛导致误匹配的问题

**提交说明**：
修复 `failedAssertionLogs` 的匹配条件过于宽泛，导致 "AI解析器正在匹配断言元素" 等进度日志被错误计入失败断言数的问题。

**问题分析**：
用户反馈测试用例只有 1 个断言，但页面显示 "断言: 2/1"，导致执行结果被判定为"失败"。

从日志分析发现：
1. "断言 1 通过" → `passedAssertions = 1` ✅
2. "❌ AI解析器正在匹配断言元素，请稍候..." → 被错误匹配为失败断言

**根本原因**：
`failedAssertionLogs` 的匹配条件中包含：
```javascript
(log.message?.includes('断言') && log.level === 'error')
```

这个条件太宽泛了！任何包含"断言"关键字且 level 为 'error' 的日志都会被计入失败断言数。"AI解析器正在匹配断言元素" 这条日志：
- 包含 "断言" 关键字
- 显示时使用 ❌ 图标（可能 level 被标记为 'error'）
- 实际上只是一条等待/进度提示，不是断言失败

**修复方案**：
移除 `(log.message?.includes('断言') && log.level === 'error')` 这个过于宽泛的条件，只保留精确匹配：
- `/断言\s*\d+\s*失败/` - 匹配 "断言 1 失败" 格式
- `/❌\s*断言\s*\d+/` - 匹配 "❌ 断言 1" 格式

**涉及文件**：
- `src/pages/TestRunDetail.tsx` - 修复 failedAssertionLogs 匹配条件
- `src/components/TestRunDetailModal.tsx` - 修复 failedAssertionLogs 匹配条件

---

## fix: 修复断言通过数统计条件过于宽泛导致误匹配截图日志的问题

**提交说明**：
修复 `passedAssertionLogs` 的匹配条件过于宽泛，导致 "✅ 断言 1 截图已保存" 日志被错误计入通过断言数的问题。

**问题分析**：
用户反馈测试用例只有 1 个断言，但页面显示 "断言: 2/1，2通过0失败0阻塞"。

从日志分析发现：
1. "✅ 断言 1 通过" → 正确匹配 `passedAssertions`
2. "✅ 断言 1 截图已保存: assertion-1-success-..." → 被 `/✅\s*断言\s*\d+/` 错误匹配

**根本原因**：
`passedAssertionLogs` 的匹配条件包含：
```javascript
log.message?.match(/✅\s*断言\s*\d+/)
```

这个正则会匹配任何包含 "✅ 断言 数字" 格式的日志，包括：
- "✅ 断言 1 通过" ✅ 正确
- "✅ 断言 1 截图已保存" ❌ 不应该匹配

**修复方案**：
移除 `/✅\s*断言\s*\d+/` 这个过于宽泛的条件，只保留精确匹配：
- `/断言\s*\d+\s*通过/` - 只匹配 "断言 1 通过" 格式

**涉及文件**：
- `src/pages/TestRunDetail.tsx` - 修复 passedAssertionLogs 匹配条件
- `src/components/TestRunDetailModal.tsx` - 修复 passedAssertionLogs 匹配条件

---

## fix: 修复MCP客户端执行UI自动化时步骤/断言计数错误和缓存死循环问题

**提交说明**：
修复使用MCP客户端执行UI自动化测试时存在的两个问题：
1. 执行进度和执行结果的步骤和断言计算错误
2. 缓存无效命令导致死循环

**问题1分析 - 步骤和断言计数错误**：
在 `executeWithMcpClient` 方法中，`totalSteps` 只根据操作步骤来估算（`estimateStepsCount(testCase.steps)`），没有包含断言步骤数量。导致前端显示的总步骤数不正确。

**问题1修复方案**：
1. 分别计算操作步骤数和断言步骤数
2. `totalSteps = 操作步骤数 + 断言步骤数`
3. 断言执行时添加日志输出 "✅ 断言 N 通过" 和 "❌ 断言 N 失败"

**问题2分析 - 缓存死循环**：
从用户日志可见：
```
⚡ 使用缓存的解析结果 (命中444次)
🔍 executeMcpCommand调试: action=error, selector=undefined, value=undefined
```
数据库中缓存了一个 `name: 'error'` 的无效命令。当 `executeMcpCommand` 检测到 `action=error` 不是有效操作类型时，会进入AI重新解析分支，但AI解析又使用相同的缓存key，返回相同的错误结果，导致死循环。

**问题2修复方案**：
1. 在读取缓存时验证命令有效性，过滤掉 `error`、`unknown`、`invalid` 等无效命令
2. 发现无效缓存时自动从内存和数据库中删除
3. 在设置缓存时验证命令有效性，不缓存无效命令
4. 新增 `deleteOperationCacheFromDatabase` 方法用于清理无效缓存

**涉及文件**：
- `server/services/testExecution.ts`
  - 修改 `executeWithMcpClient` 方法，计算 `totalSteps` 时包含断言数量
  - 断言执行时添加 "执行断言 N"、"断言 N 通过/失败" 日志
- `server/services/aiParser.ts`
  - 在 `generateMCPCommand` 方法的缓存读取逻辑中添加命令有效性验证
  - 在 `generateMCPCommand` 方法的缓存写入逻辑中添加命令有效性验证
  - 新增 `deleteOperationCacheFromDatabase` 方法清理无效缓存

---

## fix: 修复MCP客户端执行UI自动化时步骤和断言统计不准确的问题

**提交说明**：
修复使用MCP客户端执行引擎执行UI自动化测试时，执行进度和执行结果中步骤和断言的计数不准确的问题。

**问题分析**：
从日志可以看到服务端输出的格式与前端匹配逻辑不一致：

服务端日志格式：
- 步骤成功：`✅ 步骤 1 执行成功`、`✅ [步骤 1] 执行成功`
- 断言通过：`✅ 断言验证通过: xxx`、`✅ 默认断言验证通过: xxx`、`✅ 等待文本断言通过: xxx`
- 断言失败：`❌ 断言验证失败: xxx`

前端匹配条件（错误的）：
- 步骤成功：`/步骤\s*\d+\s*执行成功/`、`/✅\s*步骤\s*\d+/`
- 断言通过：`/断言\s*\d+\s*通过/`
- 断言失败：`/断言\s*\d+\s*失败/`

这些匹配条件无法匹配 "断言验证通过" 这种不带数字的格式。

**修复方案**：
扩展前端的日志匹配逻辑，覆盖所有可能的服务端日志格式：

1. **步骤通过匹配**：
   - `/✅.*步骤\s*\d+.*执行成功/` - 匹配 "✅ 步骤 1 执行成功"
   - `/✅.*\[步骤\s*\d+\].*执行成功/` - 匹配 "✅ [步骤 1] 执行成功"
   - `/步骤\s*\d+\s*执行成功/` - 匹配 "步骤 1 执行成功"

2. **步骤失败匹配**：
   - `/❌.*步骤\s*\d+.*失败/` - 匹配 "❌ 步骤 1 失败"
   - `/❌.*\[步骤\s*\d+\].*失败/` - 匹配 "❌ [步骤 1] 失败"
   - `/步骤执行最终失败/` - 匹配 "步骤执行最终失败"

3. **断言通过匹配**：
   - `/断言验证通过/` - 匹配 "断言验证通过"
   - `/默认断言验证通过/` - 匹配 "默认断言验证通过"
   - `/等待文本断言通过/` - 匹配 "等待文本断言通过"
   - `/断言\s*\d+\s*通过/` - 匹配 "断言 1 通过"

4. **断言失败匹配**：
   - `/断言验证失败/` - 匹配 "断言验证失败"
   - `/等待文本断言失败/` - 匹配 "等待文本断言失败"
   - `/❌.*断言\s*\d+\s*失败/` - 匹配 "❌ 断言 1 失败"

**涉及文件**：
- `src/pages/TestRunDetail.tsx` - 修复 calculateStepAndAssertionStats 函数的日志匹配逻辑
- `src/components/TestRunDetailModal.tsx` - 同步修复

---

## feat: 为执行日志中过长的MCP返回内容添加收起/展开功能

**提交说明**：
为测试执行详情页和弹窗中的执行日志添加可折叠功能，当日志内容超过300字符或包含 "🔍"/"MCP返回" 关键词时自动折叠，用户可点击展开/收起。

**问题分析**：
MCP客户端执行UI自动化时，`🔍 关键操作MCP返回` 的日志内容可能非常长（包含完整的DOM快照等），导致日志区域难以阅读。

**修复方案**：
创建 `CollapsibleLogMessage` 组件，提供以下功能：

1. **自动折叠判断**：
   - 内容超过 300 字符
   - 包含 "🔍" 关键词且超过 200 字符
   - 包含 "MCP返回" 关键词

2. **摘要显示**：
   - 尝试提取冒号前的描述性文字
   - 最多显示 300 字符后加 "..."

3. **展开/收起按钮**：
   - 收起状态显示 "展开 (字符数)" 按钮
   - 展开状态显示 "收起" 按钮
   - 使用 ChevronDown/ChevronUp 图标

4. **样式设计**：
   - 按钮使用小圆角灰色背景
   - 蓝色文字点击可见
   - hover 时背景变深

**涉及文件**：
- `src/components/TestRunDetailModal.tsx` - 添加 CollapsibleLogMessage 组件并应用到日志显示
- `src/pages/TestRunDetail.tsx` - 同步添加 CollapsibleLogMessage 组件

---

## 2024-12-31

## fix: 修复测试计划批量执行UI自动化时测试执行页面显示空白记录、重复记录和缺少队列记录的问题

**提交说明**：
修复在测试计划模块批量或执行所有UI自动化时，测试执行模块页面会出现：
1. 空白数据记录（显示为"-"），刷新页面后又显示正常
2. 批量执行2条用例却出现3条记录的重复问题
3. 批量执行2条用例只显示1条记录，缺少第二条队列中的记录

**问题分析**：

**问题1：空白数据**
当通过WebSocket接收到新测试创建消息时，前端创建新测试运行记录的代码缺少关键字段（system、module、tags、priority、projectVersion）。

**问题2：重复记录**
存在多个竞态条件导致重复：
1. 页面首次加载（`loadTestRuns`）未完成时，WebSocket消息到达会创建新记录
2. 之后 `loadTestRuns` 完成又加载了相同的记录
3. 服务端发送多次 `test_update` 消息（创建时、更新名称时）
4. 防抖机制只合并300ms内的消息，跨批次的消息可能导致重复

**问题3：缺少队列记录**
批量执行是**串行**的，代码逻辑是：
- 第一个用例：调用 `runTest()` → 发送WebSocket（queued）→ 开始执行（running）→ **等待完成**
- 第二个用例：**等待第一个完成后**才调用 `runTest()` → 发送WebSocket（queued）

这意味着第二个用例的WebSocket消息会在第一个用例完成后才发送，用户无法看到第二条记录处于"队列中"状态。

**修复方案**：

**前端修复（TestRuns.tsx）**：
1. **添加首次加载完成标记**：
   - 新增 `initialLoadCompleteRef` 标记首次加载是否完成
   - 首次加载未完成时，不通过WebSocket创建新记录（等待API返回完整数据）

2. **添加已创建记录集合**：
   - 新增 `createdRunIdsRef` 记录已通过WebSocket创建的runId
   - 防止防抖批处理时同一个runId被多次创建

3. **优化数据充分性检查**：
   - 允许 `queued`、`running` 状态创建新记录
   - 也允许其他状态但包含完整数据的情况（有id、name、environment）

4. **优化更新逻辑**：
   - 更新现有记录时，只更新有值的字段，保留已有的完整信息
   - 添加名称变化检测，确保名称更新能正确触发

5. **异步补充信息**：
   - 创建新记录后异步获取测试用例完整信息
   - 补充 name、system、module、tags、priority、projectVersion 字段

## 修复测试计划批量执行串行问题

**问题描述**：
- 测试计划批量执行或执行所有UI自动化用例时，第二条用例的开始时间几乎与第一条用例同时发生
- 第二条用例应该在第一条用例执行完成后才开始执行

**修复内容（testPlanService.ts）**：
1. **修改批量执行逻辑为真正的串行执行**：
   - 删除先为所有用例调用 `runTest()` 的逻辑（第1206-1238行）
   - 改为在一个用例执行完成后再启动下一个用例
   - 确保第二条用例的 `runTest()` 调用在第一条用例完成后才执行
   - 这样可以确保第二条用例的开始时间一定在第一条用例完成后

2. **修复错误处理**：
   - 修复错误处理中对已删除的 `runIdMap` 的引用
   - 使用局部变量 `runId` 而不是从 `runIdMap` 获取

**执行流程**：
- 循环执行每个用例：
  1. 调用 `runTest()` 启动当前用例（串行执行，第二条用例的 `runTest()` 会在第一条用例完成后才调用）
  2. 立即更新状态为 running，设置 started_at 为当前时间
  3. 等待用例完成（`waitForTestCompletion`）
  4. 从 `execResult.started_at` 获取真实的开始时间并更新
  5. 继续下一个用例

**效果**：
- 确保测试计划批量执行时，用例真正串行执行
- 第二条用例的开始时间一定在第一条用例完成后
- 日志中的开始时间记录准确反映实际执行顺序

**后端修复（testPlanService.ts + queueService.ts + testExecution.ts）**：
1. **修改批量执行逻辑为两阶段**：
   - **阶段1**：先为所有用例调用 `runTest()`，让它们都进入队列
   - **阶段2**：然后逐个等待用例完成（串行等待）

2. **修改队列服务支持测试计划分组**：
   - 新增 `planQueues` Map，为每个测试计划创建独立的队列
   - 测试计划队列使用 `concurrency: 1`（串行执行）
   - 确保同一测试计划的用例不会并发执行，避免浏览器/页面冲突

3. **修复执行顺序问题**：
   - 修改用例查询排序：从 `sort_order: 'asc'` 改为 `case_id: 'asc'`
   - 确保执行顺序按用例ID依次执行

4. **修复多次执行时旧记录状态被更新问题**：
   - 修改 `syncToTestPlanExecution` 函数，使用 `execution_id` 精确匹配
   - 只更新当前执行记录（`case_id` 和 `execution_id` 都匹配）的结果
   - 保留其他执行记录的结果，避免旧记录状态被错误更新

5. **修复 execution_results 重复记录问题**：
   - **问题原因**：
     - 初始化时创建的记录没有 `execution_id` 字段
     - `syncToTestPlanExecution` 添加新记录时，没有过滤掉没有 `execution_id` 的旧记录
     - `testPlanService.ts` 中的更新逻辑只匹配 `case_id`，不匹配 `execution_id`
     - 导致同一 `case_id` 出现多条记录（一条是初始的 `queued` 记录，一条是执行完成的记录）
   
   - **修复方案**：
     - **testPlanService.ts**：更新时优先匹配没有 `execution_id` 的记录（初始记录），如果找到就更新它，而不是添加新记录
     - **testExecution.ts**：在 `syncToTestPlanExecution` 中添加新记录时，过滤掉同一 `case_id` 且没有 `execution_id` 的旧记录
     - 确保每个用例在当前执行记录中只有一条记录

6. **修复用例执行完成后状态不实时更新问题**：
   - **问题原因**：
     - `syncToTestPlanExecution` 直接使用 `prisma.test_plan_executions.update` 更新数据库
     - 没有调用 `updateTestPlanExecution` 函数，因此没有发送 WebSocket 广播
     - 前端无法实时看到第一条用例执行完成后，第二条用例状态从 `queued` 更新为 `running`
   
   - **修复方案**：
     - 修改 `syncToTestPlanExecution` 使用 `updateTestPlanExecution` 函数更新，而不是直接使用 `prisma.update`
     - `updateTestPlanExecution` 会发送 WebSocket 广播，前端能实时看到状态更新
     - 确保每次 `execution_results` 更新时都会通知前端

5. **效果**：
   - 所有用例的WebSocket消息会立即发送（状态为 `queued`）
   - 前端可以立即看到所有用例的记录
   - 第一条开始执行时状态变为 `running`
   - 其他用例保持 `queued` 状态，进度为0
   - 同一测试计划的用例串行执行，不会出现浏览器/页面冲突
   - 执行顺序按用例ID排序
   - 多次执行时，旧记录状态不会被错误更新

**涉及文件**：
- `src/pages/TestRuns.tsx` - 重构 `updateTestRunIncrementally` 函数，添加防重复逻辑和完整字段处理
- `server/services/testPlanService.ts` - 修改批量执行逻辑，先为所有用例创建测试运行记录，然后逐个执行

## 修复测试计划执行完成时间问题

**问题描述**：
- 测试计划执行记录的 `finished_at` 时间不正确
- 应该使用 `execution_results` 中最后一条用例的 `finished_at` 时间
- 但实际使用的是 `new Date()`，导致时间不准确

**修复内容（testPlanService.ts）**：
1. **修复执行完成时的 finished_at 设置**：
   - 删除直接设置 `finished_at: new Date()` 的逻辑
   - 改为传递 `execution_results` 给 `updateTestPlanExecution`
   - 让 `updateTestPlanExecution` 函数自动从 `execution_results` 中提取最后一条用例的 `finished_at` 时间

2. **修复错误处理**：
   - 在 catch 块中，检查 `results` 是否存在后再传递
   - 避免在 `results` 未定义时出错

**效果**：
- 测试计划的 `finished_at` 现在使用最后一条用例的 `finished_at` 时间
- 时间记录准确反映实际执行完成时间
- 即使执行失败，如果有已完成的用例，也能正确提取 `finished_at`

## 修复测试用例 executed_at 时间不一致问题

**问题描述**：
- 测试用例的 `executed_at` 时间应该等于 `execution_results` 中对应用例的 `finished_at` 时间
- 但实际使用的是 `new Date().toISOString()`，导致时间不一致
- `executed_at` 比 `finished_at` 晚，不准确

**修复内容（testPlanService.ts）**：
1. **修复 executed_at 的设置**：
   - 将 `executed_at: new Date().toISOString()` 改为 `executed_at: execResult.finished_at || new Date().toISOString()`
   - 确保 `executed_at` 使用用例实际完成时间（`finished_at`）
   - 如果 `finished_at` 不存在，才使用当前时间作为备用

2. **保持错误处理逻辑**：
   - 执行失败时，由于没有 `finished_at`，继续使用 `new Date().toISOString()`

**效果**：
- 测试用例的 `executed_at` 现在等于 `execution_results` 中对应用例的 `finished_at` 时间
- 时间记录准确一致，反映实际执行完成时间

---

## 2026-01-05 修复测试计划详情中时间戳不一致问题

**修改文件**：
- `server/services/testPlanService.ts`

**问题描述**：
1. `cases` 中每条记录的 `executed_at`（在 `case_detail.last_execution` 中）应该使用 `test_plan_executions` 表中 `execution_results` 对应的 `finished_at`，而不是 `executed_at` 或 `started_at`
2. `executions` 中的 `finished_at` 应该使用 `test_plan_executions` 表中 `execution_results` 最后一条用例的 `finished_at`，而不是数据库字段中的值

**修复内容**：

1. **修复 cases 中 executed_at 的时间戳来源**：
   - 在步骤1（从 `execution_results` 获取）中，修改获取 `executedAt` 的逻辑
   - 优先使用 `result.finished_at`（用例完成时间）
   - 如果没有 `finished_at` 则使用 `result.executed_at`
   - 最后才使用 `execution.started_at`

2. **修复步骤2中 executed_at 的时间戳来源**：
   - 在步骤2（从 `test_case_executions` 表获取）中，修改获取 `executedAt` 的逻辑
   - 优先使用 `execution.finished_at`（用例完成时间）
   - 如果没有 `finished_at` 则使用 `execution.started_at`

3. **修复 executions 中 finished_at 的时间戳来源**：
   - 修改 `executions` 的构建逻辑
   - 始终从 `execution_results` 中获取最后一条用例的 `finished_at`
   - 按时间降序排序，取最晚的一个 `finished_at`
   - 只有当 `execution_results` 中没有 `finished_at` 时才回退到数据库字段中的值

**效果**：
- `cases` 中的 `executed_at` 现在等于 `execution_results` 中对应用例的 `finished_at` 时间
- `executions` 中的 `finished_at` 现在等于 `execution_results` 中最后一条用例的 `finished_at` 时间
- 时间戳准确一致，反映实际执行完成时间

---

## 修复测试用例表格执行状态、通过率和执行结果显示问题

**日期**：2024-12-19

**问题**：
- 测试用例表格中的执行状态、通过率和执行结果没有根据 `test_case_executions` 表中最新的测试执行记录展示
- 只获取已完成的执行记录，导致运行中的用例状态无法显示
- 通过率和执行结果的判断逻辑不完整

**修改内容**：

1. **优化 `enhanceTestCasesWithRunData` 方法** (`server/services/testExecution.ts`)：
   - 修改查询逻辑，获取所有状态的执行记录（包括 `queued`、`running`、`completed`、`failed`、`error`、`cancelled`）
   - 优化排序逻辑，按 `finished_at`、`started_at`、`queued_at` 的优先级获取最新记录
   - 改进时间戳比较逻辑，确保选择真正最新的执行记录
   - 修复通过率计算：只有已完成或失败的执行才计算和显示通过率
   - 修复执行状态映射：直接从最新执行记录的 `status` 字段获取，包括运行中的状态
   - 优化执行结果判断：根据最新执行记录的状态和步骤统计（`passed_steps`、`failed_steps`、`total_steps`）来判断结果

2. **优化前端显示逻辑** (`src/components/TestCaseTable.tsx`)：
   - 简化通过率显示条件，只要有 `success_rate` 值就显示，不再依赖 `lastRun` 字段

3. **更新类型定义** (`src/types/test.ts`)：
   - 在 `TestCase` 接口中添加 `executionStatus` 和 `executionResult` 属性
   - `executionStatus`: `'pending' | 'running' | 'completed' | 'failed' | 'cancelled'`
   - `executionResult`: `'pass' | 'fail' | 'block' | 'skip'`

**效果**：
- 执行状态现在能正确显示运行中的用例（`running`）和等待中的用例（`pending`）
- 通过率基于最新执行记录的步骤统计准确计算
- 执行结果根据最新执行记录的状态和步骤结果正确判断
- 所有数据都来自 `test_case_executions` 表的最新记录，确保数据一致性

---

## 修复UI自动化测试执行记录初始状态问题

**日期**：2024-12-19

**问题**：
- UI自动化测试执行时，`test_case_executions` 表的 `status` 默认状态是 `queued`（排队中）
- 但实际上UI自动化测试是立即执行的，应该直接设置为 `running`（执行中）

**修改内容**：

1. **修复 `createExecution` 方法** (`server/services/testCaseExecutionService.ts`)：
   - 将创建执行记录时的默认状态从 `'queued'` 改为 `'running'`
   - 同时设置 `started_at` 时间，因为状态是 `running`，表示已经开始执行
   - 添加注释说明UI自动化测试是立即执行的

**效果**：
- UI自动化测试创建执行记录时，状态直接为 `running`，准确反映实际执行状态
- 执行开始时间（`started_at`）在创建记录时即设置，确保时间戳准确
- 测试用例表格中的执行状态能立即显示为"运行中"，无需等待状态更新

