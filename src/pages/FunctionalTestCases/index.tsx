import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Bot, Trash2, FileText, ChevronLeft, ChevronRight, Filter, BarChart3 } from 'lucide-react';
import { functionalTestCaseService } from '../../services/functionalTestCaseService';
import * as systemService from '../../services/systemService';
import { showToast } from '../../utils/toast';
import { FilterBar } from './components/FilterBar';
import { StatsBar, StatsData } from './components/StatsBar';
import { ViewSwitcher } from './components/ViewSwitcher';
import { CardView } from './views/CardView';
import { TableView } from './views/TableView';
import { KanbanView } from './views/KanbanView';
import { TimelineView } from './views/TimelineView';
import { FilterState, TestScenarioGroup, TestPointGroup, ViewMode } from './types';
import type { ExecutionResult } from '../../types/testPlan';
import { SystemOption } from '../../types/test';
import { ExecutionLogModal } from './components/ExecutionLogModal';
import { requirementDocService, RequirementDoc } from '../../services/requirementDocService';
import { Modal as AntModal, Spin } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { marked } from 'marked';
import { testService } from '../../services/testService';
import { getCaseTypeLabel } from '../../utils/caseTypeHelper';
import { Modal } from '../../components/ui/modal';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../contexts/AuthContext';  // 🆕 导入用户认证上下文
import ExecutionEngineGuide from '../../components/ExecutionEngineGuide';

// LocalStorage key for view preference
const VIEW_PREFERENCE_KEY = 'functional-test-cases-view-mode';
// LocalStorage key for filters
const FILTERS_STORAGE_KEY = 'functional-test-cases-filters';
// LocalStorage key for pagination
const PAGINATION_STORAGE_KEY = 'functional-test-cases-pagination';

