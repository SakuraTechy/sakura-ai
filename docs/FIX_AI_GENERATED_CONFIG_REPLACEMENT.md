# 修复AI生成测试用例的配置变量替换问题

## 📋 问题描述

AI生成的测试用例在保存时，硬编码的账号密码（如 `admin`）没有被替换为配置变量占位符（如 `{{CONFIG.ACCOUNT.USERNAME}}`），导致：

1. 测试用例中显示的是硬编码的 `admin`，而不是项目配置中的实际账号
2. 配置变量替换功能对AI生成的用例不生效
3. 只有手动创建的测试用例才能正确替换

## 🔍 根本原因

在 `FunctionalTestCaseGenerator.tsx` 中保存AI生成的测试用例时，**没有传递 `projectId` 和 `projectVersionId` 字段**。

### 问题代码

```typescript
// ❌ 缺少 projectId 和 projectVersionId
const casesWithDocId = selectedCases.map(tc => ({
  ...tc,
  requirementDocId: docId,
  system: tc.system || projectInfo.systemName || '',
  module: tc.module || projectInfo.moduleName || '',
  sectionName: tc.sectionName || tc.section_name || '',
  // ... 其他字段
}));
```

### 后端检查逻辑

```typescript
// server/services/functionalTestCaseService.ts - batchSave方法
let processedTestCases = testCases;
if (testCases.length > 0 && testCases[0].projectId) {  // ⚠️ 检查projectId
  console.log(`🔄 [ConfigVariable] 开始替换测试用例中的硬编码数据...`);
  processedTestCases = await Promise.all(
    testCases.map(tc => 
      this.configVariableService.replaceHardcodedWithPlaceholders(tc, tc.projectId)
    )
  );
}
```

因为前端没有传递 `projectId`，所以后端的 `if (testCases[0].projectId)` 条件不满足，配置变量替换逻辑被跳过。

## ✅ 解决方案

在前端保存测试用例时，添加 `projectId` 和 `projectVersionId` 字段。

### 修复代码

```typescript
// ✅ 添加 projectId 和 projectVersionId
const casesWithDocId = selectedCases.map(tc => ({
  ...tc,
  requirementDocId: docId,
  system: tc.system || projectInfo.systemName || '',
  module: tc.module || projectInfo.moduleName || '',
  // 🆕 添加项目ID和项目版本ID（用于配置变量替换）
  projectId: projectInfo.projectId,
  projectVersionId: projectInfo.projectVersionId,
  sectionName: tc.sectionName || tc.section_name || '',
  // ... 其他字段
}));
```

### 修改位置

修改了 `src/pages/FunctionalTestCaseGenerator.tsx` 中的两处保存逻辑：

1. **第1480行附近** - `handleSaveSelectedCases` 函数
2. **第1645行附近** - `handleSaveAllCases` 函数

同时更新了调试日志，确保能看到 `projectId` 和 `projectVersionId`：

```typescript
console.log('📦 准备保存的测试用例 (第1个):', {
  name: casesWithDocId[0]?.name,
  system: casesWithDocId[0]?.system,
  module: casesWithDocId[0]?.module,
  projectId: casesWithDocId[0]?.projectId,  // 🆕 新增
  projectVersionId: casesWithDocId[0]?.projectVersionId,  // 🆕 新增
  // ... 其他字段
});
```

## 🔄 工作流程（修复后）

```
1. 用户上传需求文档，选择项目和版本
   ↓
2. AI生成测试用例（包含硬编码的 admin/admin）
   ↓
3. 用户点击保存
   ↓
4. 前端添加 projectId 和 projectVersionId 到测试用例数据
   ↓
5. 后端检测到 projectId，执行配置变量替换
   ↓
6. 硬编码的 admin → {{CONFIG.ACCOUNT.USERNAME}}
   硬编码的 admin → {{CONFIG.ACCOUNT.PASSWORD}}
   ↓
7. 保存到数据库（占位符格式）
   ↓
8. 查询时动态替换占位符为项目配置的实际值
   ↓
9. 前端显示项目配置中的实际账号密码
```

## 🧪 测试验证

### 测试步骤

1. 确保项目已配置默认账号（如 `testuser/Test@123`）
2. 上传包含硬编码账号密码的需求文档（如 `admin/admin`）
3. AI生成测试用例
4. 保存测试用例
5. 查看数据库中保存的数据（应该是占位符）
6. 在前端查询测试用例列表
7. 验证显示的是项目配置中的账号密码（`testuser/Test@123`）

### 预期结果

- **数据库中**：`{{CONFIG.ACCOUNT.USERNAME}}` 和 `{{CONFIG.ACCOUNT.PASSWORD}}`
- **前端显示**：`testuser` 和 `Test@123`（项目配置的实际值）

### 验证SQL

```sql
-- 查看保存的测试用例（应该包含占位符）
SELECT 
  id,
  name,
  preconditions,
  test_data,
  steps,
  expected_result
FROM functional_test_cases
WHERE source = 'AI_GENERATED'
ORDER BY created_at DESC
LIMIT 5;
```

## 📝 相关文件

### 修改的文件

- `src/pages/FunctionalTestCaseGenerator.tsx` - 添加 projectId 和 projectVersionId

### 相关服务

- `server/services/functionalTestCaseService.ts` - batchSave 方法
- `server/services/configVariableService.ts` - replaceHardcodedWithPlaceholders 方法

## 🎯 影响范围

### 受益功能

- ✅ AI生成的测试用例现在会自动替换硬编码为配置变量
- ✅ 配置更新后，AI生成的测试用例也会自动同步
- ✅ 与手动创建的测试用例行为一致

### 不受影响

- ✅ 手动创建的测试用例（已经正常工作）
- ✅ 测试用例查询和显示逻辑
- ✅ 配置变量替换的核心逻辑

## 🔮 后续优化

1. **前端验证**：在保存前检查 projectId 是否存在，如果不存在给出提示
2. **错误处理**：如果配置变量替换失败，记录详细日志
3. **单元测试**：添加测试用例验证配置变量替换逻辑

---

**修复时间**：2026-01-12  
**修复人员**：Kiro AI Assistant  
**状态**：✅ 已完成
