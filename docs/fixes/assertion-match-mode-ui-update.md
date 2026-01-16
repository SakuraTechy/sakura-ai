# 断言匹配策略用户配置功能 - 完整实施

## 修改日期
2025-01-15

## 修改概述
在所有执行配置弹窗中添加断言匹配策略选择器，允许用户在执行测试时选择断言匹配模式（严格/智能/宽松），并在后端 PlaywrightTestRunner 中实现相应的匹配逻辑。

## 功能说明

### 三种匹配模式

1. **严格匹配 (strict)**
   - 仅使用完全匹配
   - 期望文本必须与实际文本完全一致
   - 适用于精确验证场景

2. **智能匹配 (auto) - 推荐**
   - 完全匹配 → 包含匹配 → 反向包含匹配
   - 平衡准确性和灵活性
   - 适用于大多数场景
   - 默认模式

3. **宽松匹配 (loose)**
   - 完全匹配 → 包含匹配 → 反向包含匹配 → 关键词匹配
   - 包含关键词即可通过
   - 适用于文本可能有变化的场景

## 修改文件

### 前端修改（已完成）

#### 1. src/pages/FunctionalTestCases/index.tsx
- ✅ 添加 `assertionMatchMode` 状态
- ✅ 添加断言匹配策略选择器 UI
- ✅ 在 API 调用中传递 `assertionMatchMode` 参数

#### 2. src/pages/TestCases.tsx
- ✅ 添加 `assertionMatchMode` 状态
- ✅ 添加断言匹配策略选择器 UI
- ✅ 在 API 调用中传递 `assertionMatchMode` 参数

#### 3. src/pages/TestPlanDetail.tsx
- ✅ 添加 `assertionMatchMode` 状态
- ✅ 添加断言匹配策略选择器 UI
- ✅ 在 API 调用中传递 `assertionMatchMode` 参数

### 后端修改（已完成）

#### 1. server/services/playwrightTestRunner.ts

**修改 1: findInTextHistory 方法**
```typescript
/**
 * 🔥 新增：在文本历史记录中查找匹配的文本
 * 使用分层匹配策略：完全匹配 > 包含匹配 > 反向包含匹配 > 关键词匹配
 * @param searchText 要查找的文本
 * @param runId 运行ID
 * @param matchMode 匹配模式：'strict'（严格）| 'auto'（智能，默认）| 'loose'（宽松）
 */
private findInTextHistory(
  searchText: string, 
  runId: string, 
  matchMode: 'strict' | 'auto' | 'loose' = 'auto'
): { found: boolean; matchedText?: string; matchType?: string } {
  // 层级1：完全匹配（所有模式都支持）
  if (this.textHistory.has(searchText)) {
    return { found: true, matchedText: searchText, matchType: '完全匹配' };
  }
  
  // 🔥 严格模式：只使用完全匹配
  if (matchMode === 'strict') {
    return { found: false };
  }
  
  // 层级2：包含匹配（智能模式和宽松模式支持）
  for (const text of this.textHistory) {
    if (text.includes(searchText)) {
      return { found: true, matchedText: text, matchType: '包含匹配' };
    }
  }
  
  // 层级3：反向包含匹配（智能模式和宽松模式支持）
  for (const text of this.textHistory) {
    if (searchText.includes(text) && text.length > 5) {
      return { found: true, matchedText: text, matchType: '反向包含匹配' };
    }
  }
  
  // 🔥 智能模式：到此为止，不使用关键词匹配
  if (matchMode === 'auto') {
    return { found: false };
  }
  
  // 层级4：关键词匹配（仅宽松模式支持）
  const words = searchText.split(/[：:，,、\s]+/).filter(w => w.length > 1);
  for (const text of this.textHistory) {
    let matchedWords = 0;
    for (const word of words) {
      if (text.includes(word)) matchedWords++;
    }
    if (matchedWords >= Math.ceil(words.length * 0.5)) {
      return { found: true, matchedText: text, matchType: `关键词匹配 (${matchedWords}/${words.length})` };
    }
  }
  
  return { found: false };
}
```

**修改 2: executeStep 方法签名**
```typescript
/**
 * 执行测试步骤
 * @param step 测试步骤
 * @param runId 运行ID
 * @param stepIndex 步骤索引
 * @param matchMode 断言匹配模式（仅用于 expect 操作）：'strict'（严格）| 'auto'（智能，默认）| 'loose'（宽松）
 */
async executeStep(
  step: TestStep, 
  runId: string, 
  stepIndex: number, 
  matchMode: 'strict' | 'auto' | 'loose' = 'auto'
): Promise<{ success: boolean; error?: string }>
```

