import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Plus,
  Trash2,
  FileText,
  Activity,
  BarChart3,
  CheckCircle,
  XCircle,
  Clock,
  Target,
  Archive,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronsLeft,
  ChevronRight as ChevronRightIcon,
  ChevronsRight,
  LayoutGrid,
  List,
  Calendar,
  BarChart2,
  TrendingUp,
  Layers,
  GitBranch,
  RotateCcw,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { clsx } from 'clsx';
import { testPlanService } from '../services/testPlanService';
import { functionalTestCaseService } from '../services/functionalTestCaseService';
import { testService } from '../services/testService';
import apiClient from '../utils/axios';
import type { TestCaseType, TestPlan, TestPlanCase, TestPlanExecution, TestPlanStatistics, TestPlanType, TestPlanCaseResult } from '../types/testPlan';
import { showToast } from '../utils/toast';
import { Modal } from '../components/ui/modal';
import { Modal as AntModal } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { TestPlanExecutionLogModal } from '../components/TestPlanExecutionLogModal';
import { FunctionalCaseSelectModal } from '../components/FunctionalCaseSelectModal';
import { getCaseTypeInfo } from '../utils/caseTypeHelper';
import { Tag, Tooltip } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime } from '../../server/utils/timezone';
import ExecutionEngineGuide from '../components/ExecutionEngineGuide';

