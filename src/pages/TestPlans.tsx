import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Users,
  Play,
  Edit,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  FileText,
  Target,
  Activity,
  BarChart3,
  RotateCcw,
  ChevronLeft,
  ChevronsLeft,
  ChevronRight as ChevronRightIcon,
  ChevronsRight,
  User,
} from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { clsx } from 'clsx';
import { Tag, Tooltip } from 'antd';
import { testPlanService } from '../services/testPlanService';
import type { ExecutionResult, TestPlan, TestPlanStatus, TestPlanType } from '../types/testPlan';
import { showToast } from '../utils/toast';
import { Modal as AntModal } from 'antd';
import { SystemOption } from '../types/test';
import * as systemService from '../services/systemService';
export function TestPlans() {
  const navigate = useNavigate();
  
  const [testPlans, setTestPlans] = useState<TestPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedPlanType, setSelectedPlanType] = useState<TestPlanType | ''>('');
  const [selectedStatus, setSelectedStatus] = useState<TestPlanStatus | ''>('');
  const [selectedResult, setSelectedResult] = useState<ExecutionResult | ''>('');
  const [systemOptions, setSystemOptions] = useState<SystemOption[]>([]);
  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  // 加载测试计划列表
  const loadTestPlans = async () => {
    setLoading(true);
    try {
      const response = await testPlanService.getTestPlans({
        page: currentPage,
        pageSize,
        search: searchTerm || undefined,
        project: selectedProject || undefined,
        plan_type: selectedPlanType || undefined,
        status: selectedStatus || undefined,
        result: selectedResult || undefined,
      });
      
      setTestPlans(response.data);
      setTotal(response.total);
    } catch (error: any) {
      console.error('加载测试计划失败:', error);
      showToast.error('加载测试计划失败');
    } finally {
      setLoading(false);
    }
  };

  // 🔥 新增：加载系统字典列表
  useEffect(() => {
    const loadSystems = async () => {
      try {
        const systems = await systemService.getActiveSystems();
        setSystemOptions(systems);
      } catch (error) {
        console.error('加载系统列表失败:', error);
        showToast.error('加载系统列表失败');
      }
    };
    loadSystems();
  }, []);
  
  useEffect(() => {
    loadTestPlans();
  }, [currentPage, pageSize, searchTerm, selectedProject, selectedPlanType, selectedStatus, selectedResult]);

  // 处理每页条数变化
  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // 重置到第一页
  };

  // 创建测试计划
  const handleCreatePlan = () => {
    navigate('/test-plans/create');
  };

  // 查看测试计划详情
  const handleViewPlan = (plan: TestPlan) => {
    navigate(`/test-plans/${plan.id}`);
  };

  // 编辑测试计划
  const handleEditPlan = (plan: TestPlan) => {
    navigate(`/test-plans/${plan.id}/edit`);
  };

  // 执行测试计划
  const handleExecutePlan = (plan: TestPlan) => {
    // 🔥 修复：根据测试计划类型确定执行类型
    // UI自动化和混合类型：跳转到详情页的执行历史tab，让用户在详情页选择执行方式
    // 功能测试类型：直接跳转到执行页面
    if (plan.plan_type === 'ui_auto') {
      // UI自动化计划：跳转到详情页执行历史tab
      navigate(`/test-plans/${plan.id}`, { state: { activeTab: 'executions' } });
    } else if (plan.plan_type === 'mixed') {
      // 混合类型：跳转到详情页用例tab，让用户选择
      navigate(`/test-plans/${plan.id}`, { state: { activeTab: 'cases' } });
    } else {
      // 功能测试计划：直接跳转到执行页面
      navigate(`/test-plans/${plan.id}/execute?type=functional`);
    }
  };


  // 刷新功能 - 重新加载测试计划列表
  const handleSearch = () => {
    loadTestPlans();
    showToast.success('刷新成功');
  };

  // 重置功能 - 清空所有筛选条件
  const handleReset = () => {
    setSearchTerm('');
    setSelectedProject('');
    setSelectedPlanType('');
    setSelectedStatus('');
    setSelectedResult('');
    setCurrentPage(1);
    showToast.success('已重置筛选条件');
  };

  // 计算测试计划的实际状态（基于执行情况和时间）
  const getComputedStatus = (plan: TestPlan): string => {
    // 如果已归档，状态优先显示为归档
    if (plan.status === 'archived') {
      return 'archived';
    }
    
    // 检查计划结束时间是否已过
    const now = new Date();
    const endDate = plan.end_date ? new Date(plan.end_date) : null;
    const isExpired = endDate && now > endDate;
    
    // 获取执行情况
    const totalCases = plan.total_cases || 0;
    const hasExecutions = (plan.completed_executions || 0) > 0;
    
    // 如果没有用例，状态为未开始
    if (totalCases === 0) {
      return 'not_started';
    }
    
    // 判断状态优先级：
    // 1. 已归档 (archived) - 已处理
    // 2. 已结束 (expired) - 计划时间已过期
    // 3. 进行中 (active) - 有执行记录
    // 4. 未开始 (not_started) - 没有执行记录
    
    if (isExpired && !hasExecutions) {
      return 'expired'; // 计划时间已到但从未执行
    }
    
    if (isExpired && hasExecutions) {
      return 'completed'; // 计划时间已到且有执行记录，视为已完成
    }
    
    if (hasExecutions) {
      return 'active'; // 进行中（有执行记录）
    }
    
    return 'not_started'; // 未开始
  };

  // 获取执行结果配置（与TestPlanDetail保持一致）
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

  // 获取状态标签（与TestPlanDetail执行历史表格保持一致）
  const getStatusBadge = (plan: TestPlan) => {
    // 🔥 修复：直接使用 plan.status（后端已同步更新 test_plans 表的状态）
    // 后端在执行状态变化时会自动调用 updateTestPlanStatusFromLatestExecution 同步状态
    const status = plan.status || getComputedStatus(plan);
    
    const statusConfig = {
      draft: { label: '草稿', color: 'bg-gray-100 text-gray-700', icon: Clock },
      not_started: { label: '未开始', color: 'bg-gray-100 text-gray-700', icon: Clock },
      active: { label: '进行中', color: 'bg-blue-100 text-blue-700', icon: Activity },
      completed: { label: '已完成', color: 'bg-green-100 text-green-700', icon: CheckCircle },
      expired: { label: '已结束', color: 'bg-orange-100 text-orange-700', icon: Clock },
      cancelled: { label: '已取消', color: 'bg-red-100 text-red-700', icon: null },
      archived: { label: '已归档', color: 'bg-gray-100 text-gray-500', icon: null },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.not_started;
    
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium', config.color)}>
        {config.label}
      </span>
    );
  };

  // 获取计划结果（基于最新执行记录）
  const getPlanResult = (plan: TestPlan) => {
    // 根据最新执行状态和统计信息确定执行结果
    let executionResult: string | null = null;
    const status = plan.latest_execution_status;
    const passedCases = plan.latest_execution_passed_cases || 0;
    const failedCases = plan.latest_execution_failed_cases || 0;
    const blockedCases = plan.latest_execution_blocked_cases || 0;
    const skippedCases = plan.latest_execution_skipped_cases || 0;
    const totalCases = plan.latest_execution_total_cases || plan.total_cases || 0;

    if (status === 'completed') {
      // 已完成：根据失败和阻塞情况判断
      if (failedCases > 0) {
        executionResult = 'fail';
      } else if (blockedCases > 0) {
        executionResult = 'block';
      } else if (totalCases > 0 && skippedCases >= totalCases) {
        // 全部跳过：跳过数大于等于总用例数
        executionResult = 'skip';
      } else if (passedCases > 0) {
        executionResult = 'pass';
      }
    } else if (status === 'running') {
      // 执行中：不显示结果
      executionResult = null;
    } else if (status === 'failed') {
      executionResult = 'fail';
    }

    const config = getStatusConfig(executionResult || null);
    const resultText = executionResult === 'pass' ? '通过' :
      executionResult === 'fail' ? '失败' :
        executionResult === 'block' ? '阻塞' :
          executionResult === 'skip' ? '跳过' : '未知';

    // if (!executionResult && status !== 'running') {
    //   return <span className="text-sm text-gray-400">-</span>;
    // }

    return (
      <Tooltip
        placement="top"
        styles={{ body: { padding: '8px', fontSize: '13px' } }}
        title={
          executionResult ? (
            <div>
              <div>执行状态: {status === 'completed' ? '已完成' : status === 'running' ? '执行中' : status || '未知'}</div>
              <div>执行结果: {resultText}</div>
              {passedCases > 0 && <div>通过: {passedCases}</div>}
              {failedCases > 0 && <div>失败: {failedCases}</div>}
              {blockedCases > 0 && <div>阻塞: {blockedCases}</div>}
              {skippedCases > 0 && <div>跳过: {skippedCases}</div>}
            </div>
          ) : status === 'running' ? '执行中，暂无结果' : '暂无执行结果'
        }
      >
        <Tag style={{ marginInlineEnd: 0, padding: '1px 8px' }} color={config.color}>{config.text}</Tag>
      </Tooltip>
    );
  };

  // 获取计划类型标签
  const getPlanTypeBadge = (type: TestPlanType) => {
    const typeConfig = {
      functional: { label: '功能测试', icon: FileText, color: 'bg-purple-100 text-purple-700' },
      ui_auto: { label: 'UI自动化', icon: Activity, color: 'bg-blue-100 text-blue-700' },
      mixed: { label: '混合测试', icon: Target, color: 'bg-indigo-100 text-indigo-700' },
      regression: { label: '回归测试', icon: BarChart3, color: 'bg-orange-100 text-orange-700' },
      smoke: { label: '冒烟测试', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
      integration: { label: '集成测试', icon: Users, color: 'bg-cyan-100 text-cyan-700' },
    };

    const config = typeConfig[type] || typeConfig.functional;
    const Icon = config.icon;
    
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium', config.color)}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  // 格式化日期
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'yyyy-MM-dd', { locale: zhCN });
    } catch {
      return '-';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-0xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">测试计划</h1>
          <p className="text-gray-600">管理和执行测试计划</p>
        </div>
        {/* 新建按钮 */}
        <button
              onClick={handleCreatePlan}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              新建计划
            </button>
        </div>
        {/* 工具栏 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between gap-4">
            {/* 搜索框 */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索测试计划..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 筛选器 */}
            <div className="flex items-center gap-2">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">所有项目</option>
                {systemOptions.map(sys => (
              <option key={sys.id} value={sys.name}>{sys.name}</option>
            ))}
              </select>

              <select
                value={selectedPlanType}
                onChange={(e) => setSelectedPlanType(e.target.value as TestPlanType | '')}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">所有类型</option>
                <option value="functional">功能测试</option>
                <option value="ui_auto">UI自动化</option>
                <option value="mixed">混合测试</option>
                <option value="regression">回归测试</option>
                <option value="smoke">冒烟测试</option>
                <option value="integration">集成测试</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as TestPlanStatus | '')}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">所有状态</option>
                {/* <option value="draft">草稿</option> */}
                <option value="not_started">未开始</option>
                <option value="active">进行中</option>
                <option value="completed">已完成</option>
                <option value="expired">已结束</option>
                <option value="cancelled">已取消</option>
                <option value="archived">已归档</option>
              </select>

              <select
                value={selectedResult}
                onChange={(e) => setSelectedResult(e.target.value as ExecutionResult | '')}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">所有结果</option>
                <option value="pass">通过</option>
                <option value="fail">失败</option>
                <option value="block">阻塞</option>
                <option value="skip">跳过</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleSearch}
              className="flex items-center px-3 h-10 w-20 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none transition-colors"
            >
              <Search className="h-4 w-4 mr-2" />
              刷新
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center px-3 h-10 w-20 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 focus:outline-none transition-colors"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              重置
            </button>
          </div>
        </div>

        {/* 测试计划列表 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : testPlans.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无测试计划</p>
              <button
                onClick={handleCreatePlan}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5" />
                创建第一个测试计划
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    所属项目
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    计划名称
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    计划类型
                  </th>
                  {/* <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    用例总数
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    通过
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    失败
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    阻塞
                  </th> */}
                  <th className="pl-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    计划进度
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    计划状态
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    计划结果
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    执行次数
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    负责人
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    计划时间
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {testPlans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                      {plan.project || '-'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                        <button
                          onClick={() => handleViewPlan(plan)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 text-left truncate max-w-[450px]"
                          title={plan.name}
                        >
                          {plan.name}
                        </button>
                        {/* {plan.short_name && (
                          <span className="text-xs text-gray-500 truncate">{plan.short_name}</span>
                        )} */}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {getPlanTypeBadge(plan.plan_type)}
                    </td>
                    {/* <td className="px-3 py-3 text-center whitespace-nowrap w-15">
                      <span className="text-center text-sm font-medium">{plan.total_cases || 0}</span>
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap w-15">
                      <span className="text-sm font-medium text-green-600">{plan.latest_execution_passed_cases || 0}</span>
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap w-15">
                      <span className="text-sm font-medium text-red-600">{plan.latest_execution_failed_cases || 0}</span>
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap w-15">
                      <span className="text-sm font-medium text-yellow-600">{plan.latest_execution_blocked_cases || 0}</span>
                    </td> */}
                    {/* <td className="px-3 py-3 text-center whitespace-nowrap w-15">
                      <div className="flex items-center justify-start gap-2 ">
                        <div className="w-16 bg-gray-200 rounded-md h-1.5 overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded-md"
                            style={{ width: `${plan.latest_execution_progress ?? 0}%` }}
                          />
                        </div>
                        <span className="font-medium text-gray-900 text-xs">{plan.latest_execution_progress ?? 0}%</span>
                      </div>
                    </td> */}
                    <td className="pl-3 py-3 text-sm text-center">
                      <div className="flex items-center justify-start gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden relative">
                          <div
                            className={clsx(
                              "h-full rounded-full transition-all duration-300",
                              plan.status === 'active' 
                                ? "animate-progress-shimmer bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600" 
                                : "bg-blue-500"
                            )}
                            style={{ 
                              width: `${plan.latest_execution_progress ?? 0}%`,
                              ...(plan.status === 'active' ? {
                                backgroundSize: '200% 100%'
                              } : {})
                            }}
                          />
                        </div>
                        <span className="font-medium text-gray-900 text-xs">{plan.latest_execution_progress ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {getStatusBadge(plan)}
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {getPlanResult(plan)}
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <div className="w-full">
                        {plan.completed_executions && plan.completed_executions > 0 ? (
                          <div className="flex items-center justify-center">
                            <div className="text-xs text-gray-600">
                              <span>已执行 {plan.completed_executions} 次</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 flex items-center justify-center whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        <span className="max-w-[70px] truncate" title={plan.owner_name || '-'}>{plan.owner_name || '-'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(plan.start_date)} ~ {formatDate(plan.end_date)}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-5">
                        <button
                          onClick={() => handleViewPlan(plan)}
                          className="text-blue-600 hover:text-blue-800"
                          title="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleExecutePlan(plan)}
                          className="text-green-600 hover:text-green-800"
                          title="执行计划"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditPlan(plan)}
                          className="text-yellow-600 hover:text-yellow-800"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            AntModal.confirm({
                              title: '确认删除',
                              content: `确定删除测试计划: "${plan.name}" 吗？`,
                              okText: '确认删除',
                              okButtonProps: { danger: true },
                              cancelText: '取消',
                              onOk: async () => {
                                try {
                                  await testPlanService.deleteTestPlan(plan.id);
                                  showToast.success(`测试计划已删除`);
                                  loadTestPlans();
                                } catch (error: any) {
                                  showToast.error('删除测试计划失败: ' + error.message);
                                }
                              }
                            });
                          }}
                          className="text-red-600 hover:text-red-800"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 分页 */}
          {!loading && testPlans.length > 0 && (
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
          )}
        </div>
      </div>

    </div>
  );
}

