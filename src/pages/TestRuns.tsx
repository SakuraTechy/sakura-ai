import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Activity,
  Terminal,
  RefreshCw,
  Square,
  AlertTriangle,
  StopCircle,
  Trash2,
  LayoutGrid,
  Table2,
  ChevronLeft,
  ChevronsLeft,
  ChevronRight as ChevronRightIcon,
  ChevronsRight,
  Search,
  Filter,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';

// 🔥 引入测试服务
import { testService } from '../services/testService';
import { showToast } from '../utils/toast';
import { LiveView } from '../components/LiveView';
import { EvidenceViewer } from '../components/EvidenceViewer';
import { QueueStatus } from '../components/QueueStatus';
import { TestRunsTable } from '../components/TestRunsTable';
import { TestRunsDetailedTable } from '../components/TestRunsDetailedTable';

// 🔥 使用真实的测试运行接口
interface TestRun {
  id: string;
  testCaseId: number;
  name: string;
  status: 'running' | 'completed' | 'failed' | 'queued' | 'cancelled';
  progress: number;
  startTime: Date;
  endTime?: Date;
  duration: string;
  totalSteps: number;
  completedSteps: number;
  passedSteps: number;
  failedSteps: number;
  executor: string;
  environment: string;
  logs: Array<{
    id: string;
    timestamp: Date;
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
    stepId?: string;
  }>;
  screenshots: string[];
  error?: string;
  // 🔥 新增：测试用例相关信息，用于筛选
  system?: string;
  module?: string;
  tags?: string[];
  priority?: 'high' | 'medium' | 'low';
  projectVersion?: string;
  startedAt?: Date; // 用于兼容
  finishedAt?: Date; // 用于兼容
}

// 🔥 新增：搜索和筛选参数接口
interface TestRunsFilterProps {
  searchTerm?: string;
  statusFilter?: string;
  resultFilter?: string;  // 🆕 执行结果筛选
  executorFilter?: string;
  environmentFilter?: string;
  systemFilter?: string; // 🔥 新增：项目筛选
  versionFilter?: string; // 🔥 新增：版本筛选
  moduleFilter?: string; // 🔥 新增：模块筛选
  tagFilter?: string; // 🔥 新增：标签筛选
  priorityFilter?: string; // 🔥 新增：优先级筛选
  hideHeader?: boolean; // 🔥 新增：是否隐藏标题
  hideStats?: boolean; // 🔥 新增：是否隐藏统计数据栏
  hideViewSwitcher?: boolean; // 🔥 新增：是否隐藏视图切换器
  externalViewMode?: 'table' | 'detailed' | 'card'; // 🔥 新增：外部控制的视图模式
  onViewModeChange?: (mode: 'table' | 'detailed' | 'card') => void; // 🔥 新增：视图模式变化回调
  onStopAllRef?: React.MutableRefObject<(() => void) | null>; // 🔥 新增：停止所有按钮的引用
  onRefreshRef?: React.MutableRefObject<(() => void) | null>; // 🔥 新增：刷新按钮的引用
  statsRef?: React.MutableRefObject<{ running: number; queued: number; completed: number; failed: number } | null>; // 🔥 新增：统计数据的引用
  stoppingAllRef?: React.MutableRefObject<boolean | null>; // 🔥 新增：停止中状态的引用
  onFilterOptionsUpdate?: (options: {
    systems: string[];
    versions: string[];
    modules: string[];
    tags: string[];
    executors: string[];
    environments: string[];
  }) => void; // 🔥 新增：筛选选项更新回调
}

// 🔥 ErrorFallback 组件移到外部，避免每次渲染时重新创建导致子组件重新挂载
const ErrorFallback = ({ 
  children, 
  onRetry 
}: { 
  children: React.ReactNode; 
  onRetry: () => void;
}) => {
  const [hasError, setHasError] = useState(false);
  
  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      console.error('捕获到全局错误:', event.error);
      setHasError(true);
    };
    
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);
  
  if (hasError) {
    return (
      <div className="p-6 bg-red-50 border-l-4 border-red-400 text-red-700 rounded-md">
        <h3 className="text-lg font-semibold mb-2">出现错误</h3>
        <p>加载测试运行数据时发生错误，请尝试刷新页面。</p>
        <button 
          onClick={() => {
            setHasError(false);
            onRetry();
          }}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          重试加载
        </button>
      </div>
    );
  }
  
  return <>{children}</>;
};