export function TestPlanDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const location = useLocation();

  const [loading, setLoading] = useState(false);  // 首次加载状态
  const [isRefreshing, setIsRefreshing] = useState(false);  // 🔥 刷新状态（轻量指示器）
  const [plan, setPlan] = useState<TestPlan | null>(null);
  const [cases, setCases] = useState<TestPlanCase[]>([]);
  const [executions, setExecutions] = useState<TestPlanExecution[]>([]);
  const [statistics, setStatistics] = useState<TestPlanStatistics | null>(null);
  
  // 🔥 新增：当前时间状态，用于实时计算 running 状态的执行耗时
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // 🔥 用于标记是否已完成首次加载
  const hasLoadedRef = useRef(false);
  
  const [activeTab, setActiveTab] = useState<'cases' | 'executions' | 'statistics'>('cases');
  const [showAddCaseModal, setShowAddCaseModal] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<number>>(new Set());
  
  // 视图模式状态
  const [executionViewMode, setExecutionViewMode] = useState<'table' | 'compact' | 'timeline' | 'cards'>('table');
  const [statisticsViewMode, setStatisticsViewMode] = useState<'grid' | 'large' | 'compact' | 'detailed'>('grid');
  
  // 分页状态
  const [casePagination, setCasePagination] = useState({
    page: 1,
    pageSize: 10,
  });
  
  // 执行历史分页状态
  const [executionPagination, setExecutionPagination] = useState({
    page: 1,
    pageSize: 10,
  });
  
  // 🔥 新增：弹窗模式添加用例相关状态
  const [showAddCaseModalInline, setShowAddCaseModalInline] = useState(false);
  const [addCaseType, setAddCaseType] = useState<'functional' | 'ui_auto'>('functional');
  const [availableCases, setAvailableCases] = useState<Array<{
    id: number;
    name?: string;
    title?: string;
    description?: string;
    system?: string;
    module?: string;
    scenario_name?: string;
    case_type?: string;
    caseType?: string; // 🔥 新增：用例类型（UI自动化）
    priority?: string;
    tags?: string[];
    project_version_id?: number;
    project_version?: {
      id?: number;
      version_name?: string;
      version_code?: string;
    };
    projectVersion?: string; // 🔥 新增：UI自动化用例的版本字段
  }>>([]);
  const [selectedNewCases, setSelectedNewCases] = useState<Set<number>>(new Set());
  const [addCaseLoading, setAddCaseLoading] = useState(false);
  const [addCaseSaving, setAddCaseSaving] = useState(false);
  const [addCaseSearchTerm, setAddCaseSearchTerm] = useState('');
  const [addCaseFilterSystem, setAddCaseFilterSystem] = useState('');
  const [addCaseFilterProjectVersion, setAddCaseFilterProjectVersion] = useState('');
  const [addCaseFilterModule, setAddCaseFilterModule] = useState('');
  const [addCaseFilterScenario, setAddCaseFilterScenario] = useState('');
  const [addCaseFilterCaseType, setAddCaseFilterCaseType] = useState('');
  const [addCaseFilterPriority, setAddCaseFilterPriority] = useState('');
  // 🔥 新增：分页状态
  const [addCasePagination, setAddCasePagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0
  });
  
  // 执行日志模态框
  const [showExecutionLogModal, setShowExecutionLogModal] = useState(false);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  
  // 🔥 执行配置相关状态
  const [showExecutionConfig, setShowExecutionConfig] = useState(false);
  const [pendingExecutionType, setPendingExecutionType] = useState<'single' | 'batch'>('single');
  const [pendingCases, setPendingCases] = useState<TestPlanCase[]>([]);
  const [pendingReexecuteExecution, setPendingReexecuteExecution] = useState<TestPlanExecution | null>(null); // 🔥 重新执行的execution对象
  const [executionConfig, setExecutionConfig] = useState({
    executionEngine: 'mcp' as 'mcp' | 'playwright' | 'midscene',
    enableTrace: true,
    enableVideo: true,
    environment: 'staging',
    assertionMatchMode: 'auto' as 'strict' | 'auto' | 'loose' // 🔥 新增：断言匹配策略
  });
  const [showEngineGuide, setShowEngineGuide] = useState(false);
  
  // 🔥 新增：本地执行状态跟踪（用于离开确认）
  const [isExecutingLocally, setIsExecutingLocally] = useState(false);
  // 🔥 使用 ref 来立即跟踪执行状态（避免 React 状态更新延迟）
  const isExecutingRef = useRef(false);
  // 🔥 跟踪当前正在创建的执行记录ID，用于页面卸载时取消
  const pendingExecutionIdRef = useRef<string | null>(null);
  
  // 用于跟踪是否是首次渲染，避免在首次加载时重复调用
  const isInitialMount = useRef(true);
  
  // 🔥 优化：加载测试计划详情，支持静默刷新模式
  const loadTestPlanDetail = async (isSilentRefresh: boolean = false) => {
    if (!id) return;
    
    // 🔥 首次加载时显示全屏loading，刷新时只显示轻量指示器
    if (!isSilentRefresh && !hasLoadedRef.current) {
      setLoading(true);
    } else if (isSilentRefresh) {
      setIsRefreshing(true);  // 只显示轻量刷新指示器
    }
    
    try {
      console.log('📋 [TestPlanDetail] 开始加载测试计划详情, ID:', id, '静默刷新:', isSilentRefresh);
      const response = await testPlanService.getTestPlanDetail(parseInt(id));
      
      console.log('✅ [TestPlanDetail] 测试计划详情加载成功');
      console.log('📊 [TestPlanDetail] 计划信息:', response.plan);
      console.log('📋 [TestPlanDetail] 用例总数:', response.cases.length);
      console.log('📈 [TestPlanDetail] 执行历史:', response.executions.length);
      console.log('📊 [TestPlanDetail] 统计信息:', response.statistics);
      
      setPlan(response.plan);
      setCases(response.cases);
      setExecutions(response.executions);
      setStatistics(response.statistics);
      
      hasLoadedRef.current = true;  // 标记首次加载完成
      
      // 调试：检查功能用例的 case_detail 数据
      const functionalCases = response.cases.filter(c => c.case_type === 'functional');
      const uiAutoCases = response.cases.filter(c => c.case_type === 'ui_auto');
      
      if (functionalCases.length > 0) {
        console.log('🔧 [TestPlanDetail] 功能用例数量:', functionalCases.length);
        console.log('🔧 [TestPlanDetail] 功能用例详情示例:', functionalCases.slice(0, 2).map(c => ({
          id: c.id,
          case_id: c.case_id,
          case_name: c.case_name,
          case_type: c.case_type,
          case_detail: c.case_detail
        })));
      }
      
      if (uiAutoCases.length > 0) {
        console.log('🤖 [TestPlanDetail] UI自动化用例数量:', uiAutoCases.length);
        console.log('🤖 [TestPlanDetail] UI自动化用例详情示例:', uiAutoCases.slice(0, 2).map(c => ({
          id: c.id,
          case_id: c.case_id,
          case_name: c.case_name,
          case_type: c.case_type,
          case_detail: c.case_detail,
          raw_data: c // 显示完整数据以便调试
        })));
      }
      
      if (uiAutoCases.length === 0 && response.plan.plan_type === 'ui_auto') {
        console.warn('⚠️ [TestPlanDetail] UI自动化测试计划但没有UI自动化用例');
      }
    } catch (error) {
      console.error('❌ [TestPlanDetail] 加载测试计划详情失败:', error);
      if (!isSilentRefresh) {
        showToast.error('加载测试计划详情失败');
        navigate('/test-plans');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadTestPlanDetail();
    
    // 🔥 从location.state恢复tab状态
    const stateTab = (location.state as any)?.activeTab;
    if (stateTab && ['cases', 'executions', 'statistics'].includes(stateTab)) {
      setActiveTab(stateTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 监听tab切换，重新加载数据
  useEffect(() => {
    // 跳过首次渲染，避免与上面的useEffect重复加载
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    // tab切换时重新加载数据（静默刷新，因为数据可能已经加载过）
    loadTestPlanDetail(hasLoadedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // 🔥 新增：WebSocket监听器 - 监听测试完成事件，实时更新用例状态
  useEffect(() => {
    if (!id) return;

    console.log('🔌 [TestPlanDetail] 初始化WebSocket监听器');

    // 初始化WebSocket连接
    testService.initializeWebSocket().catch(error => {
      console.error('❌ [TestPlanDetail] WebSocket连接初始化失败:', error);
    });

    // 添加WebSocket消息监听器
    const listenerId = `test-plan-detail-${id}`;
    let refreshTimeout: NodeJS.Timeout | null = null;
    
    testService.addMessageListener(listenerId, (message) => {
      console.log('📨 [TestPlanDetail] 收到WebSocket消息:', message.type);

      // 🔥 优化：监听所有测试相关事件，实时刷新
      if (message.type === 'test_complete' || 
          message.type === 'test_update') {
        
        console.log('🔄 [TestPlanDetail] 测试状态变化，准备刷新数据');
        
        // 🔥 关键优化：清除之前的刷新定时器，防止频繁刷新
        if (refreshTimeout) {
          clearTimeout(refreshTimeout);
        }
        
        // 🔥 减少延迟，更快响应（从500ms改为200ms）
        refreshTimeout = setTimeout(() => {
          loadTestPlanDetail(true);  // 🔥 静默刷新，不显示全屏loading
          refreshTimeout = null;
        }, 200);
      }
    });

    // 组件卸载时清理监听器和定时器
    return () => {
      console.log('🧹 [TestPlanDetail] 清理WebSocket监听器');
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      testService.removeMessageListener(listenerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 🔥 新增：轮询机制 - 当有运行中的测试时，定期刷新数据（备用方案）
  useEffect(() => {
    if (!id) return;
    
    // 检查是否有运行中的执行记录
    const hasRunningExecution = executions.some(e => e.status === 'running');
    
    if (!hasRunningExecution) {
      return; // 没有运行中的测试，不需要轮询
    }
    
    console.log('⏱️ [TestPlanDetail] 检测到运行中的测试，启动轮询机制');
    
    // 每3秒刷新一次数据
    const pollInterval = setInterval(() => {
      console.log('🔄 [TestPlanDetail] 轮询刷新测试计划数据');
      loadTestPlanDetail(true);  // 🔥 静默刷新，不显示全屏loading
    }, 3000);
    
    // 组件卸载或状态变化时清理定时器
    return () => {
      console.log('🧹 [TestPlanDetail] 清理轮询定时器');
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, executions]);

  // 🔥 新增：检查是否有进行中或排队中的执行（考虑本地状态和服务器状态）
  const activeExecutions = executions.filter(e => e.status === 'running' || e.status === 'queued');
  const hasActiveExecution = isExecutingLocally || activeExecutions.length > 0;

  // 🔥 新增：实时更新当前时间，用于计算 running 状态的执行耗时
  useEffect(() => {
    // 只有当有 running 状态的执行时才启动定时器
    const hasRunningExecution = executions.some(e => e.status === 'running');
    
    if (!hasRunningExecution) {
      return; // 没有运行中的执行，不需要更新时间
    }
    
    console.log('⏱️ [TestPlanDetail] 检测到运行中的执行，启动耗时实时更新');
    
    // 每秒更新一次当前时间
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => {
      console.log('🧹 [TestPlanDetail] 清理耗时更新定时器');
      clearInterval(timeInterval);
    };
  }, [executions]);

  // 🔥 同步更新 ref（用于 beforeunload 事件处理器）
  useEffect(() => {
    isExecutingRef.current = hasActiveExecution;
  }, [hasActiveExecution]);

  // 🔥 调试日志：监控执行状态变化
  useEffect(() => {
    console.log('🔍 [TestPlanDetail] 执行状态检查:', {
      isExecutingLocally,
      isExecutingRef: isExecutingRef.current,
      activeExecutions: activeExecutions.map(e => ({ id: e.id, status: e.status })),
      hasActiveExecution,
      totalExecutions: executions.length
    });
  }, [isExecutingLocally, activeExecutions, hasActiveExecution, executions.length]);

  // 🔥 新增：页面关闭/刷新时的离开确认和清理（使用 ref 确保获取最新状态）
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 使用 ref 获取最新的执行状态，避免闭包问题
      const isActive = isExecutingRef.current;
      const pendingId = pendingExecutionIdRef.current;
      console.log('🚨 [TestPlanDetail] beforeunload 触发, isExecutingRef:', isActive, 'pendingExecutionId:', pendingId);
      
      // 🔥 如果有正在创建的执行记录，使用 sendBeacon 发送取消请求
      if (pendingId) {
        console.log('🧹 [TestPlanDetail] 发送取消请求，executionId:', pendingId);
        const cancelData = JSON.stringify({ status: 'cancelled', error_message: '页面关闭导致执行被取消' });
        navigator.sendBeacon(`/api/v1/test-plans/executions/${pendingId}`, new Blob([cancelData], { type: 'application/json' }));
      }
      
      if (isActive) {
        console.log('🚨 [TestPlanDetail] 阻止页面关闭');
        const message = '当前有测试正在执行或排队中，离开页面可能会导致执行记录状态异常。确定要离开吗？';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    console.log('📌 [TestPlanDetail] beforeunload 事件已注册');
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []); // 🔥 空依赖数组，只注册一次事件监听器

  // 🔥 新增：返回列表的处理函数（带离开确认）
  const handleBackToList = () => {
    // console.log('🔙 [TestPlanDetail] 点击返回列表, hasActiveExecution:', hasActiveExecution, 'isExecutingRef:', isExecutingRef.current, 'activeExecutions:', activeExecutions);
    // if (hasActiveExecution || isExecutingRef.current) {
    //   AntModal.confirm({
    //     title: '确认离开',
    //     content: `当前有 ${activeExecutions.length || 1} 个测试正在执行或排队中，离开页面可能会导致执行记录状态异常。确定要离开吗？`,
    //     okText: '确认离开',
    //     cancelText: '取消',
    //     okButtonProps: { danger: true },
    //     onOk: () => {
    //       setIsExecutingLocally(false); // 🔥 重置本地执行状态
    //       isExecutingRef.current = false; // 🔥 同步重置 ref
    //       navigate('/test-plans');
    //     }
    //   });
    // } else {
    //   navigate('/test-plans');
    // }
    navigate('/test-plans');
  };

  // 执行测试计划
  const handleExecute = (caseType: 'functional' | 'ui_auto') => {
    // 🔥 功能测试用例：跳转到执行页面
    if (caseType === 'functional') {
      navigate(`/test-plans/${id}/execute?type=${caseType}&mode=all`);
      return;
    }

    // 🔥 UI自动化用例：弹出执行配置对话框
    if (caseType === 'ui_auto') {
      // 获取所有UI自动化用例
      const uiAutoCases = cases.filter(c => c.case_type === 'ui_auto');
      
      if (uiAutoCases.length === 0) {
        showToast.warning('没有UI自动化用例可执行');
        return;
      }

      setPendingExecutionType('batch');
      setPendingCases(uiAutoCases);
      setShowExecutionConfig(true);
      return;
    }
  };

  // 🔥 新增：加载可用的用例列表
  const loadAvailableCases = async (type: 'functional' | 'ui_auto', options?: { page?: number; pageSize?: number; search?: string }) => {
    setAddCaseLoading(true);
    try {
      const page = options?.page || addCasePagination.page;
      const pageSize = options?.pageSize || addCasePagination.pageSize;
      const search = options?.search !== undefined ? options.search : addCaseSearchTerm;

      console.log(`📋 [TestPlanDetail] 开始加载${type === 'functional' ? '功能测试' : 'UI自动化'}用例列表`, { page, pageSize, search });

      if (type === 'functional') {
        // 加载功能测试用例
        const response = await functionalTestCaseService.getList({
          page,
          pageSize,
          search,
        }) as { success?: boolean; data?: Array<{
          id: number;
          name?: string;
          title?: string;
          description?: string;
          system?: string;
          module?: string;
          scenario_name?: string;
          case_type?: string;
          priority?: string;
          tags?: string[];
          project_version_id?: number;
          project_version?: {
            id?: number;
            version_name?: string;
            version_code?: string;
          };
        }>; pagination?: { page: number; pageSize: number; total: number; totalPages: number } };
        
        const data = response.success ? (response.data || []) : [];
        // 🔥 按用例ID正序排列
        const sortedData = [...data].sort((a, b) => (a.id || 0) - (b.id || 0));
        console.log(`✅ [TestPlanDetail] 功能测试用例加载成功，共 ${sortedData.length} 条`);
        setAvailableCases(sortedData);
        
        // 更新分页信息
        if (response.pagination) {
          console.log('📄 [TestPlanDetail] 收到分页信息:', response.pagination);
          setAddCasePagination(response.pagination);
        } else {
          console.warn('⚠️ [TestPlanDetail] 后端未返回分页信息');
          // 如果没有分页信息，根据数据计算
          setAddCasePagination({
            page: 1,
            pageSize: data.length,
            total: data.length,
            totalPages: 1
          });
        }
      } else {
        // 加载UI自动化用例
        console.log('🤖 [TestPlanDetail] 调用 testService.getTestCases()');
        const response = await testService.getTestCases() as Array<{
          id: number;
          name?: string;
          title?: string;
          description?: string;
          module?: string;
          priority?: string;
          tags?: string[];
          projectVersion?: string; // 🔥 修复：使用正确的字段名
          case_type?: string;
          caseType?: string; // 🔥 新增：用例类型
        }>;
        
        console.log('🤖 [TestPlanDetail] UI自动化用例原始响应:', response);
        
        if (!Array.isArray(response)) {
          console.error('❌ [TestPlanDetail] UI自动化用例响应格式错误，期望数组，收到:', typeof response);
          showToast.error('UI自动化用例数据格式错误');
          setAvailableCases([]);
          setAddCasePagination({
            page: 1,
            pageSize: 10,
            total: 0,
            totalPages: 0
          });
          return;
        }
        
        // 过滤和搜索（客户端处理）
        let filteredCases = response;
        if (search) {
          const searchLower = search.toLowerCase();
          filteredCases = response.filter(c => 
            (c.name?.toLowerCase().includes(searchLower)) ||
            (c.title?.toLowerCase().includes(searchLower)) ||
            (c.description?.toLowerCase().includes(searchLower))
          );
        }
        
        // 🔥 按用例ID正序排列
        filteredCases = [...filteredCases].sort((a, b) => (a.id || 0) - (b.id || 0));
        
        console.log(`✅ [TestPlanDetail] UI自动化用例加载成功，总数: ${response.length}, 过滤后: ${filteredCases.length}`);
        console.log('🔍 [TestPlanDetail] UI自动化用例示例数据:', filteredCases.slice(0, 2));
        
        // 客户端分页
        const total = filteredCases.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedCases = filteredCases.slice(startIndex, endIndex);
        
        console.log(`📄 [TestPlanDetail] UI自动化用例分页: 第${page}页, 每页${pageSize}条, 总计${total}条, 当前页${paginatedCases.length}条`);
        console.log('🔍 [TestPlanDetail] 分页后的UI自动化用例:', paginatedCases);
        
        setAvailableCases(paginatedCases);
        setAddCasePagination({
          page,
          pageSize,
          total,
          totalPages
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('❌ [TestPlanDetail] 加载用例列表失败:', error);
      showToast.error('加载用例列表失败: ' + errorMessage);
      setAvailableCases([]);
      setAddCasePagination({
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0
      });
    } finally {
      setAddCaseLoading(false);
    }
  };

  // 🔥 新增：弹窗模式添加用例
  const handleAddCasesModal = (type: 'functional' | 'ui_auto') => {
    setAddCaseType(type);
    setShowAddCaseModalInline(true);
    // 重置分页和搜索条件
    setAddCasePagination({
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0
    });
    setAddCaseSearchTerm('');
    // 🔥 重置所有筛选条件
    setAddCaseFilterSystem('');
    setAddCaseFilterProjectVersion('');
    setAddCaseFilterModule('');
    setAddCaseFilterScenario('');
    setAddCaseFilterCaseType('');
    setAddCaseFilterPriority('');
    loadAvailableCases(type, { page: 1, pageSize: 10, search: '' });
  };
  
  // 🔥 新增：添加选中的用例
  const handleConfirmAddCases = async () => {
    if (selectedNewCases.size === 0) {
      showToast.warning('请至少选择一个用例');
      return;
    }

    setAddCaseSaving(true);
    try {
      const casesToAdd = Array.from(selectedNewCases).map((caseId) => {
        const caseItem = availableCases.find((c: { id: number }) => c.id === caseId)!;
        return {
          case_id: caseId,
          case_type: addCaseType,
          case_name: (caseItem as { name?: string; title?: string }).name || (caseItem as { name?: string; title?: string }).title || '',
        };
      });

      await testPlanService.addCasesToPlan(parseInt(id!), casesToAdd);
      showToast.success(`成功添加 ${casesToAdd.length} 个用例`);
      
      // 关闭弹窗并重置状态
      setShowAddCaseModalInline(false);
      setSelectedNewCases(new Set());
      setAddCaseSearchTerm('');
      setAddCaseFilterSystem('');
      setAddCaseFilterProjectVersion('');
      setAddCaseFilterModule('');
      setAddCaseFilterScenario('');
      setAddCaseFilterCaseType('');
      setAddCaseFilterPriority('');
      
      // 重新加载测试计划详情（静默刷新）
      loadTestPlanDetail(true);
    } catch (error) {
      console.error('添加用例失败:', error);
      showToast.error('添加用例失败');
    } finally {
      setAddCaseSaving(false);
    }
  };

  // 移除用例（内部使用）
  const handleDeleteCase = async (caseItem: TestPlanCase) => {
    AntModal.confirm({
      title: '移除测试用例',
      content: `确定要移除用例: "${caseItem.case_name}" 吗？`,
      okText: '确认移除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await testPlanService.removeCaseFromPlan(parseInt(id!), caseItem.case_id, caseItem.case_type);
          showToast.success(`用例已移除`);
          loadTestPlanDetail(true);  // 静默刷新
          // 从选中列表中移除
          setSelectedCaseIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(caseItem.id);
            return newSet;
          });
        } catch (error: any) {
          showToast.error('移除用例失败: ' + error.message);
        }
      }
    });
  };

  // 单个用例执行
  const handleExecuteCase = (caseItem: TestPlanCase) => {
    if (!user) {
      showToast.error('请先登录');
      return;
    }

    // 🔥 功能测试用例：跳转到执行页面
    if (caseItem.case_type === 'functional') {
      navigate(`/test-plans/${id}/execute?type=functional&mode=single&caseIds=${caseItem.case_id}`);
      return;
    }

    // 🔥 UI自动化用例：弹出执行配置对话框
    if (caseItem.case_type === 'ui_auto') {
      setPendingExecutionType('single');
      setPendingCases([caseItem]);
      setShowExecutionConfig(true);
      return;
    }

    showToast.warning('不支持的用例类型');
  };

  // 切换单个用例选中状态
  const handleToggleCaseSelection = (caseId: number) => {
    setSelectedCaseIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(caseId)) {
        newSet.delete(caseId);
      } else {
        newSet.add(caseId);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const handleToggleAllSelection = () => {
    // 只选择当前页的用例
    const currentPageCases = getCurrentPageCases();
    const currentPageIds = new Set(currentPageCases.map(c => c.id));
    const allCurrentPageSelected = currentPageCases.every(c => selectedCaseIds.has(c.id));
    
    if (allCurrentPageSelected) {
      // 取消当前页的选择
      setSelectedCaseIds(prev => {
        const newSet = new Set(prev);
        currentPageIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // 选中当前页所有用例
      setSelectedCaseIds(prev => {
        const newSet = new Set(prev);
        currentPageIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  };

  // 获取当前页的用例
  const getCurrentPageCases = () => {
    const start = (casePagination.page - 1) * casePagination.pageSize;
    const end = start + casePagination.pageSize;
    return cases.slice(start, end);
  };

  // 计算分页信息
  const getPaginationInfo = () => {
    const total = cases.length;
    const totalPages = Math.max(1, Math.ceil(total / casePagination.pageSize));
    return {
      page: casePagination.page,
      pageSize: casePagination.pageSize,
      total,
      totalPages,
    };
  };

  // 处理页码变化
  const handlePageChange = (page: number) => {
    const totalPages = Math.ceil(cases.length / casePagination.pageSize);
    if (page >= 1 && page <= totalPages) {
      setCasePagination(prev => ({ ...prev, page }));
    }
  };

  // 处理每页条数变化
  const handlePageSizeChange = (pageSize: number) => {
    setCasePagination({ page: 1, pageSize });
    // 重置选中状态，因为页码变化了
    setSelectedCaseIds(new Set());
  };

  // 获取当前页的执行记录
  const getCurrentPageExecutions = () => {
    const start = (executionPagination.page - 1) * executionPagination.pageSize;
    const end = start + executionPagination.pageSize;
    return executions.slice(start, end);
  };

  // 计算执行历史分页信息
  const getExecutionPaginationInfo = () => {
    const total = executions.length;
    const totalPages = Math.max(1, Math.ceil(total / executionPagination.pageSize));
    return {
      page: executionPagination.page,
      pageSize: executionPagination.pageSize,
      total,
      totalPages,
    };
  };

  // 处理执行历史页码变化
  const handleExecutionPageChange = (page: number) => {
    const totalPages = Math.ceil(executions.length / executionPagination.pageSize);
    if (page >= 1 && page <= totalPages) {
      setExecutionPagination(prev => ({ ...prev, page }));
    }
  };

  // 处理执行历史每页条数变化
  const handleExecutionPageSizeChange = (pageSize: number) => {
    setExecutionPagination({ page: 1, pageSize });
  };

  // CaseTypeBadge 组件
  const getCaseTypeConfig = (caseType: string) => {
    const typeInfo = getCaseTypeInfo(caseType);
    return { 
      color: typeInfo.color, 
      bg: typeInfo.bgColor, 
      text: `${typeInfo.emoji} ${typeInfo.label}` 
    };
  };

  const CaseTypeBadge: React.FC<{ caseType: string }> = ({ caseType }) => {
    const config = getCaseTypeConfig(caseType);

    return (
      <span
        className="inline-block px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap"
        style={{
          backgroundColor: config.bg,
          color: config.color
        }}
      >
        {config.text}
      </span>
    );
  };

  // PriorityBadge 组件
  const PriorityBadge: React.FC<{ priority?: string }> = ({ priority }) => {
    if (!priority) return <span className="text-gray-400">-</span>;
    
    const priorityMap: { [key: string]: { label: string; className: string } } = {
      'critical': { label: '紧急', className: 'bg-red-100 text-red-700 border-red-200' },
      'high': { label: '高', className: 'bg-orange-100 text-orange-700 border-orange-200' },
      'medium': { label: '中', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
      'low': { label: '低', className: 'bg-green-100 text-green-700 border-green-200' },
    };

    const config = priorityMap[priority] || priorityMap['medium'];

    return (
      <span className={clsx('inline-flex px-2 py-1 rounded-md text-xs font-medium border', config.className)}>
        {config.label}
      </span>
    );
  };

  // 批量删除用例
  const handleBatchDelete = async () => {
    if (selectedCaseIds.size === 0) {
      showToast.warning('请先选择要删除的用例');
      return;
    }

    const selectedCases = cases.filter(c => selectedCaseIds.has(c.id));
    const caseNames = selectedCases.map(c => c.case_name).join('、');
    
    if (!window.confirm(`确定要删除选中的 ${selectedCaseIds.size} 个用例吗？\n\n${caseNames}`)) {
      return;
    }

    try {
      setLoading(true);
      let successCount = 0;
      let failCount = 0;

      for (const caseItem of selectedCases) {
        try {
          await testPlanService.removeCaseFromPlan(parseInt(id!), caseItem.case_id, caseItem.case_type);
          successCount++;
        } catch (error) {
          console.error(`删除用例 "${caseItem.case_name}" 失败:`, error);
          failCount++;
        }
      }

      if (failCount === 0) {
        showToast.success(`成功删除 ${successCount} 个用例`);
      } else {
        showToast.warning(`成功删除 ${successCount} 个用例，${failCount} 个删除失败`);
      }

      setSelectedCaseIds(new Set());
      loadTestPlanDetail(true);  // 静默刷新
    } catch (error) {
      console.error('批量删除用例失败:', error);
      showToast.error('批量删除用例失败');
    } finally {
      setLoading(false);
    }
  };

  // 批量执行用例
  const handleBatchExecute = () => {
    if (selectedCaseIds.size === 0) {
      showToast.warning('请先选择要执行的用例');
      return;
    }

    const selectedCases = cases.filter(c => selectedCaseIds.has(c.id));
    const hasFunctional = selectedCases.some(c => c.case_type === 'functional');
    const hasUiAuto = selectedCases.some(c => c.case_type === 'ui_auto');

    // 如果选中了不同类型的用例，提示用户
    if (hasFunctional && hasUiAuto) {
      showToast.warning('无法同时执行功能测试和UI自动化测试，请分别选择执行');
      return;
    }

    // 确定执行类型
    const caseType = hasFunctional ? 'functional' : 'ui_auto';
    
    // 🔥 功能测试用例：跳转到执行页面
    if (caseType === 'functional') {
      const caseIds = selectedCases.map(c => c.case_id).join(',');
      navigate(`/test-plans/${id}/execute?type=${caseType}&mode=batch&caseIds=${caseIds}`);
      return;
    }

    // 🔥 UI自动化用例：弹出执行配置对话框
    if (caseType === 'ui_auto') {
      setPendingExecutionType('batch');
      setPendingCases(selectedCases);
      setShowExecutionConfig(true);
      return;
    }
  };

  // 🔥 确认执行UI自动化用例
  const handleConfirmExecute = async () => {
    if (pendingCases.length === 0) {
      showToast.warning('没有待执行的用例');
      return;
    }

    try {
      setLoading(true);
      setIsExecutingLocally(true); // 🔥 标记正在执行
      isExecutingRef.current = true; // 🔥 立即更新 ref，避免状态更新延迟
      
      const caseIds = pendingCases.map(c => c.case_id);
      
      // 🔥 单个用例执行：跳转到测试执行详情页
      if (pendingExecutionType === 'single') {
        console.log(`🚀 [TestPlanDetail] 执行单个UI自动化用例`, {
          caseId: pendingCases[0].case_id,
          caseName: pendingCases[0].case_name,
          planId: parseInt(id!),
          config: executionConfig
        });

        // 🔥 先创建测试计划执行记录（autoExecute: false，不自动执行）
        const planExecution = await testPlanService.startTestPlanExecution({
          plan_id: parseInt(id!),
          executor_id: user!.id,
          execution_type: 'ui_auto',
          case_ids: [pendingCases[0].case_id],
          autoExecute: false, // 🔥 不自动执行，由前端调用runTestCase执行
          executionConfig: {
            executionEngine: executionConfig.executionEngine,
            enableTrace: executionConfig.enableTrace,
            enableVideo: executionConfig.enableVideo,
            environment: executionConfig.environment,
            assertionMatchMode: executionConfig.assertionMatchMode // 🔥 新增：传递断言匹配策略
          }
        });

        console.log(`📋 [TestPlanDetail] 测试计划执行记录已创建:`, planExecution.id);
        pendingExecutionIdRef.current = planExecution.id; // 🔥 记录执行ID，用于页面卸载时取消

        // 🔥 调用后端API执行UI自动化用例，传递planExecutionId
        const response = await testService.runTestCase(pendingCases[0].case_id, {
          environment: executionConfig.environment,
          executionEngine: executionConfig.executionEngine,
          enableTrace: executionConfig.enableTrace,
          enableVideo: executionConfig.enableVideo,
          assertionMatchMode: executionConfig.assertionMatchMode, // 🔥 新增：传递断言匹配策略
          planExecutionId: planExecution.id, // 🔥 传递测试计划执行记录ID，用于完成后同步
        });

        if (response && response.runId) {
          showToast.success(`开始执行用例: ${pendingCases[0].case_name}`);
          
          // 🔥 执行成功，清除 pendingExecutionId
          pendingExecutionIdRef.current = null;
          
          // 关闭对话框
          setShowExecutionConfig(false);
          setPendingCases([]);
          
          // 🔥 跳转到测试执行详情页，带上返回信息
          navigate(`/test-runs/${response.runId}/detail`, {
            state: { 
              from: `/test-plans/${id}`,
              fromTab: 'cases',
              planId: parseInt(id!),
              planExecutionId: planExecution.id,
              caseName: pendingCases[0].case_name 
            }
          });
        } else {
          throw new Error('执行失败');
        }
      } 
      // 🔥 批量执行：判断是重新执行还是新建执行记录
      else {
        // 🔥 如果是重新执行，重置结果和状态后调用重新执行API
        if (pendingReexecuteExecution) {
          console.log(`🔄 [TestPlanDetail] UI自动化重新执行：开始重置执行结果并重新执行, executionId: ${pendingReexecuteExecution.id}`);
          
          try {
            // 🔥 步骤1：重置所有执行结果和状态
            const resetResults = (pendingReexecuteExecution.execution_results || []).map(result => ({
              ...result,
              result: '' as const, // 空字符串表示未执行
              execution_status: 'queued' as const, // 重置为队列状态
              duration_ms: 0,
              error_message: undefined,
              executed_at: undefined,
              finished_at: undefined,
              started_at: undefined,
              execution_id: undefined, // 清除之前的执行ID
            }));
            
            // 先重置执行记录状态
            await testPlanService.updateTestPlanExecution(pendingReexecuteExecution.id, {
              status: 'running',
              started_at: new Date(), // 重置开始时间
              finished_at: null, // 重置结束时间
              duration_ms: null, // 重置耗时
              completed_cases: 0,
              passed_cases: 0,
              failed_cases: 0,
              blocked_cases: 0,
              skipped_cases: 0,
              progress: 0,
              execution_results: resetResults,
              error_message: null, // 清除之前的错误信息
            });
            
            console.log(`✅ [TestPlanDetail] UI自动化重新执行：执行结果已重置, executionId: ${pendingReexecuteExecution.id}`);
            
            // 🔥 步骤2：调用后端API重新执行现有记录（不创建新记录）
            await apiClient.post(`/api/v1/test-plans/executions/${pendingReexecuteExecution.id}/reexecute`, {
              executionConfig: {
                executionEngine: executionConfig.executionEngine,
                enableTrace: executionConfig.enableTrace,
                enableVideo: executionConfig.enableVideo,
                environment: executionConfig.environment,
                assertionMatchMode: executionConfig.assertionMatchMode // 🔥 新增：传递断言匹配策略
              },
            });
            
            console.log(`✅ [TestPlanDetail] UI自动化重新执行：已重新调用执行任务, executionId: ${pendingReexecuteExecution.id}`);
            
            // 🔥 立即更新本地状态
            setExecutions(prev => prev.map(e => 
              e.id === pendingReexecuteExecution.id ? {
                ...e,
                status: 'running',
                started_at: new Date().toISOString(),
                finished_at: undefined,
                duration_ms: undefined,
                completed_cases: 0,
                passed_cases: 0,
                failed_cases: 0,
                blocked_cases: 0,
                skipped_cases: 0,
                progress: 0,
                execution_results: resetResults,
                error_message: undefined,
              } : e
            ));
            
            showToast.success('已重新开始执行UI自动化用例');
            
            // 关闭对话框
            setShowExecutionConfig(false);
            setPendingCases([]);
            setPendingReexecuteExecution(null);
            
            // 切换到执行历史tab
            setActiveTab('executions');
            
            // 重新加载测试计划详情以获取最新的执行状态（静默刷新）
            await loadTestPlanDetail(true);
          } catch (error) {
            const err = error as { response?: { data?: { error?: string } }; message?: string };
            console.error('❌ [TestPlanDetail] UI自动化重新执行：失败:', error);
            console.error('❌ [TestPlanDetail] UI自动化重新执行：错误详情:', err?.response?.data || err?.message);
            showToast.error(`重新执行失败: ${err?.response?.data?.error || err?.message || '未知错误'}`);
            
            // 清除重新执行状态
            setPendingReexecuteExecution(null);
            setShowExecutionConfig(false);
            setPendingCases([]);
          }
        } else {
          // 🔥 新建执行记录（批量执行）
          console.log(`🚀 [TestPlanDetail] 批量执行UI自动化用例`, {
            count: caseIds.length,
            planId: parseInt(id!),
            config: executionConfig
          });

          // 调用后端API开始执行（批量执行时autoExecute: true）
          await testPlanService.startTestPlanExecution({
            plan_id: parseInt(id!),
            executor_id: user!.id,
            execution_type: 'ui_auto',
            case_ids: caseIds,
            autoExecute: true, // 🔥 批量执行时自动执行
            executionConfig: {
              executionEngine: executionConfig.executionEngine,
              enableTrace: executionConfig.enableTrace,
              enableVideo: executionConfig.enableVideo,
              environment: executionConfig.environment,
              assertionMatchMode: executionConfig.assertionMatchMode // 🔥 新增：传递断言匹配策略
            }
          });

          showToast.success(`开始执行 ${caseIds.length} 个UI自动化用例`);
          
          // 关闭对话框
          setShowExecutionConfig(false);
          setPendingCases([]);
          setPendingReexecuteExecution(null);
          
          // 清空选择
          setSelectedCaseIds(new Set());
          
          // 切换到执行历史tab
          setActiveTab('executions');
          
          // 重新加载测试计划详情以获取最新的执行记录（静默刷新）
          await loadTestPlanDetail(true);
        }
      }
    } catch (error) {
      console.error('❌ [TestPlanDetail] 执行UI自动化用例失败:', error);
      showToast.error('执行失败：' + (error instanceof Error ? error.message : '未知错误'));
      setIsExecutingLocally(false); // 🔥 执行失败时重置本地执行状态
      isExecutingRef.current = false; // 🔥 同步重置 ref
      pendingExecutionIdRef.current = null; // 🔥 清除待处理的执行ID
      // 清除执行配置相关状态
      setPendingReexecuteExecution(null);
      setShowExecutionConfig(false);
      setPendingCases([]);
    } finally {
      setLoading(false);
    }
  };

  // 查看执行日志
  const handleViewExecutionLog = (executionId: string) => {
    setCurrentExecutionId(executionId);
    setShowExecutionLogModal(true);
  };

  // 🔥 继续执行测试计划（保留之前的历史数据，传递所有用例但保留已完成用例的状态）
  const handleContinueExecution = async (execution: TestPlanExecution) => {
    // 获取该执行类型的所有用例
    const allCasesOfType = cases.filter(c => c.case_type === execution.execution_type);
    
    if (allCasesOfType.length === 0) {
      showToast.info('没有找到可执行的用例');
      return;
    }
    
    // 检查是否有未完成的用例
    const completedCaseIds = new Set<number>();
    if (execution.execution_results && Array.isArray(execution.execution_results)) {
      (execution.execution_results as Array<{ case_id: number; result?: string }>).forEach(result => {
        if (result.result && result.result !== '') {
          completedCaseIds.add(result.case_id);
        }
      });
    }
    
    const hasUnfinishedCases = allCasesOfType.some(c => !completedCaseIds.has(c.case_id));
    if (!hasUnfinishedCases) {
      showToast.info('所有用例已执行完成');
      return;
    }
    
    // 🔥 立即更新执行状态为 running，保留原来的 started_at（继续执行不重置开始时间）
    try {
      console.log(`🔄 [TestPlanDetail] 开始更新执行状态, executionId: ${execution.id}`);
      const result = await testPlanService.updateTestPlanExecution(execution.id, {
        status: 'running',
        error_message: null, // 🔥 清除之前的错误信息
        // 🔥 继续执行：不更新 started_at，保留原始开始时间
      });
      console.log(`✅ [TestPlanDetail] 后端返回结果:`, result);
      
      // 🔥 立即更新本地状态，让 UI 同步显示
      setExecutions(prev => prev.map(e => 
        e.id === execution.id ? { ...e, status: 'running' } : e
      ));
      
      console.log(`✅ [TestPlanDetail] 执行状态已更新为 running, executionId: ${execution.id}`);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      console.error('❌ [TestPlanDetail] 更新执行状态失败:', error);
      console.error('❌ [TestPlanDetail] 错误详情:', err?.response?.data || err?.message);
      showToast.error(`更新状态失败: ${err?.response?.data?.error || err?.message || '未知错误'}`);
      // 继续导航，即使状态更新失败
    }
    
    // 导航到执行页面，传递所有用例
    // 🔥 continueMode=continue 表示继续执行（保留历史数据）
    const allCaseIds = allCasesOfType.map(c => c.case_id).join(',');
    navigate(`/test-plans/${id}/execute?type=${execution.execution_type}&mode=batch&caseIds=${allCaseIds}&continueFrom=${execution.id}&continueMode=continue&fromTab=executions`);
  };
  
  // 🔥 重新执行测试计划（完全重置，执行所有用例）
  const handleReExecute = async (execution: TestPlanExecution) => {
    // 获取该执行类型的所有用例
    const allCasesOfType = cases.filter(c => c.case_type === execution.execution_type);
    
    if (allCasesOfType.length === 0) {
      showToast.info('没有找到可执行的用例');
      return;
    }
    
    // 🔥 UI自动化：弹出配置对话框，与功能用例批量执行保持一致
    if (execution.execution_type === 'ui_auto') {
      console.log(`🔄 [TestPlanDetail] UI自动化重新执行：弹出配置对话框, executionId: ${execution.id}`);
      
      // 🔥 尝试从metadata获取执行配置，用于预填充配置对话框
      const metadata = execution.metadata as any;
      const previousConfig = metadata?.executionConfig;
      if (previousConfig) {
        setExecutionConfig({
          executionEngine: previousConfig.executionEngine || 'mcp',
          enableTrace: previousConfig.enableTrace !== undefined ? previousConfig.enableTrace : false,
          enableVideo: previousConfig.enableVideo !== undefined ? previousConfig.enableVideo : false,
          environment: previousConfig.environment || 'staging',
          assertionMatchMode: previousConfig.assertionMatchMode || 'auto' // 🔥 新增：恢复断言匹配策略
        });
      }
      
      // 设置待执行的用例和重新执行的execution对象
      setPendingCases(allCasesOfType);
      setPendingExecutionType('batch');
      setPendingReexecuteExecution(execution);
      setShowExecutionConfig(true);
      return;
    }
    
    // 🔥 功能用例：导航到执行页面，传递重新执行的参数
    // 🔥 立即更新执行状态为 running，并刷新本地状态
    // 🔥 关键：必须同时更新 started_at 为当前时间，否则会被 getTestPlanDetail 的超时清理逻辑又改回 cancelled
    try {
      console.log(`🔄 [TestPlanDetail] 重新执行：开始更新执行状态, executionId: ${execution.id}`);
      const result = await testPlanService.updateTestPlanExecution(execution.id, {
        status: 'running',
        started_at: new Date(), // 🔥 重置开始时间，避免被超时清理逻辑判定为超时
        error_message: null, // 🔥 清除之前的错误信息
      });
      console.log(`✅ [TestPlanDetail] 重新执行：后端返回结果:`, result);

      // 🔥 立即更新本地状态，让 UI 同步显示
      setExecutions(prev => prev.map(e => 
        e.id === execution.id ? { ...e, status: 'running' } : e
      ));
      
      console.log(`✅ [TestPlanDetail] 重新执行：执行状态已更新为 running, executionId: ${execution.id}`);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      console.error('❌ [TestPlanDetail] 重新执行：更新执行状态失败:', error);
      console.error('❌ [TestPlanDetail] 重新执行：错误详情:', err?.response?.data || err?.message);
      showToast.error(`更新状态失败: ${err?.response?.data?.error || err?.message || '未知错误'}`);
      // 继续导航，即使状态更新失败
    }
    
    // 导航到执行页面，传递重新执行的参数
    // 🔥 continueMode=reexecute 表示重新执行（完全重置）
    const allCaseIds = allCasesOfType.map(c => c.case_id).join(',');
    navigate(`/test-plans/${id}/execute?type=${execution.execution_type}&mode=batch&caseIds=${allCaseIds}&continueFrom=${execution.id}&continueMode=reexecute&fromTab=executions`);
  };

  // 格式化日期
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      // return format(new Date(dateStr), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN });
      return format(new Date(dateStr), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN });
    } catch {
      return '-';
    }
  };
  // 格式化时长（毫秒转字符串）
  const formatDuration = (ms?: number | undefined): string => {
    if (!ms) return '-';
    const totalSeconds = Number(ms) / 1000;
    const seconds = Math.floor(totalSeconds);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      // 🔥 修复：小于1分钟时，显示三位小数（精确到毫秒），与TestRuns.tsx保持一致
      // 例如：16.891s 而不是 16.89s
      return `${totalSeconds.toFixed(3)}s`;
    }
  };
  
  // 🔥 新增：计算执行耗时（支持 running 状态的实时计算）
  const getExecutionDuration = (execution: TestPlanExecution): string => {
    // 如果有已完成的 duration_ms，直接使用
    if (execution.duration_ms) {
      return formatDuration(execution.duration_ms);
    }
    
    // 对于 running 状态，实时计算已运行时间
    if (execution.status === 'running' && execution.started_at) {
      const startTime = new Date(execution.started_at).getTime();
      const runningMs = currentTime.getTime() - startTime;
      if (runningMs > 0) {
        return formatDuration(runningMs);
      }
    }
    
    return '-';
  };
  // 计算实际状态（基于执行情况和时间）
  const getComputedStatus = (): string => {
    if (!plan) return 'draft';
    
    // 如果已归档，状态优先显示为归档
    if (plan.status === 'archived') {
      return 'archived';
    }
    
    // 检查计划结束时间是否已过
    const now = new Date();
    const endDate = plan.end_date ? new Date(plan.end_date) : null;
    const isExpired = endDate && now > endDate;
    
    // 获取执行情况
    const totalCases = statistics?.total_cases || 0;
    const executedCases = statistics?.executed_cases || 0;
    
    // 如果没有用例，状态为草稿或未开始
    if (totalCases === 0) {
      return 'draft';
    }
    
    // 判断状态优先级：
    // 1. 已归档 (archived) - 已处理
    // 2. 已结束 (expired) - 计划时间已过期
    // 3. 已完成 (completed) - 所有用例都已执行
    // 4. 进行中 (active) - 有用例已执行，但未全部完成
    // 5. 未开始 (not_started) - 一个用例都没执行
    
    if (isExpired && executedCases < totalCases) {
      return 'expired'; // 计划时间已到但未完成
    }
    
    if (executedCases === totalCases) {
      return 'completed'; // 所有用例都已执行
    }
    
    if (executedCases > 0) {
      return 'active'; // 进行中
    }
    
    return 'not_started'; // 未开始
  };
  
  // 获取状态中文
  const getStatusText = (status?: string) => {
    const computedStatus = status || getComputedStatus();
    const statusMap: Record<string, string> = {
      draft: '草稿',
      not_started: '未开始',
      active: '进行中',
      completed: '已完成',
      expired: '已结束',
      cancelled: '已取消',
      archived: '已归档',
    };
    return statusMap[computedStatus] || computedStatus;
  };

  const getStatusIcon = (status?: string) => {
    const computedStatus = status || getComputedStatus();
    switch (computedStatus) {
      case 'draft':
        return <FileText className="h-5 w-5 text-gray-600" />;
      case 'not_started':
        return <Clock className="h-5 w-5 text-gray-600" />;
      case 'active':
        return <Activity className="h-5 w-5 text-blue-600" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'expired':
        return <XCircle className="h-5 w-5 text-orange-600" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'archived':
        return <Archive className="h-5 w-5 text-gray-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status?: string) => {
    const computedStatus = status || getComputedStatus();
    const colorMap: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      not_started: 'bg-gray-100 text-gray-800',
      active: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      expired: 'bg-orange-100 text-orange-800',
      cancelled: 'bg-red-100 text-red-800',
      archived: 'bg-gray-100 text-gray-800',
    };
    return colorMap[computedStatus] || 'bg-gray-100 text-gray-800';
  };

  // 获取类型中文
  const getPlanTypeText = (type: string) => {
    const typeMap: Record<string, string> = {
      functional: '功能测试',
      ui_auto: 'UI自动化',
      mixed: '混合测试',
      regression: '回归测试',
      smoke: '冒烟测试',
      integration: '集成测试',
    };
    return typeMap[type] || type;
  };

  // 获取执行结果配置
  const getStatusConfig = (status: string | null | undefined) => {
    switch (status) {
      case 'pass':
        return { color: 'success', text: '✓ 通过', icon: '✓' };
      case 'fail':
        return { color: 'error', text: '✗ 失败', icon: '✗' };
      case 'block':
        return { color: 'warning', text: '⚠ 阻塞', icon: '⚠' };
      case 'skip':
        return { color: 'default', text: '⊘ 跳过', icon: '⊘' };
      default:
        return { color: 'default', text: '未知', icon: '' };
    }
  };

  // 🔥 修复：从executions数组的execution_results中获取用例的最新执行记录
  // 数据来源：test_plan_executions表的execution_results字段
  const getLatestCaseExecution = (caseId: number): TestPlanCaseResult | null => {
    if (!executions || executions.length === 0) {
      return null;
    }

    let latestResult: TestPlanCaseResult | null = null;
    let latestTime: string = '';

    // 遍历所有执行记录，查找该用例的最新执行结果
    for (const execution of executions) {
      if (!execution.execution_results || !Array.isArray(execution.execution_results)) {
        continue;
      }

      // 在当前执行记录的execution_results中查找该用例
      for (const result of execution.execution_results) {
        if (result.case_id === caseId) {
          // 获取执行时间：优先使用finished_at，其次executed_at，最后started_at
          const executedTime = result.finished_at || result.executed_at || execution.started_at;
          
          // 如果这是第一条记录，或者当前记录更新，则更新latestResult
          if (!latestResult || executedTime > latestTime) {
            latestResult = {
              ...result,
              // 确保execution_status存在：优先使用result.execution_status，其次使用execution.status
              execution_status: result.execution_status || (execution.status as any) || 'completed',
            };
            latestTime = executedTime;
          }
        }
      }
    }

    return latestResult;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-md h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50">
      <div className="max-w-[1500px] mx-auto">
        {/* 页面标题 */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-5">
            <button
              onClick={handleBackToList}
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              返回列表
            </button>
            <div>
              <div className="flex items-center gap-2">
                <div className="text-3xl font-bold text-gray-900 truncate max-w-[1000px]" title={plan.name}>{plan.name}</div>
                {/* 🔥 轻量刷新指示器 */}
                {isRefreshing && (
                  <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                )}
              </div>
              {plan.description && (
                <p className="text-gray-600">{plan.description}</p>
              )}
            </div>
            </div>
            <div className={clsx('px-4 py-2 rounded-lg flex items-center gap-2', getStatusColor(plan.status))}>
              {getStatusIcon(plan.status)}
              <span className="font-medium">{getStatusText(plan.status)}</span>
            </div>
            {/* <div className="flex items-center justify-center gap-2">
              <Button
                onClick={loadTestPlanDetail}
                loading={loading}
                icon={<RefreshCw className="w-4 h-4 mt-1" />}
              >
                刷新
              </Button>
            </div> */}
            
            {/* <div className="flex items-center justify-center gap-2">
              <button
                onClick={handleEdit}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Edit className="w-4 h-4" />
                编辑
              </button>
              <button
                onClick={() => handleExecute('functional')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                <Play className="w-4 h-4" />
                执行功能测试
              </button>
              <button
                onClick={() => handleExecute('ui_auto')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                <Play className="w-4 h-4" />
                执行UI自动化
              </button>
            </div> */}
          </div>
        </div>

        {/* 计划概览 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          {/* <div className="grid grid-cols-4 gap-6"> */}
          <div className="flex items-center justify-between gap-6">
          <div>
              <div className="text-sm text-gray-500 mb-1">所属项目</div>
              <div className="text-lg font-semibold text-gray-800">{plan.project}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">计划简称</div>
              <div className="text-lg font-bold text-gray-800">{plan.short_name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">计划类型</div>
              <div className="text-lg font-semibold text-gray-800">{getPlanTypeText(plan.plan_type)}</div>
            </div>
            {/* <div>
              <div className="text-sm text-gray-500 mb-1">负责人</div>
              <div className="text-lg font-semibold">{plan.owner_name}</div>
            </div> */}
            {/* <div>
              <div className="text-sm text-gray-500 mb-1">用例总数</div>
              <div className="text-lg font-semibold">{statistics?.total_cases || 0}</div>
            </div>  */}
            <div>
              <div className="text-sm text-gray-500 mb-1">计划时间</div>
              <div className="text-lg font-bold text-gray-800">{formatDate(plan.start_date)} ~ {formatDate(plan.end_date)}</div>
            </div>
            {/* <div>
              <div className="text-sm text-gray-500 mb-1">计划状态</div>
              <span>{getStatusText()}</span>
              <div className={clsx('inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium', getStatusColor())}>
                {getStatusIcon()}
                <span>{getStatusText()}</span>
              </div>
            </div> */}
          </div>
          
          {/* 计划时间和描述放一行 */}
          {/* <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-sm text-gray-500 whitespace-nowrap">
                <Calendar className="w-4 h-4" />
                计划时间: {formatDate(plan.start_date)} ~ {formatDate(plan.end_date)}
                {plan.owner_name && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">负责人: </span>
                  <span className="text-sm text-gray-700">{plan.owner_name}</span>
                  <User className="w-4 h-4" />
                  {plan.owner_name}
                </div>
                )}
                {plan.description && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">描述: </span>
                  <span className="text-sm text-gray-700">{plan.description}</span>
                  <BookOpen className="w-4 h-4" />
                  {plan.description}
                </div>
                )}
              </div>
            </div>
          </div> */}
          {/* 计划时间和描述放一行 */}
          {/* <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-6">
              <div className="flex items-center gap-12 text-sm text-gray-500 whitespace-nowrap">
                <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {formatDate(plan.start_date)} ~ {formatDate(plan.end_date)}
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  {plan.description}
                </div>
              </div>
            </div>
            </div> */}
        </div>

        {/* 标签页 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="border-b border-gray-200">
            <div className="flex items-center justify-between gap-1 p-2 text-sm">
              <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('cases')}
                className={clsx(
                  'px-4 py-2 rounded-lg transition-colors',
                  activeTab === 'cases'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  测试用例 ({statistics?.total_cases || 0})
                </div>
              </button>
              <button
                onClick={() => setActiveTab('executions')}
                className={clsx(
                  'px-4 py-2 rounded-lg transition-colors',
                  activeTab === 'executions'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  执行历史 ({executions.length})
                </div>
              </button>
              <button
                onClick={() => setActiveTab('statistics')}
                className={clsx(
                  'px-4 py-2 rounded-lg transition-colors',
                  activeTab === 'statistics'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  统计分析
                </div>
              </button>
              </div>
              {activeTab === 'cases' && <div className="flex items-center gap-4">
                {selectedCaseIds.size >= 0 && (
                  <>
                    {/* 🔥 根据计划类型显示对应的按钮 */}
                  </>
                )}
                {/* 🔥 功能测试用例按钮组 */}
                {(plan?.plan_type === 'functional' || plan?.plan_type === 'mixed' || plan?.plan_type === 'regression' || plan?.plan_type === 'smoke' || plan?.plan_type === 'integration') && (
                  <>
                    <button
                      onClick={() => handleAddCasesModal('functional')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-[13px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      关联功能用例
                    </button>
                  </>
                )}
                
                {/* 🔥 UI自动化用例按钮组 */}
                {(plan?.plan_type === 'ui_auto' || plan?.plan_type === 'mixed') && (
                  <>
                    <button
                      onClick={() => handleAddCasesModal('ui_auto')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-[13px]"
                    >
                      <Plus className="w-4 h-3.5" />
                      关联UI自动化用例
                    </button>
                  </>
                )}
                
                {/* 🔥 通用操作按钮 */}
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedCaseIds.size === 0}
                  className={clsx("inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-[13px]", selectedCaseIds.size === 0 ? 'opacity-50 cursor-not-allowed' : 'opacity-100 cursor-pointer')}
                >
                  <Trash2 className="w-4 h-3.5" />
                  {selectedCaseIds.size > 0 ? `批量删除 ${selectedCaseIds.size} 项` : '批量删除'}
                </button>
                <button
                  onClick={handleBatchExecute}
                  disabled={selectedCaseIds.size === 0}
                  className={clsx("inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-[13px]", selectedCaseIds.size === 0 ? 'opacity-50 cursor-not-allowed' : 'opacity-100 cursor-pointer')}
                >
                  <Play className="w-4 h-3.5" />
                  {selectedCaseIds.size > 0 ? `批量执行 ${selectedCaseIds.size} 项` : '批量执行'}
                </button>
                
                {/* 🔥 执行所有按钮 - 根据计划类型显示 */}
                {(plan?.plan_type === 'functional' || plan?.plan_type === 'regression' || plan?.plan_type === 'smoke' || plan?.plan_type === 'integration') && (
                  <button
                    onClick={() => handleExecute('functional')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-[13px]"
                  >
                    <Play className="w-4 h-3.5" />
                    执行所有功能用例
                  </button>
                )}
                
                {(plan?.plan_type === 'ui_auto') && (
                  <button
                    onClick={() => handleExecute('ui_auto')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-[13px]"
                  >
                    <Play className="w-4 h-3.5" />
                    执行所有UI自动化
                  </button>
                )}
                
                {(plan?.plan_type === 'mixed') && (
                  <>
                    <button
                      onClick={() => handleExecute('functional')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-[13px]"
                    >
                      <Play className="w-4 h-3.5" />
                      执行所有功能用例
                    </button>
                    <button
                      onClick={() => handleExecute('ui_auto')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-[13px]"
                    >
                      <Play className="w-4 h-3.5" />
                      执行所有UI自动化
                    </button>
                  </>
                )}
                {/* <Button
                  style={{ width: '100px', height: '32px', borderRadius: '8px', fontSize: '13px', gap: '2px' }}
                  type="primary"
                  onClick={handleAddCases}
                  icon={<Plus className="w-4 h-3.5" />}
                >
                  关联用例
                </Button>
                <Button
                  // size="small"
                  style={{ width: '100px', height: '32px', borderRadius: '8px', fontSize: '13px', gap: '2px' }}
                  type="primary"
                  onClick={handleBatchDelete}
                  disabled={selectedCaseIds.size === 0}
                  icon={<Trash2 className="w-4 h-3.5" />}
                  danger={true}
                >
                  批量删除
                </Button>
                <Button
                  style={{ width: '100px', height: '32px', borderRadius: '8px', fontSize: '13px', gap: '2px' }}
                  type="primary"
                  onClick={handleBatchExecute}
                  disabled={selectedCaseIds.size === 0}
                  icon={<Play className="w-4 h-3.5" />}
                >
                  批量执行
                </Button>
                <Button
                  style={{ width: '100px', height: '32px', borderRadius: '8px', fontSize: '13px', gap: '2px' }}
                  type="primary"
                  onClick={() => handleExecute('functional')}
                  icon={<Play className="w-4 h-3.5" />}
                >
                  执行所有
                </Button> */}
              </div>}
            </div>
          </div>

          <div className="p-0">
            {/* 测试用例列表 */}
            {activeTab === 'cases' && (
              <div>
                {/* <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">测试用例列表</h3>
                  <button
                    onClick={handleAddCases}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                    添加用例
                  </button>
                </div> */}

                {cases.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">还没有添加测试用例</p>
                    <button
                      // onClick={handleAddCases}
                      onClick={() => handleAddCasesModal(plan?.plan_type as TestCaseType)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      添加第一个用例
                    </button>
                  </div>
                ) : (
                  <>
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                            <button
                              onClick={handleToggleAllSelection}
                              className="flex items-center justify-center w-5 h-5 hover:bg-gray-200 rounded"
                              title={(() => {
                                const currentPageCases = getCurrentPageCases();
                                const allCurrentPageSelected = currentPageCases.length > 0 && currentPageCases.every(c => selectedCaseIds.has(c.id));
                                return allCurrentPageSelected ? '取消全选' : '全选当前页';
                              })()}
                            >
                              {(() => {
                                const currentPageCases = getCurrentPageCases();
                                const allCurrentPageSelected = currentPageCases.length > 0 && currentPageCases.every(c => selectedCaseIds.has(c.id));
                                return allCurrentPageSelected ? (
                                  <CheckSquare className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-gray-400" />
                                );
                              })()}
                            </button>
                          </th>
                          {/* <th className="px-1 py-2 text-left text-xs font-medium text-gray-500 uppercase">序号</th> */}
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">用例名称</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">用例版本</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">用例类型</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">优先级</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">用例来源</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">执行状态</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">执行结果</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">创建时间</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">更新时间</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {getCurrentPageCases().map((caseItem, index) => {
                          const isSelected = selectedCaseIds.has(caseItem.id);
                          const globalIndex = (casePagination.page - 1) * casePagination.pageSize + index;
                          return (
                            <tr 
                              key={caseItem.id} 
                              className={clsx("hover:bg-gray-50", isSelected && "bg-blue-50")}
                            >
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleToggleCaseSelection(caseItem.id)}
                                  className="flex items-center justify-center w-5 h-5 hover:bg-gray-200 rounded"
                                  title={isSelected ? '取消选择' : '选择'}
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-blue-600" />
                                  ) : (
                                    <Square className="w-4 h-4 text-gray-400" />
                                  )}
                                </button>
                              </td>
                              {/* <td className="px-4 py-3 text-sm text-gray-500">{globalIndex + 1}</td> */}
                              <td className="px-3 py-3 text-sm font-medium text-gray-700">
                                {caseItem.case_id}
                              </td>
                              {/* <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {caseItem.case_name}
                              </td> */}
                              <td className="px-3 py-3 max-w-[600px]">
                                <div className="text-sm font-medium text-gray-900 truncate" title={caseItem.case_name}>
                                  {caseItem.case_name}
                                </div>
                              </td>
                              {/* 🔥 用例版本 - 支持功能测试和UI自动化 */}
                              <td className="px-3 py-3 text-sm text-gray-900">
                                {(() => {
                                  if (caseItem.case_type === 'functional' && caseItem.case_detail) {
                                    return (caseItem.case_detail as any).project_version?.version_name || 
                                           (caseItem.case_detail as any).project_version?.version_code || 
                                           (caseItem.case_detail as any).project_version_id || '-';
                                  } else if (caseItem.case_type === 'ui_auto' && caseItem.case_detail) {
                                    // UI自动化：优先从 case_detail，其次尝试顶层字段
                                    return (caseItem.case_detail as any).version || 
                                           (caseItem as any).version || '-';
                                  }
                                  return '-';
                                })()}
                              </td>
                              {/* 🔥 用例类型 - 支持功能测试和UI自动化 */}
                              <td className="px-3 py-3 text-sm text-gray-500">
                                {caseItem.case_type === 'functional' && caseItem.case_detail && (caseItem.case_detail as any).case_type ? (
                                  <CaseTypeBadge caseType={(caseItem.case_detail as any).case_type} />
                                ) : caseItem.case_type === 'ui_auto' && caseItem.case_detail && (caseItem.case_detail as any).case_type ? (
                                  <CaseTypeBadge caseType={(caseItem.case_detail as any).case_type} />
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              {/* 🔥 优先级 - 支持功能测试和UI自动化 */}
                              <td className="px-3 py-3 text-sm text-gray-500 text-center">
                                {(() => {
                                  // 尝试从多个来源获取优先级
                                  const priority = (caseItem.case_detail as any)?.priority || (caseItem as any).priority;
                                  return priority ? (
                                    <PriorityBadge priority={priority} />
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  );
                                })()}
                              </td>
                              {/* 🔥 用例来源 - 支持功能测试和UI自动化 */}
                              <td className="px-3 py-3 text-sm text-gray-500">
                              <div className="flex items-center justify-center">
                                {caseItem.case_type === 'functional' && caseItem.case_detail && (caseItem.case_detail as any).source ? (
                                  <span className={clsx(
                                    'inline-flex px-2 py-1 rounded-md text-xs font-medium',
                                    (caseItem.case_detail as any).source === 'MANUAL' 
                                      ? 'bg-blue-100 text-blue-700' 
                                      : 'bg-purple-100 text-purple-700'
                                  )}>
                                    {(caseItem.case_detail as any).source === 'MANUAL' ? '手动创建' : 'AI生成'}
                                  </span>
                                ) : caseItem.case_type === 'ui_auto' ? (
                                  <span className="inline-flex px-2 py-1 rounded-md text-xs font-medium bg-cyan-100 text-cyan-700">
                                    功能用例
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                                </div>
                              </td>
                              {/* <td className="px-4 py-3 text-sm text-center">
                                {(() => {
                                  // 如果有最新执行记录，使用最新执行记录的状态
                                  const hasExecution = caseItem.case_detail?.last_execution || caseItem.is_executed;
                                  return hasExecution ? (
                                    <span className="ml-1 text-green-600">已执行</span>
                                  ) : (
                                    <span className="ml-1 text-gray-500">未执行</span>
                                  );
                                })()}
                              </td> */}
                              {/* 执行状态 */}
                              <td className="px-3 py-3 text-center">
                                <div className="flex items-center justify-center">
                                  {(() => {
                                    // 🔥 修复：从executions数组的execution_results中获取用例的最新执行状态
                                    // 数据来源：test_plan_executions表的execution_results字段
                                    const latestExecution = getLatestCaseExecution(caseItem.case_id);
                                    const executionStatus = latestExecution?.execution_status;

                                    if (!executionStatus) {
                                      return <span className="text-gray-500 text-sm">-</span>;
                                    }

                                    const statusConfig: Record<string, { className: string; text: string }> = {
                                      'running': { className: 'bg-blue-100 text-blue-800 border-blue-200', text: '运行中' },
                                      'completed': { className: 'bg-green-100 text-green-800 border-green-200', text: '已完成' },
                                      'failed': { className: 'bg-red-100 text-red-800 border-red-200', text: '失败' },
                                      'pending': { className: 'bg-yellow-100 text-yellow-800 border-yellow-200', text: '等待中' },
                                      'queued': { className: 'bg-yellow-100 text-yellow-800 border-yellow-200', text: '排队中' },
                                      'cancelled': { className: 'bg-gray-100 text-gray-800 border-gray-200', text: '已取消' },
                                      'error': { className: 'bg-red-100 text-red-800 border-red-200', text: '错误' },
                                    };

                                    const config = statusConfig[executionStatus] || {
                                      className: 'bg-gray-100 text-gray-800 border-gray-200',
                                      text: executionStatus
                                    };

                                    return (
                                      <span className={clsx(
                                        'inline-flex px-2 py-1 rounded-md text-xs font-medium border whitespace-nowrap',
                                        config.className
                                      )}>
                                        {config.text}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-xs text-center">
                                {(() => {
                                  // 🔥 修复：从executions数组的execution_results中获取用例的最新执行结果
                                  // 数据来源：test_plan_executions表的execution_results字段
                                  const latestExecution = getLatestCaseExecution(caseItem.case_id);
                                  const executionResult = latestExecution?.result;
                                  const config = getStatusConfig(executionResult || null);
                                  const resultText = executionResult === 'pass' ? '通过' :
                                    executionResult === 'fail' ? '失败' :
                                      executionResult === 'block' ? '阻塞' :
                                        executionResult === 'skip' ? '跳过' : '未知';

                                  // 获取执行时间：优先使用finished_at，其次executed_at
                                  const executedTime = latestExecution?.finished_at || latestExecution?.executed_at;

                                  return (
                                    <Tooltip
                                      placement="top"
                                      styles={{ body: { padding: '8px', fontSize: '13px' } }}
                                      title={
                                        latestExecution ? (
                                          <div>
                                            {executedTime && (
                                              <div>执行时间: {new Date(executedTime).toLocaleString('zh-CN')}</div>
                                            )}
                                            {latestExecution.executor_name && (
                                              <div>执行人: {latestExecution.executor_name}</div>
                                            )}
                                            <div>执行状态: {latestExecution.execution_status === 'running' ? '执行中' : latestExecution.execution_status === 'completed' ? '已完成' : '已执行'}</div>
                                            <div>执行结果: {resultText}</div>
                                          </div>
                                        ) : '暂无执行记录'
                                      }
                                    >
                                      {executionResult ? <Tag style={{ marginInlineEnd: 0, padding: '1px 8px' }} color={config.color}>{config.text}</Tag> : <span className="text-gray-500">-</span>}
                                    </Tooltip>
                                  );
                                })()}
                              </td>
                              <td className="px-3 py-3 text-sm">
                                {formatDateTime(caseItem.created_at)}
                              </td>
                              <td className="px-3 py-3 text-sm">
                                {(() => {
                                  // 🔥 修复：从executions数组的execution_results中获取用例的最后执行时间
                                  // 数据来源：test_plan_executions表的execution_results字段
                                  const latestExecution = getLatestCaseExecution(caseItem.case_id);
                                  const executedTime = latestExecution?.finished_at || latestExecution?.executed_at;
                                  return executedTime ? formatDateTime(executedTime) : '-';
                                })()}
                              </td>
                              {/* 操作按钮 */}
                              <td className="px-3 py-3 text-sm">
                                <div className="flex items-center gap-5">
                                  {/* 🔥 功能测试和UI自动化用例都显示执行按钮 */}
                                  {(caseItem.case_type === 'functional' || caseItem.case_type === 'ui_auto') && (
                                    <button
                                      onClick={() => handleExecuteCase(caseItem)}
                                      className="text-blue-600 hover:text-blue-800"
                                      title="执行"
                                    >
                                      <Play className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteCase(caseItem)}
                                    className="text-red-600 hover:text-red-800"
                                    title="移除"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        </tbody>
                      </table>
                    
                    {/* 分页控件 */}
                    {cases.length > 0 && (() => {
                      const paginationInfo = getPaginationInfo();
                      return (
                        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50">
                          {/* 中间：页码信息 */}
                          <div className="text-sm text-gray-500">
                            共 <span className="font-semibold text-gray-700">{paginationInfo.total}</span> 条记录，
                            第 <span className="font-semibold text-gray-700">{paginationInfo.page}</span> / <span className="font-semibold text-gray-700">{paginationInfo.totalPages}</span> 页
                          </div>
                          <div className="flex space-x-4">
                            {/* 右侧：分页按钮 */}
                            <div className="flex items-center space-x-1">
                              {/* 第一页 */}
                              <button
                                onClick={() => handlePageChange(1)}
                                disabled={paginationInfo.page === 1}
                                className={clsx(
                                  'p-2 rounded',
                                  paginationInfo.page === 1
                                    ? 'text-gray-600 cursor-not-allowed'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                )}
                                title="第一页"
                              >
                                <ChevronsLeft className="h-4 w-4" />
                              </button>

                              {/* 上一页 */}
                              <button
                                onClick={() => handlePageChange(paginationInfo.page - 1)}
                                disabled={paginationInfo.page === 1}
                                className={clsx(
                                  'p-2 rounded',
                                  paginationInfo.page === 1
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
                                  max={paginationInfo.totalPages}
                                  value={paginationInfo.page}
                                  onChange={(e) => {
                                    const page = parseInt(e.target.value);
                                    if (page >= 1 && page <= paginationInfo.totalPages) {
                                      handlePageChange(page);
                                    }
                                  }}
                                  className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  aria-label="页码"
                                  title="输入页码"
                                />
                                <span className="text-sm text-gray-500">/ {paginationInfo.totalPages}</span>
                              </div>

                              {/* 下一页 */}
                              <button
                                onClick={() => handlePageChange(paginationInfo.page + 1)}
                                disabled={paginationInfo.page === paginationInfo.totalPages}
                                className={clsx(
                                  'p-2 rounded',
                                  paginationInfo.page === paginationInfo.totalPages
                                    ? 'text-gray-600 cursor-not-allowed'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                )}
                                title="下一页"
                              >
                                <ChevronRightIcon className="h-4 w-4" />
                              </button>

                              {/* 最后一页 */}
                              <button
                                onClick={() => handlePageChange(paginationInfo.totalPages)}
                                disabled={paginationInfo.page === paginationInfo.totalPages}
                                className={clsx(
                                  'p-2 rounded',
                                  paginationInfo.page === paginationInfo.totalPages
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
                                value={paginationInfo.pageSize}
                                onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
                                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ width: '80px' }}
                                aria-label="每页显示条数"
                                title="选择每页显示的条数"
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
                    })()}
                  </>
                )}
              </div>
            )}

            {/* 执行历史 */}
            {activeTab === 'executions' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">历史列表</h3>
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setExecutionViewMode('table')}
                      className={clsx(
                        'px-3 py-1 rounded-md text-sm font-medium transition-all',
                        executionViewMode === 'table'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                      title="表格视图"
                    >
                      <BarChart2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setExecutionViewMode('compact')}
                      className={clsx(
                        'px-3 py-1 rounded-md text-sm font-medium transition-all',
                        executionViewMode === 'compact'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                      title="紧凑视图"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setExecutionViewMode('timeline')}
                      className={clsx(
                        'px-3 py-1 rounded-md text-sm font-medium transition-all',
                        executionViewMode === 'timeline'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                      title="时间轴视图"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setExecutionViewMode('cards')}
                      className={clsx(
                        'px-3 py-1 rounded-md text-sm font-medium transition-all',
                        executionViewMode === 'cards'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                      title="卡片视图"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {executions.length === 0 ? (
                  <div className="text-center py-12">
                    <Activity className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">还没有执行记录</p>
                  </div>
                ) : (
                  <>
                    {/* 表格视图 */}
                    {executionViewMode === 'table' && (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead className="bg-gray-50 border-b-2 border-gray-200">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">ID</th>
                              {/* <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">计划名称</th> */}
                              {/* <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">执行类型</th> */}
                              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">总用例</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">通过</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">失败</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">阻塞</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">跳过</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">执行进度</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">执行状态</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">执行结果</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">执行人</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">开始时间</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">结束时间</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">执行时长</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {getCurrentPageExecutions().map((execution) => (
                              <tr key={execution.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 text-sm text-gray-600">{execution.id}</td>
                                {/* <td className="px-4 py-3 text-sm text-gray-600">{execution.plan_name}</td> */}
                                {/* <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                  {execution.execution_type === 'functional' ? '功能测试' : 'UI自动化'}
                                </td> */}
                                <td className="px-4 py-3 text-sm text-center font-medium">{execution.total_cases}</td>
                                <td className="px-4 py-3 text-sm text-center font-medium text-green-600">{execution.passed_cases}</td>
                                <td className="px-4 py-3 text-sm text-center font-medium text-red-600">{execution.failed_cases}</td>
                                <td className="px-4 py-3 text-sm text-center font-medium text-yellow-600">{execution.blocked_cases}</td>
                                <td className="px-4 py-3 text-sm text-center font-medium text-gray-600">{execution.skipped_cases}</td>
                                {/* <td className="px-4 py-3 text-sm text-center">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 bg-gray-200 rounded-md h-1.5 overflow-hidden">
                                      <div 
                                        className="h-full bg-blue-500 rounded-md"
                                        style={{ width: `${execution.progress}%` }}
                                      />
                                    </div>
                                    <span className="font-medium text-gray-900 text-xs">{execution.progress}%</span>
                                  </div>
                                </td> */}
                                <td className="px-4 py-3 text-sm text-center">
                                  <div className="flex items-center justify-start gap-2">
                                    <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden relative">
                                      <div
                                        className={clsx(
                                          "h-full rounded-full transition-all duration-300",
                                          execution.status === 'running'
                                            ? "animate-progress-shimmer bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600"
                                            : "bg-blue-500"
                                        )}
                                        style={{
                                          width: `${execution.progress}%`,
                                          ...(execution.status === 'running' ? {
                                            backgroundSize: '200% 100%'
                                          } : {})
                                        }}
                                      />
                                    </div>
                                    <span className="font-medium text-gray-900 text-xs">{execution.progress}%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <span className={clsx(
                                    'px-2 py-1 rounded-md text-xs font-medium',
                                    execution.status === 'completed' ? 'bg-green-100 text-green-700' :
                                    execution.status === 'queued' ? 'bg-yellow-100 text-yellow-700' :
                                    execution.status === 'running' ? 'bg-blue-100 text-blue-700' :
                                    execution.status === 'failed' ? 'bg-red-100 text-red-700' : 
                                    execution.status === 'cancelled' ? 'bg-gray-100 text-gray-700' :
                                    'bg-gray-100 text-gray-700'
                                  )}>
                                    {execution.status === 'completed' ? '已完成' :
                                     execution.status === 'queued' ? '排队中' :
                                     execution.status === 'running' ? '执行中' :
                                     execution.status === 'failed' ? '失败' :
                                     execution.status === 'cancelled' ? '已取消' :
                                     execution.status === 'not_started' ? '未开始' :
                                     '未知'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-center">
                                  {(() => {
                                    // 根据执行状态和统计信息确定执行结果
                                    let executionResult: string | null = null;
                                    if (execution.status === 'completed') {
                                      // 已完成：根据失败和阻塞情况判断
                                      if (execution.failed_cases > 0) {
                                        executionResult = 'fail';
                                      } else if (execution.blocked_cases > 0) {
                                        executionResult = 'block';
                                      } else if (execution.passed_cases > 0) {
                                        executionResult = 'pass';
                                      } else if (execution.skipped_cases > 0) {
                                        executionResult = 'skip';
                                      }
                                    } else if (execution.status === 'running') {
                                      // 执行中：不显示结果
                                      executionResult = null;
                                    } else if (execution.status === 'failed') {
                                      executionResult = 'fail';
                                    }

                                    const config = getStatusConfig(executionResult || null);
                                    const resultText = executionResult === 'pass' ? '通过' :
                                      executionResult === 'fail' ? '失败' :
                                        executionResult === 'block' ? '阻塞' :
                                          executionResult === 'skip' ? '跳过' : '未知';

                                    return (
                                      <Tooltip
                                        placement="top"
                                        styles={{ body: { padding: '8px', fontSize: '13px' } }}
                                        title={
                                          executionResult ? (
                                            <div>
                                              {execution.started_at && (
                                                <div>开始时间: {new Date(execution.started_at).toLocaleString('zh-CN')}</div>
                                              )}
                                              {execution.finished_at && (
                                                <div>完成时间: {new Date(execution.finished_at).toLocaleString('zh-CN')}</div>
                                              )}
                                              {execution.executor_name && (
                                                <div>执行人: {execution.executor_name}</div>
                                              )}
                                              <div>执行状态: {execution.status === 'completed' ? '已完成' : execution.status === 'running' ? '执行中' : execution.status}</div>
                                              <div>执行结果: {resultText}</div>
                                            </div>
                                          ) : execution.status === 'running' ? '执行中，暂无结果' : '暂无执行结果'
                                        }
                                      >
                                        <Tag style={{ marginInlineEnd: 0, padding: '1px 8px' }} color={config.color}>{config.text}</Tag>
                                      </Tooltip>
                                    );
                                  })()}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  <div className="truncate max-w-[80px]">{execution.executor_name || '-'}</div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(execution.started_at)}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(execution.finished_at)}</td>
                                <td className="px-4 py-3 text-sm text-center text-gray-600">
                                  {/* 🔥 修复：对于 running 状态实时计算耗时 */}
                                  {execution.status === 'running' ? (
                                    <span className="text-blue-600 animate-pulse">{getExecutionDuration(execution)}</span>
                                  ) : (
                                    getExecutionDuration(execution)
                                  )}
                                </td>
                                <td className="px-2 py-3 text-sm text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {/* 详情按钮 */}
                                    {/* {(execution.status === 'completed') && ( */}
                                    <button
                                        onClick={() => handleViewExecutionLog(execution.id)}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                        title="查看执行详情"
                                      >
                                        {/* <FileText className="w-3.5 h-3.5" /> */}
                                        {/* 详情 */}
                                        <Eye className="w-4 h-4" />
                                      </button>
                                    {/* )} */}
                                    {/* 继续执行按钮 - 对 running 或 cancelled 状态显示（UI自动化不显示） */}
                                    {(execution.status === 'running' || execution.status === 'cancelled') && 
                                      execution.completed_cases < execution.total_cases &&
                                      execution.execution_type !== 'ui_auto' && (
                                      <button
                                        onClick={() => handleContinueExecution(execution)}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
                                        title="继续执行未完成的用例"
                                      >
                                        <Play className="w-4 h-4" />
                                        {/* 继续执行 */}
                                      </button>
                                    )}
                                    {/* 重新执行按钮 - 对 completed 状态显示 */}
                                    {(execution.status === 'completed' || execution.execution_type === 'ui_auto') && (
                                      <button
                                        onClick={() => handleReExecute(execution)}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded transition-colors"
                                        title="重新执行所有用例"
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* 紧凑视图 */}
                    {executionViewMode === 'compact' && (
                      <div className="space-y-2 mb-4">
                        {getCurrentPageExecutions().map((execution) => (
                          <div
                            key={execution.id}
                            className="flex items-center justify-between border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-all"
                          >
                            <div className="flex items-center gap-4 flex-1">
                              <div className={clsx(
                                'w-2 h-2 rounded-md',
                                execution.status === 'completed' ? 'bg-green-500' :
                                execution.status === 'running' ? 'bg-blue-500' :
                                execution.status === 'failed' ? 'bg-red-500' : 'bg-gray-500'
                              )} />
                              <div className="flex-1">
                                <span className="font-medium text-gray-900">
                                  {execution.execution_type === 'functional' ? '功能测试' : 'UI自动化'}
                                </span>
                                <span className="text-sm text-gray-500 ml-3">
                                  {execution.executor_name}
                                </span>
                                <span className="text-sm text-gray-500 ml-3">
                                  {formatDate(execution.started_at)}
                                </span>
                              </div>
                              <div className="flex items-center gap-6 text-sm">
                                <span className="text-gray-500">
                                  总计: <span className="font-medium text-gray-900">{execution.total_cases}</span>
                                </span>
                                <span className="text-green-600">
                                  通过: <span className="font-medium">{execution.passed_cases}</span>
                                </span>
                                <span className="text-red-600">
                                  失败: <span className="font-medium">{execution.failed_cases}</span>
                                </span>
                                <span className="text-gray-600">
                                  进度: <span className="font-medium">{execution.progress}%</span>
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-5">
                              {/* 继续执行按钮 - 对 running 或 cancelled 状态显示（UI自动化不显示） */}
                              {(execution.status === 'cancelled' || execution.status === 'running') && 
                                execution.completed_cases < execution.total_cases &&
                                execution.execution_type !== 'ui_auto' && (
                                <button
                                  onClick={() => handleContinueExecution(execution)}
                                  className="inline-flex items-center gap-1 px-3 py-1 text-sm text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors"
                                  title="继续执行未完成的用例"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              )}
                              {/* 重新执行按钮 - 对 completed 状态显示 */}
                              {execution.status === 'completed' || execution.execution_type === 'ui_auto' && (
                                <button
                                  onClick={() => handleReExecute(execution)}
                                  className="inline-flex items-center gap-0 px-1 py-1 text-sm text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded-lg transition-colors"
                                  title="重新执行所有用例"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              )}
                              {(execution.status === 'completed' || execution.status === 'cancelled') && (
                                <button
                                  onClick={() => handleViewExecutionLog(execution.id)}
                                  className="inline-flex items-center gap-0 px-1 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="查看执行日志"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 时间轴视图 */}
                    {executionViewMode === 'timeline' && (
                      <div className="relative">
                        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-200 via-purple-200 to-pink-200" />
                        <div className="space-y-6 mb-4">
                          {getCurrentPageExecutions().map((execution) => (
                            <div key={execution.id} className="relative pl-16">
                              <div className={clsx(
                                'absolute left-6 w-4 h-4 rounded-md border-4 border-white shadow-sm',
                                execution.status === 'completed' ? 'bg-green-500' :
                                execution.status === 'running' ? 'bg-blue-500' :
                                execution.status === 'failed' ? 'bg-red-500' : 'bg-gray-500'
                              )} style={{ top: '12px' }} />
                              
                              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-all">
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-semibold text-gray-900">
                                        {execution.execution_type === 'functional' ? '功能测试执行' : 'UI自动化执行'}
                                      </h4>
                                      <span className={clsx(
                                        'px-2 py-0.5 rounded-md text-xs font-medium',
                                        execution.status === 'completed' ? 'bg-green-100 text-green-700' :
                                        execution.status === 'running' ? 'bg-blue-100 text-blue-700' :
                                        execution.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                                      )}>
                                        {execution.status === 'completed' ? '已完成' :
                                         execution.status === 'running' ? '执行中' :
                                         execution.status === 'failed' ? '失败' : execution.status}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5" />
                                        {formatDate(execution.started_at)}
                                      </span>
                                      <span>执行人: {execution.executor_name}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/* 继续执行按钮 - 对 running 或 cancelled 状态显示（UI自动化不显示） */}
                                    {(execution.status === 'cancelled' || execution.status === 'running') && 
                                      execution.completed_cases < execution.total_cases &&
                                      execution.execution_type !== 'ui_auto' && (
                                      <button
                                        onClick={() => handleContinueExecution(execution)}
                                        className="inline-flex items-center gap-1 px-3 py-1 text-sm text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors"
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                        继续执行
                                      </button>
                                    )}
                                    {/* 重新执行按钮 - 对 completed 状态显示 */}
                                    {(execution.status === 'completed' || execution.execution_type === 'ui_auto') && (
                                      <button
                                        onClick={() => handleReExecute(execution)}
                                        className="inline-flex items-center gap-1 px-3 py-1 text-sm text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded-lg transition-colors"
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                        重新执行
                                      </button>
                                    )}
                                    {(execution.status === 'completed' || execution.status === 'cancelled') && (
                                      <button
                                        onClick={() => handleViewExecutionLog(execution.id)}
                                        className="inline-flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                      >
                                        <FileText className="w-4 h-4" />
                                        详情
                                      </button>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-6 text-sm bg-gray-50 rounded-lg p-3">
                                  <div className="flex items-center gap-2">
                                    <Target className="w-4 h-4 text-gray-400" />
                                    <span className="text-gray-500">总计:</span>
                                    <span className="font-semibold text-gray-900">{execution.total_cases}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    <span className="text-gray-500">通过:</span>
                                    <span className="font-semibold text-green-600">{execution.passed_cases}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <XCircle className="w-4 h-4 text-red-500" />
                                    <span className="text-gray-500">失败:</span>
                                    <span className="font-semibold text-red-600">{execution.failed_cases}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <XCircle className="w-4 h-4 text-yellow-500" />
                                    <span className="text-gray-500">阻塞:</span>
                                    <span className="font-semibold text-yellow-600">{execution.blocked_cases}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-blue-500" />
                                    <span className="text-gray-500">进度:</span>
                                    <span className="font-semibold text-blue-600">{execution.progress}%</span>
                                  </div>
                                </div>

                                {/* 进度条 */}
                                <div className="mt-3">
                                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                    <span>执行进度</span>
                                    <span>{execution.completed_cases} / {execution.total_cases}</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-md h-2 overflow-hidden">
                                    <div 
                                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-md transition-all"
                                      style={{ width: `${execution.progress}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 卡片视图 */}
                    {executionViewMode === 'cards' && (
                      <div className="space-y-4 mb-4">
                        {getCurrentPageExecutions().map((execution) => (
                          <div
                            key={execution.id}
                            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-all hover:shadow-md"
                          >
                            <div className="flex items-start justify-between mb-2 ">
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium text-gray-900">
                                  {execution.execution_type === 'functional' ? '功能测试执行' : 'UI自动化执行'}
                                </div>
                                <div className="text-md font-medium text-gray-600">
                                  {execution.executor_name}
                                </div>
                                <div className="text-md font-medium text-gray-600">
                                  {formatDate(execution.started_at)}
                                </div>
                                {/* <div className="text-sm text-gray-500 mt-0">
                                  执行人: {execution.executor_name} | 执行时间: {formatDate(execution.started_at)}
                                </div> */}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-sm font-medium">
                                  {execution.status === 'completed' ? (
                                    <span className="text-green-600">已完成</span>
                                  ) : execution.status === 'running' ? (
                                    <span className="text-blue-600">执行中</span>
                                  ) : execution.status === 'failed' ? (
                                    <span className="text-red-600">失败</span>
                                  ) : execution.status === 'cancelled' ? (
                                    <span className="text-yellow-600">已取消</span>
                                  ) : (
                                    <span className="text-gray-600">{execution.status}</span>
                                  )}
                                </div>
                                {/* 继续执行按钮 - 对 running 或 cancelled 状态显示（UI自动化不显示） */}
                                {(execution.status === 'cancelled' || execution.status === 'running') && 
                                  execution.completed_cases < execution.total_cases &&
                                  execution.execution_type !== 'ui_auto' && (
                                  <button
                                    onClick={() => handleContinueExecution(execution)}
                                    className="inline-flex items-center gap-1 px-3 py-1 text-sm text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors"
                                    title="继续执行未完成的用例"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                    继续执行
                                  </button>
                                )}
                                {/* 重新执行按钮 - 对 completed 状态显示 */}
                                {(execution.status === 'completed' || execution.execution_type === 'ui_auto') && (
                                  <button
                                    onClick={() => handleReExecute(execution)}
                                    className="inline-flex items-center gap-1 px-0 py-1 ml-2 text-sm text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded-lg transition-colors"
                                    title="重新执行所有用例"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                    重新执行
                                  </button>
                                )}
                                {(execution.status === 'completed' || execution.status === 'cancelled') && (
                                  <button
                                    onClick={() => handleViewExecutionLog(execution.id)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="查看执行日志"
                                  >
                                    <FileText className="w-4 h-4" />
                                    详情
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            {/* <div className="grid grid-cols-6 gap-4 mt-3 pt-3 border-t border-gray-200 text-sm"> */}
                              <div className="flex items-center justify-between gap-4 mt-3 pt-4 border-t border-gray-200 text-sm">
                              <div className="text-center">
                                <div className="text-gray-500">总用例</div>
                                <div className="font-medium">{execution.total_cases}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-500">已完成</div>
                                <div className="font-medium">{execution.completed_cases}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-500">通过</div>
                                <div className="font-medium text-green-600">{execution.passed_cases}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-500">失败</div>
                                <div className="font-medium text-red-600">{execution.failed_cases}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-500">阻塞</div>
                                <div className="font-medium text-yellow-600">{execution.blocked_cases}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-500">进度</div>
                                <div className="font-medium">{execution.progress}%</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 执行历史分页控件 */}
                    {executions.length > 0 && (() => {
                      const paginationInfo = getExecutionPaginationInfo();
                      return (
                        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50">
                          {/* 中间：页码信息 */}
                          <div className="text-sm text-gray-500">
                            共 <span className="font-semibold text-gray-700">{paginationInfo.total}</span> 条记录，
                            第 <span className="font-semibold text-gray-700">{paginationInfo.page}</span> / <span className="font-semibold text-gray-700">{paginationInfo.totalPages}</span> 页
                          </div>
                          <div className="flex space-x-4">
                            {/* 右侧：分页按钮 */}
                            <div className="flex items-center space-x-1">
                              {/* 第一页 */}
                              <button
                                onClick={() => handleExecutionPageChange(1)}
                                disabled={paginationInfo.page === 1}
                                className={clsx(
                                  'p-2 rounded',
                                  paginationInfo.page === 1
                                    ? 'text-gray-600 cursor-not-allowed'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                )}
                                title="第一页"
                              >
                                <ChevronsLeft className="h-4 w-4" />
                              </button>

                              {/* 上一页 */}
                              <button
                                onClick={() => handleExecutionPageChange(paginationInfo.page - 1)}
                                disabled={paginationInfo.page === 1}
                                className={clsx(
                                  'p-2 rounded',
                                  paginationInfo.page === 1
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
                                  max={paginationInfo.totalPages}
                                  value={paginationInfo.page}
                                  onChange={(e) => {
                                    const page = parseInt(e.target.value);
                                    if (page >= 1 && page <= paginationInfo.totalPages) {
                                      handleExecutionPageChange(page);
                                    }
                                  }}
                                  className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  aria-label="页码"
                                  title="输入页码"
                                />
                                <span className="text-sm text-gray-500">/ {paginationInfo.totalPages}</span>
                              </div>

                              {/* 下一页 */}
                              <button
                                onClick={() => handleExecutionPageChange(paginationInfo.page + 1)}
                                disabled={paginationInfo.page === paginationInfo.totalPages}
                                className={clsx(
                                  'p-2 rounded',
                                  paginationInfo.page === paginationInfo.totalPages
                                    ? 'text-gray-600 cursor-not-allowed'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                )}
                                title="下一页"
                              >
                                <ChevronRightIcon className="h-4 w-4" />
                              </button>

                              {/* 最后一页 */}
                              <button
                                onClick={() => handleExecutionPageChange(paginationInfo.totalPages)}
                                disabled={paginationInfo.page === paginationInfo.totalPages}
                                className={clsx(
                                  'p-2 rounded',
                                  paginationInfo.page === paginationInfo.totalPages
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
                                value={paginationInfo.pageSize}
                                onChange={(e) => handleExecutionPageSizeChange(parseInt(e.target.value))}
                                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ width: '80px' }}
                                aria-label="每页显示条数"
                                title="选择每页显示的条数"
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
                    })()}
                  </>
                )}
              </div>
            )}

            {/* 统计分析 */}
            {activeTab === 'statistics' && statistics && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">统计分析</h3>
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setStatisticsViewMode('grid')}
                      className={clsx(
                        'px-3 py-1 rounded-md text-sm font-medium transition-all',
                        statisticsViewMode === 'grid'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                      title="网格视图"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setStatisticsViewMode('large')}
                      className={clsx(
                        'px-3 py-1 rounded-md text-sm font-medium transition-all',
                        statisticsViewMode === 'large'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                      title="大卡片视图"
                    >
                      <Layers className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setStatisticsViewMode('compact')}
                      className={clsx(
                        'px-3 py-1 rounded-md text-sm font-medium transition-all',
                        statisticsViewMode === 'compact'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                      title="紧凑视图"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setStatisticsViewMode('detailed')}
                      className={clsx(
                        'px-3 py-1 rounded-md text-sm font-medium transition-all',
                        statisticsViewMode === 'detailed'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                      title="详细视图"
                    >
                      <TrendingUp className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 网格视图 */}
                {statisticsViewMode === 'grid' && (
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-blue-700">用例总数</div>
                        <Target className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="text-3xl font-bold text-blue-900">{statistics.total_cases}</div>
                      <div className="text-xs text-blue-600 mt-2">
                        功能 {statistics.functional_cases} | UI {statistics.ui_auto_cases}
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-green-700">通过率</div>
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="text-3xl font-bold text-green-900">
                        {statistics.pass_rate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-green-600 mt-2">
                        通过 {statistics.passed_cases} / 执行 {statistics.executed_cases}
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-purple-700">执行率</div>
                        <Activity className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="text-3xl font-bold text-purple-900">
                        {statistics.execution_rate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-purple-600 mt-2">
                        已执行 {statistics.executed_cases} / 总数 {statistics.total_cases}
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-red-700">失败用例</div>
                        <XCircle className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="text-3xl font-bold text-red-900">{statistics.failed_cases}</div>
                      <div className="text-xs text-red-600 mt-2">
                        占比 {statistics.total_cases > 0 ? ((statistics.failed_cases / statistics.total_cases) * 100).toFixed(1) : 0}%
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-yellow-700">阻塞用例</div>
                        <XCircle className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div className="text-3xl font-bold text-yellow-900">{statistics.blocked_cases}</div>
                      <div className="text-xs text-yellow-600 mt-2">
                        占比 {statistics.total_cases > 0 ? ((statistics.blocked_cases / statistics.total_cases) * 100).toFixed(1) : 0}%
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-gray-700">执行次数</div>
                        <Clock className="w-5 h-5 text-gray-600" />
                      </div>
                      <div className="text-3xl font-bold text-gray-900">{statistics.total_executions}</div>
                      <div className="text-xs text-gray-600 mt-2">
                        历史执行记录
                      </div>
                    </div>
                  </div>
                )}

                {/* 大卡片视图 */}
                {statisticsViewMode === 'large' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-8 text-white shadow-lg hover:shadow-xl transition-all">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="text-blue-100 text-sm font-medium mb-2">用例总数</div>
                            <div className="text-5xl font-bold mb-3">{statistics.total_cases}</div>
                          </div>
                          <Target className="w-12 h-12 text-blue-200" />
                        </div>
                        <div className="flex items-center gap-6 pt-4 border-t border-blue-400">
                          <div className="flex-1">
                            <div className="text-blue-100 text-xs mb-1">功能测试</div>
                            <div className="text-2xl font-bold">{statistics.functional_cases}</div>
                          </div>
                          <div className="flex-1">
                            <div className="text-blue-100 text-xs mb-1">UI自动化</div>
                            <div className="text-2xl font-bold">{statistics.ui_auto_cases}</div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-8 text-white shadow-lg hover:shadow-xl transition-all">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="text-green-100 text-sm font-medium mb-2">通过率</div>
                            <div className="text-5xl font-bold mb-3">{statistics.pass_rate.toFixed(1)}%</div>
                          </div>
                          <CheckCircle className="w-12 h-12 text-green-200" />
                        </div>
                        <div className="pt-4 border-t border-green-400">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-green-100">通过 {statistics.passed_cases} 个</span>
                            <span className="text-green-100">共执行 {statistics.executed_cases} 个</span>
                          </div>
                          <div className="mt-3 bg-green-400 rounded-md h-2 overflow-hidden">
                            <div 
                              className="h-full bg-white rounded-md transition-all"
                              style={{ width: `${statistics.pass_rate}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-white border-2 border-purple-200 rounded-xl p-6 hover:border-purple-400 transition-all">
                        <div className="flex items-center gap-3 mb-3">
                          <Activity className="w-8 h-8 text-purple-600" />
                          <div className="text-sm text-purple-700 font-medium">执行率</div>
                        </div>
                        <div className="text-3xl font-bold text-purple-900">{statistics.execution_rate.toFixed(1)}%</div>
                        <div className="text-xs text-purple-600 mt-2">
                          {statistics.executed_cases} / {statistics.total_cases}
                        </div>
                      </div>

                      <div className="bg-white border-2 border-red-200 rounded-xl p-6 hover:border-red-400 transition-all">
                        <div className="flex items-center gap-3 mb-3">
                          <XCircle className="w-8 h-8 text-red-600" />
                          <div className="text-sm text-red-700 font-medium">失败用例</div>
                        </div>
                        <div className="text-3xl font-bold text-red-900">{statistics.failed_cases}</div>
                        <div className="text-xs text-red-600 mt-2">
                          占比 {statistics.total_cases > 0 ? ((statistics.failed_cases / statistics.total_cases) * 100).toFixed(1) : 0}%
                        </div>
                      </div>

                      <div className="bg-white border-2 border-yellow-200 rounded-xl p-6 hover:border-yellow-400 transition-all">
                        <div className="flex items-center gap-3 mb-3">
                          <XCircle className="w-8 h-8 text-yellow-600" />
                          <div className="text-sm text-yellow-700 font-medium">阻塞用例</div>
                        </div>
                        <div className="text-3xl font-bold text-yellow-900">{statistics.blocked_cases}</div>
                        <div className="text-xs text-yellow-600 mt-2">
                          占比 {statistics.total_cases > 0 ? ((statistics.blocked_cases / statistics.total_cases) * 100).toFixed(1) : 0}%
                        </div>
                      </div>

                      <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-gray-400 transition-all">
                        <div className="flex items-center gap-3 mb-3">
                          <Clock className="w-8 h-8 text-gray-600" />
                          <div className="text-sm text-gray-700 font-medium">执行次数</div>
                        </div>
                        <div className="text-3xl font-bold text-gray-900">{statistics.total_executions}</div>
                        <div className="text-xs text-gray-600 mt-2">
                          历史记录
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 紧凑视图 */}
                {statisticsViewMode === 'compact' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border-l-4 border-blue-500">
                      <div className="flex items-center gap-4">
                        <Target className="w-8 h-8 text-blue-600" />
                        <div>
                          <div className="text-sm text-blue-700 font-medium">用例总数</div>
                          <div className="text-xs text-blue-600">功能 {statistics.functional_cases} | UI {statistics.ui_auto_cases}</div>
                        </div>
                      </div>
                      <div className="text-3xl font-bold text-blue-900">{statistics.total_cases}</div>
                    </div>

                    <div className="flex items-center justify-between bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4 border-l-4 border-green-500">
                      <div className="flex items-center gap-4">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                        <div>
                          <div className="text-sm text-green-700 font-medium">通过率</div>
                          <div className="text-xs text-green-600">通过 {statistics.passed_cases} / 执行 {statistics.executed_cases}</div>
                        </div>
                      </div>
                      <div className="text-3xl font-bold text-green-900">{statistics.pass_rate.toFixed(1)}%</div>
                    </div>

                    <div className="flex items-center justify-between bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4 border-l-4 border-purple-500">
                      <div className="flex items-center gap-4">
                        <Activity className="w-8 h-8 text-purple-600" />
                        <div>
                          <div className="text-sm text-purple-700 font-medium">执行率</div>
                          <div className="text-xs text-purple-600">已执行 {statistics.executed_cases} / 总数 {statistics.total_cases}</div>
                        </div>
                      </div>
                      <div className="text-3xl font-bold text-purple-900">{statistics.execution_rate.toFixed(1)}%</div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex items-center justify-between bg-gradient-to-r from-red-50 to-red-100 rounded-lg p-4 border-l-4 border-red-500">
                        <div className="flex items-center gap-3">
                          <XCircle className="w-6 h-6 text-red-600" />
                          <div className="text-sm text-red-700 font-medium">失败</div>
                        </div>
                        <div className="text-2xl font-bold text-red-900">{statistics.failed_cases}</div>
                      </div>

                      <div className="flex items-center justify-between bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg p-4 border-l-4 border-yellow-500">
                        <div className="flex items-center gap-3">
                          <XCircle className="w-6 h-6 text-yellow-600" />
                          <div className="text-sm text-yellow-700 font-medium">阻塞</div>
                        </div>
                        <div className="text-2xl font-bold text-yellow-900">{statistics.blocked_cases}</div>
                      </div>

                      <div className="flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 border-l-4 border-gray-500">
                        <div className="flex items-center gap-3">
                          <Clock className="w-6 h-6 text-gray-600" />
                          <div className="text-sm text-gray-700 font-medium">执行次数</div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{statistics.total_executions}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 详细视图 */}
                {statisticsViewMode === 'detailed' && (
                  <div className="space-y-6">
                    {/* 概览统计 */}
                    <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="text-2xl font-bold">测试计划概览</h4>
                        <BarChart3 className="w-10 h-10 text-white opacity-80" />
                      </div>
                      <div className="grid grid-cols-4 gap-6">
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <div className="text-white/80 text-sm mb-2">用例总数</div>
                          <div className="text-4xl font-bold">{statistics.total_cases}</div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <div className="text-white/80 text-sm mb-2">已执行</div>
                          <div className="text-4xl font-bold">{statistics.executed_cases}</div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <div className="text-white/80 text-sm mb-2">通过</div>
                          <div className="text-4xl font-bold">{statistics.passed_cases}</div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <div className="text-white/80 text-sm mb-2">执行次数</div>
                          <div className="text-4xl font-bold">{statistics.total_executions}</div>
                        </div>
                      </div>
                    </div>

                    {/* 用例类型分布 */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h5 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <GitBranch className="w-5 h-5 text-blue-600" />
                          用例类型分布
                        </h5>
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">功能测试</span>
                              <span className="text-lg font-bold text-purple-600">{statistics.functional_cases}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-md h-3 overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-md"
                                style={{ width: `${statistics.total_cases > 0 ? (statistics.functional_cases / statistics.total_cases * 100) : 0}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              占比 {statistics.total_cases > 0 ? ((statistics.functional_cases / statistics.total_cases) * 100).toFixed(1) : 0}%
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">UI自动化</span>
                              <span className="text-lg font-bold text-blue-600">{statistics.ui_auto_cases}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-md h-3 overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-md"
                                style={{ width: `${statistics.total_cases > 0 ? (statistics.ui_auto_cases / statistics.total_cases * 100) : 0}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              占比 {statistics.total_cases > 0 ? ((statistics.ui_auto_cases / statistics.total_cases) * 100).toFixed(1) : 0}%
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h5 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-green-600" />
                          执行结果分布
                        </h5>
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">通过</span>
                              <span className="text-lg font-bold text-green-600">{statistics.passed_cases}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-md h-3 overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-md"
                                style={{ width: `${statistics.executed_cases > 0 ? (statistics.passed_cases / statistics.executed_cases * 100) : 0}%` }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">失败</span>
                              <span className="text-lg font-bold text-red-600">{statistics.failed_cases}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-md h-3 overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-md"
                                style={{ width: `${statistics.executed_cases > 0 ? (statistics.failed_cases / statistics.executed_cases * 100) : 0}%` }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">阻塞</span>
                              <span className="text-lg font-bold text-yellow-600">{statistics.blocked_cases}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-md h-3 overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-md"
                                style={{ width: `${statistics.executed_cases > 0 ? (statistics.blocked_cases / statistics.executed_cases * 100) : 0}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 关键指标 */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="text-sm text-green-700 font-medium mb-1">通过率</div>
                            <div className="text-4xl font-bold text-green-900">{statistics.pass_rate.toFixed(1)}%</div>
                          </div>
                          <CheckCircle className="w-10 h-10 text-green-500" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-green-700">通过用例</span>
                            <span className="font-bold text-green-900">{statistics.passed_cases}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-green-700">已执行用例</span>
                            <span className="font-bold text-green-900">{statistics.executed_cases}</span>
                          </div>
                          <div className="w-full bg-green-200 rounded-md h-2.5 overflow-hidden mt-3">
                            <div 
                              className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-md transition-all"
                              style={{ width: `${statistics.pass_rate}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="text-sm text-purple-700 font-medium mb-1">执行率</div>
                            <div className="text-4xl font-bold text-purple-900">{statistics.execution_rate.toFixed(1)}%</div>
                          </div>
                          <Activity className="w-10 h-10 text-purple-500" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-purple-700">已执行</span>
                            <span className="font-bold text-purple-900">{statistics.executed_cases}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-purple-700">用例总数</span>
                            <span className="font-bold text-purple-900">{statistics.total_cases}</span>
                          </div>
                          <div className="w-full bg-purple-200 rounded-md h-2.5 overflow-hidden mt-3">
                            <div 
                              className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-md transition-all"
                              style={{ width: `${statistics.execution_rate}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 添加用例对话框 */}
      {showAddCaseModal && (
        <Modal
          isOpen={showAddCaseModal}
          onClose={() => setShowAddCaseModal(false)}
          title="添加测试用例"
        >
          <div className="p-6">
            <p className="text-gray-700 mb-4">
              选择要添加的用例类型，然后进入用例选择页面
            </p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  navigate(`/test-plans/${id}/add-cases?type=functional`);
                }}
                className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-purple-600" />
                  <div>
                    <div className="font-medium">功能测试用例</div>
                    <div className="text-sm text-gray-500">手动执行的功能测试用例</div>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  navigate(`/test-plans/${id}/add-cases?type=ui_auto`);
                }}
                className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Activity className="w-6 h-6 text-blue-600" />
                  <div>
                    <div className="font-medium">UI自动化用例</div>
                    <div className="text-sm text-gray-500">自动化执行的UI测试用例</div>
                  </div>
                </div>
              </button>
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowAddCaseModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 执行日志模态框 */}
      {showExecutionLogModal && currentExecutionId && (
        <TestPlanExecutionLogModal
          isOpen={showExecutionLogModal}
          onClose={() => {
            setShowExecutionLogModal(false);
            setCurrentExecutionId(null);
          }}
          executionId={currentExecutionId}
        />
      )}

      {/* 🔥 新增：弹窗模式添加用例 - 使用统一组件 */}
      {showAddCaseModalInline && (
        <FunctionalCaseSelectModal
          isOpen={showAddCaseModalInline}
          onClose={() => {
            setShowAddCaseModalInline(false);
            setSelectedNewCases(new Set());
            setAddCaseSearchTerm('');
            setAddCaseFilterSystem('');
            setAddCaseFilterProjectVersion('');
            setAddCaseFilterModule('');
            setAddCaseFilterScenario('');
            setAddCaseFilterCaseType('');
            setAddCaseFilterPriority('');
          }}
          title={`从${addCaseType === 'functional' ? '功能测试' : 'UI自动化'}用例关联`}
          cases={(() => {
            const mappedCases = availableCases.map(c => {
              // 🔥 UI自动化用例的版本字段转换
              if (addCaseType === 'ui_auto') {
                const mapped = {
                  id: c.id,
                  name: c.name || c.title || '',
                  description: c.description,
                  priority: c.priority,
                  case_type: c.caseType || c.case_type || addCaseType,
                  system: c.system,
                  module: c.module,
                  // scenario_name: c.scenario_name,
                  // tags: c.tags,
                  // UI自动化用例：将 projectVersion 字符串转换为 project_version 对象
                  project_version: c.projectVersion ? {
                    version_name: c.projectVersion,
                    version_code: c.projectVersion,
                  } : undefined,
                };
                console.log('🔄 [TestPlanDetail] UI自动化用例映射:', { 原始: c, 映射后: mapped });
                return mapped;
              }
              
              // 功能测试用例：直接映射
              return {
                id: c.id,
                name: c.name || c.title || '',
                description: c.description,
                priority: c.priority,
                case_type: c.case_type || addCaseType,
                system: c.system,
                module: c.module,
                scenario_name: c.scenario_name,
                tags: c.tags,
                project_version_id: c.project_version_id,
                project_version: c.project_version,
              };
            });
            console.log('📋 [TestPlanDetail] 传递给模态框的用例数据:', mappedCases);
            return mappedCases;
          })()}
          selectedCaseIds={selectedNewCases}
          onSelectedCasesChange={(ids) => setSelectedNewCases(ids as Set<number>)}
          associatedCaseIds={new Set(cases.map(c => c.case_id))}
          loading={addCaseLoading}
          searchTerm={addCaseSearchTerm}
          onSearchChange={setAddCaseSearchTerm}
          onSearch={() => loadAvailableCases(addCaseType, { page: 1, search: addCaseSearchTerm })}
          pagination={addCasePagination}
          onPageChange={(page) => loadAvailableCases(addCaseType, { page })}
          onPageSizeChange={(pageSize) => loadAvailableCases(addCaseType, { page: 1, pageSize })}
          onConfirm={handleConfirmAddCases}
          confirmText="添加选中的用例"
          confirmDisabled={addCaseSaving}
          confirmLoading={addCaseSaving}
          showViewToggle={true}
          defaultViewMode="list"
          CaseTypeBadge={CaseTypeBadge}
          filters={(() => {
            return [
              {
                key: 'system',
                label: '所属系统',
                value: addCaseFilterSystem,
                onChange: setAddCaseFilterSystem,
                placeholder: '所有系统'
              },
              {
                key: 'project_version_id',
                label: '所属版本',
                value: addCaseFilterProjectVersion,
                onChange: setAddCaseFilterProjectVersion,
                placeholder: '所有版本'
              },
              (addCaseType === 'functional' && {
                key: 'scenario_name',
                label: '所属场景',
                value: addCaseFilterScenario,
                onChange: setAddCaseFilterScenario,
                placeholder: '所有场景'
              }),
              {
                key: 'module',
                label: '所属模块',
                value: addCaseFilterModule,
                onChange: setAddCaseFilterModule,
                placeholder: '所有模块'
              },
              {
                key: 'case_type',
                label: '用例类型',
                value: addCaseFilterCaseType,
                onChange: setAddCaseFilterCaseType,
                options: ['SMOKE', 'FULL', 'ABNORMAL', 'BOUNDARY', 'PERFORMANCE', 'SECURITY', 'USABILITY', 'COMPATIBILITY', 'RELIABILITY'],
                optionLabels: {
                  SMOKE: '🔥 冒烟',
                  FULL: '📋 全量',
                  ABNORMAL: '⚠️ 异常',
                  BOUNDARY: '📏 边界',
                  PERFORMANCE: '⚡ 性能',
                  SECURITY: '🔒 安全',
                  USABILITY: '👤 可用性',
                  COMPATIBILITY: '🔄 兼容性',
                  RELIABILITY: '💪 可靠性'
                },
                placeholder: '所有类型'
              },
              {
                key: 'priority',
                label: '优先级',
                value: addCaseFilterPriority,
                onChange: setAddCaseFilterPriority,
                options: ['high', 'medium', 'low'],
                optionLabels: { high: '高', medium: '中', low: '低' },
                placeholder: '所有优先级'
              }
            ].filter(Boolean);
          })() as any}
          useSet={true}
        />
      )}

      {/* 🔥 UI自动化执行配置对话框 */}
      <Modal
        isOpen={showExecutionConfig}
        onClose={() => {
          setShowExecutionConfig(false);
          setPendingCases([]);
          setPendingReexecuteExecution(null);
        }}
        title="执行配置"
        size="md"
      >
        <div className="space-y-4">
          {/* 显示待执行的用例信息 */}
          {/* {pendingCases.length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">
                {pendingExecutionType === 'single' ? '单个用例执行' : `批量执行 ${pendingCases.length} 个用例`}
              </p>
              <p className="font-medium text-gray-900">
                {pendingExecutionType === 'single' 
                  ? pendingCases[0]?.case_name 
                  : pendingCases.map(c => c.case_name).join(', ')}
              </p>
            </div>
          )} */}

          <div className="mt-[-20px]">
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
              aria-label="执行引擎"
            >
              <option value="mcp">MCP 客户端（AI驱动，适应性强）</option>
              <option value="midscene">Midscene Runner（AI视觉识别，智能定位）</option>
              <option value="playwright">Playwright Runner（高性能，推荐）</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {executionConfig.executionEngine === 'mcp' 
                ? '🤖 AI实时解析，动态适应页面变化'
                : executionConfig.executionEngine === 'playwright'
                ? '⚡ 原生API执行，速度快5-10倍，成本低95%'
                : '👁️ AI视觉识别，智能元素定位，适合复杂UI'}
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

          <div className="pb-2">
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
              aria-label="执行环境"
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
            <button
              onClick={() => {
                setShowExecutionConfig(false);
                setPendingCases([]);
                setPendingReexecuteExecution(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirmExecute}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '执行中...' : '开始执行'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 执行引擎选择指南 */}
      <ExecutionEngineGuide 
        visible={showEngineGuide}
        onClose={() => setShowEngineGuide(false)}
      />

    </div>
  );
}