export function FunctionalTestCases() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    
    // 🆕 获取当前用户信息
    const { user } = useAuth();

    // View State - 从 localStorage 读取用户偏好，默认为表格视图
    const [currentView, setCurrentView] = useState<ViewMode>(() => {
        const saved = localStorage.getItem(VIEW_PREFERENCE_KEY);
        return (saved as ViewMode) || 'table';
    });

    // 侧边栏状态
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true); // 默认收缩

    // State
    const [testCases, setTestCases] = useState<any[]>([]); // Raw flat data
    const [loading, setLoading] = useState(false);
    
    // 🔥 从 localStorage 恢复分页状态
    const [pagination, setPagination] = useState(() => {
        try {
            const saved = localStorage.getItem(PAGINATION_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    page: parsed.page || 1,
                    pageSize: parsed.pageSize || 10,
                    total: 0,
                    totalPages: 0
                };
            }
        } catch (error) {
            console.error('恢复分页状态失败:', error);
        }
        // 默认值
        return {
            page: 1,
            pageSize: 10,
            total: 0,
            totalPages: 0
        };
    });

    // 🔥 从 localStorage 恢复筛选条件
    const [filters, setFilters] = useState<FilterState>(() => {
        try {
            const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.error('恢复筛选条件失败:', error);
        }
        // 默认值
        return {
            search: '',
            system: '',
            module: '',
            source: '',
            priority: '',
            status: '',
            tag: '',
            sectionName: '',
            createdBy: '',
            startDate: '',
            endDate: '',
            riskLevel: '',
            projectVersion: '',
            caseType: '',
            executionStatus: ''
        };
    });

    const [systemOptions, setSystemOptions] = useState<SystemOption[]>([]);
    const [selectedPoints, setSelectedPoints] = useState<Set<number>>(new Set());
    
    // 🆕 动态筛选选项
    const [filterOptions, setFilterOptions] = useState<{
        systems: string[];
        modules: string[];
        scenarios: string[];
        creators: { id: number; username: string }[];
        projectVersions?: string[];  // 🆕 项目版本列表
    }>({
        systems: [],
        modules: [],
        scenarios: [],
        creators: [],
        projectVersions: []  // 🆕 初始化项目版本列表
    });

    // Modal State
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [currentLogCaseId, setCurrentLogCaseId] = useState<number | null>(null);
    
    // 🆕 需求文档详情弹窗状态
    const [requirementModalOpen, setRequirementModalOpen] = useState(false);
    const [currentRequirementDoc, setCurrentRequirementDoc] = useState<RequirementDoc | null>(null);
    const [requirementLoading, setRequirementLoading] = useState(false);

    // 🆕 UI自动化测试执行配置状态
    const [showExecutionConfig, setShowExecutionConfig] = useState(false);
    const [pendingTestCase, setPendingTestCase] = useState<any | null>(null);
    const [runningTestId, setRunningTestId] = useState<number | null>(null);
    const [executionConfig, setExecutionConfig] = useState({
        executionEngine: 'mcp' as 'mcp' | 'playwright' | 'midscene',
        enableTrace: true,
        enableVideo: true,
        environment: 'staging',
        // 🔥 新增：断言匹配策略
        assertionMatchMode: 'auto' as 'strict' | 'auto' | 'loose'
    });
    const [showEngineGuide, setShowEngineGuide] = useState(false);

    // 保存视图偏好到 localStorage
    const handleViewChange = (view: ViewMode) => {
        setCurrentView(view);
        localStorage.setItem(VIEW_PREFERENCE_KEY, view);
        // 切换视图时清空选中状态
        setSelectedPoints(new Set());
    };

    // Load Data
    const loadData = async () => {
        setLoading(true);
        try {
            const result: any = await functionalTestCaseService.getFlatList({
                page: pagination.page,
                pageSize: pagination.pageSize,
                ...filters
            });

            setTestCases(result.data || []);
            setPagination(prev => ({
                ...prev,
                total: result.pagination?.total || 0,
                totalPages: result.pagination?.totalPages || 0
            }));
        } catch (error: any) {
            showToast.error('加载数据失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Load Systems
    useEffect(() => {
        const loadSystems = async () => {
            try {
                const systems = await systemService.getActiveSystems();
                setSystemOptions(systems);
            } catch (error) {
                console.error('加载系统列表失败:', error);
            }
        };
        loadSystems();
    }, []);

    // 🆕 WebSocket初始化和清理
    useEffect(() => {
        // 初始化WebSocket连接
        const initWebSocket = async () => {
            try {
                await testService.initializeWebSocket();
                console.log('✅ WebSocket连接已初始化');
            } catch (error) {
                console.error('❌ WebSocket连接初始化失败:', error);
            }
        };
        
        initWebSocket();
        
        // 设置定期检查WebSocket连接状态
        const wsCheckInterval = setInterval(() => {
            if (!testService.isWebSocketConnected()) {
                console.log('⚠️ WebSocket连接已断开，尝试重连...');
                initWebSocket();
            }
        }, 10000); // 每10秒检查一次
        
        // 添加状态清理超时机制 - 防止状态永久卡住
        const stateCleanupTimeouts: ReturnType<typeof setTimeout>[] = [];
        
        // 监听 runningTestId 变化，设置清理超时
        if (runningTestId !== null) {
            const timeout = setTimeout(() => {
                console.warn('⚠️ 测试运行状态超时，强制清理');
                setRunningTestId(null);
            }, 10 * 60 * 1000); // 10分钟超时
            stateCleanupTimeouts.push(timeout);
        }
        
        // 清理函数
        return () => {
            clearInterval(wsCheckInterval);
            stateCleanupTimeouts.forEach(timeout => clearTimeout(timeout));
        };
    }, [runningTestId]);

    // 🆕 检查URL参数，如果有docId则自动打开需求文档详情弹窗
    useEffect(() => {
        const docId = searchParams.get('docId');
        if (docId) {
            const docIdNum = parseInt(docId);
            if (!isNaN(docIdNum)) {
                handleViewRequirementDoc(docIdNum);
                // 清除URL参数，避免刷新页面时重复弹窗
                setSearchParams({});
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 🆕 加载筛选选项（初始化时加载，数据变化时刷新）
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const options = await functionalTestCaseService.getFilterOptions();
                console.log('📋 筛选选项加载成功:', options);
                setFilterOptions(options);
            } catch (error) {
                console.error('加载筛选选项失败:', error);
            }
        };
        loadFilterOptions();
    }, []); // 初始化时加载一次
    
    // 数据变化后刷新筛选选项（删除/新增后）
    useEffect(() => {
        if (testCases.length > 0) {
            const refreshFilterOptions = async () => {
                try {
                    const options = await functionalTestCaseService.getFilterOptions();
                    // 🔥 保留当前的 projectVersions，避免被覆盖
                    setFilterOptions(prev => ({
                        ...options,
                        projectVersions: prev.projectVersions || options.projectVersions
                    }));
                } catch (error) {
                    console.error('刷新筛选选项失败:', error);
                }
            };
            refreshFilterOptions();
        }
    }, [pagination.total]); // 当总数变化时刷新（说明数据有增删）

    // Reload on filter/page change
    useEffect(() => {
        loadData();
    }, [pagination.page, pagination.pageSize, filters]);

    // 🔥 保存筛选条件到 localStorage
    useEffect(() => {
        try {
            localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
        } catch (error) {
            console.error('保存筛选条件失败:', error);
        }
    }, [filters]);

    // 🔥 保存分页状态到 localStorage
    useEffect(() => {
        try {
            localStorage.setItem(PAGINATION_STORAGE_KEY, JSON.stringify({
                page: pagination.page,
                pageSize: pagination.pageSize
            }));
        } catch (error) {
            console.error('保存分页状态失败:', error);
        }
    }, [pagination.page, pagination.pageSize]);

    // 🆕 筛选条件变化时清空选中（翻页不清空，保留跨页选择）
    useEffect(() => {
        setSelectedPoints(new Set());
    }, [filters]);

    // 🆕 监听系统变化，动态获取项目版本列表
    useEffect(() => {
        const loadProjectVersions = async () => {
            if (filters.system) {
                try {
                    console.log('📋 加载系统版本列表:', filters.system);
                    const versions = await functionalTestCaseService.getProjectVersionsBySystem(filters.system);
                    console.log('✅ 版本列表API返回:', versions);
                    console.log('✅ 版本数量:', versions.length);
                    console.log('✅ 版本代码列表:', versions.map(v => v.version_code));
                    
                    const versionCodes = versions.map(v => v.version_code);
                    const versionNames = versions.map(v => v.version_name || v.version_code);
                    console.log('🔍 准备更新的版本代码数组:', versionCodes);
                    console.log('🔍 准备更新的版本名称数组:', versionNames);
                    
                    setFilterOptions(prev => {
                        const newOptions = {
                            ...prev,
                            projectVersions: versionNames  // � 使p用版本名称而不是版本代码
                        };
                        console.log('🔍 更新后的 filterOptions:', newOptions);
                        return newOptions;
                    });
                } catch (error) {
                    console.error('❌ 加载系统版本列表失败:', error);
                    setFilterOptions(prev => ({
                        ...prev,
                        projectVersions: []
                    }));
                }
            } else {
                // 清空系统时，清空版本列表和版本筛选
                setFilterOptions(prev => ({
                    ...prev,
                    projectVersions: []
                }));
                setFilters(prev => ({
                    ...prev,
                    projectVersion: ''
                }));
            }
        };
        loadProjectVersions();
    }, [filters.system]); // 仅监听系统变化

    // 计算统计数据
    const stats: StatsData = useMemo(() => {
        if (!testCases || testCases.length === 0) {
            return { 
                scenarios: 0, 
                testPoints: 0, 
                testCases: 0, 
                aiCount: 0, 
                manualCount: 0,
                avgCasesPerScenario: 0,
                aiPercentage: 0,
                manualPercentage: 0,
                targetAchievement: 0
            };
        }

        const scenarioSet = new Set<string>();
        const testPointSet = new Set<string>();
        const testCaseSet = new Set<number>();
        let aiCount = 0;
        let manualCount = 0;

        testCases.forEach(row => {
            if (row.section_name || row.tags) {
                scenarioSet.add(row.section_name || row.tags);
            }
            if (row.test_point_name) {
                testPointSet.add(row.test_point_name);
            }
            if (row.id) {
                testCaseSet.add(row.id);
            }
            if (row.source === 'AI_GENERATED') {
                aiCount++;
            } else {
                manualCount++;
            }
        });

        const scenarioCount = scenarioSet.size;
        const caseCount = testCaseSet.size;

        return {
            scenarios: scenarioCount,
            testPoints: testPointSet.size,
            testCases: caseCount,
            aiCount,
            manualCount,
            avgCasesPerScenario: scenarioCount > 0 ? Math.round((caseCount / scenarioCount) * 10) / 10 : 0,
            aiPercentage: caseCount > 0 ? Math.round((aiCount / caseCount) * 100) : 0,
            manualPercentage: caseCount > 0 ? Math.round((manualCount / caseCount) * 100) : 0,
            targetAchievement: scenarioCount > 0 ? Math.min(100, Math.round(((caseCount / scenarioCount) / 3) * 100)) : 0
        };
    }, [testCases]);

    // Organize Data: Scenario -> Point -> Case
    const organizedData = useMemo(() => {
        if (!testCases || testCases.length === 0) return [];

        const scenarioMap = new Map<string, TestScenarioGroup>();

        testCases.forEach((row) => {
            // 1. Identify Scenario
            // Assuming 'tags' or 'section_name' identifies the scenario. 
            // If tags is an array string "['Scenario A']", we might need to parse it.
            // For now, using tags as string or '未分类'.
            const scenarioName = row.tags || '未分类';
            const scenarioId = scenarioName; // Use name as ID for now if no specific ID

            if (!scenarioMap.has(scenarioId)) {
                scenarioMap.set(scenarioId, {
                    id: scenarioId,
                    name: scenarioName,
                    description: '', // Scenario description might not be in flat list row
                    testPoints: [],
                    progress: 0
                });
            }
            const scenario = scenarioMap.get(scenarioId)!;

            // 2. Identify Test Point
            const pointId = row.test_point_id;
            let point = scenario.testPoints.find(p => p.id === pointId);

            if (!point) {
                point = {
                    id: pointId,
                    test_point_index: row.test_point_index,
                    test_point_name: row.test_point_name || '未命名测试点',
                    test_purpose: row.test_purpose,
                    steps: row.test_point_steps || '',
                    expected_result: row.test_point_expected_result || '',
                    risk_level: row.test_point_risk_level || 'medium',
                    testCases: [],
                    progress: 0
                };
                scenario.testPoints.push(point);
            }

            // 3. Add Test Case
            // Check if case already exists (unlikely in flat list unless duplicate rows)
            if (!point.testCases.some(tc => tc.id === row.id)) {
                point.testCases.push({
                    id: row.id,
                    name: row.name || '未命名用例',
                    description: row.description,
                    system: row.system || '',
                    module: row.module || '',
                    priority: row.priority || 'medium',
                    status: row.status || 'DRAFT',
                    executionStatus: row.execution_status || 'pending', // Assuming backend returns execution_status
                    lastRun: row.last_run,
                    logs: row.execution_logs || [], // Assuming backend returns logs
                    created_at: row.created_at,
                    users: row.users
                });
            }
        });

        // Calculate Progress
        const scenarios = Array.from(scenarioMap.values());
        scenarios.forEach(scenario => {
            let scenarioTotalCases = 0;
            let scenarioCompletedCases = 0;

            scenario.testPoints.forEach(point => {
                const total = point.testCases.length;
                // Usually 'pass' is 100%, 'fail' is also executed. 
                // Let's count 'pass', 'fail', 'block' as executed.
                const executed = point.testCases.filter(tc => ['pass', 'fail', 'block'].includes(tc.executionStatus)).length;

                point.progress = total > 0 ? Math.round((executed / total) * 100) : 0;

                scenarioTotalCases += total;
                scenarioCompletedCases += executed;
            });

            scenario.progress = scenarioTotalCases > 0 ? Math.round((scenarioCompletedCases / scenarioTotalCases) * 100) : 0;
        });

        return scenarios;
    }, [testCases]);

    // Handlers
    const handleBatchDelete = async () => {
        if (selectedPoints.size === 0) {
            showToast.warning('请选择要删除的测试用例');
            return;
        }

        AntModal.confirm({
            title: '批量删除测试用例',
            content: `确定要删除选中的 ${selectedPoints.size} 个测试用例吗？此操作不可恢复。`,
            okText: '确认删除',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                try {
                    await functionalTestCaseService.batchDelete(Array.from(selectedPoints));
                    showToast.success(`已删除 ${selectedPoints.size} 个测试用例`);
                    loadData();
                    setSelectedPoints(new Set());
                } catch (error: any) {
                    showToast.error(error.message || '批量删除失败');
                }
            }
        });
    };

    const handleToggleSelectPoint = (pointId: number) => {
        const newSelected = new Set(selectedPoints);
        if (newSelected.has(pointId)) {
            newSelected.delete(pointId);
        } else {
            newSelected.add(pointId);
        }
        setSelectedPoints(newSelected);
    };

    // 🆕 批量选择/取消选择
    const handleBatchSelectPoints = (pointIds: number[], selected: boolean) => {
        const newSelected = new Set(selectedPoints);
        if (selected) {
            pointIds.forEach(id => newSelected.add(id));
        } else {
            pointIds.forEach(id => newSelected.delete(id));
        }
        setSelectedPoints(newSelected);
    };

    // 查看详情 - 跳转到详情页面
    const handleViewDetail = (id: number) => {
        navigate(`/functional-test-cases/${id}/detail`);
    };

    // 编辑用例 - 跳转到编辑页面
    const handleEditCase = (id: number) => {
        navigate(`/functional-test-cases/${id}/edit`);
    };

    const handleDeleteCase = async (id: number) => {
        AntModal.confirm({
            title: '删除测试用例',
            content: `确定要删除测试用例 ID: ${id} 吗？此操作不可恢复。`,
            okText: '确认删除',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                try {
                    await functionalTestCaseService.delete(id);
                    showToast.success(`测试用例已删除`);
                    loadData();
                } catch (error: any) {
                    showToast.error('删除失败: ' + error.message);
                }
            }
        });
    };

    // 🆕 复制测试用例 - 跳转到新建页面，预填充原用例数据
    const handleCopyCase = (id: number) => {
        navigate(`/functional-test-cases/create?copyFrom=${id}`);
    };

    const handleEditPoint = (point: TestPointGroup) => {
        // For now, we edit the first case of the point or just open a modal?
        // Since points are tied to cases, maybe we just pick one case to edit context?
        // Or maybe we need a specific Point Edit Modal.
        // Reusing handleEditCase for the first case for now as fallback.
        if (point.testCases.length > 0) {
            handleEditCase(point.testCases[0].id);
        }
    };

    const handleDeletePoint = async (pointId: number, pointName: string) => {
        AntModal.confirm({
            title: '删除测试点',
            content: `确定要删除 "${pointName}" 吗？此操作不可恢复。`,
            okText: '确认删除',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                try {
                    await functionalTestCaseService.batchDelete([pointId]);
                    showToast.success('测试点已删除');
                    loadData();
                } catch (error: any) {
                    showToast.error('删除失败: ' + error.message);
                }
            }
        });
    };

    // 🆕 查看需求文档详情
    const handleViewRequirementDoc = async (docId: number) => {
        setRequirementModalOpen(true);
        setRequirementLoading(true);
        
        try {
            const doc = await requirementDocService.getById(docId);
            setCurrentRequirementDoc(doc);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            showToast.error('加载需求文档失败: ' + errorMessage);
            setRequirementModalOpen(false);
        } finally {
            setRequirementLoading(false);
        }
    };

    // 格式化日期
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleUpdateExecutionStatus = async (caseId: number, status: ExecutionResult) => {
        try {
            // Optimistic update
            setTestCases(prev => prev.map(tc => tc.id === caseId ? { ...tc, execution_status: status } : tc));

            await functionalTestCaseService.update(caseId, { executionStatus: status });
            showToast.success('执行状态已更新');
            // No need to reload data if optimistic update is enough, but for consistency:
            // loadData(); 
        } catch (error: any) {
            showToast.error('更新状态失败: ' + error.message);
            loadData(); // Revert on error
        }
    };

    const handleViewLogs = (caseId: number) => {
        setCurrentLogCaseId(caseId);
        setLogModalOpen(true);
    };

    // 执行用例 - 跳转到执行页面或显示UI自动化执行配置
    const handleExecuteCase = (id: number, style: 'default' | 'alt' | 'ui-auto' = 'default') => {
        if (style === 'ui-auto') {
            // UI自动化测试 - 显示执行配置对话框
            handleRunUITest(id);
        } else if (style === 'alt') {
            navigate(`/functional-test-cases/${id}/execute-alt`);
        } else {
            navigate(`/functional-test-cases/${id}/execute`);
        }
    };

    // 🆕 运行UI自动化测试 - 显示执行配置对话框
    const handleRunUITest = async (caseId: number) => {
        if (runningTestId) {
            showToast.warning('已有测试在运行中，请等待完成');
            return;
        }

        // 查找测试用例详情
        const testCase = testCases.find(tc => tc.id === caseId);
        if (!testCase) {
            showToast.error('未找到测试用例');
            return;
        }

        // 显示执行配置对话框
        setPendingTestCase(testCase);
        setShowExecutionConfig(true);
    };

    // 🆕 确认执行UI自动化测试（带配置）
    const handleConfirmRunUITest = async () => {
        if (!pendingTestCase) return;

        setRunningTestId(pendingTestCase.id);
        setShowExecutionConfig(false);
        
        try {
            console.log(`🚀 开始执行UI自动化测试: ${pendingTestCase.name}`);
            console.log(`   执行引擎: ${executionConfig.executionEngine}`);
            console.log(`   Trace录制: ${executionConfig.enableTrace ? '启用' : '禁用'}`);
            console.log(`   Video录制: ${executionConfig.enableVideo ? '启用' : '禁用'}`);
            
            try {
                // 🔥 步骤1: 将功能用例信息转换为标准测试用例格式（使用与导入功能用例相同的转换逻辑）
                // 🔥 调试日志：查看功能用例的实际数据结构
                console.log('🔍 [UI自动化测试] 原始数据:', pendingTestCase);
                console.log('  - name:', pendingTestCase.name);
                console.log('  - steps:', pendingTestCase.steps);
                console.log('  - test_point_steps:', pendingTestCase.test_point_steps);
                console.log('  - expected_result:', pendingTestCase.expected_result);
                console.log('  - test_point_expected_result:', pendingTestCase.test_point_expected_result);
                console.log('  - assertions:', pendingTestCase.assertions);
                console.log('  - project_version:', pendingTestCase.project_version);
                console.log('  - project_version_id:', pendingTestCase.project_version_id);

                // 优先级映射
                const priorityMap: { [key: string]: 'high' | 'medium' | 'low' } = {
                    'HIGH': 'high',
                    'CRITICAL': 'high',
                    'MEDIUM': 'medium',
                    'LOW': 'low',
                    'high': 'high',
                    'medium': 'medium',
                    'low': 'low'
                };

                // 状态映射
                const statusMap: { [key: string]: 'active' | 'draft' | 'disabled' } = {
                    'PUBLISHED': 'active',
                    'DRAFT': 'draft',
                    'ARCHIVED': 'disabled',
                    'active': 'active',
                    'draft': 'draft',
                    'disabled': 'disabled'
                };

                // 🔥 处理步骤和预期结果：将每个步骤与对应的预期结果配对
                // 尝试多种可能的字段名
                const rawSteps = pendingTestCase.test_point_steps || pendingTestCase.steps || '';
                const rawExpectedResults = pendingTestCase.test_point_expected_result || pendingTestCase.expected_result || pendingTestCase.assertions || '';
                
                console.log('🔍 [UI自动化测试] 提取结果:', {
                    rawSteps,
                    rawExpectedResults
                });
                
                let formattedSteps = '';
                let lastExpectedResult = '';
                
                if (rawSteps && rawExpectedResults) {
                    // 按行分割步骤和预期结果
                    const stepLines = rawSteps.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                    const expectedLines = rawExpectedResults.split('\n').map((e: string) => e.trim()).filter((e: string) => e.length > 0);
                    
                    console.log('🔍 [UI自动化测试] 分割后:', {
                        stepLines,
                        expectedLines,
                        stepCount: stepLines.length,
                        expectedCount: expectedLines.length
                    });
                    
                    // 将每个步骤与对应的预期结果配对
                    const pairedLines: string[] = [];
                    for (let i = 0; i < stepLines.length; i++) {
                        const step = stepLines[i];
                        // 移除步骤前面的序号（如 "1. ", "1、", "1）"等）
                        const cleanStep = step.replace(/^\d+[.、)]\s*/, '');
                        
                        if (i < expectedLines.length) {
                            const expected = expectedLines[i];
                            // 移除预期结果前面的序号
                            const cleanExpected = expected.replace(/^\d+[.、)]\s*/, '');
                            pairedLines.push(`${i + 1}. ${cleanStep} -> ${cleanExpected}`);
                            
                            // 每次都更新，循环结束后 lastExpectedResult 就是最后一个
                            lastExpectedResult = cleanExpected;
                        } else {
                            // 如果预期结果不够，只保留步骤
                            pairedLines.push(`${i + 1}. ${cleanStep}`);
                        }
                    }
                    
                    formattedSteps = pairedLines.join('\n');
                    
                    console.log('🔍 [UI自动化测试] 配对结果:', {
                        pairedLines,
                        lastExpectedResult
                    });
                } else if (rawSteps) {
                    // 只有步骤，没有预期结果
                    formattedSteps = rawSteps;
                }

                // 🔥 断言预期使用最后一个步骤的预期结果
                const assertions = lastExpectedResult || rawExpectedResults || pendingTestCase.assertions || '';
                
                console.log('🔍 [UI自动化测试] 最终结果:', {
                    formattedSteps,
                    assertions,
                    lastExpectedResult
                });

                // 🔥 标签处理：添加用例类型的中文标签
                const tagsList: string[] = [];
                
                // 先添加用例类型标签（中文）
                if (pendingTestCase.case_type) {
                    const caseTypeInfo = getCaseTypeLabel(pendingTestCase.case_type);
                    tagsList.push(caseTypeInfo); // 使用中文标签（如"冒烟测试"、"全量测试"）
                }

                // 🔥 获取版本信息（与导入功能用例逻辑一致）
                const projectVersion = pendingTestCase.project_version 
                    ? (pendingTestCase.project_version.version_name || pendingTestCase.project_version.version_code || String(pendingTestCase.project_version_id))
                    : undefined;

                // 创建唯一标识符（用于name前缀）
                const uniqueId = `TC_${String(pendingTestCase.id).padStart(5, '0')}`;
                
                const testCaseData: any = {
                    name: `[${uniqueId}] ${pendingTestCase.name || pendingTestCase.test_point_name || '未命名测试'}`,
                    preconditions: pendingTestCase.preconditions || '', // 🔥 前置条件
                    testData: pendingTestCase.testData || pendingTestCase.test_data || '', // 🔥 测试数据
                    steps: formattedSteps,
                    assertions: assertions,
                    priority: priorityMap[pendingTestCase.priority || pendingTestCase.test_point_risk_level || ''] || 'medium',
                    status: statusMap[pendingTestCase.status || ''] || 'active',
                    tags: tagsList,
                    system: pendingTestCase.system || '',
                    module: pendingTestCase.module || '',
                    projectVersion: projectVersion, // 🔥 新增：所属版本（与导入功能用例逻辑一致）
                    department: user?.project || undefined,
                    author: user?.accountName || user?.username || user?.email || '未知用户',
                    created: new Date().toISOString().split('T')[0],
                    lastRun: '',
                    success_rate: 0
                };

                console.log('📋 [UI自动化测试] 步骤1 - 转换功能用例数据:', {
                    originalId: pendingTestCase.id,
                    uniqueId,
                    name: testCaseData.name,
                    stepsLength: testCaseData.steps.length,
                    assertionsLength: testCaseData.assertions.length,
                    formattedSteps,
                    assertions,
                    projectVersion: testCaseData.projectVersion // 🔥 新增：记录版本信息
                });

                // 🔥 步骤2: 检查是否已存在对应的临时测试用例
                console.log('📋 [UI自动化测试] 步骤2 - 检查是否存在临时测试用例...');
                let temporaryTestCaseId: number;
                
                try {
                    // 通过name前缀搜索已存在的临时测试用例
                    const existingCases = await testService.getTestCasesPaginated({
                        page: 1,
                        pageSize: 10,
                        search: `[${uniqueId}]`,  // 通过name前缀搜索（如：[TC_00002]）
                        tag: '',
                        priority: '',
                        status: '',
                        system: ''
                    });

                    if (existingCases.data && existingCases.data.length > 0) {
                        // 找到已存在的临时测试用例，更新它
                        const existingCase = existingCases.data[0];
                        temporaryTestCaseId = existingCase.id;
                        
                        console.log(`♻️ [UI自动化测试] 发现已存在的临时测试用例 ID: ${temporaryTestCaseId}，将更新数据`);
                        
                        // 更新测试用例数据（保持最新）
                        await testService.updateTestCase(temporaryTestCaseId, testCaseData);
                        console.log(`✅ [UI自动化测试] 临时测试用例已更新`);
                    } else {
                        // 不存在，创建新的临时测试用例
                        console.log('📋 [UI自动化测试] 未找到已存在的临时测试用例，创建新的...');
                        const createdTestCase = await testService.createTestCase(testCaseData);
                        temporaryTestCaseId = createdTestCase.id;
                        console.log(`✅ [UI自动化测试] 临时测试用例已创建，ID: ${temporaryTestCaseId}`);
                    }
                } catch (error) {
                    // 如果查询失败，直接创建新的
                    console.warn('⚠️ [UI自动化测试] 查询失败，直接创建新的临时测试用例:', error);
                    const createdTestCase = await testService.createTestCase(testCaseData);
                    temporaryTestCaseId = createdTestCase.id;
                    console.log(`✅ [UI自动化测试] 临时测试用例已创建，ID: ${temporaryTestCaseId}`);
                }

                // 🔥 步骤3: 启动WebSocket监听器
                const listenerId = `test-run-${temporaryTestCaseId}`;
                
                testService.addMessageListener(listenerId, (message) => {
                    console.log(`📣 [FunctionalTestCase] 收到WebSocket消息:`, message);
                    
                    if (message.type === 'test_complete') {
                        console.log(`✅ 收到测试完成通知，重置状态:`, message);
                        setRunningTestId(null);
                        testService.removeMessageListener(listenerId);
                        
                        const status = message.data?.status || 'completed';
                        if (status === 'failed' || status === 'error') {
                            showToast.error(`测试执行失败`);
                        } else if (status === 'cancelled') {
                            showToast.warning(`测试执行被取消`);
                        } else {
                            showToast.success(`测试执行成功`);
                        }
                        
                        loadData();
                    } else if (message.type === 'test_error') {
                        console.log(`❌ 收到测试错误通知，重置状态:`, message);
                        setRunningTestId(null);
                        testService.removeMessageListener(listenerId);
                        showToast.error(`❌ 测试执行出错: ${pendingTestCase.name}`);
                        loadData();
                    }
                });
                
                // 🔥 步骤4: 执行临时测试用例
                console.log(`📋 [UI自动化测试] 步骤3 - 执行测试用例 ID: ${temporaryTestCaseId}`);
                const response = await testService.runTestCase(temporaryTestCaseId, {
                    executionEngine: executionConfig.executionEngine,
                    enableTrace: executionConfig.enableTrace,
                    enableVideo: executionConfig.enableVideo,
                    environment: executionConfig.environment,
                    assertionMatchMode: executionConfig.assertionMatchMode // 🔥 新增：传递断言匹配策略
                });
                
                // showToast.info(`✅ 测试开始执行: ${pendingTestCase.name}\n运行ID: ${response.runId}\n引擎: ${executionConfig.executionEngine === 'playwright' ? 'Playwright Test Runner' : 'MCP 客户端'}`);
                // showToast.info(`✅ 开始执行: ${pendingTestCase.name}`);
                showToast.info(`测试执行开始`);
                console.log('✅ [UI自动化测试] 测试运行ID:', response.runId);
                console.log(`💡 [UI自动化测试] 提示: 临时测试用例ID ${temporaryTestCaseId} 已创建，执行完成后可在测试用例列表中查看或删除`);
                
                navigate(`/test-runs/${response.runId}/detail`, {
                  state: { 
                    from: '/functional-test-cases',
                    caseName: pendingTestCase.name 
                  }
                });
            } catch (error: any) {
                setRunningTestId(null);
                throw new Error(error.message || '启动测试失败');
            }
            
        } catch (error: any) {
            console.error('执行测试失败:', error);
            showToast.error(`❌ 执行测试失败: ${error.message}`);
            setRunningTestId(null);
        } finally {
            setPendingTestCase(null);
        }
    };

    // 视图组件的通用属性
    const viewProps = {
        testCases,
        organizedData,
        loading,
        selectedPoints,
        onToggleSelectPoint: handleToggleSelectPoint,
        onBatchSelectPoints: handleBatchSelectPoints,  // 🆕 批量选择
        onViewDetail: handleViewDetail,  // 🆕 查看详情
        onEditCase: handleEditCase,
        onDeleteCase: handleDeleteCase,
        onCopyCase: handleCopyCase,  // 🆕 复制用例
        onEditPoint: handleEditPoint,
        onDeletePoint: handleDeletePoint,
        onUpdateExecutionStatus: handleUpdateExecutionStatus,
        onViewLogs: handleViewLogs,
        onExecuteCase: handleExecuteCase,  // 🆕 执行用例
        runningTestId  // 🆕 传递正在运行的测试ID
    };

    // 处理表格视图的分页变化
    const handleTablePageChange = (page: number, pageSize: number) => {
        setPagination(prev => ({ ...prev, page, pageSize }));
    };

    // 渲染当前视图
    const renderCurrentView = () => {
        switch (currentView) {
            case 'card':
                return <CardView {...viewProps} />;
            case 'table':
                return (
                    <TableView 
                        {...viewProps} 
                        pagination={pagination}
                        onPageChange={handleTablePageChange}
                    />
                );
            case 'kanban':
                return <KanbanView {...viewProps} />;
            case 'timeline':
                return <TimelineView {...viewProps} />;
            default:
                return (
                    <TableView 
                        {...viewProps} 
                        pagination={pagination}
                        onPageChange={handleTablePageChange}
                    />
                );
        }
    };

    return (
        <div className="w-full min-h-screen bg-gray-50/50 relative">
            {/* 右侧抽屉 - 可收缩的侧边栏 */}
            <div 
                className={`fixed right-0 top-0 bottom-0 bg-white border-l border-gray-200 shadow-lg transition-all duration-300 z-40 ${
                    isSidebarCollapsed ? 'translate-x-full' : 'translate-x-0'
                }`}
                style={{ width: '280px' }}
            >
                <div className="h-full flex flex-col p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <Filter className="w-4 h-4" />
                            快捷面板
                        </h3>
                        <button
                            onClick={() => setIsSidebarCollapsed(true)}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            title="收起侧边栏"
                            aria-label="收起侧边栏"
                        >
                            <ChevronRight className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>

                    {/* 侧边栏内容 */}
                    <div className="flex-1 overflow-y-auto space-y-4">
                        {/* 快速统计 */}
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <BarChart3 className="w-4 h-4 text-blue-600" />
                                <h4 className="text-sm font-semibold text-gray-900">统计概览</h4>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">测试场景</span>
                                    <span className="font-semibold text-blue-600">{stats.scenarios}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">测试点</span>
                                    <span className="font-semibold text-blue-600">{stats.testPoints}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">测试用例</span>
                                    <span className="font-semibold text-blue-600">{stats.testCases}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                                    <span className="text-gray-600">AI生成</span>
                                    <span className="font-semibold text-purple-600">{stats.aiCount}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">手动创建</span>
                                    <span className="font-semibold text-green-600">{stats.manualCount}</span>
                                </div>
                            </div>
                        </div>

                        {/* 快捷操作 */}
                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">快捷操作</h4>
                            <button
                                onClick={() => navigate('/functional-test-cases/generator')}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all"
                            >
                                <Bot className="w-4 h-4" />
                                AI 生成器
                            </button>
                            <button
                                onClick={() => navigate('/functional-test-cases/create')}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-white text-gray-700 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                快速创建
                            </button>
                            {selectedPoints.size > 0 && (
                                <button
                                    onClick={handleBatchDelete}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    批量删除 ({selectedPoints.size})
                                </button>
                            )}
                        </div>

                        {/* 选中状态 */}
                        {selectedPoints.size > 0 && (
                            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                                <div className="text-sm text-blue-900 font-medium">
                                    已选择 {selectedPoints.size} 项
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 右侧抽屉收缩时的打开按钮 */}
            {isSidebarCollapsed && (
                <button
                    onClick={() => setIsSidebarCollapsed(false)}
                    className="fixed right-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 shadow-lg rounded-l-lg p-2 hover:bg-gray-50 transition-all z-40"
                    title="展开侧边栏"
                    aria-label="展开侧边栏"
                >
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
            )}

            {/* 主内容区域 */}
            <div 
                className={`transition-all duration-300 ${
                    isSidebarCollapsed ? 'mr-0' : 'mr-[280px]'
                }`}
            >
                {/* 内容区域 */}
                <div className="p-0">
                    {/* View Switcher and Filter Bar */}
                    <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <ViewSwitcher currentView={currentView} onViewChange={handleViewChange} />

                        {/* <div className="text-sm text-gray-500">
                            共 {pagination.total} 个测试用例
                        </div> */}
                        <div className="flex gap-3">
                            {selectedPoints.size > 0 && (
                                <button
                                    onClick={handleBatchDelete}
                                    className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all shadow-sm hover:shadow-md"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    批量删除 ({selectedPoints.size})
                                </button>
                            )}
                            <button
                                onClick={() => navigate('/functional-test-cases/generator')}
                                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-sm hover:shadow-md"
                            >
                                <Bot className="w-4 h-4 mr-2" />
                                AI 生成器
                            </button>
                            {/* <button
                                onClick={() => navigate('/functional-test-cases/create-simple')}
                                className="inline-flex items-center px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200 shadow-sm"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                快速创建
                            </button> */}
                            <button
                                onClick={() => navigate('/functional-test-cases/create')}
                                className="inline-flex items-center px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200 shadow-sm"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                快速创建
                            </button>
                        </div>
                        
                    </div>

                    {/* 统计栏 */}
                    <StatsBar stats={stats} total={pagination.total} />

                    {/* Filter Bar */}
                    <FilterBar
                        filters={filters}
                        setFilters={setFilters}
                        onSearch={() => setPagination(prev => ({ ...prev, page: 1 }))}
                        onReset={() => {
                            setFilters({
                                search: '', system: '', module: '', source: '', priority: '', status: '', tag: '',
                                sectionName: '', createdBy: '', startDate: '', endDate: '', riskLevel: '', projectVersion: '', caseType: '', executionStatus: ''
                            });
                            setPagination(prev => ({ ...prev, page: 1 }));
                        }}
                        systemOptions={systemOptions}
                        filterOptions={filterOptions}
                    />

                    {/* Content - 渲染当前视图 */}
                    <div className="mt-6">
                        {renderCurrentView()}
                    </div>

                    {/* Pagination - 仅在卡片、看板和时间线视图显示（表格视图自带分页） */}
                    {(currentView === 'card' || currentView === 'kanban' || currentView === 'timeline') && pagination.total > 0 && (
                        <div className="mt-8 flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <div className="text-sm text-gray-500">
                                显示 {((pagination.page - 1) * pagination.pageSize) + 1} 到 {Math.min(pagination.page * pagination.pageSize, pagination.total)} 条，共 {pagination.total} 条结果
                            </div>
                            <div className="flex gap-2">
                                <button
                                    disabled={pagination.page === 1}
                                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    上一页
                                </button>
                                <button
                                    disabled={pagination.page === pagination.totalPages}
                                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    下一页
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Execution Log Modal */}
                    {logModalOpen && currentLogCaseId && (
                        <ExecutionLogModal
                            isOpen={logModalOpen}
                            onClose={() => setLogModalOpen(false)}
                            caseId={currentLogCaseId}
                        />
                    )}

                    {/* 🆕 UI自动化测试执行配置对话框 */}
                    <Modal
                        isOpen={showExecutionConfig}
                        onClose={() => {
                            setShowExecutionConfig(false);
                            setPendingTestCase(null);
                        }}
                        title="UI自动化测试执行配置"
                        size="lg"
                    >
                        <div className="space-y-4">
                            {pendingTestCase && (
                                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                                    <p className="text-sm text-gray-600">测试用例</p>
                                    <p className="font-medium text-gray-900">{pendingTestCase.name}</p>
                                    {pendingTestCase.test_point_name && (
                                        <p className="text-sm text-gray-500 mt-1">测试点: {pendingTestCase.test_point_name}</p>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <span className="flex items-center gap-2">
                                        执行引擎
                                        <QuestionCircleOutlined 
                                            className="text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
                                            onClick={() => setShowEngineGuide(true)}
                                            title="查看执行引擎选择指南"
                                        />
                                    </span>
                                </label>
                                <select
                                    value={executionConfig.executionEngine}
                                    onChange={(e) => setExecutionConfig(prev => ({ 
                                        ...prev, 
                                        executionEngine: e.target.value as 'mcp' | 'playwright' | 'midscene'
                                    }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="mcp">MCP 客户端（AI驱动，适应性强）</option>
                                    <option value="midscene">Midscene Runner（AI视觉识别，智能定位）</option>
                                    <option value="playwright">Playwright Runner（高性能，推荐）</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-500">
                                    {executionConfig.executionEngine === 'mcp' 
                                        ? '🤖 AI实时解析，动态适应页面变化'
                                        : '⚡ 原生API执行，速度快5-10倍，成本低95%'}
                                </p>
                            </div>

                            {executionConfig.executionEngine === 'playwright' && (
                                <>
                                    <div className="flex items-center space-x-3">
                                        <input
                                            type="checkbox"
                                            id="enableTrace"
                                            checked={executionConfig.enableTrace}
                                            onChange={(e) => setExecutionConfig(prev => ({ 
                                                ...prev, 
                                                enableTrace: e.target.checked 
                                            }))}
                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <label htmlFor="enableTrace" className="text-sm font-medium text-gray-700">
                                            启用 Trace 录制
                                        </label>
                                    </div>
                                    <p className="ml-7 text-xs text-gray-500">
                                        录制测试执行过程，可在 trace.playwright.dev 查看
                                    </p>

                                    <div className="flex items-center space-x-3">
                                        <input
                                            type="checkbox"
                                            id="enableVideo"
                                            checked={executionConfig.enableVideo}
                                            onChange={(e) => setExecutionConfig(prev => ({ 
                                                ...prev, 
                                                enableVideo: e.target.checked 
                                            }))}
                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <label htmlFor="enableVideo" className="text-sm font-medium text-gray-700">
                                            启用 Video 录制
                                        </label>
                                    </div>
                                    <p className="ml-7 text-xs text-gray-500">
                                        录制测试执行视频，用于调试和回放
                                    </p>
                                </>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    执行环境
                                </label>
                                <select
                                    value={executionConfig.environment}
                                    onChange={(e) => setExecutionConfig(prev => ({ 
                                        ...prev, 
                                        environment: e.target.value 
                                    }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="staging">Staging</option>
                                    <option value="production">Production</option>
                                    <option value="development">Development</option>
                                </select>
                            </div>

                            {/* 🔥 新增：断言匹配策略 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    断言匹配策略
                                </label>
                                <select
                                    value={executionConfig.assertionMatchMode}
                                    onChange={(e) => setExecutionConfig(prev => ({ 
                                        ...prev, 
                                        assertionMatchMode: e.target.value as 'auto' | 'strict' | 'loose'
                                    }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="auto">智能匹配（推荐）</option>
                                    <option value="strict">严格匹配</option>
                                    <option value="loose">宽松匹配</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-500">
                                    {executionConfig.assertionMatchMode === 'auto' && '自动选择最佳匹配策略，平衡准确性和灵活性'}
                                    {executionConfig.assertionMatchMode === 'strict' && '仅完全匹配，适用于精确验证'}
                                    {executionConfig.assertionMatchMode === 'loose' && '宽松匹配，包含关键词即可通过'}
                                </p>
                            </div>

                            <div className="flex justify-end space-x-3 pt-4 border-t">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setShowExecutionConfig(false);
                                        setPendingTestCase(null);
                                    }}
                                >
                                    取消
                                </Button>
                                <Button
                                    variant="default"
                                    onClick={handleConfirmRunUITest}
                                    isLoading={runningTestId === pendingTestCase?.id}
                                >
                                    开始执行
                                </Button>
                            </div>
                        </div>
                    </Modal>

                    {/* 🆕 需求文档详情弹窗 */}
                    <AntModal
                        title={
                            <div className="flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-600" />
                                <span>需求文档详情</span>
                                {currentRequirementDoc && (
                                    <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">
                                        #{currentRequirementDoc.id}
                                    </span>
                                )}
                            </div>
                        }
                        open={requirementModalOpen}
                        onCancel={() => {
                            setRequirementModalOpen(false);
                            setCurrentRequirementDoc(null);
                        }}
                        footer={null}
                        width={1200}
                        centered
                        styles={{
                            content: {
                                minHeight: '95vh',
                                display: 'flex',
                                flexDirection: 'column'
                            },
                            body: {
                                flex: 1,
                                overflow: 'auto',
                                padding: '20px'
                            }
                        }}
                        className="requirement-doc-modal"
                        destroyOnHidden={true}
                    >
                        {requirementLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <Spin size="large" />
                            </div>
                        ) : currentRequirementDoc && (
                            <div className="flex flex-col gap-6 h-full">
                                {/* 文档信息 */}
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <h2 className="text-xl font-bold text-gray-900 mb-2">{currentRequirementDoc.title}</h2>
                                    <div className="flex items-center gap-4 text-sm text-gray-500">
                                        {currentRequirementDoc.project && (
                                            <span className="flex items-center gap-1">
                                                <FileText className="w-4 h-4" />
                                                {currentRequirementDoc.project.name}
                                                {currentRequirementDoc.project_version && ` / ${currentRequirementDoc.project_version.version_name}`}
                                            </span>
                                        )}
                                        {currentRequirementDoc.users && (
                                            <span className="flex items-center gap-1">
                                                <span>👤</span>
                                                {currentRequirementDoc.users.username}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <span>📅</span>
                                            {formatDate(currentRequirementDoc.created_at)}
                                        </span>
                                    </div>
                                </div>
                                
                                {/* 需求文档内容 */}
                                <div className="flex-1 flex flex-col min-h-0">
                                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2 flex-shrink-0">
                                        <FileText className="w-4 h-4" />
                                        需求文档内容
                                        <span className="text-xs text-gray-400 font-normal ml-2">
                                            {currentRequirementDoc.content?.length || 0} 字 · {currentRequirementDoc.content?.split('\n').length || 0} 行
                                        </span> 
                                    </h3>
                                    <div 
                                        className="bg-white border border-gray-200 rounded-lg p-6 flex-1 overflow-y-auto"
                                        style={{ minHeight: '400px', maxHeight: 'calc(95vh - 250px)' }}
                                    >
                                        <div
                                            className="prose prose-slate max-w-none prose-sm
                                                prose-headings:text-gray-900
                                                prose-h1:text-2xl prose-h1:font-bold prose-h1:mb-4 prose-h1:border-b prose-h1:border-gray-200 prose-h1:pb-2
                                                prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-6 prose-h2:mb-3 prose-h2:text-blue-700
                                                prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-2
                                                prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-3
                                                prose-ul:my-3 prose-ol:my-3
                                                prose-li:text-gray-700 prose-li:my-1
                                                prose-strong:text-gray-900
                                                prose-table:w-full prose-table:border-collapse prose-table:text-sm prose-table:my-4
                                                prose-thead:bg-blue-50
                                                prose-th:border prose-th:border-gray-300 prose-th:p-2 prose-th:text-left prose-th:font-semibold
                                                prose-td:border prose-td:border-gray-300 prose-td:p-2
                                            "
                                            dangerouslySetInnerHTML={{ __html: marked.parse(currentRequirementDoc.content || '') as string }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </AntModal>

                    {/* 执行引擎选择指南 */}
                    <ExecutionEngineGuide 
                        visible={showEngineGuide}
                        onClose={() => setShowEngineGuide(false)}
                    />
                </div>
            </div>
        </div>
    );
}
