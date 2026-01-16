# 调试已保存状态标识问题

## 🔍 问题描述

已保存状态标识（"✓ 已保存"）在保存测试用例后没有显示。

## 🛠️ 调试步骤

### 1. 打开浏览器开发者工具

- **Chrome/Edge**: 按 `F12` 或 `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
- **Firefox**: 按 `F12` 或 `Ctrl+Shift+K` (Windows) / `Cmd+Option+K` (Mac)

### 2. 切换到 Console（控制台）标签

### 3. 执行保存操作

1. 在AI测试用例生成器页面生成测试用例
2. 选中一个或多个测试用例
3. 点击"保存选中用例"按钮
4. 观察控制台输出

### 4. 查看调试日志

保存过程中会输出以下调试信息：

#### 4.1 收集测试用例阶段
```
🔄 [saveSelectedCases] 收集测试用例: {
  id: "TC_LOGIN_00001",
  name: "用户登录测试",
  steps: "...",
  saved: false,
  modified: false
}
```

#### 4.2 准备保存阶段
```
📦 准备保存的测试用例 (第1个): {
  name: "用户登录测试",
  system: "登录系统",
  module: "用户管理",
  projectId: 1,
  projectVersionId: 2,
  ...
}
```

#### 4.3 更新saved状态阶段
```
🔍 [saveSelectedCases] 开始更新saved状态...
📋 [saveSelectedCases] selectedCases数量: 3
📋 [saveSelectedCases] 第一个selectedCase: {
  name: "用户登录测试",
  scenarioId: "scenario-1",
  testPointId: "登录功能",
  testPointName: "登录功能"
}
📋 [saveSelectedCases] draftCases数量: 5
📋 [saveSelectedCases] 第一个draftCase: {
  name: "用户登录测试",
  scenarioId: "scenario-1",
  testPointId: "登录功能",
  testPointName: "登录功能",
  saved: false,
  modified: false
}
✅ [saveSelectedCases] 匹配成功: 用户登录测试
🔄 [saveSelectedCases] 更新用例saved状态: 用户登录测试 -> saved: true
✅ [saveSelectedCases] 更新后的draftCases: 3 个已保存
```

#### 4.4 显示逻辑阶段
```
🔍 [显示逻辑] 第一个用例: {
  name: "用户登录测试",
  saved: true,
  modified: false,
  shouldShow: true
}
```

## 📊 问题诊断

### 情况1：匹配失败

如果看到：
```
📋 [saveSelectedCases] selectedCases数量: 3
📋 [saveSelectedCases] draftCases数量: 5
❌ 没有看到 "✅ 匹配成功" 的日志
```

**原因**：`selectedCases` 和 `draftCases` 的字段不匹配

**检查点**：
- `name` 是否完全相同？
- `scenarioId` 是否完全相同？
- `testPointId` 或 `testPointName` 是否完全相同？

**可能的问题**：
- 字段名不一致（如 `testPointId` vs `testPointName`）
- 字段值不一致（如空格、大小写）
- 字段为 `undefined` 或 `null`

### 情况2：状态更新失败

如果看到：
```
✅ [saveSelectedCases] 匹配成功: 用户登录测试
🔄 [saveSelectedCases] 更新用例saved状态: 用户登录测试 -> saved: true
✅ [saveSelectedCases] 更新后的draftCases: 3 个已保存
```

但显示逻辑显示：
```
🔍 [显示逻辑] 第一个用例: {
  saved: false,  // ❌ 依然是false
  ...
}
```

**原因**：React状态更新异步问题或组件重新渲染问题

**解决方案**：
- 检查是否有其他地方重置了 `draftCases` 状态
- 检查是否有其他地方覆盖了 `saved` 字段

### 情况3：显示条件不满足

如果看到：
```
🔍 [显示逻辑] 第一个用例: {
  saved: true,
  modified: true,  // ❌ modified为true
  shouldShow: false
}
```

**原因**：`modified` 字段为 `true`，不满足显示条件 `tc.saved && !tc.modified`

**解决方案**：
- 检查为什么 `modified` 为 `true`
- 确认保存时是否正确设置了 `modified: false`

## 🔧 常见问题和解决方案

### 问题1：字段名不一致

**症状**：
```javascript
selectedCase: { testPointId: "登录功能" }
draftCase: { testPointName: "登录功能" }
// testPointId !== testPointName，匹配失败
```

**解决方案**：
确保数据结构一致，或在匹配逻辑中同时检查两个字段：
```typescript
sc.testPointId === c.testPointId || sc.testPointName === c.testPointName
```

### 问题2：scenarioId 为 undefined

**症状**：
```javascript
selectedCase: { scenarioId: undefined }
draftCase: { scenarioId: "scenario-1" }
// undefined !== "scenario-1"，匹配失败
```

**解决方案**：
检查数据收集阶段，确保 `scenarioId` 被正确设置。

### 问题3：React状态更新延迟

**症状**：
- 控制台显示状态已更新
- 但界面没有刷新

**解决方案**：
- 刷新页面重新查看
- 检查是否有其他状态管理逻辑干扰
- 确认 `setDraftCases` 返回的是新对象而不是修改原对象

## 📝 收集信息

如果问题依然存在，请提供以下信息：

1. **完整的控制台日志**（从保存开始到结束）
2. **selectedCases 的完整数据**（第一个元素）
3. **draftCases 的完整数据**（第一个元素）
4. **是否看到 "✅ 匹配成功" 的日志**
5. **显示逻辑的输出**（saved、modified、shouldShow的值）

## 🎯 预期行为

正常情况下，应该看到以下完整流程：

```
1. 🔄 收集测试用例
2. 📦 准备保存数据
3. ✅ 保存成功
4. 🔍 开始更新saved状态
5. ✅ 匹配成功: XXX
6. 🔄 更新用例saved状态: XXX -> saved: true
7. ✅ 更新后的draftCases: N 个已保存
8. 🔍 显示逻辑: saved: true, modified: false, shouldShow: true
9. ✓ 界面显示 "✓ 已保存" 标识
```

---

**创建时间**：2026-01-13  
**用途**：调试已保存状态标识显示问题  
**状态**：🔍 调试中