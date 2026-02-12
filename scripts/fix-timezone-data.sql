-- ============================================
-- 时区历史数据修复脚本
-- ============================================
-- 用途：修复因时区问题导致的历史数据时间偏差（少8小时）
-- 作者：系统维护
-- 日期：2025-12-17
-- 
-- ⚠️ 警告：
-- 1. 执行前必须备份数据库！
-- 2. 建议在非业务高峰期执行
-- 3. 执行后请验证数据正确性
-- ============================================

-- ============================================
-- 第一步：备份检查
-- ============================================
-- 在执行此脚本前，请先手动备份数据库：
-- mysqldump -u username -p Sakura AI > Sakura AI_backup_20251217.sql

-- ============================================
-- 第二步：检查需要修复的数据量
-- ============================================

-- 查看 functional_test_cases 表需要修复的记录数
SELECT COUNT(*) AS functional_test_cases_count
FROM functional_test_cases
WHERE deleted_at IS NULL
  AND created_at < NOW();

-- 查看 functional_test_executions 表需要修复的记录数
SELECT COUNT(*) AS functional_test_executions_count
FROM functional_test_executions
WHERE executed_at < NOW();

-- 查看 test_runs 表需要修复的记录数
SELECT COUNT(*) AS test_runs_count
FROM test_runs
WHERE started_at < NOW();

-- 查看 test_run_results 表需要修复的记录数
SELECT COUNT(*) AS test_run_results_count
FROM test_run_results
WHERE executed_at < NOW();

-- ============================================
-- 第三步：预览修复结果（不实际修改数据）
-- ============================================

-- 预览 functional_test_cases 表的修复结果（前10条）
SELECT 
    id,
    name,
    created_at AS old_created_at,
    DATE_ADD(created_at, INTERVAL 8 HOUR) AS new_created_at,
    updated_at AS old_updated_at,
    DATE_ADD(updated_at, INTERVAL 8 HOUR) AS new_updated_at
FROM functional_test_cases
WHERE deleted_at IS NULL
  AND created_at < NOW()
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- 第四步：执行修复（⚠️ 谨慎执行）
-- ============================================

-- 开始事务（可以回滚）
START TRANSACTION;

-- 修复 functional_test_cases 表
UPDATE functional_test_cases 
SET 
    created_at = DATE_ADD(created_at, INTERVAL 8 HOUR),
    updated_at = DATE_ADD(updated_at, INTERVAL 8 HOUR)
WHERE deleted_at IS NULL
  AND created_at < NOW();

SELECT ROW_COUNT() AS functional_test_cases_updated;

-- 修复 functional_test_executions 表
UPDATE functional_test_executions 
SET executed_at = DATE_ADD(executed_at, INTERVAL 8 HOUR)
WHERE executed_at < NOW();

SELECT ROW_COUNT() AS functional_test_executions_updated;

-- 修复 test_runs 表
UPDATE test_runs 
SET 
    started_at = DATE_ADD(started_at, INTERVAL 8 HOUR),
    finished_at = CASE 
        WHEN finished_at IS NOT NULL 
        THEN DATE_ADD(finished_at, INTERVAL 8 HOUR) 
        ELSE NULL 
    END
WHERE started_at < NOW();

SELECT ROW_COUNT() AS test_runs_updated;

-- 修复 test_run_results 表
UPDATE test_run_results 
SET executed_at = DATE_ADD(executed_at, INTERVAL 8 HOUR)
WHERE executed_at < NOW();

SELECT ROW_COUNT() AS test_run_results_updated;

-- 修复 test_cases 表
UPDATE test_cases 
SET 
    created_at = DATE_ADD(created_at, INTERVAL 8 HOUR),
    updated_at = DATE_ADD(updated_at, INTERVAL 8 HOUR)
WHERE created_at < NOW();

SELECT ROW_COUNT() AS test_cases_updated;

-- 修复 test_suites 表
UPDATE test_suites 
SET 
    created_at = DATE_ADD(created_at, INTERVAL 8 HOUR),
    updated_at = DATE_ADD(updated_at, INTERVAL 8 HOUR)
WHERE created_at < NOW();

SELECT ROW_COUNT() AS test_suites_updated;

-- 修复 users 表（如果有时间字段）
UPDATE users 
SET 
    created_at = DATE_ADD(created_at, INTERVAL 8 HOUR),
    updated_at = DATE_ADD(updated_at, INTERVAL 8 HOUR)
WHERE created_at < NOW();

SELECT ROW_COUNT() AS users_updated;

-- 修复 ai_generation_sessions 表
UPDATE ai_generation_sessions 
SET 
    created_at = DATE_ADD(created_at, INTERVAL 8 HOUR),
    updated_at = DATE_ADD(updated_at, INTERVAL 8 HOUR)
WHERE created_at < NOW();

SELECT ROW_COUNT() AS ai_generation_sessions_updated;

-- 修复 project_versions 表
UPDATE project_versions 
SET 
    created_at = DATE_ADD(created_at, INTERVAL 8 HOUR),
    updated_at = DATE_ADD(updated_at, INTERVAL 8 HOUR)
WHERE created_at < NOW();

SELECT ROW_COUNT() AS project_versions_updated;

-- 修复 requirement_docs 表
UPDATE requirement_docs 
SET 
    created_at = DATE_ADD(created_at, INTERVAL 8 HOUR),
    updated_at = DATE_ADD(updated_at, INTERVAL 8 HOUR)
WHERE created_at < NOW();

SELECT ROW_COUNT() AS requirement_docs_updated;

-- ============================================
-- 第五步：验证修复结果
-- ============================================

-- 查看修复后的最新记录（应该接近当前时间）
SELECT 
    id,
    name,
    created_at,
    updated_at
FROM functional_test_cases
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 10;

-- 检查是否还有未来时间的记录（不应该存在）
SELECT COUNT(*) AS future_records
FROM functional_test_cases
WHERE created_at > DATE_ADD(NOW(), INTERVAL 1 HOUR);

-- ============================================
-- 第六步：提交或回滚
-- ============================================

-- 如果验证结果正确，提交事务：
-- COMMIT;

-- 如果发现问题，回滚事务：
-- ROLLBACK;

-- ⚠️ 重要提示：
-- 1. 默认情况下不会自动提交，需要手动执行 COMMIT;
-- 2. 如果验证后发现数据有问题，立即执行 ROLLBACK;
-- 3. 提交后无法回滚，请确保数据正确后再提交

-- ============================================
-- 执行示例
-- ============================================
-- 
-- mysql -u username -p Sakura AI < scripts/fix-timezone-data.sql
-- 
-- 或在 MySQL 命令行中：
-- source scripts/fix-timezone-data.sql;
-- 
-- 记得最后手动执行：COMMIT; 或 ROLLBACK;

