# 修复后端数据优先级问题

## 📋 问题描述

用户编辑测试用例后，保存到数据库的数据不是编辑后的数据，而是原始的AI生成数据。

## 🔍 问题分析

### 前端数据流（正常）

1. ✅ 用户在 `TestCaseDetailModal` 中编辑测试用例
2. ✅ `handleSaveDetail` 正确更新 `draftCases` 中的数据
3. ✅ `saveSelectedCases` 正确收集编辑后的数据并发送到后端

**前端日志证实数据正确：**
```
🔄 [FunctionalTestCaseGenerator] 更新后的draftCases: {
  "steps": "1. 【操作】密码：3edc$RFV\n   【预期】密码：3edc$RFV\n2. 【操作】在用户名输入框中输入'admin'..."
}

🔄 [saveSelectedCases] 收集测试用例: {
  "steps": "1. 【操作】密码：3edc$RFV\n   【预期】密码：3edc$RFV\n2. 【操作】在用户名输入框中输入'admin'..."
}
```

### 后端数据处理（问题所在）

在 `server/services/functionalTestCaseService.ts` 的 `batchSave` 方法中：

```typescript
// 🔧 获取原始的 steps 和 expectedResult
const rawSteps = firstPoint.steps || tc.steps || '';  // ❌ 问题在这里！
const rawExpectedResult = firstPoint.expectedResult || tc.assertions || tc.expectedResult || '';
```

**问题分析：**

1. **`firstPoint.steps`** = 测试点级别的数据（AI生成的原始数据）
2. **`tc.steps`** = 用例级别的数据（用户编辑后的数据）

由于使用了 `firstPoint.steps || tc.steps`，会**优先使用测试点级别的原始数据**，而不是用户编辑后的数据。

### 数据对比

**测试点级别数据（原始AI生成）：**
```json
{
  "testPoints": [{
    "steps": "1. 【操作】打开登录页面\n   【预期】页面正常加载，显示用户名和密码输入框..."
  }]
}
```

**用例级别数据（用户编辑后）：**
```json
{
  "steps": "1. 【操作】密码：3edc$RFV\n   【预期】密码：3edc$RFV\n2. 【操作】在用户名输入框中输入'admin'..."
}
```

由于 `firstPoint.steps` 存在且不为空，所以 `rawSteps = firstPoint.steps`，用户编辑的 `tc.steps` 被忽略了！

## ✅ 解决方案

### 修改数据提取优先级

将数据提取逻辑改为**优先使用用例级别的数据**：

```typescript
// 🔧 获取原始的 steps 和 expectedResult
// 🔥 优先使用用例级别的数据（用户可能已编辑），而不是测试点级别的数据
let rawSteps = tc.steps || firstPoint.steps || '';
let rawExpectedResult = tc.assertions || tc.expectedResult || firstPoint.expectedResult || '';
```

### 修改位置

`server/services/functionalTestCaseService.ts` - `batchSave` 方法中的数据提取部分

### 逻辑说明

1. **`tc.steps`** - 用例级别的步骤（用户编辑后的最新数据）
2. **`firstPoint.steps`** - 测试点级别的步骤（AI生成的原始数据）
3. **优先级**：用例级别 > 测试点级别

这样确保：
- 如果用户编辑了用例级别的数据，使用编辑后的数据
- 如果用例级别没有数据，才使用测试点级别的数据（向后兼容）

## 🔄 数据流程（修复后）

```
1. AI生成测试用例
   ↓ 包含 testPoints[0].steps（原始数据）
   
2. 用户编辑测试用例
   ↓ 更新 tc.steps（编辑后的数据）
   
3. 前端保存
   ↓ 发送包含 tc.steps 的数据到后端
   
4. 后端处理（修复后）
   ↓ rawSteps = tc.steps || firstPoint.steps  // 优先使用 tc.steps
   
5. 保存到数据库
   ↓ 使用用户编辑后的数据 ✅
```

## 🧪 测试验证

### 测试步骤

1. 生成AI测试用例
2. 点击"查看用例"，编辑测试步骤
3. 保存编辑
4. 勾选用例并保存到数据库
5. 查看数据库中保存的数据

### 预期结果

- **修复前**：保存的是 `testPoints[0].steps`（原始AI数据）
- **修复后**：保存的是 `tc.steps`（用户编辑后的数据）

## 📊 影响范围

### 受益功能

- ✅ 用户编辑测试用例后，保存的是编辑后的数据
- ✅ 支持用例级别和测试点级别的数据（向后兼容）
- ✅ 数据优先级更合理：用户编辑 > AI生成

### 不受影响

- ✅ 没有编辑过的测试用例（仍使用测试点级别的数据）
- ✅ 配置变量替换逻辑
- ✅ 其他字段的处理逻辑

## 🎯 关键要点

1. **数据层级**：用例级别 vs 测试点级别
2. **优先级**：用户编辑的数据 > AI生成的数据
3. **向后兼容**：如果用例级别没有数据，仍使用测试点级别的数据
4. **调试重要性**：通过日志分析确定问题出现在后端，而不是前端

## 🔮 未来优化

1. **数据结构统一**：考虑统一用例级别和测试点级别的数据结构
2. **编辑状态跟踪**：明确标记哪些字段被用户编辑过
3. **数据验证**：在保存前验证数据的完整性和一致性

## 📝 相关文档

- [修复编辑后无法再次保存的问题](./FIX_EDIT_AND_RESAVE_ISSUE.md)
- [配置变量动态替换功能说明](./CONFIG_VARIABLE_REPLACEMENT.md)

---

**修复时间**：2026-01-12  
**修复人员**：Kiro AI Assistant  
**状态**：✅ 已完成