export function TestRuns({ 
  searchTerm = '', 
  statusFilter = '', 
  resultFilter = '',  // 🆕 执行结果筛选
  executorFilter = '',
  hideStats = false,
  hideViewSwitcher = false,
  externalViewMode,
  onViewModeChange, 
  environmentFilter = '',
  systemFilter = '',
  versionFilter = '',
  moduleFilter = '',
  tagFilter = '',
  priorityFilter = '',
  hideHeader = false,
  onStopAllRef,
  onRefreshRef,
  statsRef,
  stoppingAllRef,
  onFilterOptionsUpdate
}: TestRunsFilterProps = {}) {
  // 🚀 优化：移除组件渲染日志
  // console.log('🔥 [TestRuns] 组件重新渲染，时间戳:', Date.now());

  const navigate = useNavigate();
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stoppingTests, setStoppingTests] = useState<Set<string>>(new Set());
  const [showStopModal, setShowStopModal] = useState(false);
  // 🔥 新增：批量选择状态
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  // 🔥 新增：视图模式状态（卡片视图、简单表格视图、详细表格视图）
  const [internalViewMode, setInternalViewMode] = useState<'card' | 'table' | 'detailed'>(() => {
    const saved = localStorage.getItem('tr-viewMode');
    return saved === 'card' || saved === 'table' || saved === 'detailed' ? saved : 'card';
  });
  
  // 🔥 使用外部viewMode或内部viewMode
  const viewMode = externalViewMode || internalViewMode;
  const setViewMode = (mode: 'card' | 'table' | 'detailed') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };
  
  // 🔥 新增：分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeTab, setActiveTab] = useState<'logs' | 'live' | 'evidence' | 'queue'>(() => {
    const saved = localStorage.getItem('tr-activeTab');
    return saved === 'logs' || saved === 'live' || saved === 'evidence' || saved === 'queue' ? saved : 'logs';
  });
  useEffect(() => {
    localStorage.setItem('tr-activeTab', activeTab);
  }, [activeTab]);
  // 🔥 保存视图模式偏好（仅在非外部控制时）
  useEffect(() => {
    if (!externalViewMode) {
      localStorage.setItem('tr-viewMode', internalViewMode);
    }
  }, [internalViewMode, externalViewMode]);
  // 🔥 核心修复3：简化 selectedRun 同步逻辑，直接复用 testRuns 中的对象
  useEffect(() => {
    if (!selectedRun) return;

    const latest = testRuns.find(run => run.id === selectedRun.id);
    if (!latest) return;

    // 🔥 关键优化：只检查关键字段，日志已经被隔离
    const hasSignificantChange = (
      latest.status !== selectedRun.status ||
      latest.progress !== selectedRun.progress ||
      latest.completedSteps !== selectedRun.completedSteps ||
      latest.passedSteps !== selectedRun.passedSteps ||
      latest.failedSteps !== selectedRun.failedSteps
    );

    // 🔥 核心修复：只有在字段变化且对象引用也变化时才更新
    if (hasSignificantChange && latest !== selectedRun) {
      // 🔥 输出调试日志
      console.log('🔄 [TestRuns] selectedRun 更新:', {
        runId: selectedRun.id.substring(0, 8),
        statusChange: latest.status !== selectedRun.status,
        progressChange: latest.progress !== selectedRun.progress
      });

      // 🔥 直接复用 testRuns 中的对象引用
      setSelectedRun(latest);
    }
  }, [testRuns, selectedRun]);

  const [isLiveFull, setIsLiveFull] = useState(false);
  const [logLevels, setLogLevels] = useState({ info: true, success: true, warning: true, error: true });
  const [logSearch, setLogSearch] = useState('');
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const logsContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [testToStop, setTestToStop] = useState<{ id: string; name: string; isSuite: boolean } | null>(null);
  const [showStopAllModal, setShowStopAllModal] = useState(false);
  const [stoppingAll, setStoppingAll] = useState(false);
  
  // 🔥 本地搜索和筛选状态（当组件独立使用时）
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const [localStatusFilter, setLocalStatusFilter] = useState('');
  const [localResultFilter, setLocalResultFilter] = useState('');
  const [localSystemFilter, setLocalSystemFilter] = useState('');
  const [localVersionFilter, setLocalVersionFilter] = useState('');
  const [localModuleFilter, setLocalModuleFilter] = useState('');
  const [localTagFilter, setLocalTagFilter] = useState('');
  const [localPriorityFilter, setLocalPriorityFilter] = useState('');
  const [localEnvironmentFilter, setLocalEnvironmentFilter] = useState('');
  const [localExecutorFilter, setLocalExecutorFilter] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false); // 控制高级筛选显示/隐藏
  
  // 🔥 本地筛选选项（从数据中提取）
  const [localFilterOptions, setLocalFilterOptions] = useState<{
    systems: string[];
    versions: string[];
    modules: string[];
    tags: string[];
    environments: string[];
    executors: string[];
  }>({
    systems: [],
    versions: [],
    modules: [],
    tags: [],
    environments: [],
    executors: []
  });
  
  // 🔥 判断是否使用本地筛选（当没有外部传入筛选参数时使用本地状态）
  const isLocalMode = !hideHeader && !hideStats;
  const effectiveSearchTerm = isLocalMode ? localSearchTerm : searchTerm;
  const effectiveStatusFilter = isLocalMode ? localStatusFilter : statusFilter;
  const effectiveResultFilter = isLocalMode ? localResultFilter : resultFilter;
  const effectiveSystemFilter = isLocalMode ? localSystemFilter : systemFilter;
  const effectiveVersionFilter = isLocalMode ? localVersionFilter : versionFilter;
  const effectiveModuleFilter = isLocalMode ? localModuleFilter : moduleFilter;
  const effectiveTagFilter = isLocalMode ? localTagFilter : tagFilter;
  const effectivePriorityFilter = isLocalMode ? localPriorityFilter : priorityFilter;
  const effectiveEnvironmentFilter = isLocalMode ? localEnvironmentFilter : environmentFilter;
  const effectiveExecutorFilter = isLocalMode ? localExecutorFilter : executorFilter;

  // 🚀 组件挂载状态追踪
  const isMountedRef = React.useRef(true);
  
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      console.log('🧹 TestRuns组件卸载，设置挂载状态为false');
    };
  }, []);
  
  // 🔥 新增：监听筛选条件变化，重置分页到第一页
  React.useEffect(() => {
    console.log('🔍 [TestRuns] 筛选条件变化，重置分页到第一页');
    setCurrentPage(1);
  }, [
    searchTerm,
    statusFilter,
    resultFilter,
    executorFilter,
    environmentFilter,
    systemFilter,
    versionFilter,
    moduleFilter,
    tagFilter,
    priorityFilter
  ]);

  // 🔥 从后端API加载真实的测试运行数据 - 修复异步状态更新问题
  const loadTestRuns = React.useCallback(async () => {
    try {
      setLoading(true);
      // console.log('📊 正在加载测试运行数据...');
      
      // 🔥 清理停止状态 - 与实际运行状态同步
      // 这将在数据加载完成后执行
      
      // 同时尝试建立WebSocket连接
      testService.initializeWebSocket().catch(error => {
        console.warn('WebSocket连接初始化失败，将使用HTTP API轮询:', error);
      });

      // 🔥 使用 testService.getAllTestRuns() 方法，支持排序
      // 按 startedAt 降序排列，最新的测试显示在最前面
      const apiData = await testService.getAllTestRuns({
        sortBy: 'startedAt',
        sortOrder: 'desc'
      });
      
      // 🔥 调试：查看第一个测试运行的数据结构
      if (apiData && apiData.length > 0) {
        const firstRun = apiData[0] as any;
        console.log('📊 [TestRuns] API返回的第一个测试运行数据:', firstRun);
        console.log('📊 [TestRuns] 测试运行数据结构:', {
          hasSystem: !!firstRun.system,
          hasModule: !!firstRun.module,
          hasTags: !!firstRun.tags,
          hasPriority: !!firstRun.priority,
          hasProjectVersion: !!firstRun.projectVersion,
          hasTestCase: !!firstRun.testCase,
          hasCaseDetail: !!firstRun.caseDetail,
          testCaseId: firstRun.testCaseId,
          rawData: firstRun
        });
      }
      
      // 🔥 批量获取测试用例信息（如果后端没有返回）
      const testCaseIds = [...new Set((apiData || []).map((run: any) => (run as any).testCaseId).filter(Boolean))];
      const testCaseMap = new Map<number, any>();
      
      if (testCaseIds.length > 0) {
        try {
          // 批量获取测试用例信息
          const testCasePromises = testCaseIds.map(async (id: number) => {
            try {
              const testCase = await testService.getTestCaseById(id);
              return { id, testCase };
            } catch (error) {
              console.warn(`⚠️ [TestRuns] 获取测试用例 ${id} 失败:`, error);
              return null;
            }
          });
          
          const testCaseResults = await Promise.allSettled(testCasePromises);
          testCaseResults.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
              testCaseMap.set(result.value.id, result.value.testCase);
            }
          });
          
          console.log(`✅ [TestRuns] 成功获取 ${testCaseMap.size}/${testCaseIds.length} 个测试用例信息`);
        } catch (error) {
          console.error('❌ [TestRuns] 批量获取测试用例信息失败:', error);
        }
      }
      
      // 转换数据格式，确保时间字段正确
      const runs = (apiData || []).map((run: any) => {
        // 🔥 修复：优先使用 startedAt 字段，而不是 startTime
        // startedAt 是测试实际开始时间，startTime 可能不准确
        let startTime;
        let endTime;
        
        try {
          // 优先使用 startedAt，其次是 actualStartedAt，最后才是 startTime
          const startTimeField = run.startedAt || run.actualStartedAt || run.startTime;
          startTime = startTimeField ? new Date(startTimeField) : new Date(); // 使用当前时间作为默认值
          // 验证日期是否有效
          if (isNaN(startTime.getTime())) {
            startTime = new Date(); // 无效时使用当前时间
          }
        } catch {
          console.error('无效的开始时间:', run.startedAt || run.startTime);
          startTime = new Date(); // 异常时使用当前时间
        }
        
        try {
          // 优先使用 finishedAt，其次是 endedAt，最后才是 endTime
          const endTimeField = run.finishedAt || run.endedAt || run.endTime;
          endTime = endTimeField ? new Date(endTimeField) : undefined;
          // 验证日期是否有效
          if (endTime && isNaN(endTime.getTime())) {
            endTime = undefined;
          }
        } catch {
          console.error('无效的结束时间:', run.finishedAt || run.endTime);
          endTime = undefined;
        }
        
        // 补充可能缺失的字段，确保数据结构完整
        // 处理 actualStartedAt 字段
        let actualStartedAt: Date | undefined;
        try {
          const actualStartedAtField = run.actualStartedAt;
          if (actualStartedAtField) {
            actualStartedAt = actualStartedAtField instanceof Date ? actualStartedAtField : new Date(actualStartedAtField);
            if (isNaN(actualStartedAt.getTime())) {
              actualStartedAt = undefined;
            }
          }
        } catch {
          console.error('无效的 actualStartedAt:', run.actualStartedAt);
          actualStartedAt = undefined;
        }
        
        const processedRun = {
          id: run.id || `unknown-${Date.now()}`,
          testCaseId: run.testCaseId || 0,
          name: run.name || '未命名测试',
          status: run.status || 'completed',
          progress: run.progress || 0,
          // 🔥 修复：使用 startedAt 和 finishedAt 字段名，与组件保持一致
          startedAt: startTime,
          actualStartedAt: actualStartedAt,
          finishedAt: endTime,
          startTime: startTime, // 兼容旧字段
          endTime: endTime, // 兼容旧字段
          duration: run.duration || '0s',
          totalSteps: run.totalSteps || 0,
          completedSteps: run.completedSteps || 0,
          passedSteps: run.passedSteps || 0,
          failedSteps: run.failedSteps || 0,
          executor: run.executor || 'System',
          environment: run.environment || 'default',
          // 🔥 新增：从测试用例或测试运行数据中提取筛选字段
          // 优先级：1. 测试运行数据本身 2. 嵌套的testCase对象 3. 嵌套的caseDetail对象 4. 通过testCaseId获取的测试用例信息
          system: (run as any).system || (run as any).testCase?.system || (run as any).caseDetail?.system || testCaseMap.get(run.testCaseId)?.system || '',
          module: (run as any).module || (run as any).testCase?.module || (run as any).caseDetail?.module || testCaseMap.get(run.testCaseId)?.module || '',
          tags: (() => {
            const runTags = (run as any).tags || (run as any).testCase?.tags || (run as any).caseDetail?.tags;
            if (runTags) {
              return Array.isArray(runTags) ? runTags : runTags.split(',').map((t: string) => t.trim());
            }
            const testCase = testCaseMap.get(run.testCaseId);
            if (testCase?.tags) {
              return Array.isArray(testCase.tags) ? testCase.tags : testCase.tags.split(',').map((t: string) => t.trim());
            }
            return [];
          })(),
          priority: (run as any).priority || (run as any).testCase?.priority || (run as any).caseDetail?.priority || testCaseMap.get(run.testCaseId)?.priority || 'medium',
          projectVersion: (run as any).projectVersion || (run as any).testCase?.projectVersion || (run as any).caseDetail?.version || (run as any).testCase?.project_version?.version_name || testCaseMap.get(run.testCaseId)?.projectVersion || testCaseMap.get(run.testCaseId)?.project_version?.version_name || '',
          logs: (run.logs || []).map((log: any) => {
            let timestamp;
            try {
              timestamp = log.timestamp ? new Date(log.timestamp) : null;
              if (timestamp && isNaN(timestamp.getTime())) {
                timestamp = null;
              }
            } catch {
              console.error('无效的日志时间戳:', log.timestamp);
              timestamp = null;
            }
            
            return {
              id: log.id || `log-${Date.now()}-${Math.random()}`,
              timestamp,
              level: log.level || 'info',
              message: log.message || '无日志信息',
              stepId: log.stepId
            };
          }),
          screenshots: run.screenshots || []
        };
        
        return processedRun;
      });
      
      // 🔥 调试：输出处理后的数据（仅第一个）
      if (runs.length > 0) {
        const firstRun = runs[0] as any;
        console.log(`📊 [TestRuns] 处理后的第一个测试运行数据:`, {
          id: firstRun.id,
          name: firstRun.name,
          system: firstRun.system,
          module: firstRun.module,
          tags: firstRun.tags,
          priority: firstRun.priority,
          projectVersion: firstRun.projectVersion,
          testCaseId: firstRun.testCaseId
        });
      }
      
      setTestRuns(runs);
      // console.log('📊 成功加载测试运行数据:', runs.length, '条记录（已按开始时间降序排列）');
      
      // 🔥 新增：从测试运行数据中提取筛选选项
      const systems = Array.from(new Set(runs.map((run: any) => run.system).filter(Boolean))) as string[];
      const versions = Array.from(new Set(runs.map((run: any) => run.projectVersion).filter(Boolean))) as string[];
      const modules = Array.from(new Set(runs.map((run: any) => run.module).filter(Boolean))) as string[];
      const tags = Array.from(new Set(runs.flatMap((run: any) => (Array.isArray(run.tags) ? run.tags : [])).filter(Boolean))) as string[];
      const executors = Array.from(new Set(runs.map((run: any) => run.executor).filter(Boolean))) as string[];
      const environments = Array.from(new Set(runs.map((run: any) => run.environment).filter(Boolean))) as string[];
      
      console.log(`📊 [TestRuns] 提取的筛选选项:`, {
        systems: systems.length,
        versions: versions.length,
        modules: modules.length,
        tags: tags.length,
        executors: executors.length,
        environments: environments.length
      });
      
      // 🔥 更新本地筛选选项
      setLocalFilterOptions({
        systems: systems.sort(),
        versions: versions.sort(),
        modules: modules.sort(),
        tags: tags.sort(),
        environments: environments.sort(),
        executors: executors.sort()
      });
      
      // 🔥 同时通知外部（如果有回调）
      if (onFilterOptionsUpdate) {
        onFilterOptionsUpdate({
          systems: systems.sort(),
          versions: versions.sort(),
          modules: modules.sort(),
          tags: tags.sort(),
          executors: executors.sort(),
          environments: environments.sort()
        });
      }
      
      // 🔥 清理停止状态 - 只保留实际还在运行的测试
      setStoppingTests(prev => {
        const runningIds = new Set(runs
          .filter((run: any) => run.status === 'running' || run.status === 'queued')
          .map((run: any) => run.id)
        );
        
        const cleanedSet = new Set<string>();
        for (const testId of prev) {
          if (runningIds.has(testId)) {
            cleanedSet.add(testId);
          }
        }
        
        if (cleanedSet.size !== prev.size) {
          console.log(`🧹 清理了 ${prev.size - cleanedSet.size} 个无效的停止状态`);
        }
        
        return cleanedSet;
      });
    } catch (error) {
      console.error('加载测试运行失败:', error);
      if (isMountedRef.current) {
        setTestRuns([]);  // 确保在错误情况下设置为空数组
      }
    } finally {
      // 🚀 修复：只在组件挂载时更新loading状态
      if (isMountedRef.current) {
        setLoading(false);
      }
      // 🔥 标记首次加载完成，允许 WebSocket 创建新记录
      initialLoadCompleteRef.current = true;
      // 🔥 清空已创建记录集合（因为加载后会有完整数据）
      createdRunIdsRef.current.clear();
    }
  }, [onFilterOptionsUpdate]); // 依赖onFilterOptionsUpdate

  // 🔥 优化的WebSocket消息处理 - 减少不必要的状态更新
  const updateTestRunIncrementally = useCallback((message: any) => {
    if (!message) return;
    
    // 根据消息类型进行增量更新
    if (message.type === 'test_created' || message.type === 'test_update' || message.type === 'test_complete') {
      const runId = message.runId || message.data?.id;
      const updateData = message.data;
      
      if (runId && updateData) {
        setTestRuns(prevRuns => {
          const runIndex = prevRuns.findIndex(run => run.id === runId);
          if (runIndex >= 0) {
            const currentRun = prevRuns[runIndex];
            
            // 🚀 优化：只有关键字段变化才更新
            const hasSignificantChange = 
              currentRun.status !== updateData.status ||
              currentRun.progress !== updateData.progress ||
              Math.abs(currentRun.completedSteps - (updateData.completedSteps || 0)) > 0 ||
              currentRun.name !== updateData.name; // 🔥 添加名称变化检测
            
            if (!hasSignificantChange) {
              return prevRuns; // 无重要变化，不更新
            }
            
            // 更新现有测试运行，保留已有的完整字段
            const updatedRuns = [...prevRuns];
            updatedRuns[runIndex] = {
              ...currentRun,
              // 🔥 只更新有值的字段，保留已有的完整信息
              status: updateData.status || currentRun.status,
              progress: updateData.progress ?? currentRun.progress,
              name: updateData.name || currentRun.name,
              completedSteps: updateData.completedSteps ?? currentRun.completedSteps,
              totalSteps: updateData.totalSteps ?? currentRun.totalSteps,
              passedSteps: updateData.passedSteps ?? currentRun.passedSteps,
              failedSteps: updateData.failedSteps ?? currentRun.failedSteps,
              duration: updateData.duration || currentRun.duration,
              startTime: updateData.startTime ? new Date(updateData.startTime) : currentRun.startTime,
              endTime: updateData.endTime ? new Date(updateData.endTime) : currentRun.endTime,
              logs: updateData.logs || currentRun.logs,
              error: updateData.error || currentRun.error
            };
            return updatedRuns;
          } else {
            // 🔥 新测试运行 - 需要检查是否应该创建
            
            // 🔥 防重复检查1：如果首次加载未完成，不创建新记录（等 loadTestRuns 完成后会有完整数据）
            if (!initialLoadCompleteRef.current) {
              console.log(`⏳ [TestRuns] 首次加载未完成，跳过创建新记录: ${runId?.substring(0, 8)}`);
              return prevRuns;
            }
            
            // 🔥 防重复检查2：如果该 runId 已经创建过，不重复创建
            if (createdRunIdsRef.current.has(runId)) {
              console.log(`⚠️ [TestRuns] 该记录已创建过，跳过: ${runId?.substring(0, 8)}`);
              return prevRuns;
            }
            
            // 🔥 防重复检查3：检查消息是否只是部分更新（只有少数字段），不应该创建新记录
            // 如果消息只有 name 或只有状态更新，说明这是更新消息而不是创建消息
            // 🔥 修复：允许 queued、running 状态创建新记录，也允许其他状态但包含完整数据的情况
            const hasEnoughDataToCreate = updateData.testCaseId && 
              (updateData.status === 'queued' || 
               updateData.status === 'running' || 
               (updateData.id && updateData.name && updateData.environment)); // 如果有完整数据，也允许创建
            if (!hasEnoughDataToCreate) {
              console.log(`⚠️ [TestRuns] 数据不足以创建新记录，跳过: ${runId?.substring(0, 8)}, status=${updateData.status}, testCaseId=${updateData.testCaseId}, hasId=${!!updateData.id}, hasName=${!!updateData.name}`);
              return prevRuns;
            }
            
            // 标记该 runId 已创建
            createdRunIdsRef.current.add(runId);
            console.log(`🆕 [TestRuns] 通过 WebSocket 创建新记录: ${runId?.substring(0, 8)}, testCaseId=${updateData.testCaseId}`);
            
            const startTime = updateData.startTime ? new Date(updateData.startTime) : new Date();
            const newRun: TestRun = {
              id: runId,
              testCaseId: updateData.testCaseId || 0,
              name: updateData.name || '新测试',
              status: updateData.status || 'running',
              progress: updateData.progress || 0,
              startTime: startTime,
              startedAt: startTime, // 🔥 添加兼容字段
              endTime: updateData.endTime ? new Date(updateData.endTime) : undefined,
              finishedAt: updateData.endTime ? new Date(updateData.endTime) : undefined, // 🔥 添加兼容字段
              duration: updateData.duration || '0s',
              totalSteps: updateData.totalSteps || 0,
              completedSteps: updateData.completedSteps || 0,
              passedSteps: updateData.passedSteps || 0,
              failedSteps: updateData.failedSteps || 0,
              executor: updateData.executor || 'System',
              environment: updateData.environment || 'default',
              logs: updateData.logs || [],
              screenshots: updateData.screenshots || [],
              error: updateData.error,
              // 🔥 初始化测试用例相关字段（先设为空，稍后异步填充）
              system: updateData.system || '',
              module: updateData.module || '',
              tags: updateData.tags || [],
              priority: updateData.priority || 'medium',
              projectVersion: updateData.projectVersion || ''
            };
            
            // 🔥 异步获取测试用例完整信息并更新（不阻塞UI）
            if (updateData.testCaseId && !updateData.system) {
              testService.getTestCaseById(updateData.testCaseId).then(testCase => {
                if (testCase) {
                  setTestRuns(currentRuns => {
                    const idx = currentRuns.findIndex(r => r.id === runId);
                    if (idx >= 0) {
                      const updatedRuns = [...currentRuns];
                      updatedRuns[idx] = {
                        ...updatedRuns[idx],
                        name: testCase.name || updatedRuns[idx].name, // 🔥 也更新名称
                        system: testCase.system || '',
                        module: testCase.module || '',
                        tags: Array.isArray(testCase.tags) 
                          ? testCase.tags 
                          : (testCase.tags ? testCase.tags.split(',').map((t: string) => t.trim()) : []),
                        priority: testCase.priority || 'medium',
                        projectVersion: (testCase as any).project_version?.version_name || (testCase as any).projectVersion || ''
                      };
                      console.log(`✅ [TestRuns] 已补充测试运行 ${runId.substring(0, 8)} 的测试用例信息`);
                      return updatedRuns;
                    }
                    return currentRuns;
                  });
                }
              }).catch(err => {
                console.warn(`⚠️ [TestRuns] 获取测试用例 ${updateData.testCaseId} 信息失败:`, err);
              });
            }
            
            return [newRun, ...prevRuns];
          }
        });
      }
    } else if (message.type === 'suiteUpdate') {
      const suiteRunId = message.suiteRunId || message.data?.id;
      const updateData = message.data || message.suiteRun;
      
      if (suiteRunId && updateData) {
        setTestRuns(prevRuns => {
          const runIndex = prevRuns.findIndex(run => run.id === suiteRunId);
          if (runIndex >= 0) {
            const currentRun = prevRuns[runIndex];
            
            // 检查是否有重要变化
            const hasChange = 
              currentRun.status !== updateData.status ||
              currentRun.progress !== updateData.progress;
            
            if (!hasChange) return prevRuns;
            
            const updatedRuns = [...prevRuns];
            updatedRuns[runIndex] = {
              ...currentRun,
              name: updateData.suiteName ? `Suite: ${updateData.suiteName}` : currentRun.name,
              status: updateData.status || currentRun.status,
              progress: updateData.progress || currentRun.progress,
              totalSteps: updateData.totalCases || currentRun.totalSteps,
              completedSteps: updateData.completedCases || currentRun.completedSteps,
              passedSteps: updateData.passedCases || currentRun.passedSteps,
              failedSteps: updateData.failedCases || currentRun.failedSteps,
              endTime: updateData.endTime ? new Date(updateData.endTime) : currentRun.endTime,
              duration: updateData.duration || currentRun.duration,
              error: updateData.error
            };
            return updatedRuns;
          }
          return prevRuns;
        });
      }
    }
  }, []);

  // 🔥 优化的防抖处理 - 更合理的延迟和批处理
  const debouncedUpdate = useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    let pendingMessages: any[] = [];
    
    return (message: any) => {
      pendingMessages.push(message);
      
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (pendingMessages.length > 0) {
          // 批量处理，减少状态更新次数
          const messages = [...pendingMessages];
          pendingMessages = [];
          
          // 合并相同runId的消息，只保留最新的
          const messageMap = new Map();
          messages.forEach(msg => {
            const runId = msg.runId || msg.data?.id;
            if (runId) {
              messageMap.set(runId, msg);
            }
          });
          
          // 一次性处理所有合并后的消息
          messageMap.forEach(msg => updateTestRunIncrementally(msg));
        }
      }, 300); // 延长到300ms，减少更新频率
    };
  }, [updateTestRunIncrementally]);

  // 🔥 核心修复2：使用独立的日志缓冲区，避免频繁更新 testRuns 对象引用
  const logsBufferRef = useRef<Map<string, any[]>>(new Map());
  
  // 🔥 新增：标记首次加载是否完成，防止 WebSocket 消息在加载前创建重复记录
  const initialLoadCompleteRef = useRef<boolean>(false);
  // 🔥 新增：记录已通过 WebSocket 创建的 runId，防止防抖批处理时重复创建
  const createdRunIdsRef = useRef<Set<string>>(new Set());

  // 🔥 核心修复：使用 useCallback 而不是 useRef，确保函数能访问最新的 ref
  const handleBatchLogs = useCallback((message: any) => {
    const { runId, logs, data } = message;

    // 🔥 核心修复：兼容两种消息格式（logs 可能在顶层或 data 里）
    const actualLogs = logs || data?.logs;

    // 🔥 添加详细日志验证函数是否被调用
    console.log(`🔵 [handleBatchLogs] 被调用, runId=${runId?.substring(0, 8)}, logs数量=${actualLogs?.length}, 原始logs=${logs?.length}, data.logs=${data?.logs?.length}`);

    if (!runId || !actualLogs || !Array.isArray(actualLogs) || actualLogs.length === 0) {
      console.warn(`⚠️ [handleBatchLogs] 参数无效, runId=${runId}, actualLogs=${actualLogs}`);
      return;
    }

    // 🔥 核心优化：日志存储到独立缓冲区，不触发 testRuns 更新
    if (!logsBufferRef.current.has(runId)) {
      logsBufferRef.current.set(runId, []);
    }

    const buffer = logsBufferRef.current.get(runId)!;

    // 🔥 核心修复：使用 actualLogs 而不是 logs
    const formattedLogs = actualLogs.map((log: any) => ({
      id: log.id || `log-${Date.now()}-${Math.random()}`,
      timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
      level: log.level || 'info',
      message: log.message || '',
      stepId: log.stepId
    }));

    buffer.push(...formattedLogs);

    // 🔥 总是输出日志，移除环境检查
    console.log(`📦 [TestRuns] 日志缓存: ${formattedLogs.length}条, 总计: ${buffer.length}, runId=${runId.substring(0, 8)}`);

    // 🔥 关键：不更新 testRuns，避免触发 selectedRun 同步和 LiveView 重渲染
    // 日志会在 filteredLogs 的 useMemo 中从缓冲区读取并合并
    
    // 🔥 新增：触发日志容器自动滚动到底部
    if (autoScrollLogs && activeTab === 'logs') {
      // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
      requestAnimationFrame(() => {
        const el = logsContainerRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
          console.log(`📜 [TestRuns] 自动滚动到底部: scrollHeight=${el.scrollHeight}`);
        }
        
        // 🔥 同时滚动浏览器窗口到底部
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'auto'
        });
      });
    }
  }, [autoScrollLogs, activeTab]);  // 添加依赖项

  // 🔥 稳定的WebSocket连接管理 - 减少重复初始化
  useEffect(() => {
    let isMounted = true;
    let messageCount = 0;

    // 初始化WebSocket连接
    testService.initializeWebSocket().catch(error => {
      console.error('初始化WebSocket连接失败:', error);
    });

    // 添加WebSocket消息监听器
    const listenerId = 'testRuns-page';
    testService.addMessageListener(listenerId, (message) => {
      if (!isMounted || !message) return;

      messageCount++;

      if (messageCount % 10 === 1) { // 减少日志输出
        console.log('📨 WebSocket消息:', message.type, messageCount);
      }

      // 🔥 核心修复：处理批量日志 - 使用 useCallback
      if (message.type === 'logs_batch') {
        handleBatchLogs(message);  // 🔥 修复：调用 handleBatchLogs 而不是 .current
        return;
      }

      // 🚀 优化：优先使用增量更新
      if (message.type === 'test_created' || message.type === 'test_update' ||
          message.type === 'test_complete' || message.type === 'suiteUpdate') {
        debouncedUpdate(message);
      }
    });

    // 首次加载数据
    loadTestRuns();

    // 组件卸载时清理
    return () => {
      isMounted = false;
      testService.removeMessageListener(listenerId);
      console.log('🧹 WebSocket监听器已清理');
    };
  }, []); // 🔥 空依赖数组，只初始化一次

  // 🔥 完全依赖 WebSocket 实时更新，无需定时刷新
  // WebSocket 会自动推送测试状态变化，用户也可以手动点击"刷新数据"按钮

  // 🔥 优化：缓存停止测试处理函数
  const handleStopTest = useCallback((testRun: TestRun) => {
    const isSuite = testRun.name.startsWith('Suite:');
    setTestToStop({
      id: testRun.id,
      name: testRun.name,
      isSuite
    });
    setShowStopModal(true);
  }, []);

  // 🔥 优化：缓存确认停止测试函数
  const confirmStopTest = useCallback(async () => {
    if (!testToStop) return;

    try {
      // 添加到停止中的集合
      setStoppingTests(prev => new Set([...prev, testToStop.id]));
      setShowStopModal(false);

      console.log(`🛑 停止测试: ${testToStop.name} (ID: ${testToStop.id})`);

      if (testToStop.isSuite) {
        // 停止测试套件
        await testService.cancelSuiteRun(testToStop.id);
        showToast.success(`已发送停止信号给测试套件: ${testToStop.name}`);
      } else {
        // 停止单个测试
        await testService.cancelTest(testToStop.id);
        showToast.success(`已发送停止信号给测试: ${testToStop.name}`);
      }

      // 🚀 优化：减少不必要的全量刷新，依赖WebSocket增量更新
      // setTimeout(() => {
      //   loadTestRuns();
      // }, 1000);

    } catch (error: any) {
      console.error('停止测试失败:', error);
      showToast.error(`停止测试失败: ${error.message}`);
    } finally {
      // 移除停止状态（延迟一点，给用户视觉反馈）
      setTimeout(() => {
        setStoppingTests(prev => {
          const newSet = new Set(prev);
          newSet.delete(testToStop.id);
          return newSet;
        });
      }, 2000);
      
      setTestToStop(null);
    }
  }, [testToStop]);

  // 🔥 优化：缓存停止所有测试处理函数
  const handleStopAllTests = useCallback(() => {
    const runningTests = testRuns.filter(run => 
      run.status === 'running' || run.status === 'queued'
    );
    
    if (runningTests.length === 0) {
      showToast.warning('当前没有正在运行的测试');
      return;
    }
    
    setShowStopAllModal(true);
  }, [testRuns]);

  // 🔥 优化：缓存确认停止所有测试函数
  const confirmStopAllTests = useCallback(async () => {
    const runningTests = testRuns.filter(run => 
      run.status === 'running' || run.status === 'queued'
    );

    if (runningTests.length === 0) {
      showToast.warning('当前没有正在运行的测试');
      setShowStopAllModal(false);
      return;
    }

    try {
      setStoppingAll(true);
      setShowStopAllModal(false);

      console.log(`🛑 批量停止 ${runningTests.length} 个测试`);

      // 同时发送所有停止请求
      const stopPromises = runningTests.map(async (run) => {
        try {
          // 添加到停止集合
          setStoppingTests(prev => new Set([...prev, run.id]));

          const isSuite = run.name.startsWith('Suite:');
          if (isSuite) {
            await testService.cancelSuiteRun(run.id);
            console.log(`✅ 已发送停止信号给测试套件: ${run.name}`);
          } else {
            await testService.cancelTest(run.id);
            console.log(`✅ 已发送停止信号给测试: ${run.name}`);
          }
        } catch (error: any) {
          console.error(`❌ 停止测试失败 ${run.name}:`, error);
          throw new Error(`${run.name}: ${error.message}`);
        }
      });

      // 等待所有停止操作完成
      const results = await Promise.allSettled(stopPromises);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed === 0) {
        showToast.success(`✅ 成功发送停止信号给 ${successful} 个测试`);
      } else {
        showToast.warning(`⚠️ ${successful} 个测试停止成功，${failed} 个失败`);
      }

      // 🚀 优化：减少不必要的全量刷新，依赖WebSocket增量更新
      // setTimeout(() => {
      //   loadTestRuns();
      // }, 1000);

    } catch (error: any) {
      console.error('批量停止测试失败:', error);
      showToast.error(`❌ 批量停止失败: ${error.message}`);
    } finally {
      // 延迟清除停止状态
      setTimeout(() => {
        setStoppingAll(false);
        setStoppingTests(new Set());
      }, 3000);
    }
  }, [testRuns]);

  // 🔥 新增：根据搜索和筛选条件过滤测试运行数据
  const filteredTestRuns = useMemo(() => {
    return testRuns.filter(run => {
      // 搜索条件：匹配测试名称或测试用例ID（保持模糊搜索）
      let matchesSearch = false;
      if (!effectiveSearchTerm) {
        matchesSearch = true;
      } else {
        const searchLower = effectiveSearchTerm.toLowerCase();
        // 匹配测试运行名称
        const matchesName = run.name.toLowerCase().includes(searchLower);
        // 🆕 匹配测试用例ID（模糊匹配，支持部分ID搜索）
        const matchesId = run.testCaseId && String(run.testCaseId).includes(effectiveSearchTerm);
        
        matchesSearch = matchesName || matchesId;
      }
      
      // 状态筛选（精确匹配）
      const matchesStatus = !effectiveStatusFilter || run.status === effectiveStatusFilter;
      
      // 🆕 执行结果筛选：根据 status 和 steps 计算实际执行结果（精确匹配）
      let matchesResult = true;
      if (effectiveResultFilter) {
        // 计算实际执行结果（使用小写值以匹配筛选选项）
        let actualResult: string | null = null;
        if (run.status === 'completed') {
          if (run.failedSteps > 0) {
            actualResult = 'fail';
          } else if (run.passedSteps > 0) {
            actualResult = 'pass';
          } else {
            actualResult = 'skip';  // 没有通过也没有失败的步骤
          }
        } else if (run.status === 'failed') {
          actualResult = 'fail';
        } else if (run.status === 'cancelled') {
          actualResult = 'skip';
        }
        
        matchesResult = actualResult === effectiveResultFilter;
      }
      
      // 执行者筛选（精确匹配）
      const matchesExecutor = !effectiveExecutorFilter || 
        run.executor.toLowerCase() === effectiveExecutorFilter.toLowerCase();
      
      // 环境筛选（精确匹配）
      const matchesEnvironment = !effectiveEnvironmentFilter || 
        run.environment.toLowerCase() === effectiveEnvironmentFilter.toLowerCase();
      
      // 🔥 新增：项目筛选（精确匹配）
      const matchesSystem = !effectiveSystemFilter || 
        (run.system && run.system.toLowerCase() === effectiveSystemFilter.toLowerCase());
      
      // 🔥 新增：版本筛选（精确匹配）
      const matchesVersion = !effectiveVersionFilter || 
        (run.projectVersion && run.projectVersion.toLowerCase() === effectiveVersionFilter.toLowerCase());
      
      // 🔥 新增：模块筛选（精确匹配）
      const matchesModule = !effectiveModuleFilter || 
        (run.module && run.module.toLowerCase() === effectiveModuleFilter.toLowerCase());
      
      // 🔥 新增：标签筛选（精确匹配）
      const matchesTag = !effectiveTagFilter || 
        (run.tags && Array.isArray(run.tags) && run.tags.some(tag => 
          tag.toLowerCase() === effectiveTagFilter.toLowerCase()
        ));
      
      // 🔥 新增：优先级筛选（精确匹配）
      const matchesPriority = !effectivePriorityFilter || run.priority === effectivePriorityFilter;
      
      return matchesSearch && matchesStatus && matchesResult && matchesExecutor && matchesEnvironment &&
        matchesSystem && matchesVersion && matchesModule && matchesTag && matchesPriority;
    });
  }, [testRuns, effectiveSearchTerm, effectiveStatusFilter, effectiveResultFilter, effectiveExecutorFilter, effectiveEnvironmentFilter, 
      effectiveSystemFilter, effectiveVersionFilter, effectiveModuleFilter, effectiveTagFilter, effectivePriorityFilter]);

  // 🔥 新增：计算分页后的数据
  const paginatedTestRuns = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredTestRuns.slice(startIndex, endIndex);
  }, [filteredTestRuns, currentPage, pageSize]);

  // 🔥 新增：全选/取消全选 - 分页场景下只选择当前页
  const handleSelectAll = useCallback(() => {
    const allCurrentPageSelected = paginatedTestRuns.length > 0 && 
      paginatedTestRuns.every(run => selectedRunIds.has(run.id));
    
    if (allCurrentPageSelected) {
      // 取消全选：只取消当前页的选择
      setSelectedRunIds(prev => {
        const newSet = new Set(prev);
        paginatedTestRuns.forEach(run => newSet.delete(run.id));
        return newSet;
      });
      setSelectAll(false);
    } else {
      // 全选：选择当前页的所有项
      setSelectedRunIds(prev => {
        const newSet = new Set(prev);
        paginatedTestRuns.forEach(run => newSet.add(run.id));
        return newSet;
      });
      setSelectAll(true);
    }
  }, [paginatedTestRuns, selectedRunIds]);

  // 🔥 新增：单项选择/取消选择
  const handleSelectRun = useCallback((runId: string) => {
    setSelectedRunIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(runId)) {
        newSet.delete(runId);
      } else {
        newSet.add(runId);
      }
      // 检查当前页是否全部被选中
      const allCurrentPageSelected = paginatedTestRuns.length > 0 && 
        paginatedTestRuns.every(run => {
          if (run.id === runId) {
            return newSet.has(runId);
          }
          return newSet.has(run.id);
        });
      setSelectAll(allCurrentPageSelected);
      return newSet;
    });
  }, [paginatedTestRuns]);

  // 🔥 新增：批量删除测试记录
  const handleBatchDelete = useCallback(async () => {
    if (selectedRunIds.size === 0) {
      showToast.warning('请先选择要删除的测试记录');
      return;
    }

    const confirmMessage = `确定要删除选中的 ${selectedRunIds.size} 条测试记录吗？此操作不可恢复。`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const runIds = Array.from(selectedRunIds);
      console.log(`🗑️ 批量删除 ${runIds.length} 条测试记录`);

      // 🔥 调用后端批量删除API
      const result = await testService.batchDeleteTestRuns(runIds);

      // 🔥 从前端列表中移除已删除的项
      setTestRuns(prev => prev.filter(run => !selectedRunIds.has(run.id)));

      showToast.success(`已成功删除 ${result.deletedCount} 条测试记录`);

      // 清空选择
      setSelectedRunIds(new Set());
      setSelectAll(false);
    } catch (error: any) {
      console.error('批量删除失败:', error);
      showToast.error(`批量删除失败: ${error.message || '未知错误'}`);
    }
  }, [selectedRunIds]);

  // 🔥 数据变化时更新全选状态 - 检查当前页是否全部被选中
  useEffect(() => {
    if (paginatedTestRuns.length > 0) {
      const allCurrentPageSelected = paginatedTestRuns.every(run => selectedRunIds.has(run.id));
      setSelectAll(allCurrentPageSelected);
    } else {
      setSelectAll(false);
    }
  }, [paginatedTestRuns, selectedRunIds]);

  // 修改为导航到详情页面，带上返回参数
  const handleViewLogs = useCallback((run: TestRun) => {
    navigate(`/test-runs/${run.id}/detail`, {
      state: { 
        from: '/test-runs',
        caseName: run.name 
      }
    });
  }, [navigate]);

  // 🔥 修复灰屏问题：使用 useCallback 稳定 onFrameUpdate 函数引用
  // 避免 WebSocket 消息触发的重新渲染导致 LiveView 重新连接
  const handleFrameUpdate = useCallback((timestamp: Date) => {
    // 🔥 减少日志输出，避免控制台污染
    if (timestamp.getSeconds() % 10 === 0) {
      console.log('实时流帧更新:', timestamp);
    }
  }, []);

  // 🔥 核心修复4：使用独立的 ref 存储 LiveView 关键属性
  const liveViewRunIdRef = useRef<string | null>(null);
  const liveViewStatusRef = useRef<'running' | 'completed' | 'failed' | 'queued' | 'cancelled' | null>(null);
  const [liveViewPropsVersion, setLiveViewPropsVersion] = useState(0);

  // 🔥 监听 selectedRun 变化，只在 id 或 status 真正变化时更新 ref 和触发重渲染
  useEffect(() => {
    if (!selectedRun) {
      if (liveViewRunIdRef.current !== null || liveViewStatusRef.current !== null) {
        liveViewRunIdRef.current = null;
        liveViewStatusRef.current = null;
        setLiveViewPropsVersion(v => v + 1);
      }
      return;
    }

    const idChanged = liveViewRunIdRef.current !== selectedRun.id;
    const statusChanged = liveViewStatusRef.current !== selectedRun.status;

    if (idChanged || statusChanged) {
      liveViewRunIdRef.current = selectedRun.id;
      liveViewStatusRef.current = selectedRun.status;
      setLiveViewPropsVersion(v => v + 1);

      console.log('🎬 [TestRuns] LiveView props 更新:', {
        runId: selectedRun.id.substring(0, 8),
        status: selectedRun.status,
        idChanged,
        statusChanged
      });
    }
  }, [selectedRun?.id, selectedRun?.status]);  // 🔥 核心修复：移除 selectedRun 对象，只依赖 id 和 status

  // 🔥 liveViewProps 完全基于 ref，不依赖 selectedRun 对象
  const liveViewProps = useMemo(() => {
    if (!liveViewRunIdRef.current) return null;

    return {
      runId: liveViewRunIdRef.current,
      testStatus: liveViewStatusRef.current || 'queued',
      onFrameUpdate: handleFrameUpdate
    };
  }, [liveViewPropsVersion, handleFrameUpdate]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Activity className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'queued':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'cancelled':
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'queued':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running': return '执行中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
      case 'queued': return '队列中';
      case 'cancelled': return '已取消';
      default: return '未知';
    }
  };

  // 🔥 优化：使用useMemo缓存统计数据计算，避免每次渲染都重新计算
  const stats = useMemo(() => {
    const running = filteredTestRuns.filter(run => run.status === 'running').length;
    const queued = filteredTestRuns.filter(run => run.status === 'queued').length;
    const completed = filteredTestRuns.filter(run => run.status === 'completed').length;
    const failed = filteredTestRuns.filter(run => run.status === 'failed').length;
    
    return { running, queued, completed, failed };
  }, [filteredTestRuns]);

  // 🔥 新增：通过ref暴露函数和状态给父组件
  useEffect(() => {
    if (onStopAllRef) {
      onStopAllRef.current = handleStopAllTests;
    }
    if (onRefreshRef) {
      onRefreshRef.current = loadTestRuns;
    }
    if (statsRef) {
      statsRef.current = stats;
    }
    if (stoppingAllRef) {
      stoppingAllRef.current = stoppingAll;
    }
  }, [handleStopAllTests, loadTestRuns, stats, stoppingAll]);

  // 🔥 新增：处理每页条数变化
  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // 重置到第一页
  }, []);

  // 🔥 新增：重置筛选条件
  const handleResetFilters = useCallback(() => {
    setLocalSearchTerm('');
    setLocalStatusFilter('');
    setLocalResultFilter('');
    setLocalSystemFilter('');
    setLocalVersionFilter('');
    setLocalModuleFilter('');
    setLocalTagFilter('');
    setLocalPriorityFilter('');
    setLocalEnvironmentFilter('');
    setLocalExecutorFilter('');
    setCurrentPage(1);
  }, []);

  // 🔥 新增：当数据变化时，如果当前页没有数据，自动跳转到第一页
  useEffect(() => {
    const totalPages = Math.ceil(testRuns.length / pageSize);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [testRuns.length, pageSize, currentPage]);

  // 🔥 分页组件 - 可复用
  const PaginationComponent = ({ total }: { total: number }) => {
    if (!loading && total > 0) {
      return (
        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50">
          {/* 中间：页码信息 */}
          <div className="text-sm text-gray-500">
            共 <span className="font-semibold text-gray-700">{total}</span> 条记录，
            第 <span className="font-semibold text-gray-700">{currentPage}</span> / <span className="font-semibold text-gray-700">{Math.ceil(total / pageSize)}</span> 页
          </div>
          <div className="flex space-x-4">
            {/* 右侧：分页按钮 */}
            <div className="flex items-center space-x-1">
              {/* 第一页 */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className={clsx(
                  'p-2 rounded',
                  currentPage === 1
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
                title="第一页"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>

              {/* 上一页 */}
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className={clsx(
                  'p-2 rounded',
                  currentPage === 1
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
                title="上一页"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {/* 页码输入框 */}
              <div className="flex items-center space-x-2 px-2">
                <input
                  type="number"
                  min={1}
                  max={Math.ceil(total / pageSize)}
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value);
                    const totalPages = Math.ceil(total / pageSize);
                    if (page >= 1 && page <= totalPages) {
                      setCurrentPage(page);
                    }
                  }}
                  className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">/ {Math.ceil(total / pageSize)}</span>
              </div>

              {/* 下一页 */}
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage >= Math.ceil(total / pageSize)}
                className={clsx(
                  'p-2 rounded',
                  currentPage >= Math.ceil(total / pageSize)
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
                title="下一页"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>

              {/* 最后一页 */}
              <button
                onClick={() => setCurrentPage(Math.ceil(total / pageSize))}
                disabled={currentPage >= Math.ceil(total / pageSize)}
                className={clsx(
                  'p-2 rounded',
                  currentPage >= Math.ceil(total / pageSize)
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
                title="最后一页"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>

            {/* 左侧：每页条数选择器 */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700">每页显示</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ width: '80px' }}
                title="选择每页显示的记录数"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm text-gray-700">条</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // 🔥 格式化日志级别的颜色
  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'success': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'warning': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  // 🔥 格式化日志级别的图标
  const getLogLevelIcon = (level: string) => {
    switch (level) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  };

  // 🔎 日志过滤与搜索 - 核心修复：从缓冲区合并日志
  const filteredLogs = useMemo(() => {
    const runId = selectedRun?.id;
    if (!runId) return [];

    // 🔥 核心修复：不访问 selectedRun 对象，通过 runId 从 testRuns 查找
    const run = testRuns.find(r => r.id === runId);
    if (!run) return [];

    const enabled = new Set<string>();
    Object.entries(logLevels).forEach(([k, v]) => {
      if (v) enabled.add(k);
    });
    const keyword = logSearch.trim().toLowerCase();

    // 🔥 核心优化：合并 run.logs 和缓冲区的日志
    const baseLogs = run.logs || [];
    const bufferedLogs = logsBufferRef.current.get(runId) || [];
    const allLogs = [...baseLogs, ...bufferedLogs];

    return allLogs.filter(log => {
      const levelOk = enabled.has(log.level as string);
      const keywordOk = keyword === '' || (log.message || '').toLowerCase().includes(keyword);
      return levelOk && keywordOk;
    });
  }, [selectedRun?.id, testRuns, logLevels, logSearch]);  // 🔥 添加 testRuns 依赖

  // 窗口化显示：默认仅渲染最近500条，可一键展开全部
  const displayLogs = useMemo(() => {
    if (!filteredLogs) return [];
    if (showAllLogs) return filteredLogs;
    const limit = 500;
    return filteredLogs.length > limit ? filteredLogs.slice(-limit) : filteredLogs;
  }, [filteredLogs, showAllLogs]);

  // 🔍 日志关键字高亮工具
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const highlightText = (text: string, keyword: string) => {
    if (!keyword) return text;
    try {
      const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi');
      const parts = (text || '').split(regex);
      return parts.map((part, i) =>
        regex.test(part) ? (
          <React.Fragment key={i}>
            <mark className="bg-yellow-200 px-0.5 rounded">{part}</mark>
          </React.Fragment>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      );
    } catch {
      return text;
    }
  };

  // 🔥 加强版日期格式化函数
  const safeFormat = (date: Date | null | undefined, formatStr: string): string => {
    try {
      if (!date) {
        return '-';
      }
      
      // 确保是Date对象
      if (!(date instanceof Date)) {
        console.warn('传入的日期不是Date对象:', date);
        const converted = new Date(date as any);
        if (isNaN(converted.getTime())) {
          return '日期无效';
        }
        date = converted;
      }
      
      // 检查日期是否有效
      if (isNaN(date.getTime())) {
        return '日期无效';
      }
      
      // 尝试格式化日期
      return format(date, formatStr);
    } catch (error) {
      console.error('日期格式化错误:', error, date);
      return '日期格式化错误';
    }
  };

  // 🔥 优化：创建记忆化的测试运行项组件，避免不必要的重渲染
  const TestRunItem = React.memo(({
    run,
    index,
    onStopTest,
    onViewLogs,
    isStoppingTest,
    isSelected,
    onSelect
  }: {
    run: TestRun;
    index: number;
    onStopTest: (run: TestRun) => void;
    onViewLogs: (run: TestRun) => void;
    isStoppingTest: boolean;
    isSelected: boolean;
    onSelect: (runId: string) => void;
  }) => (
    <div
      key={run.id || index}
      className="px-6 py-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 flex-1">
          {/* 🔥 批量选择复选框 */}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(run.id)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer transition-none"
            onClick={(e) => e.stopPropagation()}
          />
          {getStatusIcon(run.status)}
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h4 className="font-medium text-gray-900 truncate"  style={{ maxWidth: '1000px' }} title={run.name}>{run.name}</h4>
              <span className={clsx(
                'inline-flex px-2 py-1 rounded-md text-xs font-medium',
                getStatusColor(run.status)
              )}>
                {getStatusText(run.status)}
              </span>
              {run.error && (
                <span className="text-sm text-red-600 bg-red-50 px-2 py-1 rounded font-medium">
                  错误: {run.error}
                </span>
              )}
            </div>
            
            {/* 🔥 新增：项目、版本、模块、标签、优先级 */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {/* 项目 */}
              {run.system && (
                <span className="inline-flex items-center px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded border border-blue-200">
                  🖥️ {run.system}
                </span>
              )}
              {/* 版本 */}
              {run.projectVersion && (
                <span className="inline-flex items-center px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded border border-purple-200">
                  📌 {run.projectVersion}
                </span>
              )}
              {/* 模块 */}
              {run.module && (
                <span className="inline-flex items-center px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded border border-green-200">
                  📦 {run.module}
                </span>
              )}
              {/* 🔥 新增：标签 */}
              {run.tags && Array.isArray(run.tags) && run.tags.length > 0 && (
                <div className="flex items-center flex-wrap gap-1">
                  {run.tags.slice(0, 3).map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2 py-0.5 text-xs font-medium
                             bg-blue-50 text-blue-700 rounded border border-blue-200"
                    >
                      {tag}
                    </span>
                  ))}
                  {run.tags.length > 3 && (
                    <span className="text-xs text-gray-600 px-2 py-0.5">
                      +{run.tags.length - 3}
                    </span>
                  )}
                </div>
              )}
              {/* 优先级 */}
              {run.priority && (
                <span className={clsx(
                  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                  run.priority === 'high' ? 'bg-red-100 text-red-800 border-red-200' :
                  run.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                  'bg-gray-100 text-gray-800 border-gray-200'
                )}>
                  {run.priority === 'high' ? '高' : run.priority === 'medium' ? '中' : '低'}
                </span>
              )}
            </div>
            {run.status === 'running' && (
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>进度 ({run.completedSteps}/{run.totalSteps})</span>
                  <span>{run.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-150"
                    style={{ width: `${run.progress}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div>执行者：{run.executor}</div>
              <div>环境：{run.environment}</div>
              <div>开始时间：{safeFormat(run.startTime, 'yyyy-MM-dd HH:mm:ss')}</div>
              <div>结束时间：{safeFormat(run.endTime, 'yyyy-MM-dd HH:mm:ss')}</div>
              <div>执行时长：{run.duration}</div>
              <div className="flex items-center gap-1">
              {(run.status === 'running' || run.status === 'queued') && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onStopTest(run)}
                  disabled={isStoppingTest}
                  className={clsx(
                    "p-2 transition-colors",
                    isStoppingTest
                      ? "text-orange-500 cursor-not-allowed"
                      : "text-gray-600 hover:text-red-600"
                  )}
                  title={isStoppingTest ? "正在停止..." : "停止测试"}
                >
                  {isStoppingTest ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </motion.button>
              )}
              {/* 🔥 只在非队列状态时显示查看日志按钮 */}
              {run.status !== 'queued' && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onViewLogs(run)}
                  className="p-2 text-gray-600 hover:text-blue-600 transition-colors"
                  title="查看详细执行日志"
                >
                  <Terminal className="h-4 w-4" />
                </motion.button>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ), (prevProps, nextProps) => {
    // 🔥 自定义比较函数，只有关键属性变化时才重新渲染
    return (
      prevProps.run.id === nextProps.run.id &&
      prevProps.run.status === nextProps.run.status &&
      prevProps.run.progress === nextProps.run.progress &&
      prevProps.run.completedSteps === nextProps.run.completedSteps &&
      prevProps.run.passedSteps === nextProps.run.passedSteps &&
      prevProps.run.failedSteps === nextProps.run.failedSteps &&
      prevProps.isStoppingTest === nextProps.isStoppingTest &&
      prevProps.isSelected === nextProps.isSelected
    );
  });

  // 🔁 日志自动滚动到底部 - 依赖 filteredLogs 长度变化
  useEffect(() => {
    if (activeTab !== 'logs' || !autoScrollLogs) return;
    const el = logsContainerRef.current;
    if (!el) return;
    
    // 使用 requestAnimationFrame 确保 DOM 渲染完成后再滚动
    requestAnimationFrame(() => {
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
      
      // 🔥 同时滚动浏览器窗口到底部
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'auto'
      });
    });
  }, [selectedRun?.id, filteredLogs.length, activeTab, autoScrollLogs]);

  
  return (
    <ErrorFallback onRetry={loadTestRuns}>
      <div className="space-y-6">
        {/* Header - 仅在非隐藏模式下显示 - 参考截图布局 */}
        {!hideHeader && (
          <div className="flex items-center justify-between">
            {/* 左侧：视图切换器 */}
            <div className="inline-flex items-center bg-white rounded-lg border border-gray-200 shadow-sm p-1">
              <button
                onClick={() => setViewMode('table')}
                className={clsx(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
                title="表格视图"
              >
                <Table2 className="w-4 h-4" />
                <span className="hidden sm:inline">表格视图</span>
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={clsx(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                  viewMode === 'detailed'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
                title="详细表格"
              >
                <Table2 className="w-4 h-4" />
                <span className="hidden sm:inline">详细表格</span>
              </button>
              <button
                onClick={() => setViewMode('card')}
                className={clsx(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                  viewMode === 'card'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
                title="卡片视图"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">卡片视图</span>
              </button>
            </div>

            {/* 右侧：批量删除和停止所有按钮 */}
            <div className="flex items-center gap-3">
              {/* 批量删除按钮 - 仅在有选中项时显示 */}
              {selectedRunIds.size > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleBatchDelete}
                  className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg
                             hover:bg-red-700 transition-colors shadow-md hover:shadow-lg font-medium"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  批量删除 ({selectedRunIds.size})
                </motion.button>
              )}

              {/* 停止所有按钮 */}
              <motion.button
                whileHover={{ scale: stats.running + stats.queued > 0 ? 1.02 : 1 }}
                whileTap={{ scale: stats.running + stats.queued > 0 ? 0.98 : 1 }}
                onClick={handleStopAllTests}
                disabled={stoppingAll || stats.running + stats.queued === 0}
                className={clsx(
                  "inline-flex items-center px-4 py-2 rounded-lg transition-colors font-medium",
                  stoppingAll
                    ? "bg-orange-100 text-orange-700 cursor-not-allowed"
                    : stats.running + stats.queued > 0
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed"
                )}
                title={
                  stoppingAll
                    ? "正在停止所有测试..."
                    : stats.running + stats.queued > 0
                    ? `停止所有运行中的测试 (${stats.running + stats.queued}个)`
                    : "当前没有正在运行的测试"
                }
              >
                {stoppingAll ? (
                  <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <StopCircle className="h-5 w-5 mr-2" />
                )}
                {stoppingAll
                  ? '停止中...'
                  : '停止所有'
                }
              </motion.button>
            </div>
          </div>
        )}

        {/* 🔥 统计数据卡片 */}
        {!hideStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="h-3 w-3 bg-yellow-500 rounded-full mr-2"></div>
                <div className="text-sm font-medium text-gray-600">队列中</div>
              </div>
              <div className="text-2xl font-bold text-gray-900 mt-2">{stats.queued}</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="h-3 w-3 bg-blue-500 rounded-full animate-pulse mr-2"></div>
                <div className="text-sm font-medium text-gray-600">执行中</div>
              </div>
              <div className="text-2xl font-bold text-gray-900 mt-2">{stats.running}</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="h-3 w-3 bg-green-500 rounded-full mr-2"></div>
                <div className="text-sm font-medium text-gray-600">已完成</div>
              </div>
              <div className="text-2xl font-bold text-gray-900 mt-2">{stats.completed}</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="h-3 w-3 bg-red-500 rounded-full mr-2"></div>
                <div className="text-sm font-medium text-gray-600">失败</div>
              </div>
              <div className="text-2xl font-bold text-gray-900 mt-2">{stats.failed}</div>
            </div>
          </div>
        )}

        {/* 🔥 搜索栏和筛选器 - 参考截图布局 */}
        {!hideHeader && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            {/* 第一行：搜索框和主要筛选器 */}
            <div className="flex flex-wrap items-center gap-3">
              {/* 搜索输入框 */}
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索测试用例ID或名称..."
                  value={localSearchTerm}
                  onChange={(e) => setLocalSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg 
                       focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                       transition-all duration-200"
                />
              </div>

              {/* 项目筛选 */}
              <select
                value={localSystemFilter}
                onChange={(e) => {
                  setLocalSystemFilter(e.target.value);
                  setLocalVersionFilter(''); // 重置版本筛选
                }}
                className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                     focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">所有项目</option>
                {localFilterOptions.systems.map(sys => (
                  <option key={sys} value={sys}>{sys}</option>
                ))}
              </select>

              {/* 版本筛选 - 依赖于项目选择 */}
              <select
                value={localVersionFilter}
                onChange={(e) => setLocalVersionFilter(e.target.value)}
                disabled={!localSystemFilter || localFilterOptions.versions.length === 0}
                className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                     focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{!localSystemFilter ? '请先选择项目' : '所有版本'}</option>
                {localFilterOptions.versions.map(version => (
                  <option key={version} value={version}>{version}</option>
                ))}
              </select>

              {/* 模块筛选 */}
              <select
                value={localModuleFilter}
                onChange={(e) => setLocalModuleFilter(e.target.value)}
                className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                     focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">所有模块</option>
                {localFilterOptions.modules.map(module => (
                  <option key={module} value={module}>{module}</option>
                ))}
              </select>

              {/* 状态筛选 */}
              <select
                value={localStatusFilter}
                onChange={(e) => setLocalStatusFilter(e.target.value)}
                className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                     focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">所有状态</option>
                <option value="queued">队列中</option>
                <option value="running">执行中</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
                <option value="failed">失败</option>
              </select>

              {/* 结果筛选 */}
              <select
                value={localResultFilter}
                onChange={(e) => setLocalResultFilter(e.target.value)}
                className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                     focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">所有结果</option>
                <option value="pass">✅ 通过</option>
                <option value="fail">❌ 失败</option>
                <option value="skip">⏭️ 跳过</option>
              </select>

              {/* 筛选按钮 - 点击展开/收起高级筛选 */}
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={clsx(
                  'inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  showAdvancedFilters
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                )}
              >
                <Filter className="w-4 h-4 mr-2" />
                筛选
              </button>

              {/* 重置按钮 */}
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center px-4 py-2.5 text-gray-600 hover:text-gray-900
                     border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <X className="w-4 h-4 mr-2" />
                重置
              </button>

              {/* 刷新按钮 */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={loadTestRuns}
                disabled={loading}
                className="inline-flex items-center px-4 py-2.5 bg-blue-600 text-white rounded-lg 
                     hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
                title="刷新数据"
              >
                <RefreshCw className={clsx("w-4 h-4 mr-2", loading && "animate-spin")} />
                刷新
              </motion.button>
            </div>

            {/* 第二行：标签、优先级、环境、执行者筛选 - 默认隐藏，点击筛选按钮展开 */}
            <AnimatePresence>
              {showAdvancedFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 mt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* 标签筛选 */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">标签</label>
                      <select
                        value={localTagFilter}
                        onChange={(e) => setLocalTagFilter(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                             focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="">所有标签</option>
                        {localFilterOptions.tags.map(tag => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))}
                      </select>
                    </div>

                    {/* 优先级筛选 */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">优先级</label>
                      <select
                        value={localPriorityFilter}
                        onChange={(e) => setLocalPriorityFilter(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                             focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="">所有优先级</option>
                        <option value="high">高</option>
                        <option value="medium">中</option>
                        <option value="low">低</option>
                      </select>
                    </div>

                    {/* 环境筛选 */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">环境</label>
                      <select
                        value={localEnvironmentFilter}
                        onChange={(e) => setLocalEnvironmentFilter(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                             focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="">所有环境</option>
                        {localFilterOptions.environments.map(env => (
                          <option key={env} value={env}>{env}</option>
                        ))}
                      </select>
                    </div>

                    {/* 执行者筛选 */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">执行者</label>
                      <select
                        value={localExecutorFilter}
                        onChange={(e) => setLocalExecutorFilter(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                             focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="">所有执行者</option>
                        {localFilterOptions.executors.map(executor => (
                          <option key={executor} value={executor}>{executor}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 加载状态显示 */}
        {loading && (
          <div className="text-center py-8">
            <RefreshCw className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-lg text-gray-600">正在加载测试运行数据...</p>
          </div>
        )}

        {/* 🔥 空状态提示 */}
        {testRuns.length === 0 && !loading && (
          <div className="text-center py-16">
            <div className="mx-auto w-32 h-32 mb-6 rounded-full bg-gray-100 flex items-center justify-center">
              <Activity className="h-16 w-16 text-gray-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">暂无测试运行记录</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              还没有执行过测试用例。去"测试用例"页面运行一些测试，然后回到这里查看详细的执行结果和断言结果。
            </p>
          </div>
        )}

        {/* 🔥 筛选后无结果提示 */}
        {testRuns.length > 0 && filteredTestRuns.length === 0 && !loading && (
          <div className="text-center py-16">
            <div className="mx-auto w-32 h-32 mb-6 rounded-full bg-gray-100 flex items-center justify-center">
              <Search className="h-16 w-16 text-gray-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">没有匹配的测试运行</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              请尝试调整搜索条件或筛选器。
            </p>
          </div>
        )}

        {/* 测试运行列表 */}
        {filteredTestRuns.length > 0 && !loading && (
          <div className="space-y-4">
            {/* 🔥 根据视图模式渲染不同的组件 */}
            {viewMode === 'table' ? (
              // 表格视图
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <TestRunsTable
                  testRuns={paginatedTestRuns}
                  selectedRunIds={selectedRunIds}
                  stoppingTests={stoppingTests}
                  onStopTest={handleStopTest}
                  onViewLogs={handleViewLogs}
                  onSelectRun={handleSelectRun}
                  onSelectAll={handleSelectAll}
                  selectAll={selectAll}
                />
                <PaginationComponent total={filteredTestRuns.length} />
              </div>
            ) : viewMode === 'detailed' ? (
              // 详细表格视图
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <TestRunsDetailedTable
                  testRuns={paginatedTestRuns}
                  selectedRunIds={selectedRunIds}
                  stoppingTests={stoppingTests}
                  onStopTest={handleStopTest}
                  onViewLogs={handleViewLogs}
                  onSelectRun={handleSelectRun}
                  onSelectAll={handleSelectAll}
                  selectAll={selectAll}
                  total={testRuns.length}
                  currentPage={currentPage}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={handlePageSizeChange}
                  loading={loading}
                />
              </div>
            ) : (
              // 卡片视图（原有样式）
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* 🔥 列表头部 - 包含全选和标题 */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
                  {/* 🔥 全选复选框 */}
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer transition-none"
                    title={selectAll ? "取消全选" : "全选"}
                  />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">测试执行记录</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      包含测试步骤和断言预期的详细结果
                      {selectedRunIds.size > 0 && (
                        <span className="ml-2 text-blue-600 font-medium">
                          (已选择 {selectedRunIds.size} 项)
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* 🔥 测试运行项列表 */}
                <div className="divide-y divide-gray-200">
                  {paginatedTestRuns.map((run, index) => (
                    <TestRunItem
                      key={run.id || index}
                      run={run}
                      index={index}
                      onStopTest={handleStopTest}
                      onViewLogs={handleViewLogs}
                      isStoppingTest={stoppingTests.has(run.id)}
                      isSelected={selectedRunIds.has(run.id)}
                      onSelect={handleSelectRun}
                    />
                  ))}
                </div>
                <PaginationComponent total={filteredTestRuns.length} />
              </div>
            )}
          </div>
        )}

        {/* 🔥 详细日志模态框 - 显示断言结果 */}
        <AnimatePresence>
          {showLogs && selectedRun && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className={clsx(
                  "bg-white rounded-xl shadow-xl overflow-hidden flex flex-col",
                  isLiveFull ? "w-[98vw] h-[96vh]" : "w-[92vw] h-[90vh]"
                )}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`run-log-title-${selectedRun.id}`}
              >
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 id={`run-log-title-${selectedRun.id}`} className="text-lg font-semibold text-gray-900">
                        测试执行日志: {selectedRun.name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        运行ID: {selectedRun.id} | 状态: {getStatusText(selectedRun.status)}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowLogs(false)}
                      className="text-gray-600 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* 🔥 标签页导航 - 紧凑设计，为内容区腾出空间 */}
                <div className="px-6 py-3 border-b bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex space-x-4">
                      <button
                        onClick={() => setActiveTab('logs')}
                        className={clsx(
                          "px-4 py-2 rounded-lg font-medium transition-colors",
                          activeTab === 'logs'
                            ? "bg-blue-100 text-blue-700"
                            : "text-gray-600 hover:text-gray-900"
                        )}
                      >
                        执行日志
                      </button>
                      <button
                        onClick={() => setActiveTab('live')}
                        className={clsx(
                          "px-4 py-2 rounded-lg font-medium transition-colors",
                          activeTab === 'live'
                            ? "bg-red-100 text-red-700"
                            : "text-gray-600 hover:text-gray-900"
                        )}
                      >
                        实时画面
                      </button>
                      <button
                        onClick={() => setActiveTab('evidence')}
                        className={clsx(
                          "px-4 py-2 rounded-lg font-medium transition-colors",
                          activeTab === 'evidence'
                            ? "bg-green-100 text-green-700"
                            : "text-gray-600 hover:text-gray-900"
                        )}
                      >
                        测试证据
                      </button>
                      <button
                        onClick={() => setActiveTab('queue')}
                        className={clsx(
                          "px-4 py-2 rounded-lg font-medium transition-colors",
                          activeTab === 'queue'
                            ? "bg-purple-100 text-purple-700"
                            : "text-gray-600 hover:text-gray-900"
                        )}
                      >
                        队列状态
                      </button>
                    </div>
                    {activeTab === 'live' && (
                      <button
                        onClick={() => setIsLiveFull(v => !v)}
                        className="px-3 py-2 text-sm rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700"
                        title={isLiveFull ? "退出全屏" : "近全屏查看"}
                        aria-pressed={isLiveFull}
                      >
                        {isLiveFull ? "退出全屏" : "全屏"}
                      </button>
                    )}
                  </div>
                </div>

                {/* 标签页内容 */}
                <div className="px-6 py-4 flex-1 min-h-0">
                  {activeTab === 'logs' && (
                    <div ref={logsContainerRef} className="h-full min-h-0 overflow-y-auto" role="log" aria-live="polite" aria-relevant="additions">
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" className="rounded border-gray-300" checked={logLevels.info} onChange={(e) => setLogLevels(v => ({ ...v, info: e.target.checked }))} />
                            <span className="text-blue-600">Info</span>
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" className="rounded border-gray-300" checked={logLevels.success} onChange={(e) => setLogLevels(v => ({ ...v, success: e.target.checked }))} />
                            <span className="text-green-600">Success</span>
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" className="rounded border-gray-300" checked={logLevels.warning} onChange={(e) => setLogLevels(v => ({ ...v, warning: e.target.checked }))} />
                            <span className="text-yellow-600">Warning</span>
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" className="rounded border-gray-300" checked={logLevels.error} onChange={(e) => setLogLevels(v => ({ ...v, error: e.target.checked }))} />
                            <span className="text-red-600">Error</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          placeholder="搜索关键字"
                          value={logSearch}
                          onChange={(e) => setLogSearch(e.target.value)}
                          className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                        <div className="ml-auto flex items-center gap-3">
                          <span className="text-sm text-gray-700">
                            显示 {displayLogs.length}/{filteredLogs.length}
                          </span>
                          {filteredLogs.length > displayLogs.length && (
                            <button
                              onClick={() => setShowAllLogs(true)}
                              className="px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                            >
                              展开全部
                            </button>
                          )}
                          {filteredLogs.length > 500 && showAllLogs && (
                            <button
                              onClick={() => setShowAllLogs(false)}
                              className="px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                            >
                              仅显示最近500条
                            </button>
                          )}
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300"
                              checked={autoScrollLogs}
                              onChange={(e) => setAutoScrollLogs(e.target.checked)}
                            />
                            自动滚动
                          </label>
                          <button
                            onClick={() => {
                              const el = logsContainerRef.current;
                              if (el) el.scrollTop = el.scrollHeight;
                            }}
                            className="px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                          >
                            跳到最新
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {displayLogs.length > 0 ? (
                          displayLogs.map((log, index) => (
                            <div
                              key={log.id || index}
                              className={clsx(
                                "p-3 rounded-lg text-sm font-mono",
                                log.level === 'success' && "bg-green-50 border-l-4 border-green-400",
                            log.level === 'error' && "bg-red-50 border-l-4 border-red-400",
                            log.level === 'warning' && "bg-yellow-50 border-l-4 border-yellow-400",
                            log.level === 'info' && "bg-blue-50 border-l-4 border-blue-400"
                          )}
                        >
                          <div className="flex items-start space-x-2">
                            <span className="flex-shrink-0 mt-0.5">
                              {getLogLevelIcon(log.level)}
                            </span>
                            <div className="flex-1">
                              <div className={clsx("font-medium break-words", getLogLevelColor(log.level))}>
                                {highlightText(log.message, logSearch)}
                              </div>
                              <div className="text-sm text-gray-700 mt-1">
                                {safeFormat(log.timestamp, 'HH:mm:ss.SSS')}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        暂无执行日志
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* 🔥 实时画面标签页 */}
                {activeTab === 'live' && liveViewProps && (
                  <div className="h-full min-h-0">
                    <div className="h-full rounded-lg overflow-hidden bg-black/5">
                      <LiveView
                        runId={liveViewProps.runId}
                        testStatus={liveViewProps.testStatus}
                        onFrameUpdate={liveViewProps.onFrameUpdate}
                      />
                    </div>
                  </div>
                )}

                {/* 🔥 测试证据标签页 */}
                {activeTab === 'evidence' && (
                  <div className="h-full min-h-0 overflow-y-auto">
                    <EvidenceViewer runId={selectedRun.id} />
                  </div>
                )}

                {/* 🔥 队列状态标签页 */}
                {activeTab === 'queue' && (
                  <div className="h-full min-h-0 overflow-y-auto">
                    <QueueStatus />
                  </div>
                )}
                </div>
                
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
                  <button
                    onClick={() => setShowLogs(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 🔥 新增：停止测试确认模态框 */}
        <AnimatePresence>
          {showStopModal && testToStop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-xl max-w-md w-full"
              >
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center">
                    <AlertTriangle className="h-6 w-6 text-amber-500 mr-3" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      确认停止测试
                    </h3>
                  </div>
                </div>
                
                <div className="px-6 py-4">
                  <p className="text-gray-700 mb-4">
                    您确定要停止以下{testToStop.isSuite ? '测试套件' : '测试'}吗？
                  </p>
                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <p className="font-medium text-gray-900">{testToStop.name}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      ID: {testToStop.id}
                    </p>
                  </div>
                  <div className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
                    <p className="font-medium">⚠️ 注意事项：</p>
                    <ul className="mt-1 space-y-1 list-disc list-inside">
                      <li>测试将被立即终止</li>
                      <li>已执行的步骤结果会保留</li>
                      <li>测试状态将标记为"已取消"</li>
                      {testToStop.isSuite && (
                        <li>套件中正在执行的测试也会被停止</li>
                      )}
                    </ul>
                  </div>
                </div>
                
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowStopModal(false);
                      setTestToStop(null);
                    }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmStopTest}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    停止测试
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 🔥 新增：全局停止确认模态框 */}
        <AnimatePresence>
          {showStopAllModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-xl max-w-lg w-full"
              >
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center">
                    <StopCircle className="h-6 w-6 text-red-500 mr-3" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      批量停止所有测试
                    </h3>
                  </div>
                </div>
                
                <div className="px-6 py-4">
                  <p className="text-gray-700 mb-4">
                    您确定要停止当前所有正在运行的测试吗？这将影响以下测试：
                  </p>
                  
                  <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
                    {testRuns
                      .filter(run => run.status === 'running' || run.status === 'queued')
                      .map((run) => (
                        <div key={run.id} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{run.name}</p>
                            <p className="text-sm text-gray-700">
                              {run.status === 'running' ? '执行中' : '队列中'} | 
                              进度: {run.progress}% | 
                              ID: {run.id.slice(0, 8)}...
                            </p>
                          </div>
                          <span className={clsx(
                            'inline-flex px-2 py-1 rounded-full text-xs font-medium ml-2',
                            run.status === 'running' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
                          )}>
                            {run.status === 'running' ? '执行中' : '队列中'}
                          </span>
                        </div>
                      ))}
                  </div>
                  
                  <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                    <p className="font-medium">⚠️ 重要提醒：</p>
                    <ul className="mt-1 space-y-1 list-disc list-inside">
                      <li>所有正在运行和排队的测试将被立即终止</li>
                      <li>已执行的步骤结果会保留在系统中</li>
                      <li>所有测试状态将标记为"已取消"</li>
                      <li>浏览器会话将被关闭，释放系统资源</li>
                      <li>此操作无法撤销</li>
                    </ul>
                  </div>
                </div>
                
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                  <button
                    onClick={() => setShowStopAllModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmStopAllTests}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    确认停止所有测试
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorFallback>
  );
}