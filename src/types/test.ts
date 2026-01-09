// 🔥 新增：结构化测试步骤接口
export interface TestStepRow {
  id: string;                    // 唯一标识
  order: number;                 // 排序号
  action: string;                // 操作步骤
  expected: string;              // 预期结果
  note?: string;                 // 备注（可选）
  selector?: string;             // 元素选择器（可选）
  screenshot?: string;           // 截图URL（可选）
  duration?: number;             // 预期耗时秒数（可选）
  type?: 'action' | 'verification' | 'setup' | 'cleanup';  // 步骤类型
}

// 测试用例基础接口
export interface TestCase {
  id: number;
  name: string;
  description?: string;
  preconditions?: string;        // 🔥 新增：前置条件
  testData?: string;             // 🔥 新增：测试数据
  steps: string;                 // 保留原文本格式（兼容性）
  stepsData?: TestStepRow[];     // 新增：结构化步骤数据
  assertions?: string;
  priority?: 'high' | 'medium' | 'low';
  status?: 'active' | 'draft' | 'disabled';
  tags?: string[];
  system?: string;    // 新增系统字段
  module?: string;    // 新增模块字段
  department?: string; // 🔥 新增：部门字段
  projectVersion?: string; // 🔥 新增：所属版本字段
  caseType?: string; // 🔥 新增：用例类型（SMOKE、FULL、ABNORMAL等）
  author?: string;
  created?: string;
  updated?: string; // 🔥 新增：更新时间字段
  lastRun?: string;
  lastRunStatus?: 'completed' | 'failed' | 'error' | 'cancelled'; // 🔥 新增：最后一次执行状态
  success_rate?: number;
  suiteId?: number; // 🔥 新增：关联的测试套件ID
  executionStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'; // 🔥 新增：执行状态（来自test_case_executions表）
  executionResult?: 'pass' | 'fail' | 'block' | 'skip'; // 🔥 新增：执行结果（来自test_case_executions表）
}

// 用于显示的简化测试用例接口（兼容现有数据）
export interface TestCaseDisplay {
  id: number;
  name: string;
  description: string;
  tags: string[];
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'draft' | 'disabled';
  lastRun: string;
  success_rate: number;
  author: string;
  created: string;
}

// 测试步骤接口 - 支持多种操作类型
export interface TestStep {
  id: string;
  action: TestAction;
  selector?: string;
  url?: string;
  value?: string;
  text?: string;
  condition?: ExpectCondition;
  timeout?: number;
  description: string;
  order: number;
  // 🔥 新增：浏览器自动化扩展属性
  element?: string;     // 元素的人类可读描述
  ref?: string;         // 元素的精确引用
  stepType?: 'operation' | 'assertion'; // 步骤类型标记
  // 🔥 新增：滚动操作参数
  pixels?: number;      // 滚动像素数
  direction?: 'up' | 'down' | 'left' | 'right'; // 滚动方向
  x?: number;           // 水平滚动距离
  y?: number;           // 垂直滚动距离
  // 🔥 新增：页签切换参数
  tabTarget?: string;   // 页签目标（标题、URL片段或索引）
  tabMatchType?: 'title' | 'url' | 'index' | 'last' | 'first'; // 匹配方式
}

export type TestAction =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'expect'
  | 'wait'
  | 'screenshot'
  | 'hover'
  | 'drag'
  | 'select'
  | 'upload'
  | 'press_key'
  | 'tab_new'
  | 'tab_close'
  | 'tab_select'
  | 'back'
  | 'forward'
  | 'pdf_save'
  | 'wait_for_text'
  | 'scroll'
  // 🔥 新增：浏览器自动化操作
  | 'browser_navigate'
  | 'browser_click'
  | 'browser_type'
  | 'browser_fill'
  | 'browser_select_option'
  | 'browser_wait_for'
  | 'browser_snapshot'
  | 'browser_scroll_down'
  | 'browser_scroll_up'
  | 'browser_scroll_to_top'
  | 'browser_scroll_to_bottom'
  | 'browser_scroll_to_element'
  | 'browser_scroll_by'
  | 'browser_scroll_page'
  | 'browser_tab_switch'
  // 🔥 新增：兼容性操作
  | 'input'
  | 'type'
  | 'execute';

export type ExpectCondition = 
  | 'visible'
  | 'hidden'
  | 'contains_text'
  | 'not_contains_text'
  | 'has_value'
  | 'has_attribute'
  | 'is_enabled'
  | 'is_disabled'
  | 'url_changed'
  | 'logged_in'
  | 'element_exists';

