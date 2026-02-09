-- CreateTable
CREATE TABLE `ai_prompts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `template` TEXT NOT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `name`(`name`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prompt_id` INTEGER NOT NULL,
    `run_id` INTEGER NULL,
    `token_used` INTEGER NULL,
    `cost_usd` DECIMAL(10, 6) NULL,
    `executed_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `prompt_id`(`prompt_id`),
    INDEX `run_id`(`run_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `scopes` JSON NULL,
    `expires_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `user_id`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `run_result_id` INTEGER NOT NULL,
    `file_key` VARCHAR(1024) NOT NULL,
    `mime_type` VARCHAR(100) NULL,
    `size_bytes` BIGINT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `run_result_id`(`run_result_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `action` VARCHAR(100) NOT NULL,
    `target_type` VARCHAR(50) NULL,
    `target_id` BIGINT NULL,
    `meta` JSON NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `user_id`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flags` (
    `flag_name` VARCHAR(100) NOT NULL,
    `is_enabled` BOOLEAN NULL DEFAULT false,
    `rollout_percentage` TINYINT UNSIGNED NULL,
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`flag_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `job_name` VARCHAR(255) NOT NULL,
    `status` ENUM('STARTED', 'SUCCESS', 'FAILED') NOT NULL,
    `message` TEXT NULL,
    `started_at` TIMESTAMP(0) NULL,
    `ended_at` TIMESTAMP(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metrics_daily` (
    `metric_date` DATE NOT NULL,
    `suite_id` INTEGER NOT NULL,
    `pass_rate` DECIMAL(5, 2) NULL,
    `avg_duration_ms` INTEGER NULL,

    PRIMARY KEY (`metric_date`, `suite_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `run_id` INTEGER NOT NULL,
    `summary` JSON NULL,
    `generated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `run_id`(`run_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NULL,
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `step_screenshots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `run_id` VARCHAR(191) NOT NULL,
    `test_case_id` INTEGER NULL,
    `step_index` VARCHAR(50) NOT NULL,
    `step_description` TEXT NULL,
    `status` ENUM('success', 'failed', 'error', 'completed') NOT NULL,
    `file_path` VARCHAR(1024) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `file_size` BIGINT NULL,
    `mime_type` VARCHAR(100) NULL DEFAULT 'image/png',
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `file_exists` BOOLEAN NOT NULL DEFAULT true,

    INDEX `idx_created_at`(`created_at`),
    INDEX `idx_run_id`(`run_id`),
    INDEX `idx_test_case_id`(`test_case_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suite_case_map` (
    `suite_id` INTEGER NOT NULL,
    `case_id` INTEGER NOT NULL,

    INDEX `case_id`(`case_id`),
    PRIMARY KEY (`suite_id`, `case_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_cases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `steps` JSON NULL,
    `tags` JSON NULL,
    `system` VARCHAR(100) NULL,
    `module` VARCHAR(100) NULL,
    `project` VARCHAR(100) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    INDEX `test_cases_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_run_results` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `run_id` INTEGER NOT NULL,
    `case_id` INTEGER NOT NULL,
    `status` ENUM('PASSED', 'FAILED', 'SKIPPED') NOT NULL,
    `duration_ms` INTEGER NULL,
    `screenshot_url` VARCHAR(1024) NULL,
    `executed_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `case_id`(`case_id`),
    INDEX `run_id`(`run_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `suite_id` INTEGER NOT NULL,
    `trigger_user_id` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED') NOT NULL,
    `started_at` TIMESTAMP(0) NULL,
    `finished_at` TIMESTAMP(0) NULL,

    INDEX `suite_id`(`suite_id`),
    INDEX `trigger_user_id`(`trigger_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_suites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `owner_id` INTEGER NOT NULL,
    `project` VARCHAR(100) NULL,
    `metadata` JSON NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `owner_id`(`owner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` INTEGER NOT NULL,
    `role_id` INTEGER NOT NULL,

    INDEX `role_id`(`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `account_name` VARCHAR(100) NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `project` VARCHAR(100) NULL,
    `is_super_admin` BOOLEAN NOT NULL DEFAULT false,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `email`(`email`),
    UNIQUE INDEX `username`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `run_artifacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `runId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `size` BIGINT NOT NULL,
    `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_run_id`(`runId`),
    INDEX `idx_created_at`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `case_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `steps` JSON NULL,
    `tags` JSON NULL,
    `system` VARCHAR(100) NULL,
    `module` VARCHAR(100) NULL,
    `meta` JSON NULL,
    `created_by` INTEGER NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `case_versions_case_id_idx`(`case_id`),
    INDEX `case_versions_created_at_idx`(`created_at`),
    INDEX `case_versions_created_by_fkey`(`created_by`),
    UNIQUE INDEX `case_versions_case_id_version_key`(`case_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bulk_edit_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `system` VARCHAR(100) NOT NULL,
    `module` VARCHAR(100) NOT NULL,
    `tag_filter` JSON NULL,
    `priority_filter` VARCHAR(50) NULL,
    `change_brief` TEXT NOT NULL,
    `status` ENUM('dry_run', 'applied', 'cancelled', 'failed') NOT NULL DEFAULT 'dry_run',
    `created_by` INTEGER NOT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `applied_at` TIMESTAMP(0) NULL,

    INDEX `bulk_edit_sessions_created_by_idx`(`created_by`),
    INDEX `bulk_edit_sessions_status_idx`(`status`),
    INDEX `bulk_edit_sessions_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_patch_proposals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_id` INTEGER NOT NULL,
    `case_id` INTEGER NOT NULL,
    `diff_json` JSON NOT NULL,
    `ai_rationale` TEXT NULL,
    `side_effects` JSON NULL,
    `risk_level` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    `recall_reason` VARCHAR(255) NULL,
    `old_hash` VARCHAR(255) NOT NULL,
    `new_hash` VARCHAR(255) NULL,
    `apply_status` ENUM('pending', 'applied', 'skipped', 'conflicted') NOT NULL DEFAULT 'pending',
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `applied_at` TIMESTAMP(0) NULL,

    INDEX `case_patch_proposals_session_id_idx`(`session_id`),
    INDEX `case_patch_proposals_case_id_idx`(`case_id`),
    INDEX `case_patch_proposals_apply_status_idx`(`apply_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_case_executions` (
    `id` VARCHAR(191) NOT NULL,
    `test_case_id` INTEGER NOT NULL,
    `test_case_title` VARCHAR(255) NOT NULL,
    `environment` VARCHAR(100) NOT NULL DEFAULT 'default',
    `execution_mode` VARCHAR(50) NOT NULL DEFAULT 'standard',
    `execution_engine` VARCHAR(50) NULL,
    `status` ENUM('queued', 'running', 'completed', 'failed', 'cancelled', 'error') NOT NULL DEFAULT 'queued',
    `executor_user_id` INTEGER NULL,
    `executor_project` VARCHAR(100) NULL,
    `queued_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `started_at` TIMESTAMP(3) NULL,
    `finished_at` TIMESTAMP(3) NULL,
    `duration_ms` INTEGER NULL,
    `total_steps` INTEGER NOT NULL DEFAULT 0,
    `completed_steps` INTEGER NOT NULL DEFAULT 0,
    `passed_steps` INTEGER NOT NULL DEFAULT 0,
    `failed_steps` INTEGER NOT NULL DEFAULT 0,
    `progress` TINYINT NOT NULL DEFAULT 0,
    `error_message` TEXT NULL,
    `execution_logs` JSON NULL,
    `screenshots` JSON NULL,
    `artifacts` JSON NULL,
    `metadata` JSON NULL,
    `midscene_report_path` VARCHAR(500) NULL,

    INDEX `test_case_executions_test_case_id_idx`(`test_case_id`),
    INDEX `test_case_executions_executor_user_id_idx`(`executor_user_id`),
    INDEX `test_case_executions_executor_project_idx`(`executor_project`),
    INDEX `test_case_executions_status_idx`(`status`),
    INDEX `test_case_executions_queued_at_idx`(`queued_at`),
    INDEX `test_case_executions_started_at_idx`(`started_at`),
    INDEX `test_case_executions_finished_at_idx`(`finished_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `functional_test_cases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `case_id` VARCHAR(100) NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `system` VARCHAR(100) NULL,
    `module` VARCHAR(100) NULL,
    `priority` ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
    `tags` VARCHAR(500) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'PUBLISHED',
    `source` ENUM('MANUAL', 'AI_GENERATED') NOT NULL DEFAULT 'MANUAL',
    `ai_session_id` VARCHAR(100) NULL,
    `creator_id` INTEGER NOT NULL,
    `test_type` VARCHAR(50) NULL,
    `preconditions` TEXT NULL,
    `test_data` TEXT NULL,
    `section_id` VARCHAR(50) NULL,
    `section_name` VARCHAR(255) NULL,
    `scenario_name` VARCHAR(255) NULL,
    `scenario_description` TEXT NULL,
    `batch_number` INTEGER NULL DEFAULT 0,
    `coverage_areas` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `case_type` ENUM('SMOKE', 'FULL', 'ABNORMAL', 'BOUNDARY', 'PERFORMANCE', 'SECURITY', 'USABILITY', 'COMPATIBILITY') NOT NULL DEFAULT 'FULL',
    `project_version_id` INTEGER NULL,
    `requirement_source` TEXT NULL,
    `section_description` TEXT NULL,
    `expected_result` TEXT NULL,
    `risk_level` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    `steps` TEXT NULL,
    `test_point_name` VARCHAR(500) NULL,
    `test_purpose` TEXT NULL,
    `requirement_doc_id` INTEGER NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    INDEX `functional_test_cases_system_idx`(`system`),
    INDEX `functional_test_cases_module_idx`(`module`),
    INDEX `functional_test_cases_creator_id_idx`(`creator_id`),
    INDEX `functional_test_cases_ai_session_id_idx`(`ai_session_id`),
    INDEX `functional_test_cases_source_idx`(`source`),
    INDEX `functional_test_cases_section_id_idx`(`section_id`),
    INDEX `functional_test_cases_batch_number_idx`(`batch_number`),
    INDEX `functional_test_cases_project_version_id_idx`(`project_version_id`),
    INDEX `functional_test_cases_case_type_idx`(`case_type`),
    INDEX `functional_test_cases_requirement_doc_id_idx`(`requirement_doc_id`),
    INDEX `functional_test_cases_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_generation_sessions` (
    `id` VARCHAR(100) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `axure_filename` VARCHAR(255) NOT NULL,
    `axure_file_size` INTEGER NOT NULL,
    `project_name` VARCHAR(255) NULL,
    `system_type` VARCHAR(50) NULL,
    `business_domain` VARCHAR(100) NULL,
    `requirement_doc` TEXT NULL,
    `page_count` INTEGER NOT NULL DEFAULT 0,
    `element_count` INTEGER NOT NULL DEFAULT 0,
    `interaction_count` INTEGER NOT NULL DEFAULT 0,
    `total_generated` INTEGER NOT NULL DEFAULT 0,
    `total_saved` INTEGER NOT NULL DEFAULT 0,
    `batches` JSON NULL,
    `pre_analysis_result` JSON NULL,
    `enhanced_data` JSON NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `ai_generation_sessions_user_id_idx`(`user_id`),
    INDEX `ai_generation_sessions_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `requirement_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `summary` TEXT NULL,
    `source_filename` VARCHAR(255) NULL,
    `ai_session_id` VARCHAR(100) NULL,
    `project_id` INTEGER NULL,
    `project_version_id` INTEGER NULL,
    `creator_id` INTEGER NOT NULL,
    `scenario_count` INTEGER NOT NULL DEFAULT 0,
    `test_case_count` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'ARCHIVED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `module` VARCHAR(255) NULL,
    `system` VARCHAR(255) NULL,

    INDEX `requirement_documents_creator_id_idx`(`creator_id`),
    INDEX `requirement_documents_ai_session_id_idx`(`ai_session_id`),
    INDEX `requirement_documents_project_id_idx`(`project_id`),
    INDEX `requirement_documents_project_version_id_idx`(`project_version_id`),
    INDEX `requirement_documents_status_idx`(`status`),
    INDEX `requirement_documents_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `systems` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `short_name` VARCHAR(20) NULL,
    `description` TEXT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `systems_name_key`(`name`),
    INDEX `systems_status_idx`(`status`),
    INDEX `systems_sort_order_idx`(`sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `version_name` VARCHAR(100) NOT NULL,
    `version_code` VARCHAR(50) NOT NULL,
    `description` TEXT NULL,
    `is_main` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `release_date` DATE NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `project_versions_project_id_idx`(`project_id`),
    INDEX `project_versions_is_main_idx`(`is_main`),
    UNIQUE INDEX `project_versions_project_id_version_name_key`(`project_id`, `version_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `functional_test_executions` (
    `id` VARCHAR(100) NOT NULL,
    `test_case_id` INTEGER NOT NULL,
    `test_case_name` VARCHAR(255) NOT NULL,
    `final_result` ENUM('pass', 'fail', 'block') NOT NULL,
    `actual_result` TEXT NOT NULL,
    `comments` TEXT NULL,
    `duration_ms` INTEGER NULL,
    `executed_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `executor_id` INTEGER NOT NULL,
    `executor_project` VARCHAR(100) NULL,
    `step_results` JSON NULL,
    `total_steps` INTEGER NOT NULL DEFAULT 0,
    `completed_steps` INTEGER NOT NULL DEFAULT 0,
    `passed_steps` INTEGER NOT NULL DEFAULT 0,
    `failed_steps` INTEGER NOT NULL DEFAULT 0,
    `blocked_steps` INTEGER NOT NULL DEFAULT 0,
    `screenshots` JSON NULL,
    `attachments` JSON NULL,
    `metadata` JSON NULL,

    INDEX `functional_test_executions_test_case_id_idx`(`test_case_id`),
    INDEX `functional_test_executions_executor_id_idx`(`executor_id`),
    INDEX `functional_test_executions_executed_at_idx`(`executed_at`),
    INDEX `functional_test_executions_final_result_idx`(`final_result`),
    INDEX `functional_test_executions_executor_project_idx`(`executor_project`),
    INDEX `functional_test_executions_test_case_id_executed_at_idx`(`test_case_id`, `executed_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `short_name` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `project` VARCHAR(100) NULL,
    `plan_type` ENUM('functional', 'ui_auto', 'mixed', 'regression', 'smoke', 'integration') NOT NULL DEFAULT 'functional',
    `status` ENUM('draft', 'not_started', 'active', 'completed', 'expired', 'cancelled', 'archived') NOT NULL DEFAULT 'draft',
    `members` JSON NULL,
    `owner_id` INTEGER NOT NULL,
    `start_date` TIMESTAMP(0) NULL,
    `end_date` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    INDEX `test_plans_owner_id_idx`(`owner_id`),
    INDEX `test_plans_project_idx`(`project`),
    INDEX `test_plans_plan_type_idx`(`plan_type`),
    INDEX `test_plans_status_idx`(`status`),
    INDEX `test_plans_created_at_idx`(`created_at`),
    INDEX `test_plans_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_plan_cases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `plan_id` INTEGER NOT NULL,
    `case_id` INTEGER NOT NULL,
    `case_type` VARCHAR(50) NOT NULL,
    `case_name` VARCHAR(255) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_executed` BOOLEAN NOT NULL DEFAULT false,
    `execution_result` VARCHAR(50) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `test_plan_cases_plan_id_idx`(`plan_id`),
    INDEX `test_plan_cases_case_id_idx`(`case_id`),
    INDEX `test_plan_cases_case_type_idx`(`case_type`),
    UNIQUE INDEX `test_plan_cases_plan_id_case_id_case_type_key`(`plan_id`, `case_id`, `case_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_plan_executions` (
    `id` VARCHAR(100) NOT NULL,
    `plan_id` INTEGER NOT NULL,
    `plan_name` VARCHAR(255) NOT NULL,
    `executor_id` INTEGER NOT NULL,
    `executor_name` VARCHAR(100) NOT NULL,
    `execution_type` VARCHAR(50) NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `progress` TINYINT NOT NULL DEFAULT 0,
    `total_cases` INTEGER NOT NULL DEFAULT 0,
    `completed_cases` INTEGER NOT NULL DEFAULT 0,
    `passed_cases` INTEGER NOT NULL DEFAULT 0,
    `failed_cases` INTEGER NOT NULL DEFAULT 0,
    `blocked_cases` INTEGER NOT NULL DEFAULT 0,
    `skipped_cases` INTEGER NOT NULL DEFAULT 0,
    `started_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` TIMESTAMP(3) NULL,
    `duration_ms` INTEGER NULL,
    `execution_results` JSON NULL,
    `error_message` TEXT NULL,
    `metadata` JSON NULL,

    INDEX `test_plan_executions_plan_id_idx`(`plan_id`),
    INDEX `test_plan_executions_executor_id_idx`(`executor_id`),
    INDEX `test_plan_executions_status_idx`(`status`),
    INDEX `test_plan_executions_started_at_idx`(`started_at`),
    INDEX `test_plan_executions_finished_at_idx`(`finished_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_element_cache` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cache_key` VARCHAR(191) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `selector` VARCHAR(500) NOT NULL,
    `snapshot_fp` VARCHAR(32) NOT NULL,
    `element_ref` VARCHAR(255) NOT NULL,
    `element_text` VARCHAR(1000) NOT NULL,
    `confidence` INTEGER NOT NULL DEFAULT 100,
    `hit_count` INTEGER NOT NULL DEFAULT 0,
    `last_hit_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `ai_element_cache_cache_key_key`(`cache_key`),
    INDEX `ai_element_cache_expires_at_idx`(`expires_at`),
    INDEX `ai_element_cache_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_assertion_cache` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cache_key` VARCHAR(191) NOT NULL,
    `assertion_desc` VARCHAR(1000) NOT NULL,
    `page_elements_fp` VARCHAR(32) NOT NULL,
    `command_name` VARCHAR(100) NOT NULL,
    `command_args` JSON NULL,
    `assertion_info` JSON NULL,
    `hit_count` INTEGER NOT NULL DEFAULT 0,
    `last_hit_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `ai_assertion_cache_cache_key_key`(`cache_key`),
    INDEX `ai_assertion_cache_expires_at_idx`(`expires_at`),
    INDEX `ai_assertion_cache_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_operation_cache` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cache_key` VARCHAR(191) NOT NULL,
    `operation_desc` VARCHAR(1000) NOT NULL,
    `page_elements_fp` VARCHAR(32) NOT NULL,
    `command_name` VARCHAR(100) NOT NULL,
    `command_args` JSON NULL,
    `hit_count` INTEGER NOT NULL DEFAULT 0,
    `last_hit_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `ai_operation_cache_cache_key_key`(`cache_key`),
    INDEX `ai_operation_cache_expires_at_idx`(`expires_at`),
    INDEX `ai_operation_cache_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `account_type` VARCHAR(20) NOT NULL,
    `account_name` VARCHAR(100) NOT NULL,
    `account_password` VARCHAR(255) NOT NULL,
    `account_description` TEXT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `account_configs_account_type_idx`(`account_type`),
    INDEX `account_configs_status_idx`(`status`),
    INDEX `account_configs_account_name_idx`(`account_name`),
    INDEX `account_configs_project_id_idx`(`project_id`),
    INDEX `account_configs_is_default_idx`(`is_default`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `server_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `server_type` VARCHAR(50) NOT NULL,
    `server_version` VARCHAR(100) NOT NULL,
    `host_name` VARCHAR(191) NOT NULL,
    `host_port` INTEGER NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `parameters` JSON NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `server_configs_server_type_idx`(`server_type`),
    INDEX `server_configs_status_idx`(`status`),
    INDEX `server_configs_host_name_idx`(`host_name`),
    INDEX `server_configs_project_id_idx`(`project_id`),
    INDEX `server_configs_is_default_idx`(`is_default`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `database_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `database_type` VARCHAR(50) NOT NULL,
    `database_version` VARCHAR(100) NOT NULL,
    `database_driver` VARCHAR(255) NOT NULL,
    `database_name` VARCHAR(191) NOT NULL,
    `database_port` INTEGER NOT NULL,
    `database_schema` VARCHAR(100) NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `connection_string` VARCHAR(500) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `parameters` JSON NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `database_configs_database_type_idx`(`database_type`),
    INDEX `database_configs_status_idx`(`status`),
    INDEX `database_configs_database_name_idx`(`database_name`),
    INDEX `database_configs_project_id_idx`(`project_id`),
    INDEX `database_configs_is_default_idx`(`is_default`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_runs` ADD CONSTRAINT `ai_runs_ibfk_1` FOREIGN KEY (`prompt_id`) REFERENCES `ai_prompts`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ai_runs` ADD CONSTRAINT `ai_runs_ibfk_2` FOREIGN KEY (`run_id`) REFERENCES `test_runs`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `api_tokens` ADD CONSTRAINT `api_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_ibfk_1` FOREIGN KEY (`run_result_id`) REFERENCES `test_run_results`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_ibfk_1` FOREIGN KEY (`run_id`) REFERENCES `test_runs`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `step_screenshots` ADD CONSTRAINT `step_screenshots_test_case_id_fkey` FOREIGN KEY (`test_case_id`) REFERENCES `test_cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `suite_case_map` ADD CONSTRAINT `suite_case_map_ibfk_1` FOREIGN KEY (`suite_id`) REFERENCES `test_suites`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `suite_case_map` ADD CONSTRAINT `suite_case_map_ibfk_2` FOREIGN KEY (`case_id`) REFERENCES `test_cases`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `test_run_results` ADD CONSTRAINT `test_run_results_ibfk_1` FOREIGN KEY (`run_id`) REFERENCES `test_runs`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `test_run_results` ADD CONSTRAINT `test_run_results_ibfk_2` FOREIGN KEY (`case_id`) REFERENCES `test_cases`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `test_runs` ADD CONSTRAINT `test_runs_ibfk_1` FOREIGN KEY (`suite_id`) REFERENCES `test_suites`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `test_runs` ADD CONSTRAINT `test_runs_ibfk_2` FOREIGN KEY (`trigger_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `test_suites` ADD CONSTRAINT `test_suites_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `case_versions` ADD CONSTRAINT `case_versions_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `test_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_versions` ADD CONSTRAINT `case_versions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bulk_edit_sessions` ADD CONSTRAINT `bulk_edit_sessions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_patch_proposals` ADD CONSTRAINT `case_patch_proposals_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `test_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_patch_proposals` ADD CONSTRAINT `case_patch_proposals_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `bulk_edit_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `test_case_executions` ADD CONSTRAINT `test_case_executions_executor_user_id_fkey` FOREIGN KEY (`executor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `test_case_executions` ADD CONSTRAINT `test_case_executions_test_case_id_fkey` FOREIGN KEY (`test_case_id`) REFERENCES `test_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `functional_test_cases` ADD CONSTRAINT `functional_test_cases_creator_id_fkey` FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `functional_test_cases` ADD CONSTRAINT `functional_test_cases_project_version_id_fkey` FOREIGN KEY (`project_version_id`) REFERENCES `project_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `functional_test_cases` ADD CONSTRAINT `functional_test_cases_requirement_doc_id_fkey` FOREIGN KEY (`requirement_doc_id`) REFERENCES `requirement_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generation_sessions` ADD CONSTRAINT `ai_generation_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requirement_documents` ADD CONSTRAINT `requirement_documents_ai_session_id_fkey` FOREIGN KEY (`ai_session_id`) REFERENCES `ai_generation_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requirement_documents` ADD CONSTRAINT `requirement_documents_creator_id_fkey` FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requirement_documents` ADD CONSTRAINT `requirement_documents_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `systems`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requirement_documents` ADD CONSTRAINT `requirement_documents_project_version_id_fkey` FOREIGN KEY (`project_version_id`) REFERENCES `project_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_versions` ADD CONSTRAINT `project_versions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `systems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `functional_test_executions` ADD CONSTRAINT `functional_test_executions_test_case_id_fkey` FOREIGN KEY (`test_case_id`) REFERENCES `functional_test_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `functional_test_executions` ADD CONSTRAINT `functional_test_executions_executor_id_fkey` FOREIGN KEY (`executor_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `test_plans` ADD CONSTRAINT `test_plans_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `test_plan_cases` ADD CONSTRAINT `test_plan_cases_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `test_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `test_plan_executions` ADD CONSTRAINT `test_plan_executions_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `test_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_configs` ADD CONSTRAINT `account_configs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `systems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `server_configs` ADD CONSTRAINT `server_configs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `systems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `database_configs` ADD CONSTRAINT `database_configs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `systems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
