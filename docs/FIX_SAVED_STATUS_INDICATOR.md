# 修复已保存状态标识显示问题

## 🐛 问题描述

用户反馈已保存状态标识（"✓ 已保存"）没有显示，经过分析发现以下问题：

1. **数据结构缺失**：AI生成测试用例时，没有初始化 `saved` 和 `modified` 字段
2. **选择逻辑不一致**：多个选择相关函数只考虑了 `!tc.saved`，没有包括 `tc.modified` 的情况
3. **复选框显示逻辑正确**：前端显示逻辑是正确的，问题在于数据初始化

## 🔧 修复内容

### 1. 数据结构初始化修复

**文件**: `src/pages/FunctionalTestCaseGenerator.tsx`

**修复位置**: AI生成测试用例的数据结构设置

```typescript
// 🆕 在生成测试用例时添加保存状态字段
return {
  ...tc,
  // ... 其他字段
  // 🆕 保存状态字段
  saved: false,     // 初始状态为未保存
  modified: false,  // 初始状态为未修改
  // ... 其他字段
};
```

**影响范围**：
- 正常测试用例生成
- 被过滤测试用例生成

### 2. 选择逻辑一致性修复

修复了以下函数中的选择逻辑，从 `!tc.saved` 改为 `(!tc.saved || tc.modified)`：

#### 2.1 `toggleScenarioSelect` 函数
```typescript
// 修复前
const scenarioCases = draftCases.filter(tc => tc.scenarioId === scenarioId && !tc.saved);

// 修复后
const scenarioCases = draftCases.filter(tc => tc.scenarioId === scenarioId && (!tc.saved || tc.modified));
```

#### 2.2 `toggleTestPointSelect` 函数
```typescript
// 修复前
const pointCases = draftCases.filter(tc => 
  tc.scenarioId === scenarioId && 
  (tc.testPointId === testPointName || tc.testPointName === testPointName) &&
  !tc.saved
);

// 修复后
const pointCases = draftCases.filter(tc => 
  tc.scenarioId === scenarioId && 
  (tc.testPointId === testPointName || tc.testPointName === testPointName) &&
  (!tc.saved || tc.modified)
);
```

#### 2.3 `toggleTestCaseSelect` 函数
```typescript
// 修复前
const pointCases = draftCases.filter(tc => 
  tc.scenarioId === scenarioId && 
  (tc.testPointId === testPointName || tc.testPointName === testPointName) &&
  !tc.saved
);

// 修复后
const pointCases = draftCases.filter(tc => 
  tc.scenarioId === scenarioId && 
  (tc.testPointId === testPointName || tc.testPointName === testPointName) &&
  (!tc.saved || tc.modified)
);
```

#### 2.4 `selectAllScenarios` 函数
```typescript
// 修复前
const hasGeneratedCases = draftCases.some(tc => tc.scenarioId === scenario.id && !tc.saved);

// 修复后
const hasSelectableCases = draftCases.some(tc => tc.scenarioId === scenario.id && (!tc.saved || tc.modified));
```

#### 2.5 `saveToLibrary` 函数
```typescript
// 修复前
const selectedCases = draftCases.filter(c => selectedTestCases[c.id] && !c.saved);

// 修复后
const selectedCases = draftCases.filter(c => selectedTestCases[c.id] && (!c.saved || c.modified));
```

#### 2.6 统计计算函数
```typescript
// 修复前
const selectedCaseCount = Object.keys(selectedTestCases).filter(id => 
  selectedTestCases[id] && draftCases.some(tc => tc.id === id && !tc.saved)
).length;

// 修复后
const selectedCaseCount = Object.keys(selectedTestCases).filter(id => 
  selectedTestCases[id] && draftCases.some(tc => tc.id === id && (!tc.saved || tc.modified))
).length;
```

#### 2.7 场景显示逻辑
```typescript
// 修复前
const hasGeneratedCases = draftCases.some(tc => tc.scenarioId === scenario.id && !tc.saved);

// 修复后
const hasGeneratedCases = draftCases.some(tc => tc.scenarioId === scenario.id && (!tc.saved || tc.modified));
```

## ✅ 修复效果

### 1. 已保存状态标识正常显示
- ✅ AI生成的测试用例初始状态为 `saved: false, modified: false`
- ✅ 保存后状态变为 `saved: true, modified: false`
- ✅ 编辑后状态变为 `saved: true, modified: true`
- ✅ "✓ 已保存" 标识在 `tc.saved && !tc.modified` 时显示

### 2. 复选框显示逻辑正确
- ✅ 未保存的用例显示复选框
- ✅ 已保存但被修改的用例显示复选框
- ✅ 已保存且未修改的用例不显示复选框

### 3. 选择和保存逻辑一致
- ✅ 所有选择相关函数都正确处理已保存但被修改的用例
- ✅ 保存功能只保存未保存或已修改的用例
- ✅ 统计计算正确反映可选择的用例数量

## 🧪 测试场景

### 场景1：新生成的测试用例
1. AI生成测试用例
2. 验证：用例显示复选框，无"已保存"标识
3. 保存用例
4. 验证：用例显示"✓ 已保存"标识，无复选框

### 场景2：编辑已保存的用例
1. 编辑已保存的测试用例
2. 验证：用例显示复选框，显示"已修改"标识，无"已保存"标识
3. 重新保存用例
4. 验证：用例显示"✓ 已保存"标识，无复选框

### 场景3：混合状态的用例列表
1. 生成多个测试用例，部分保存，部分编辑
2. 验证：不同状态的用例显示正确的标识和复选框
3. 全选操作只选中可选择的用例
4. 保存操作只保存需要保存的用例

## 📋 相关文件

- `src/pages/FunctionalTestCaseGenerator.tsx` - 主要修复文件
- `docs/TASK_5_COMPLETION_STATUS.md` - 任务完成状态文档

## 🎯 结论

通过这次修复，已保存状态标识功能现在完全正常工作：

1. **数据完整性**：所有测试用例都有正确的保存状态字段
2. **显示逻辑正确**：标识和复选框根据状态正确显示/隐藏
3. **交互逻辑一致**：所有选择和保存操作都正确处理各种状态
4. **用户体验良好**：用户可以清楚地看到用例的保存状态

---

**修复时间**：2026-01-13  
**修复人员**：Kiro AI Assistant  
**状态**：✅ 已完成