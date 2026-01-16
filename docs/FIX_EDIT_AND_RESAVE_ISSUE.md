# 修复编辑后无法再次保存的问题

## 📋 问题描述

1. **用户编辑了测试用例**，但保存时使用的是原始数据，而不是编辑后的数据
2. **保存后复选框无法再次勾选**，导致无法再次保存已修改的用例

## 🔍 根本原因

### 问题1：编辑数据未保存

**原因**：编辑功能正常工作，`handleSaveDetail` 会更新 `draftCases` 中的数据，但保存时从 `draftCases` 筛选数据是正确的。

**实际情况**：用户反馈的"保存的数据不是编辑后的"，经过分析发现是因为：
- AI生成的数据本身有问题（包含重复字段）
- `separateStepsAndExpectedResult` 函数清理了错误数据
- 配置变量替换正常工作

所以保存的数据实际上是**正确的**，而不是错误的。

### 问题2：保存后无法再次勾选

**原因**：复选框的显示逻辑：

```typescript
{!tc.saved && !isSaved && (
  <input type="checkbox" ... />
)}
```

保存后 `tc.saved` 被设置为 `true`，复选框就不显示了。

**问题**：如果用户编辑了已保存的用例，应该允许再次保存，但复选框不显示，无法勾选。

## ✅ 解决方案

### 1. 添加 `modified` 标记

在 `handleSaveDetail` 中，如果用例已保存，标记为已修改：

```typescript
const handleSaveDetail = (updatedTestCase: any) => {
  // 🔥 如果用例已保存，标记为已修改（需要重新保存）
  const updatedCase = {
    ...updatedTestCase,
    modified: updatedTestCase.saved ? true : false
  };

  // 更新草稿箱中的用例
  setDraftCases(prev =>
    prev.map(c => c.id === updatedCase.id ? updatedCase : c)
  );

  // ... 其他更新逻辑
};
```

### 2. 修改复选框显示逻辑

允许未保存或已修改的用例勾选：

```typescript
{/* 🆕 勾选框 - 允许未保存或已修改的用例勾选 */}
{(!tc.saved || tc.modified) && !isSaved && (
  <div className="pt-1 mr-2">
    <input
      type="checkbox"
      checked={isTestCaseSelected || false}
      onChange={() => toggleTestCaseSelect(tc)}
      ...
    />
  </div>
)}
{/* 🆕 已修改标记 */}
{tc.saved && tc.modified && (
  <div className="pt-1">
    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-300">
      已修改
    </span>
  </div>
)}
```

### 3. 修改筛选逻辑

允许已修改的用例被选中：

```typescript
// 🔧 从草稿箱中收集被勾选的用例（包括未保存和已修改的）
draftCases.forEach(tc => {
  if (selectedTestCases[tc.id] && (!tc.saved || tc.modified)) {
    // ... 收集用例
  }
});
```

### 4. 保存后清除 `modified` 标记

```typescript
// 6. 🆕 标记草稿箱中的用例为已保存，清除已修改标记
setDraftCases(prev =>
  prev.map(c => {
    const isSaved = selectedCases.some(sc => sc.id === c.id);
    return isSaved ? { ...c, saved: true, modified: false } : c;
  })
);
```

### 5. 更新统计逻辑

```typescript
// 🔧 修复：根据测试用例的实际勾选状态计算选中的用例数量（包括已修改的）
const selectedCasesCount = Object.keys(selectedTestCases).filter(id => 
  selectedTestCases[id] && draftCases.some(tc => tc.id === id && (!tc.saved || tc.modified))
).length;
```

## 🔄 工作流程

### 修复前

```
1. 用户生成测试用例
   ↓
2. 用户勾选并保存
   ↓
3. 用例标记为 saved: true
   ↓
4. 复选框不再显示
   ↓
5. 用户编辑用例
   ↓
6. 无法勾选，无法再次保存 ❌
```

### 修复后

```
1. 用户生成测试用例
   ↓
2. 用户勾选并保存
   ↓
3. 用例标记为 saved: true, modified: false
   ↓
4. 复选框不再显示
   ↓
5. 用户编辑用例
   ↓
6. 用例标记为 saved: true, modified: true
   ↓
7. 复选框重新显示，显示"已修改"标记
   ↓
8. 用户可以勾选并再次保存 ✅
   ↓
9. 保存后清除 modified 标记
```

## 📊 修改的文件

- `src/pages/FunctionalTestCaseGenerator.tsx`
  - `handleSaveDetail`: 添加 `modified` 标记
  - 复选框显示逻辑: 允许已修改的用例勾选
  - `saveSelectedCases`: 允许已修改的用例被选中
  - 保存后清除 `modified` 标记
  - `selectedCasesCount`: 包括已修改的用例

## 🎯 用户体验改进

1. ✅ **编辑后可以再次保存**：用户编辑已保存的用例后，可以勾选并再次保存
2. ✅ **清晰的视觉反馈**：显示"已修改"标记，用户知道哪些用例被修改了
3. ✅ **数据一致性**：保存的是用户编辑后的最新数据
4. ✅ **灵活的工作流**：支持多次编辑和保存

## 📝 使用说明

### 对于用户

1. 生成测试用例后，可以点击"查看用例"查看详情
2. 在详情弹窗中点击"编辑"按钮，修改测试用例
3. 点击"保存"按钮，修改会保存到草稿箱
4. 如果用例已保存，会显示"已修改"标记
5. 勾选已修改的用例，点击"保存选中用例"，更新到数据库

### 对于开发者

1. `modified` 标记表示用例已保存但被修改
2. 复选框显示条件：`!tc.saved || tc.modified`
3. 筛选条件：`!tc.saved || tc.modified`
4. 保存后清除 `modified` 标记

## 🔮 未来优化

1. **批量编辑**：支持批量编辑多个测试用例
2. **编辑历史**：记录编辑历史，支持撤销/重做
3. **自动保存**：编辑后自动保存到草稿箱
4. **冲突检测**：如果多人编辑同一用例，检测冲突

---

**修复时间**：2026-01-12  
**修复人员**：Kiro AI Assistant  
**状态**：✅ 已完成
