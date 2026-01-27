// 从全局类型导入 ExecutionResult
import type { ExecutionResult } from '../../types/testPlan';

export interface ExecutionLog {
    id: string;
    status: ExecutionResult;
    executor: string;
    time: string;
    comment?: string;
    // 🆕 新增字段：支持更详细的执行信息
    actualResult?: string;           // 实际结果
    durationMs?: number;              // 执行时长（毫秒）
    stepResults?: any[];              // 步骤结果
    totalSteps?: number;              // 总步骤数
    completedSteps?: number;          // 已完成步骤数
    passedSteps?: number;             // 通过步骤数
    failedSteps?: number;             // 失败步骤数
    blockedSteps?: number;            // 受阻步骤数
    screenshots?: any[];              // 截图列表
    attachments?: any[];              // 附件列表
}

export interface TestCaseItem {
    id: number;
    name: string;
    description?: string;
    system: string;
    module: string;
    priority: string;
    status: string;
    executionStatus: ExecutionResult;
    lastRun?: string;
    logs: ExecutionLog[];
    created_at: string;
    users?: {
        username: string;
    };
}

export interface TestPointGroup {
    id: number;
    test_point_index: number;
    test_point_name: string;
    test_purpose?: string;
    steps: string;
    expected_result: string;
    risk_level: string;
    testCases: TestCaseItem[];
    progress: number; // 0-100
}

export interface TestScenarioGroup {
    id: string;
    name: string;
    description?: string;
    testPoints: TestPointGroup[];
    progress: number; // 0-100
}

export interface FilterState {
    search: string;
    system: string;
    module: string;
    source: string;
    priority: string;
    status: string;
    tag: string;
    sectionName: string;
    createdBy: string;
    startDate: string;
    endDate: string;
    riskLevel: string;
    projectVersion: string;  // 🆕 项目版本筛选
    caseType: string;  // 🆕 用例类型筛选
    executionStatus: string;  // 🆕 执行结果筛选
}

// 视图模式类型
export type ViewMode = 'card' | 'table' | 'kanban' | 'timeline';

// 分页信息
export interface PaginationInfo {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

// 视图组件通用属性
export interface ViewProps {
    testCases: any[];
    organizedData: TestScenarioGroup[];
    loading: boolean;
    selectedPoints: Set<number>;
    onToggleSelectPoint: (pointId: number) => void;
    onBatchSelectPoints?: (pointIds: number[], selected: boolean) => void;  // 🆕 批量选择
    onViewDetail: (id: number) => void;  // 🆕 查看详情
    onEditCase: (id: number) => void;
    onDeleteCase: (id: number) => void;  // 🔧 移除name参数
    onCopyCase: (id: number) => void;  // 🆕 复制用例
    onEditPoint: (point: TestPointGroup) => void;
    onDeletePoint: (pointId: number, pointName: string) => void;
    onUpdateExecutionStatus: (caseId: number, status: ExecutionResult) => void;
    onViewLogs: (caseId: number) => void;
    onExecuteCase: (id: number, style?: 'default' | 'alt' | 'ui-auto') => void;  // 🆕 执行用例，可选择样式（新增ui-auto）
    // 分页相关（可选，供表格视图使用）
    pagination?: PaginationInfo;
    onPageChange?: (page: number, pageSize: number) => void;
    // 🆕 UI自动化测试执行状态
    runningTestId?: number | null;
}
