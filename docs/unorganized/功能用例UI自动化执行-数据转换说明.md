# 功能用例UI自动化执行 - 数据转换说明

## 问题背景

最初实现中，功能用例在执行UI自动化测试时，只传递了`caseId`给后端，但没有传递功能用例的详细信息（如测试步骤、预期结果等）。这导致后端无法获取完整的测试信息来执行UI自动化测试。

## 解决方案

### 1. 扩展 testService.runTestCase 方法

在 `src/services/testService.ts` 中扩展了 `runTestCase` 方法的 `options` 参数，添加 `testCaseData` 字段：

```typescript
async runTestCase(
  caseId: number, 
  options?: {
    executionEngine?: 'mcp' | 'playwright';
    enableTrace?: boolean;
    enableVideo?: boolean;
    environment?: string;
    // 🆕 支持传递功能用例的详细信息
    testCaseData?: {
      name: string;
      steps: string;
      assertions: string;
      priority?: string;
      system?: string;
      module?: string;
    };
  }
): Promise<{runId: string}>
```

### 2. 功能用例数据转换逻辑

在 `src/pages/FunctionalTestCases/index.tsx` 的 `handleConfirmRunUITest` 函数中实现数据转换：

```typescript
// 将功能用例信息转换为标准测试用例格式
const testCaseData = {
    name: pendingTestCase.name || pendingTestCase.test_point_name || '未命名测试',
    steps: pendingTestCase.test_point_steps || pendingTestCase.steps || '未定义步骤',
    assertions: pendingTestCase.test_point_expected_result || pendingTestCase.expected_result || '未定义预期结果',
    priority: pendingTestCase.priority || pendingTestCase.test_point_risk_level || 'medium',
    system: pendingTestCase.system || '',
    module: pendingTestCase.module || ''
};

// 执行测试时传递完整数据
const response = await testService.runTestCase(pendingTestCase.id, {
    executionEngine: executionConfig.executionEngine,
    enableTrace: executionConfig.enableTrace,
    enableVideo: executionConfig.enableVideo,
    environment: executionConfig.environment,
    testCaseData: testCaseData  // 🆕 传递转换后的数据
});
```

## 数据转换映射表

| 标准测试用例字段 | 功能用例来源字段 | 备用字段 | 默认值 |
|-----------------|-----------------|---------|--------|
| `name` | `pendingTestCase.name` | `test_point_name` | '未命名测试' |
| `steps` | `test_point_steps` | `steps` | '未定义步骤' |
| `assertions` | `test_point_expected_result` | `expected_result` | '未定义预期结果' |
| `priority` | `priority` | `test_point_risk_level` | 'medium' |
| `system` | `system` | - | '' |
| `module` | `module` | - | '' |

## 转换规则说明

### 1. 名称 (name)
- **优先级**: `name` > `test_point_name` > 默认值
- **说明**: 功能用例可能有用例名称或测试点名称，优先使用用例名称

### 2. 测试步骤 (steps)
- **优先级**: `test_point_steps` > `steps` > 默认值
- **说明**: 测试点的步骤字段是主要来源，如果没有则使用通用的steps字段

### 3. 断言/预期结果 (assertions)
- **优先级**: `test_point_expected_result` > `expected_result` > 默认值
- **说明**: 从测试点的预期结果字段获取，作为UI自动化测试的断言依据

### 4. 优先级 (priority)
- **优先级**: `priority` > `test_point_risk_level` > 默认值
- **说明**: 优先使用明确的优先级字段，如果没有则使用风险等级作为替代

### 5. 系统和模块
- **说明**: 直接使用对应字段，用于测试分类和统计

## 数据流程图（✅ 最新版本）

```
功能用例数据
    ↓
[前端] 步骤1: 数据转换 (handleConfirmRunUITest)
    ↓
创建标准测试用例数据对象
    ↓
[前端] 步骤2: 创建临时测试用例
    ↓
[API] testService.createTestCase(testCaseData)
    ↓
[后端] 在 test_cases 表中创建记录
    ↓
返回临时测试用例ID (temporaryTestCaseId)
    ↓
[前端] 步骤3: 执行临时测试用例
    ↓
[API] testService.runTestCase(temporaryTestCaseId, executionConfig)
    ↓
[后端] /tests/cases/execute
    ↓
正常执行测试（不会有外键约束错误）
    ↓
WebSocket 返回执行结果
    ↓
[前端] 更新UI，刷新数据
```

### 🔑 关键改进

