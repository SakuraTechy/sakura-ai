# Git 提交摘要

## 2026-03-02

### docs: 修复AI提示词文档格式问题 ✅
- 修复完整文档代码块后说明文本格式（`→` 改为 `**说明**：`）
- 修复完整文档日期错误（2025→2026）
- 修复模板文档代码块嵌套问题，改为纯文本格式便于复制
- 影响：`docs/prompts/AI-PROMPTS-COMPLETE.md`, `docs/prompts/AI-PROMPTS-TEMPLATES.md`

### fix: 修复测试用例名称重复序号和重新生成重复问题

- 清理用例名称中的重复序号（如 1.1-）
- 修复重新生成时草稿箱用例重复新增的问题

### fix: 新增跨场景智能去重功能
- 问题：不同场景下的测试点生成了相似或相同的用例（如多个场景都有"登录"测试点）
- 方案：实现智能相似度计算算法（名称40%+步骤30%+数据20%+类型10%）
- 阈值：相似度≥80%认为是重复，自动过滤
- 优化：详细的去重日志和用户提示，新增 duplicateCount 统计字段
- 效果：大幅减少跨场景重复用例，保持草稿箱用例唯一性
- 影响文件：`src/pages/FunctionalTestCaseGenerator.tsx`

---

### fix: 修复AI生成测试用例时同场景重复生成问题
- 问题：同一场景下不同测试点生成了相同的"正常流程"用例，导致大量重复
- 原因：AI prompt 要求每个测试点都生成 2-3 个用例（正常、边界、异常）
- 修复：调整为每个测试点默认生成 1 个与其直接对应的用例
- 修复：只有正常流程测试点才生成 SMOKE 用例，边界/异常测试点生成对应类型
- 修复：新增用例与测试点对应关系要求，禁止为非正常流程测试点生成"正常流程"用例
- 修复：优化冒烟用例生成策略，根据测试点名称智能判断用例类型
- 预期：大幅减少同场景重复用例，每个测试点只生成与其直接相关的用例
- 影响文件：`server/services/functionalTestCaseAIService.ts`

---

## 2026-02-28

### fix: 修复卡片视图重复声明变量编译错误 ✅
- 移除 `scenarioIndex` 和 `testPointIndex` 重复声明
- 影响：`src/pages/FunctionalTestCaseGenerator.tsx`

---

### fix: 修复草稿箱序号显示逻辑 ✅
- 用例名称保留层级序号（1.1.1-用例名），序号列显示简单递增（1,2,3）
- 分页后序号正确递增
- 影响：`src/pages/FunctionalTestCaseGenerator.tsx`, `DraftCaseTableView.tsx`, `DraftCaseListView.tsx`

---

### fix: 修复草稿箱排序逻辑 ✅
- 按场景→测试点→用例索引逐级排序，支持多位数序号
- 生成时保存原始索引，排序时直接使用，序号不受添加顺序影响
- 使用测试点数组索引而非名称序号，不依赖名称格式
- 影响：`src/pages/FunctionalTestCaseGenerator.tsx`, `DraftCaseTableView.tsx`

---

### fix: 修复草稿箱去重功能 ✅
- 新生成用例之间去重 + 与草稿箱去重
- 支持同场景和跨场景去重，移除序号前缀后比较名称
- 支持被过滤用例的去重，分别统计有效重复和被过滤重复
- 影响：`src/pages/FunctionalTestCaseGenerator.tsx`

---

### fix: 修复草稿箱数据同步问题 ✅
- 使用同步变量 `currentDraftCases` 避免状态异步问题
- 数据源改为 `draftCases`，重新生成后草稿箱立即更新
- 为每个用例添加预计算索引，所有视图正确显示层级序号
- 影响：`src/pages/FunctionalTestCaseGenerator.tsx`

---

### feat: 草稿箱筛选排序功能 ✅
- 类型筛选：多选（冒烟/全量/异常/边界）
- 优先级筛选：多选（紧急/高/中/低）
- 排序功能：升序/降序切换
- 筛选提示栏：显示当前条件和筛选后数量
- 影响：`DraftCaseTableView.tsx`, `DraftCaseListView.tsx`

---

### fix: 修复筛选交互问题 ✅
- 点击文本标签即可切换选中状态
- 复选框仅作为视觉指示器
- 影响：`DraftCaseTableView.tsx`, `DraftCaseListView.tsx`

---

### fix: 修复函数定义顺序错误 ✅
- 将辅助函数移到 useMemo 之前，避免暂时性死区错误
- 影响：`src/pages/FunctionalTestCaseGenerator.tsx`

---

### style: 优化需求文档选择界面 ✅
- 刷新按钮移至标题右侧
- StepCard 支持 ReactNode 类型 title
- 影响：`FunctionalTestCaseGenerator.tsx`, `StepCard.tsx`

---

### fix: 修复AI生成用例重复问题 ✅
- 每个测试点默认生成1个对应用例（而非2-3个）
- 只有正常流程测试点才生成SMOKE用例
- 禁止为非正常流程测试点生成"正常流程"用例
- 影响：`server/services/functionalTestCaseAIService.ts`

---

## 2026-02-27

### fix: 修复编辑生成用例时的运行时错误
- 修复 TestCaseDetailModal 和 FunctionalTestCaseGenerator 中 `assertions?.substring is not a function` 错误
- 添加类型检查，确保只对字符串类型调用 substring 方法
- 修正变量名拼写错误 `newsortedDraftCases` → `newDraftCases`

---

## 2025-01-XX

### feat: 草稿箱分页功能 ✅
- 新增 DraftPagination 组件，支持页码跳转和每页条数选择（10/20/50/100）
- 为所有视图（表格/列表/卡片/网格）添加分页支持
- 影响：`src/components/ai-generator/DraftPagination.tsx`

---

### fix: 修复草稿箱全选功能 ✅
- 使用 `useRef` 存储实时计数器，解决串行生成时ID重复
- 使用 `useMemo` 确保选中数量基于最新状态计算
- 全选框状态基于所有可选用例，而非当前页
- 影响：`src/pages/FunctionalTestCaseGenerator.tsx`

---

### fix: 修复草稿箱序号计算逻辑 ✅
- 序号计算包含分页偏移量（startIndex + index + 1）
- 测试点按风险等级排序，只包含有用例的测试点
- 序号与测试场景完全一致
- 影响：`src/pages/FunctionalTestCaseGenerator.tsx`, `DraftCaseTableView.tsx`, `DraftCaseListView.tsx`

---

### fix: 修复草稿箱用例显示和选择问题 ✅
- 用例名称添加层级序号（1.3.1-用例名）
- 全选功能正确统计，排除已保存和被过滤用例
- 支持被过滤用例展示和选择
- 影响：`src/pages/FunctionalTestCaseGenerator.tsx`

---

### fix: 修复用例名称重复序号问题 ✅
- 清理用例名称中的重复序号（如 1.1-）
- 修复重新生成时草稿箱用例重复新增
- 影响：`src/pages/FunctionalTestCaseGenerator.tsx`

---
