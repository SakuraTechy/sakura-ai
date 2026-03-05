# Git 提交摘要

## 2026-03-04

### fix: 修复功能用例版本筛选无法按版本名称搜索的问题 ✅
- 前端显示版本名称，后端只按版本号筛选导致不匹配
- 修改后端筛选逻辑，支持同时按版本名称或版本号筛选
- 用户选择版本名称或版本号都能正确筛选数据
- 影响：`server/services/functionalTestCaseService.ts`

---

### fix: 补充UI自动化模块所有筛选项的状态保留功能 ✅
- 补充缺失的筛选项：模块、版本、状态、执行状态、执行结果、创建者
- 更新保存逻辑，确保所有筛选项都被保存
- 所有筛选条件都能正确保留和恢复
- 与功能用例模块的用户体验完全一致
- 影响：`src/pages/TestCases.tsx`

---

### fix: 修复UI自动化模块（TestCases）切换标签后筛选项和分页状态无法保留的问题 ✅
- 找到根本原因：实际使用的是 TestCases 组件，而不是 UIAutoTestCases
- 在 TestCases 组件中添加 localStorage 状态持久化
- 恢复搜索关键词、标签、优先级、系统筛选和分页状态
- 切换标签后返回，所有筛选条件和分页状态自动恢复
- 影响：`src/pages/TestCases.tsx`

---

### fix: 修复UI自动化模块路由路径不一致导致状态无法保留的问题 ✅
- 统一路由路径：将 `/ui-auto-test-cases` 改为 `/test-cases`
- 移除手动 addTab 调用，使用 TabContext 自动管理
- 路由路径与 TabContext 配置一致，组件不会被卸载
- localStorage 状态持久化正常工作
- 影响：`src/pages/UIAutoTestCases/index.tsx`

---