原方案直接传递功能用例ID会导致外键约束错误，因为功能用例ID不存在于 `test_cases` 表中。

新方案通过创建临时测试用例解决了这个问题：
1. **避免外键约束错误**: 临时测试用例是真实的 `test_cases` 记录
2. **保留执行历史**: 所有执行记录都与临时测试用例关联
3. **便于追溯**: 通过标签 `功能用例-{id}` 可以追溯到原始功能用例
4. **可选清理**: 执行完成后可以选择保留或删除临时测试用例

## 后端处理说明（✅ 新方案）

### 当前方案的优势

使用临时测试用例方案后，**后端无需做任何特殊处理**：

1. ✅ **标准流程**: 执行请求与普通测试用例完全相同
2. ✅ **数据完整性**: 外键约束自动满足
3. ✅ **执行记录**: 自动关联到临时测试用例
4. ✅ **无需改动**: 现有后端代码无需修改

### 后端自动处理

```javascript
// 后端接收到执行请求
POST /tests/cases/execute
{
  "caseId": 12345,  // 这是临时测试用例的真实ID
  "executionEngine": "mcp",
  "enableTrace": true,
  "enableVideo": true,
  "environment": "staging"
}

// 后端按照标准流程执行
async function executeTestCase(request) {
  const { caseId, executionEngine, ... } = request;
  
  // 1. 从数据库查询测试用例（临时测试用例）
  const testCase = await database.getTestCaseById(caseId);  // ✅ 能找到
  
  // 2. 创建执行记录
  const execution = await database.createExecution({
    test_case_id: caseId  // ✅ 外键约束满足
  });
  
  // 3. 执行测试
  return executeTest(testCase, executionEngine);
}
```

### 临时测试用例的标识

临时测试用例通过以下方式标识：
- **名称前缀**: `[功能用例] ...`
- **标签**: `功能用例-{原始功能用例ID}`
- **创建时间**: 最近创建

### 清理建议（可选）

如果需要清理临时测试用例，可以：

```sql
-- 查找临时测试用例
SELECT * FROM test_cases 
WHERE name LIKE '[功能用例]%' 
  OR tags LIKE '%功能用例-%';

-- 删除临时测试用例（建议保留执行记录）
DELETE FROM test_cases 
WHERE id = {temporaryTestCaseId};
```

## 优势（✅ 新方案）

1. **无外键约束问题**: 临时测试用例是真实的数据库记录，自动满足外键约束
2. **后端零改动**: 无需修改后端代码，完全兼容现有执行流程
3. **完整的执行历史**: 所有执行记录都正确关联，可以查看历史和统计
4. **可追溯性**: 通过标签可以追溯到原始功能用例
5. **灵活管理**: 执行完成后可以选择保留或删除临时测试用例
6. **数据完整性**: 确保所有关联数据（日志、截图、trace等）都能正确保存

## 注意事项

1. **数据一致性**: 确保转换后的数据格式与标准测试用例一致
2. **字段验证**: 必要字段（steps、assertions）缺失时使用默认值，但应该在UI上提示用户
3. **性能考虑**: 转换逻辑在前端执行，不会增加服务器负担
4. **安全性**: 后端仍需验证传递的数据，防止恶意数据注入

## 测试建议（✅ 新方案）

1. **完整流程测试**: 
   - 测试功能用例到临时测试用例的转换
   - 验证临时测试用例创建成功
   - 验证测试执行正常完成

2. **数据完整性测试**:
   - 验证所有字段正确转换
   - 验证标签正确添加（`功能用例-{id}`）
   - 验证名称前缀正确添加（`[功能用例]`）

3. **外键约束测试**:
   - 确认不再出现外键约束错误
   - 验证执行记录正确关联到临时测试用例

4. **执行历史测试**:
   - 验证执行记录能正确保存
   - 验证日志、截图等附件能正确关联
   - 验证可以在测试运行详情页查看结果

5. **临时用例管理测试**:
   - 在测试用例列表中能找到临时测试用例
   - 可以查看临时测试用例的执行历史
   - 可以手动删除不需要的临时测试用例

6. **并发测试**:
   - 测试同时执行多个功能用例
   - 验证不会创建重复的临时测试用例

7. **错误处理测试**:
   - 测试创建临时用例失败的情况
   - 测试执行失败的情况
   - 验证错误信息正确显示

---

**版本**: 1.0.0  
**创建日期**: 2025-12-15  
**最后更新**: 2025-12-15  
**作者**: AI Assistant