// 测试执行结果
export interface TestRun {
  id:string;
  runId: string;
  testCaseId: number;
  name?: string; // 🔥 新增：测试用例名称（通常来自测试用例标题）
  status: TestRunStatus;
  logs: TestLog[];
  // 🔥 优化：统一使用 startedAt 和 finishedAt 时间字段
  startedAt: Date;
  finishedAt?: Date;
  environment: string;
  suiteId?: string;
  reuseBrowser?: boolean;
  contextState?: any;
  executionMode?: string;
  executionEngine?: 'mcp' | 'playwright'; // 🔥 新增：执行引擎选择
  enableTrace?: boolean; // 🔥 新增：是否启用 trace（仅 Playwright）
  enableVideo?: boolean; // 🔥 新增：是否启用 video（仅 Playwright）
  steps: TestStep[];
  successfulSteps: string[];
  error?: string;
  // 🔥 新增：进度跟踪属性
  totalSteps?: number;
  completedSteps?: number;
  passedSteps?: number;
  failedSteps?: number;
  progress?: number;
  duration?: string;
  userId?: string; // 🔥 新增：执行者用户ID
  executor?: string; // 🔥 新增：执行者名称（用户名）
}

export type TestRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'error' | 'cancelled';

export interface TestLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  stepId?: string;
}

export interface Screenshot {
  id: string;
  stepId: string;
  filename: string;
  timestamp: Date;
  description?: string;
}

// API 请求/响应接口
export interface RunTestRequest {
  testCaseId: number;
  environment?: string;
}

export interface RunTestResponse {
  success: boolean;
  runId: string;
  message?: string;
  error?: string;
}

// MCP 执行结果
export interface McpExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  screenshot?: string;
}

// WebSocket 消息
export interface WebSocketMessage {
  type: 'test_created' | 'test_update' | 'test_complete' | 'test_error' | 'log' | 'logs_batch' | 'suiteUpdate';
  runId: string;
  data: any;
} 

// 🔥 新增：测试套件接口
export interface TestSuite {
  id: number;
  name: string;
  description?: string;
  owner?: string;
  department?: string; // 🔥 新增：部门字段
  project?: string; // 🔥 新增：项目字段
  tags?: string[];
  testCaseIds: number[];
  createdAt: string;
  updatedAt: string;
  environment?: string;
  priority?: 'high' | 'medium' | 'low';
  status?: 'active' | 'draft' | 'disabled';
}

// 🔥 新增：测试套件运行记录
export interface TestSuiteRun {
  id: string;
  suiteId: number;
  suiteName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startTime: string;
  endTime?: string;
  duration: string;
  totalCases: number;
  completedCases: number;
  passedCases: number;
  failedCases: number;
  executor: string;
  environment: string;
  testRuns: string[]; // runIds of individual test cases
  error?: string;
}

// 🔥 新增：套件执行选项
export interface SuiteExecutionOptions {
  environment?: string;
  executionMode?: 'standard' | 'interactive';
  concurrency?: number;
  continueOnFailure?: boolean;
}

// 🆕 三阶段渐进式生成相关类型

/**
 * 测试模块（阶段1输出）
 */
export interface TestModule {
  id: string;
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  relatedSections: string[]; // 关联的章节ID，如 ["1.1", "1.2"]
  testPurposes?: TestPurpose[]; // 可选，阶段2生成后才有
}

/**
 * 测试目的（阶段2输出）
 */
export interface TestPurpose {
  id: string;
  name: string;
  description: string;
  coverageAreas: string; // 逗号分隔的覆盖范围
  estimatedTestPoints: number;
  priority: 'high' | 'medium' | 'low';
  testCase?: any; // 可选，阶段3生成后才有（使用any避免循环引用）
  generating?: boolean; // 是否正在生成测试点（前端状态）
}

// 🔥 项目管理相关类型（原系统字典）

/**
 * 项目/系统状态枚举
 */
export type SystemStatus = 'active' | 'inactive';

/**
 * 项目版本接口
 */
