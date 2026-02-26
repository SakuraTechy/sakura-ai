# Git Commit Log

## 2026-02-26

### fix: 修复 getTestPlanDetail 查询导致 MySQL sort buffer 溢出的问题
- **文件**: `server/services/testPlanService.ts`
- **问题**: `findUnique` 中 include `plan_executions` 并按 `started_at` 排序时，因 `execution_results` 大 JSON 字段导致 MySQL 报错 `Out of sort memory, consider increasing server sort buffer size`（错误码 1038）
- **修复**: 将 `plan_executions` 从 `findUnique` 的 `include` 中拆分为独立的 `findMany` 查询，避免 MySQL 在单个大查询中对包含大 JSON 字段的记录排序
- **影响**: 所有引用 `plan.plan_executions` 的地方改为使用独立变量 `planExecutions`