**修改 3: 在弹窗验证中使用 matchMode**
```typescript
// 🔥 新增：先检查文本历史记录（可能弹窗已经消失），使用用户选择的匹配模式
const historyResult = this.findInTextHistory(step.value, runId, matchMode);
```

#### 2. server/services/testExecution.ts

**修改 1: executeWithPlaywrightRunner 方法签名**
```typescript
private async executeWithPlaywrightRunner(
  runId: string,
  testCase: TestCase,
  testRun: TestRun,
  options: { 
    enableTrace?: boolean; 
    enableVideo?: boolean;
    assertionMatchMode?: 'strict' | 'auto' | 'loose'; // 🔥 新增：断言匹配模式
  }
): Promise<void>
```

**修改 2: 获取并记录 matchMode**
```typescript
// 🔥 新增：获取断言匹配模式，默认为 'auto'（智能匹配）
const matchMode = options.assertionMatchMode || 'auto';
console.log(`⚙️ [${runId}] 断言匹配模式: ${matchMode === 'strict' ? '严格匹配' : matchMode === 'auto' ? '智能匹配（推荐）' : '宽松匹配'}`);
this.addLog(runId, `⚙️ 断言匹配模式: ${matchMode === 'strict' ? '严格匹配' : matchMode === 'auto' ? '智能匹配（推荐）' : '宽松匹配'}`, 'info');
```

**修改 3: 在三个位置传递 matchMode 参数**
```typescript
// 位置1: 执行操作步骤
let result = await this.playwrightRunner.executeStep(enhancedStep, runId, i, matchMode);

// 位置2: 重试执行
result = await this.playwrightRunner.executeStep(enhancedRetryStep, runId, i, matchMode);

// 位置3: 执行断言
const result = await this.playwrightRunner.executeStep(assertion, runId, assertionIndex - 1, matchMode);
```

**修改 4: 从 testRun 获取 assertionMatchMode**
```typescript
// 🔥 获取执行引擎配置
const executionEngine = (testRun as any).executionEngine || 'mcp';
const enableTrace = (testRun as any).enableTrace !== false;
const enableVideo = (testRun as any).enableVideo !== false;
const assertionMatchMode = (testRun as any).assertionMatchMode || 'auto'; // 🔥 新增：获取断言匹配模式
```

**修改 5: 传递给 executeWithPlaywrightRunner**
```typescript
await this.executeWithPlaywrightRunner(runId, testCase, testRun, { 
  enableTrace, 
  enableVideo,
  assertionMatchMode // 🔥 新增：传递断言匹配模式
});
```

## 测试验证

### 测试场景 1: 严格匹配
- 期望文本: "系统无证书，请上传证书"
- 实际文本: "系统无证书，请上传证书1"
- 结果: ❌ 断言失败（完全不匹配）

### 测试场景 2: 智能匹配（推荐）
- 期望文本: "系统无证书，请上传证书"
- 实际文本: "系统无证书，请上传证书"
- 结果: ✅ 断言通过（完全匹配）

- 期望文本: "系统无证书"
- 实际文本: "系统无证书，请上传证书"
- 结果: ✅ 断言通过（包含匹配）

- 期望文本: "系统无证书，请上传证书1"
- 实际文本: "系统无证书，请上传证书"
- 结果: ✅ 断言通过（反向包含匹配，会有警告）

- 期望文本: "系统无证书，请上传证书1"
- 实际文本: "请联系管理员"
- 结果: ❌ 断言失败（关键词匹配不启用）

### 测试场景 3: 宽松匹配
- 期望文本: "系统无证书，请上传证书"
- 实际文本: "系统无证书"
- 结果: ✅ 断言通过（关键词匹配）

## 日志输出示例

```
⚙️ [runId] 断言匹配模式: 智能匹配（推荐）
🔍 [runId] 在文本历史记录中查找: "系统无证书，请上传证书1"
📊 [runId] 历史记录共有 156 条文本
⚙️ [runId] 匹配模式: 智能匹配
✅ [runId] 反向包含匹配: 期望文本 "系统无证书，请上传证书1" 包含实际文本 "系统无证书，请上传证书"
💡 [runId] 提示：期望文本可能有多余字符，建议检查测试用例
✅ [runId] 在文本历史记录中找到弹窗: "系统无证书，请上传证书"
📊 [runId] 匹配类型: 反向包含匹配
⚠️ [runId] 警告：使用了宽松匹配策略
   期望文本: "系统无证书，请上传证书1"
   实际文本: "系统无证书，请上传证书"
💡 [runId] 建议：检查测试用例中的期望文本是否准确
💡 [runId] 弹窗已消失，但历史记录证明它曾经出现过
```

## 实施状态