export interface ProjectVersion {
  id: number;
  project_id: number;
  version_name: string;
  version_code: string;
  description?: string | null;
  is_main: boolean;  // 是否为主线版本
  status: SystemStatus;
  release_date?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 项目/系统接口（包含版本列表）
 */
export interface System {
  id: number;
  name: string;
  short_name?: string | null;  // 🆕 项目简称
  description?: string | null;
  status: SystemStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  versions?: ProjectVersion[];  // 项目版本列表
}

/**
 * 创建项目输入
 */
export interface CreateSystemInput {
  name: string;
  short_name?: string;  // 🆕 项目简称
  description?: string;
  status?: SystemStatus;
  sort_order?: number;
  // 创建项目时的初始版本
  initial_version?: {
    version_name: string;
    version_code: string;
    description?: string;
    is_main?: boolean;
  };
}

/**
 * 更新项目输入
 */
export interface UpdateSystemInput {
  name?: string;
  short_name?: string;  // 🆕 项目简称
  description?: string;
  status?: SystemStatus;
  sort_order?: number;
}

/**
 * 创建版本输入
 */
export interface CreateVersionInput {
  project_id: number;
  version_name: string;
  version_code: string;
  description?: string;
  is_main?: boolean;
  status?: SystemStatus;
  release_date?: string;
}

/**
 * 更新版本输入
 */
export interface UpdateVersionInput {
  version_name?: string;
  version_code?: string;
  description?: string;
  is_main?: boolean;
  status?: SystemStatus;
  release_date?: string;
}

/**
 * 项目列表响应
 */
export interface SystemsResponse {
  data: System[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 简化的项目选项（用于下拉选择）
 */
export interface SystemOption {
  id: number;
  name: string;
  short_name?: string;  // 🆕 项目简称
  project_versions?: { 
    id: number; 
    version_name: string; 
    version_code: string;
    is_main: boolean;
  }[];
}

/**
 * 用例类型枚举
 */
export type CaseType = 'SMOKE' | 'FULL';

/**
 * 功能测试用例扩展字段
 */
export interface FunctionalTestCaseExtended {
  project_version_id?: number;    // 项目版本ID
  case_type?: CaseType;           // 用例类型（冒烟/全量）
  requirement_source?: string;    // 需求来源
}

// ==================== 账号配置相关类型 ====================

export type AccountType = 'admin' | 'security' | 'auditor';  // 管理员账号、安全员账号、审核员账号

export interface AccountConfig {
  id: number;
  project_id: number;
  account_type: AccountType;
  account_name: string;
  account_password: string;
  account_description?: string | null;
  status: SystemStatus;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAccountInput {
  project_id: number;
  account_type: AccountType;
  account_name: string;
  account_password: string;
  account_description?: string;
  status?: SystemStatus;
}

export interface UpdateAccountInput {
  account_type?: AccountType;
  account_name?: string;
  account_password?: string;
  account_description?: string;
  status?: SystemStatus;
}

// ==================== 服务器配置相关类型 ====================

export interface ServerConfig {
  id: number;
  project_id: number;
  server_type: string;  // 服务器类型，如：Linux
  server_version: string;  // 服务器版本，如：CentOS 7.9.2009
  host_name: string;  // 主机名称，如：172.19.5.45
  host_port: number;  // 主机端口，如：22
  username: string;  // 用户名
  password: string;  // 密码
  description?: string | null;  // 描述
  status: SystemStatus;  // 启用状态
  is_default: boolean;
  parameters?: Record<string, string>;  // 参数配置（键值对）
  created_at: string;
  updated_at: string;
}

export interface CreateServerInput {
  project_id: number;
  server_type: string;
  server_version: string;
  host_name: string;
  host_port: number;
  username: string;
  password: string;
  description?: string;
  status?: SystemStatus;
  parameters?: Record<string, string>;
}

export interface UpdateServerInput {
  server_type?: string;
  server_version?: string;
  host_name?: string;
  host_port?: number;
  username?: string;
  password?: string;
  description?: string;
  status?: SystemStatus;
  parameters?: Record<string, string>;
}

// ==================== 数据库配置相关类型 ====================

export interface DatabaseConfig {
  id: number;
  project_id: number;
  database_type: string;  // 数据库类型，如：MySQL
  database_version: string;  // 数据库版本，如：MySQL 5.7.38
  database_driver: string;  // 数据库驱动，如：com.mysql.jdbc.Driver
  database_name: string;  // 数据库名称（IP或主机名），如：172.19.5.45
  database_port: number;  // 数据库端口，如：3306
  database_schema: string;  // 数据库/模式，如：bs_audit
  username: string;  // 用户名
  password: string;  // 密码
  connection_string: string;  // 数据库连接串，如：jdbc:mysql://172.19.5.45:3306/bs_audit
  description?: string | null;  // 数据库描述
  status: SystemStatus;  // 启用状态
  is_default: boolean;
  parameters?: Record<string, string>;  // 参数配置（键值对）
  created_at: string;
  updated_at: string;
}

export interface CreateDatabaseInput {
  project_id: number;
  database_type: string;
  database_version: string;
  database_driver: string;
  database_name: string;
  database_port: number;
  database_schema: string;
  username: string;
  password: string;
  connection_string: string;
  description?: string;
  status?: SystemStatus;
  parameters?: Record<string, string>;
}

export interface UpdateDatabaseInput {
  database_type?: string;
  database_version?: string;
  database_driver?: string;
  database_name?: string;
  database_port?: number;
  database_schema?: string;
  username?: string;
  password?: string;
  connection_string?: string;
  description?: string;
  status?: SystemStatus;
  parameters?: Record<string, string>;
} 