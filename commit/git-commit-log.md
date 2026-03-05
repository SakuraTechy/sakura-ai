# Git 提交日志

## 2026-03-04

### fix: 修复功能用例版本筛选无法按版本名称搜索的问题 ✅

**问题描述：**
- 前端版本下拉框显示的是 `version_name`（版本名称）
- 后端筛选时只按 `version_code`（版本号）进行匹配
- 导致用户选择版本名称后，后端无法正确筛选数据

**问题根源：**
```typescript
// 前端：显示版本名称
projectVersions: versionNames  // version_name 或 version_code

// 后端：只按版本号筛选
caseWhere.project_version = {
  version_code: projectVersion  // ❌ 只匹配 version_code
};
```

**修复方案：**
修改后端筛选逻辑，支持同时按版本名称或版本号进行筛选：

```typescript
// 支持按版本名称或版本代码筛选
if (projectVersion) {
  caseWhere.project_version = {
    OR: [
      { version_code: projectVersion },
      { version_name: projectVersion }
    ]
  };
}
```

**修复效果：**
- ✅ 用户选择版本名称时，能正确筛选数据
- ✅ 用户选择版本号时，也能正确筛选数据
- ✅ 兼容新旧数据（有些版本可能只有 version_code）

**影响文件：**
- `server/services/functionalTestCaseService.ts`

---

## 2026-03-04

### fix: 补充UI自动化模块所有筛选项的状态保留功能 ✅

**问题描述：**
- UI自动化模块只保留了部分筛选项（搜索、标签、优先级、系统）
- 缺少模块、版本、状态、执行状态、执行结果、创建者等筛选项的状态保留
- 导致切换标签后这些筛选条件丢失

**修复方案：**

1. **补充缺失的筛选项状态恢复**
   - `selectedModule` - 模块筛选
   - `selectedVersion` - 版本筛选
   - `casesStatusFilter` - 状态筛选
   - `casesExecutionStatusFilter` - 执行状态筛选
   - `casesExecutionResultFilter` - 执行结果筛选
   - `casesAuthorFilter` - 创建者筛选

2. **更新保存逻辑**
   - 将所有筛选项都保存到 localStorage
   - 确保与功能用例模块的筛选项保留功能一致

**修复效果：**
- ✅ 所有筛选条件都能正确保留和恢复
- ✅ 切换标签后返回，所有筛选状态完整保留
- ✅ 与功能用例模块的用户体验完全一致

**影响文件：**
- `src/pages/TestCases.tsx`

**完整的筛选项列表：**
- 基础筛选：searchTerm, selectedTag, selectedPriority, selectedSystem
- 高级筛选：selectedModule, selectedVersion, casesStatusFilter, casesExecutionStatusFilter, casesExecutionResultFilter, casesAuthorFilter

---

### fix: 修复UI自动化模块（TestCases）切换标签后筛选项和分页状态无法保留的问题 ✅

**问题分析：**
- UI自动化列表页面实际使用的是 `TestCases` 组件，而不是 `UIAutoTestCases` 组件
- 路由配置：`/test-cases` → `<TestCases />` 组件
- `TestCases` 组件只保存了视图模式，没有保存筛选条件和分页状态
- 这就是为什么功能用例不需要修改（它直接使用 `FunctionalTestCases` 组件）

**修复方案：**

1. **添加 localStorage 状态持久化常量**
