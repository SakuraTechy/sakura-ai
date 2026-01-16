# 断言匹配策略 - 最终修复（完整版）

## 问题根源

用户通过 `/tests/cases/execute` 接口执行测试时，即使前端传递了 `assertionMatchMode` 参数，后端也没有接收和处理。

经过仔细排查，发现有**三个缺失的环节**：

1. ❌ 前端 `testService.ts` 的 `runTestCase()` 方法没有传递 `assertionMatchMode`
2. ❌ 后端 `/tests/cases/execute` 接口没有接收 `assertionMatchMode` 参数
3. ❌ 后端 `runTest()` 方法的 options 参数中没有 `assertionMatchMode` 类型定义

## 完整的调用链路

```
前端页面 (FunctionalTestCases/index.tsx)
  ↓ 调用 testService.runTestCase()
testService.ts (runTestCase 方法)
  ↓ 发送 HTTP 请求到 /tests/cases/execute
server/routes/test.ts (/tests/cases/execute 接口)
  ↓ 调用 testExecutionService.runTest()
server/services/testExecution.ts (runTest 方法)
  ↓ 保存到 testRun 对象
executeTestInternal()
  ↓ 从 testRun 获取
executeWithPlaywrightRunner()
  ↓ 传递 matchMode
executeStep()
  ↓ 使用 matchMode
findInTextHistory()
  ↓ 应用匹配策略
```

## 修复内容

### 1. src/services/testService.ts（前端）

**修改 `runTestCase()` 方法**：

```typescript
async runTestCase(
  caseId: number, 
  options?: {
    executionEngine?: 'mcp' | 'playwright';
    enableTrace?: boolean;
    enableVideo?: boolean;
    environment?: string;
    assertionMatchMode?: 'strict' | 'auto' | 'loose'; // ✅ 新增类型定义
    planExecutionId?: string;
  }
): Promise<{runId: string}> {
  try {
    const response = await fetch(`${API_BASE_URL}/tests/cases/execute`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ 
        caseId,
        executionEngine: options?.executionEngine || 'mcp',
        enableTrace: options?.enableTrace || false,
        enableVideo: options?.enableVideo || false,
        environment: options?.environment || 'staging',
        assertionMatchMode: options?.assertionMatchMode || 'auto', // ✅ 传递参数
        planExecutionId: options?.planExecutionId,
      })
    });
    // ...
  }
}
```

### 2. server/routes/test.ts（后端路由）

**修改 `/tests/cases/execute` 接口**：

```typescript
router.post('/cases/execute', async (req: Request, res: Response) => {
  try {
    const { 
      caseId, 
      testCaseId, 
      environment = 'staging',
      executionEngine = 'mcp',
      enableTrace = false,
      enableVideo = false,
      assertionMatchMode = 'auto', // ✅ 接收参数
      planExecutionId
    } = req.body;
    
    console.log(`📋 [test路由] 执行测试用例:`, {
      caseId: actualCaseId,
      planExecutionId,
      executionEngine,
      assertionMatchMode, // ✅ 记录日志
      userId
    });
    
    const runId = await testExecutionService.runTest(
      actualCaseId, 
      environment,
      'standard',
      {
        userId: userId,
        executionEngine: executionEngine as 'mcp' | 'playwright',
        enableTrace: enableTrace === true,
        enableVideo: enableVideo === true,
        assertionMatchMode: assertionMatchMode as 'strict' | 'auto' | 'loose', // ✅ 传递参数
        planExecutionId: planExecutionId
      }
    );
    // ...
  }
});
```

### 3. server/services/testExecution.ts（后端服务）

**修改 `runTest()` 方法签名**：

```typescript
public async runTest(
  testCaseId: number,
  environment: string,
  executionMode: string = 'standard',
  options: {
    reuseBrowser?: boolean,
    suiteId?: string,
    contextState?: any,
    userId?: string,
    executionEngine?: 'mcp' | 'playwright',
    enableTrace?: boolean,
    enableVideo?: boolean,
    assertionMatchMode?: 'strict' | 'auto' | 'loose', // ✅ 新增类型定义
    planExecutionId?: string,
  } = {}
): Promise<string>
```

**修改 testRun 对象**：

```typescript
const testRun: TestRun = {
  id: runId, 
  runId, 
  testCaseId, 
  environment, 
  executionMode,
  status: 'queued',
  logs: [],
  steps: [],
  successfulSteps: [],
  startedAt: new Date(),
  executor: executorName,
  ...options,
  executionEngine,
  assertionMatchMode: options.assertionMatchMode || 'auto', // ✅ 保存到 testRun
  planExecutionId: options.planExecutionId,
};
```

## 完整的参数传递示例

### 前端调用

```typescript
// src/pages/FunctionalTestCases/index.tsx
const response = await testService.runTestCase(temporaryTestCaseId, {
  executionEngine: executionConfig.executionEngine,
  enableTrace: executionConfig.enableTrace,
  enableVideo: executionConfig.enableVideo,
  environment: executionConfig.environment,
  assertionMatchMode: executionConfig.assertionMatchMode // ✅ 传递
});
```

