# Git Commit Log

## 2026-02-26

### fix: 修复 getTestPlanDetail 查询导致 MySQL sort buffer 溢出的问题（三次优化）
- **文件**: `server/services/testPlanService.ts`
- **问题**: `test_plan_executions` 表的 `execution_results` JSON 字段过大，MySQL 默认 `sort_buffer_size` 不足以排序包含大 JSON 的行
- **修复**: 
  1. 将 `plan_executions` 从 `findUnique` 的 `include` 拆分为独立查询
  2. 在查询前通过 `SET SESSION sort_buffer_size = 8388608`（8MB）临时增大当前连接的排序缓冲区
  3. session 级别设置不影响全局 MySQL 配置