- ✅ 前端 UI 实现（所有执行配置弹窗）
- ✅ 后端参数传递
- ✅ PlaywrightTestRunner 匹配逻辑实现
- ✅ 日志输出优化
- ✅ 文档更新

## 相关文件

- `src/pages/FunctionalTestCases/index.tsx`
- `src/pages/TestCases.tsx`
- `src/pages/TestPlanDetail.tsx`
- `server/services/playwrightTestRunner.ts`
- `server/services/testExecution.ts`
- `docs/fixes/assertion-match-mode-ui-update.md`
- `docs/fixes/popup-verification-fix.md`

## 注意事项

1. **默认模式**: 如果用户未选择，默认使用 `auto`（智能匹配）
2. **仅影响断言**: `matchMode` 参数仅用于 `expect` 操作，不影响其他操作（click、fill 等）
3. **向后兼容**: 旧的测试执行记录如果没有 `assertionMatchMode`，会自动使用默认值 `auto`
4. **日志详细**: 每次匹配都会记录详细的匹配类型和警告信息，便于调试
  assertionMatchMode: executionConfig.assertionMatchMode, // 🔥 新增
  planExecutionId: planExecution.id,
});
```

3. **重新执行** - 调用 reexecute API 时：
```typescript
await apiClient.post(`/api/v1/test-plans/executions/${pendingReexecuteExecution.id}/reexecute`, {
  executionConfig: {
    executionEngine: executionConfig.executionEngine,
    enableTrace: executionConfig.enableTrace,
    enableVideo: executionConfig.enableVideo,
    environment: executionConfig.environment,
    assertionMatchMode: executionConfig.assertionMatchMode // 🔥 新增
  },
});
```

4. **批量执行** - 创建批量执行记录时：
```typescript
executionConfig: {
  executionEngine: executionConfig.executionEngine,
  enableTrace: executionConfig.enableTrace,
  enableVideo: executionConfig.enableVideo,
  environment: executionConfig.environment,
  assertionMatchMode: executionConfig.assertionMatchMode // 🔥 新增
}
```

5. **恢复之前的配置** - 从 metadata 恢复配置时：
```typescript
setExecutionConfig({
  executionEngine: previousConfig.executionEngine || 'mcp',
  enableTrace: previousConfig.enableTrace !== undefined ? previousConfig.enableTrace : false,
  enableVideo: previousConfig.enableVideo !== undefined ? previousConfig.enableVideo : false,
  environment: previousConfig.environment || 'staging',
  assertionMatchMode: previousConfig.assertionMatchMode || 'auto' // 🔥 新增
});
```

## 断言匹配策略说明

### 严格匹配 (strict)
- 仅完全匹配
- 适用于精确验证场景
- 实际结果必须与预期结果完全一致

### 智能匹配 (auto) - 推荐
- 自动选择最佳匹配策略
- 平衡准确性和灵活性
- 根据断言内容智能判断匹配方式

### 宽松匹配 (loose)
- 宽松匹配
- 包含关键词即可通过
- 适用于动态内容或格式不固定的场景

## 测试验证

### 验证步骤
1. 打开测试用例列表页面 (`/test-cases`)
2. 点击任意测试用例的"执行"按钮
3. 在执行配置对话框中，验证是否显示"断言匹配策略"选择器
4. 验证三个选项是否正确显示：严格匹配、智能匹配（推荐）、宽松匹配
5. 选择不同选项，验证说明文字是否正确切换
6. 点击"开始执行"，验证参数是否正确传递到后端

重复以上步骤测试测试计划详情页面 (`/test-plans/:id`)。

## 注意事项

1. **默认值**：所有执行配置的默认断言匹配策略为 `'auto'`（智能匹配）
2. **向后兼容**：如果后端或旧的执行记录没有 `assertionMatchMode` 字段，前端会使用默认值 `'auto'`
3. **UI 位置**：断言匹配策略选择器位于执行环境选择器之后，保持 UI 布局一致性
4. **代码风格**：所有修改都添加了 `🔥 新增` 注释标记，便于代码审查和追踪

## 相关文件

- `src/pages/TestCases.tsx` - UI 测试用例列表页面
- `src/pages/TestPlanDetail.tsx` - 测试计划详情页面
- `src/services/testService.ts` - 测试服务 API（需要确保支持 assertionMatchMode 参数）
- `server/services/testExecution.ts` - 后端测试执行服务（需要确保处理 assertionMatchMode 参数）

## 后续工作

1. 确保后端 API 正确接收和处理 `assertionMatchMode` 参数
2. 在测试执行引擎中实现不同匹配策略的逻辑
3. 更新相关文档和用户手册
4. 添加单元测试和集成测试