### HTTP 请求

```json
POST /api/tests/cases/execute
{
  "caseId": 80,
  "executionEngine": "playwright",
  "enableTrace": true,
  "enableVideo": true,
  "environment": "staging",
  "assertionMatchMode": "auto"  // ✅ 包含在请求中
}
```

### 后端接收

```typescript
// server/routes/test.ts
const { assertionMatchMode = 'auto' } = req.body; // ✅ 接收
```

### 传递给服务

```typescript
// server/routes/test.ts
await testExecutionService.runTest(actualCaseId, environment, 'standard', {
  assertionMatchMode: assertionMatchMode as 'strict' | 'auto' | 'loose' // ✅ 传递
});
```

### 保存到 testRun

```typescript
// server/services/testExecution.ts
const testRun: TestRun = {
  // ...
  assertionMatchMode: options.assertionMatchMode || 'auto' // ✅ 保存
};
```

### 使用

```typescript
// server/services/testExecution.ts
const assertionMatchMode = (testRun as any).assertionMatchMode || 'auto';

// Playwright 引擎
await this.executeWithPlaywrightRunner(runId, testCase, testRun, { 
  enableTrace, 
  enableVideo,
  assertionMatchMode // ✅ 传递
});

// MCP 引擎
await this.executeWithMcpClient(runId, testCase, testRun, assertionMatchMode);
```

## 验证步骤

### 1. 重启服务

```bash
# 重启后端
npm run dev:server

# 重启前端（如果需要）
npm run dev:frontend
```

### 2. 清除浏览器缓存

- **Windows/Linux**: `Ctrl + Shift + R`
- **Mac**: `Cmd + Shift + R`

### 3. 执行测试

1. 打开测试用例页面
2. 点击"执行"按钮
3. 在执行配置弹窗中：
   - **执行引擎**：选择 `Playwright Test Runner`
   - **断言匹配策略**：选择 `智能匹配（推荐）`
4. 点击"确认执行"

### 4. 验证请求（开发者工具）

打开浏览器开发者工具（F12），Network 标签：

```json
POST /api/tests/cases/execute
Request Payload:
{
  "caseId": 80,
  "executionEngine": "playwright",
  "enableTrace": true,
  "enableVideo": true,
  "environment": "staging",
  "assertionMatchMode": "auto"  // ✅ 应该有这个字段
}
```

### 5. 验证后端日志

应该看到以下日志：

```
📋 [test路由] 执行测试用例: { 
  caseId: 80, 
  executionEngine: 'playwright', 
  assertionMatchMode: 'auto' 
}
⚙️ [runId] 断言匹配模式: 智能匹配（推荐）
```

## 修改文件清单

### 前端
- ✅ `src/services/testService.ts` - 添加 assertionMatchMode 参数
- ✅ `src/pages/FunctionalTestCases/index.tsx` - 传递 assertionMatchMode（已完成）
- ✅ `src/pages/TestCases.tsx` - 传递 assertionMatchMode（已完成）
- ✅ `src/pages/TestPlanDetail.tsx` - 传递 assertionMatchMode（已完成）

### 后端
- ✅ `server/routes/test.ts` - 接收和传递 assertionMatchMode
- ✅ `server/services/testExecution.ts` - 添加类型定义和参数传递
- ✅ `server/services/playwrightTestRunner.ts` - 实现匹配逻辑（已完成）

## 常见问题

### Q1: 请求中仍然没有 assertionMatchMode？

**解决方法**：
1. 确保已重启后端服务器
2. 硬刷新浏览器（Ctrl + Shift + R）
3. 检查浏览器控制台是否有错误

### Q2: 后端日志没有显示断言匹配模式？

**可能原因**：
- 使用了 MCP 引擎（断言匹配策略在 Playwright 中效果最佳）
- 参数传递链路中某个环节出错

**解决方法**：
1. 确保选择了 Playwright Test Runner
2. 检查后端日志中的完整请求参数

### Q3: 断言匹配策略没有生效？

**可能原因**：
- 使用了 MCP 引擎（仅在 Playwright 中完全支持）

**解决方法**：
- 在执行配置中选择 **Playwright Test Runner**
- 参考：[执行引擎要求说明](./assertion-match-mode-engine-requirement.md)

## 相关文档

- [断言匹配策略实施总结](./assertion-match-mode-implementation.md)
- [执行引擎要求说明](./assertion-match-mode-engine-requirement.md)
- [调试指南](./assertion-match-mode-debug-guide.md)
- [完整实施文档](./assertion-match-mode-ui-update.md)

## 总结

这次修复完成了断言匹配策略功能的**最后一个缺失环节**：

1. ✅ 前端 UI 已实现（三个页面）
2. ✅ 前端 API 调用已修复（testService.ts）
3. ✅ 后端路由已修复（test.ts）
4. ✅ 后端服务已修复（testExecution.ts）
5. ✅ 执行引擎已实现（playwrightTestRunner.ts）

现在整个参数传递链路已经完全打通，断言匹配策略功能应该可以正常工作了！
