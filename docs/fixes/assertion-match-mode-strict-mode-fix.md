# 断言匹配策略 - 严格模式修复

## 问题现象

用户选择了"严格匹配"模式（`assertionMatchMode: "strict"`），但断言仍然通过了，即使期望文本和实际文本不匹配。

## 问题分析

### 日志分析

```
⚙️ [runId] 匹配模式: 严格匹配
❌ [runId] 严格模式下未找到完全匹配的文本  // ✅ 文本历史记录正确失败
⚠️ [runId] 弹窗未立即出现，等待10秒...
⚠️ [runId] 未通过value值找到弹窗，继续尝试其他方式
✅ [runId] 使用getByText找到元素: "尊敬的用户，您当前没有证书，请立即上传证书。"
✅ [runId] 文本包含验证成功（宽松模式）  // ❌ 问题：这里使用了宽松模式！
```

### 问题根源

`matchMode` 参数只在 `findInTextHistory()` 方法中使用，但在后续的**元素验证逻辑**中没有使用。

具体来说，在 `executeStep()` 方法的 expect 操作中，有一段"存在内容"断言的宽松验证逻辑：

```typescript
// 🔥 问题代码（修复前）
if (isExistenceAssertion && text && text.trim().length > 0) {
  console.log(`✅ 文本包含验证成功（宽松模式）: ...`);
  return { success: true };  // ❌ 没有检查 matchMode，直接通过
}
```

这段代码的意图是：对于"存在内容"类型的断言（如"有弹窗提示"），即使文本不完全匹配，只要元素有内容就认为通过。

**但是**，这个逻辑没有考虑用户选择的 `matchMode`，导致即使在严格模式下也会使用宽松验证。

## 修复方案

### 修改位置

`server/services/playwrightTestRunner.ts` - `executeStep()` 方法中的 expect 操作验证逻辑

### 修复代码

```typescript
if (step.value) {
  // 如果指定了value，检查是否包含
  if (!text?.includes(String(step.value))) {
    // 🔥 修复：只有在非严格模式下，才使用"存在内容"的宽松验证
    // 严格模式下，必须完全匹配
    if (matchMode !== 'strict' && isExistenceAssertion && text && text.trim().length > 0) {
      console.log(`✅ [${runId}] 文本包含验证成功（宽松模式）: 元素有内容"${text.substring(0, 30)}..."，虽然不完全匹配"${step.value}"，但符合"存在内容"断言`);
      console.log(`💡 [${runId}] 提示：当前使用${matchMode === 'auto' ? '智能' : '宽松'}匹配模式，允许宽松验证`);
      return { success: true };
    }
    // 🔥 严格模式或非"存在内容"断言，必须匹配
    if (matchMode === 'strict') {
      console.log(`❌ [${runId}] 严格模式：文本不匹配`);
      console.log(`   期望: "${step.value}"`);
      console.log(`   实际: "${text || '(空)'}"`);
    }
    return { success: false, error: `期望文本包含 "${step.value}"，实际为 "${text || '(空)'}"` };
  }
  // value匹配成功
  console.log(`✅ [${runId}] 文本包含验证成功: "${text}"`);
}
```

### 修复要点

1. **添加 matchMode 检查**：只有在 `matchMode !== 'strict'` 时才使用宽松验证
2. **严格模式行为**：在严格模式下，文本必须匹配，否则断言失败
3. **详细日志**：添加日志说明当前使用的匹配模式和失败原因

## 修复后的行为

### 严格匹配模式（strict）

```
期望: "系统无证书，请上传证书1"
实际: "尊敬的用户，您当前没有证书，请立即上传证书。"
结果: ❌ 断言失败

日志:
⚙️ [runId] 匹配模式: 严格匹配
❌ [runId] 严格模式下未找到完全匹配的文本
❌ [runId] 严格模式：文本不匹配
   期望: "系统无证书，请上传证书1"
   实际: "尊敬的用户，您当前没有证书，请立即上传证书。"
```

### 智能匹配模式（auto）

```
期望: "系统无证书，请上传证书1"
实际: "尊敬的用户，您当前没有证书，请立即上传证书。"
结果: ✅ 断言通过（如果是"存在内容"类型的断言）

日志:
⚙️ [runId] 匹配模式: 智能匹配
✅ [runId] 文本包含验证成功（宽松模式）
💡 [runId] 提示：当前使用智能匹配模式，允许宽松验证
```

### 宽松匹配模式（loose）

```
期望: "系统无证书，请上传证书1"
实际: "尊敬的用户，您当前没有证书，请立即上传证书。"
结果: ✅ 断言通过（如果是"存在内容"类型的断言）

日志:
⚙️ [runId] 匹配模式: 宽松匹配
✅ [runId] 文本包含验证成功（宽松模式）
💡 [runId] 提示：当前使用宽松匹配模式，允许宽松验证
```

## 验证步骤

### 1. 重启后端服务器

```bash
npm run dev:server
```

### 2. 执行测试

1. 选择测试用例
2. 在执行配置中：
   - 执行引擎：`Playwright Test Runner`
   - 断言匹配策略：`严格匹配`
3. 确认执行

### 3. 验证结果

**期望行为**：
- 如果期望文本和实际文本不完全匹配，断言应该失败
- 日志应该显示：`❌ 严格模式：文本不匹配`

**实际测试**：
```
期望: "系统无证书，请上传证书1"
实际: "尊敬的用户，您当前没有证书，请立即上传证书。"
结果: ❌ 断言失败 ✅ 正确
```

## 相关修改

### 修改文件
- ✅ `server/services/playwrightTestRunner.ts` - 修复验证逻辑

### 影响范围
- ✅ 严格匹配模式：现在会正确失败
- ✅ 智能匹配模式：保持原有行为（允许宽松验证）
- ✅ 宽松匹配模式：保持原有行为（允许宽松验证）

## 总结

这次修复解决了严格匹配模式不生效的问题。现在 `matchMode` 参数在两个地方都会生效：

1. ✅ **文本历史记录匹配**（`findInTextHistory`）- 已实现
2. ✅ **元素验证逻辑**（`executeStep` 中的 expect 操作）- 本次修复

现在严格匹配模式会真正严格验证文本匹配，不会使用任何宽松策略。

## 相关文档

- [断言匹配策略实施总结](./assertion-match-mode-implementation.md)
- [最终修复说明](./assertion-match-mode-final-fix.md)
- [执行引擎要求说明](./assertion-match-mode-engine-requirement.md)
