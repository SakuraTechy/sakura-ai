import React, { useState, useEffect } from 'react';
import { 
  Search, 
  FileText, 
  Loader2, 
  Package, 
  Tag,
  Table2,
  LayoutGrid,
  AlignLeft,
  Target,
  Filter,
  X
} from 'lucide-react';
import { clsx } from 'clsx';
import { Modal } from './ui/modal';
import { Button } from './ui/button';
import { Pagination } from './Pagination';

// 视图模式类型
type ViewMode = 'list' | 'table' | 'card';

// 功能用例类型定义
interface FunctionalCase {
  id: number;
  name: string;
  description?: string;
  priority?: string;
  case_type?: string;
  system?: string;
  module?: string;
  scenario_name?: string;  // 所属场景
  test_point_name?: string;  // 测试点名称
  tags?: string | string[];
  steps?: string;
  test_point_steps?: string;
  expected_result?: string;
  test_point_expected_result?: string;
  project_version_id?: number;
  project_version?: {
    version_name?: string;
    version_code?: string;
  };
  users?: {
    username?: string;
    account_name?: string;
  };
}

// 分页信息类型
interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// 筛选器配置类型
interface FilterConfig {
  key: string;                    // 筛选字段的键名（如 'module', 'priority', 'system'）
  label: string;                  // 显示标签（如 '模块', '优先级', '系统'）
  value: string;                  // 当前选中的值
  onChange: (value: string) => void;  // 值变化回调
  options?: string[];             // 选项列表（如果不提供，会从 cases 中自动提取）
  optionLabels?: Record<string, string>;  // 选项标签映射（如 {high: '高', medium: '中', low: '低'}）
  placeholder?: string;           // 占位符文本
}

// 组件Props类型
interface FunctionalCaseSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  cases: FunctionalCase[];
  selectedCaseIds: number[] | Set<number>;
  onSelectedCasesChange: (ids: number[] | Set<number>) => void;
  importedCaseIds?: Set<number>;
  associatedCaseIds?: Set<number>; // 已关联的用例ID（用于测试计划等场景）
  loading?: boolean;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  onSearch?: () => void;
  pagination?: PaginationInfo;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onConfirm?: () => void;
  confirmText?: string;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  showViewToggle?: boolean;
  defaultViewMode?: ViewMode;
  CaseTypeBadge?: React.ComponentType<{ caseType: string }>;
  // 灵活的筛选器配置
  filters?: FilterConfig[];
  // 使用 Set 还是 Array
  useSet?: boolean;
  // 筛选模式：client 为客户端筛选（默认），server 为服务端搜索
  filterMode?: 'client' | 'server';
  // 是否启用自动搜索（仅在 server 模式下生效）
  enableAutoSearch?: boolean;
  // 重置筛选器回调
  onResetFilters?: () => void;
}

/**
 * 功能用例选择弹窗组件
 * 
 * 支持：
 * - 多种视图模式切换（列表/表格/卡片）
 * - 搜索和筛选
 * - 批量选择
 * - 分页
 * - 已导入标记
 * - 已关联标记
 */
export const FunctionalCaseSelectModal: React.FC<FunctionalCaseSelectModalProps> = ({
  isOpen,
  onClose,
  title = '选择功能用例',
  cases,
  selectedCaseIds,
  onSelectedCasesChange,
  importedCaseIds,
  associatedCaseIds,
  loading = false,
  searchTerm = '',
  onSearchChange,
  onSearch,
  pagination,
  onPageChange,
  onPageSizeChange,
  onConfirm,
  confirmText = '确认',
  confirmDisabled = false,
  confirmLoading = false,
  showViewToggle = true,
  defaultViewMode = 'list',
  CaseTypeBadge,
  filters = [],
  useSet = false,
  filterMode = 'client',
  enableAutoSearch = false,
  onResetFilters,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [showFilters, setShowFilters] = useState(false); // 控制筛选项的显示/隐藏

  // 获取所有筛选器的值，用于监听变化
  const filterValues = filters.map(f => f.value).join(',');

  // 重置筛选器
  const handleResetFilters = () => {
    if (onResetFilters) {
      onResetFilters();
    } else {
      // 如果没有提供回调，重置所有筛选器为空
      filters.forEach(filter => {
        filter.onChange('');
      });
    }
  };

  // 服务端模式：自动搜索 - 当搜索词或筛选条件变化时，延迟触发搜索
  useEffect(() => {
    // 只在服务端模式且启用自动搜索时生效
    if (filterMode !== 'server' || !enableAutoSearch || !onSearch) {
      return;
    }

    // 跳过初始挂载
    if (isInitialMount) {
      setIsInitialMount(false);
      return;
    }

    // 防抖延迟时间：600ms
    const timer = setTimeout(() => {
      onSearch();
    }, 600);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterValues]);

  // 客户端筛选：根据搜索词和筛选条件过滤用例
  const filteredCases = filterMode === 'client' ? cases.filter((c) => {
    // 搜索词筛选 - 支持多字段搜索：用例ID、测试场景、测试点、用例名称、创建人
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const searchTermTrimmed = searchTerm.trim();
      
      // 用例ID匹配（支持完整格式 TC_00001 或纯数字 1, 01, 00001）
      const caseIdFormatted = `TC_${String(c.id).padStart(5, '0')}`;
      const caseIdFormattedLower = caseIdFormatted.toLowerCase();
      
      // 完整格式匹配（如 TC_00001）
      let matchesCaseId = caseIdFormattedLower.includes(searchLower);
      
      // 纯数字匹配（如 1, 01, 00001）
      if (!matchesCaseId && /^\d+$/.test(searchTermTrimmed)) {
        const searchNum = parseInt(searchTermTrimmed, 10);
        matchesCaseId = c.id === searchNum || 
                       String(c.id).padStart(5, '0') === searchTermTrimmed.padStart(5, '0');
      }
      
      const matchesName = c.name?.toLowerCase().includes(searchLower) || false;
      const matchesScenario = c.scenario_name?.toLowerCase().includes(searchLower) || false;
      const matchesTestPoint = c.test_point_name?.toLowerCase().includes(searchLower) || false;
      const matchesCreator = c.users?.username?.toLowerCase().includes(searchLower) || 
                            c.users?.account_name?.toLowerCase().includes(searchLower) || false;
      
      // 如果任何一个字段匹配，则通过筛选
      if (!matchesCaseId && !matchesName && !matchesScenario && !matchesTestPoint && !matchesCreator) {
        return false;
      }
    }
    
    // 动态筛选器筛选
    for (const filter of filters) {
      if (filter.value) {
        // 特殊处理：project_version_id 或 project_version 需要转换为字符串比较
        if (filter.key === 'project_version_id' || filter.key === 'project_version') {
          const caseVersionId = c.project_version_id ? String(c.project_version_id) : '';
          if (caseVersionId !== filter.value) {
            return false;
          }
        } else {
          const caseValue = (c as unknown as Record<string, unknown>)[filter.key];
          if (typeof caseValue === 'string') {
            if (caseValue.toLowerCase() !== filter.value.toLowerCase()) {
              return false;
            }
          } else if (String(caseValue) !== filter.value) {
            return false;
          }
        }
      }
    }
    
    return true;
  }) : cases;

  // 显示的用例列表：客户端模式使用筛选后的数据，服务端模式使用原始数据
  const displayCases = filterMode === 'client' ? filteredCases : cases;

  // 处理选中状态
  const isSelected = (id: number): boolean => {
    if (useSet) {
      return (selectedCaseIds as Set<number>).has(id);
    }
    return (selectedCaseIds as number[]).includes(id);
  };

  const toggleSelection = (id: number) => {
    if (useSet) {
      const newSet = new Set(selectedCaseIds as Set<number>);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      onSelectedCasesChange(newSet);
    } else {
      const arr = selectedCaseIds as number[];
      if (arr.includes(id)) {
        onSelectedCasesChange(arr.filter(caseId => caseId !== id));
      } else {
        onSelectedCasesChange([...arr, id]);
      }
    }
  };

  // 全选当前页
  const selectAll = () => {
    const allIds = displayCases.map(c => c.id);
    if (useSet) {
      onSelectedCasesChange(new Set(allIds));
    } else {
      onSelectedCasesChange(allIds);
    }
  };

  // 清空选择
  const clearSelection = () => {
    if (useSet) {
      onSelectedCasesChange(new Set());
    } else {
      onSelectedCasesChange([]);
    }
  };

  // 获取选中数量
  const selectedCount = useSet 
    ? (selectedCaseIds as Set<number>).size 
    : (selectedCaseIds as number[]).length;

  // 获取优先级显示文本和样式
  const getPriorityInfo = (priority?: string) => {
    const p = priority?.toLowerCase();
    if (p === 'high' || p === 'critical') {
      return { text: '高', className: 'bg-red-100 text-red-800' };
    }
    if (p === 'medium') {
      return { text: '中', className: 'bg-yellow-100 text-yellow-800' };
    }
    return { text: '低', className: 'bg-green-100 text-green-800' };
  };

  // 渲染用例项（列表视图）
  const renderListItem = (functionalCase: FunctionalCase) => (
    <label
      key={functionalCase.id}
      className={clsx(
        "flex items-start space-x-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors",
        isSelected(functionalCase.id) && "bg-blue-50"
      )}
    >
      <input
        type="checkbox"
        checked={isSelected(functionalCase.id)}
        onChange={() => toggleSelection(functionalCase.id)}
        className="mt-1 rounded text-blue-600 focus:ring-blue-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {/* <span className="text-xs text-gray-500">TC_{String(functionalCase.id).padStart(5, '0')}</span> */}
          <span className="text-sm text-gray-500">#{functionalCase.id}</span>
          <h4 className="font-medium text-gray-900">{functionalCase.name}</h4>
          {CaseTypeBadge && functionalCase.case_type && (
            <CaseTypeBadge caseType={functionalCase.case_type} />
          )}
          {functionalCase.priority && (
            <span className={clsx(
              'text-xs px-2 py-0.5 rounded-full',
              getPriorityInfo(functionalCase.priority).className
            )}>
              {getPriorityInfo(functionalCase.priority).text}
            </span>
          )}
          {importedCaseIds?.has(functionalCase.id) && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-600 font-medium">
              已导入
            </span>
          )}
          {associatedCaseIds?.has(functionalCase.id) && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">
              已关联
            </span>
          )}
        </div>
        {functionalCase.description && (
          <p className="text-sm text-gray-600 line-clamp-2">
            {functionalCase.description}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap mt-2">
          {functionalCase.system && (
            <span className="flex items-center">
              <Package className="h-3 w-3 mr-1" />
              {functionalCase.system}
            </span>
          )}
          {functionalCase.project_version && (
            <span className="flex items-center">
              <Package className="h-3 w-3 mr-1" />
              {functionalCase.project_version?.version_name || 
               functionalCase.project_version?.version_code || 
               functionalCase.project_version_id}
            </span>
          )}
          {functionalCase.module && (
            <span className="flex items-center">
              <FileText className="h-3 w-3 mr-1" />
              {functionalCase.module}
            </span>
          )}
          {functionalCase.scenario_name && (
            <span className="flex items-center">
              <Target className="h-3 w-3 mr-1" />
              {functionalCase.scenario_name}
            </span>
          )}
          {functionalCase.tags && (
            <span className="flex items-center">
              <Tag className="h-3 w-3 mr-1" />
              {typeof functionalCase.tags === 'string' 
                ? functionalCase.tags 
                : functionalCase.tags.slice(0, 2).join(', ')}
            </span>
          )}
        </div>
      </div>
    </label>
  );

  // 渲染表格视图
  const renderTableView = () => (
    <div className="border border-gray-300 rounded-lg">
      <table className="table-auto w-max min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-12 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={displayCases.length > 0 && selectedCount === displayCases.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      selectAll();
                    } else {
                      clearSelection();
                    }
                  }}
                  className="rounded text-blue-600 focus:ring-blue-500"
                  aria-label="全选所有用例"
                  title="全选所有用例"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">
                用例编号
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                所属系统
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                所属版本
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                所属模块
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                所属场景
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider min-w-[200px]">
                用例名称
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                用例类型
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[80px]">
                优先级
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                是否关联
              </th>
            </tr>
          </thead>
           <tbody className="bg-white divide-y divide-gray-200">
             {displayCases.map((functionalCase) => (
              <tr
                key={functionalCase.id}
                onClick={() => toggleSelection(functionalCase.id)}
                className={clsx(
                  "cursor-pointer transition-colors",
                  isSelected(functionalCase.id) ? "bg-blue-50" : "hover:bg-gray-50"
                )}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={isSelected(functionalCase.id)}
                    onChange={() => {}}
                    className="rounded text-blue-600 focus:ring-blue-500"
                    aria-label={`选择用例 ${functionalCase.name}`}
                    title={`选择用例 ${functionalCase.name}`}
                  />
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                  {/* TC_{String(functionalCase.id).padStart(5, '0')} */}
                  #{functionalCase.id}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {functionalCase.system ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                      <Package className="h-3 w-3" />
                      {functionalCase.system}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {functionalCase.project_version ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                      <Package className="h-3 w-3" />
                      {functionalCase.project_version?.version_name || 
                       functionalCase.project_version?.version_code || 
                       functionalCase.project_version_id}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {functionalCase.module || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {functionalCase.scenario_name ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
                      <FileText className="h-3 w-3" />
                      {functionalCase.scenario_name}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{functionalCase.name}</div>
                  {functionalCase.description && (
                    <div className="text-xs text-gray-500 truncate mt-1 max-w-[300px]">
                      {functionalCase.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {CaseTypeBadge && functionalCase.case_type && (
                      <CaseTypeBadge caseType={functionalCase.case_type} />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {functionalCase.priority && (
                    <span className={clsx(
                      'text-xs px-2 py-1 rounded-full font-medium inline-block',
                      getPriorityInfo(functionalCase.priority).className
                    )}>
                      {getPriorityInfo(functionalCase.priority).text}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                {importedCaseIds?.has(functionalCase.id) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-600 font-medium">
                        已导入
                      </span>
                    )}
                    {associatedCaseIds?.has(functionalCase.id) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">
                        已关联
                      </span>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );

  // 渲染用例项（卡片视图）
  const renderCardItem = (functionalCase: FunctionalCase) => (
    <div
      key={functionalCase.id}
      onClick={() => toggleSelection(functionalCase.id)}
      className={clsx(
        "border rounded-lg p-4 cursor-pointer transition-all",
        isSelected(functionalCase.id)
          ? "border-blue-500 bg-blue-50 shadow-sm"
          : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={clsx(
          'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
          isSelected(functionalCase.id)
            ? 'bg-blue-600 border-blue-600'
            : 'border-gray-300'
        )}>
          {isSelected(functionalCase.id) && (
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
              <path d="M4.5 8.5L1.5 5.5L2.5 4.5L4.5 6.5L9.5 1.5L10.5 2.5L4.5 8.5Z" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-sm text-gray-500 font-mono">
              {/* TC_{String(functionalCase.id).padStart(5, '0')} */}
              #{functionalCase.id}
            </span>
            {CaseTypeBadge && functionalCase.case_type && (
              <CaseTypeBadge caseType={functionalCase.case_type} />
            )}
            {functionalCase.priority && (
              <span className={clsx(
                'text-xs px-2 py-1 rounded-full font-medium',
                getPriorityInfo(functionalCase.priority).className
              )}>
                {getPriorityInfo(functionalCase.priority).text}
              </span>
            )}
            {importedCaseIds?.has(functionalCase.id) && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-600 font-medium">
                已导入
              </span>
            )}
            {associatedCaseIds?.has(functionalCase.id) && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">
                已关联
              </span>
            )}
          </div>
          <h4 className="font-medium text-gray-900 mb-2">{functionalCase.name}</h4>
          {functionalCase.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {functionalCase.description}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {functionalCase.system && (
              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full flex items-center gap-1">
                <Package className="h-3 w-3" />
                {functionalCase.system}
              </span>
            )}
            {functionalCase.project_version && (
              <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full flex items-center gap-1">
                <Package className="h-3 w-3" />
                {functionalCase.project_version?.version_name || 
                 functionalCase.project_version?.version_code || 
                 functionalCase.project_version_id}
              </span>
            )}
            {functionalCase.module && (
              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {functionalCase.module}
              </span>
            )}
            {functionalCase.scenario_name && (
              <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded-full flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {functionalCase.scenario_name}
              </span>
            )}

          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="custom"
      footer={
        <div className="flex justify-between items-center gap-5">
          <div className="text-sm text-gray-600">
            已选择 {selectedCount} 个用例
          </div>
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={confirmLoading}
            >
              取消
            </Button>
            {onConfirm && (
              <Button
                onClick={onConfirm}
                disabled={confirmDisabled || selectedCount === 0}
                isLoading={confirmLoading}
              >
                {confirmText}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {/* 工具栏 - 固定在顶部 */}
        <div className="flex justify-between items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />              
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange?.(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  onSearch?.();
                }
              }}
              placeholder="搜索用例ID、用例名称..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
            />
          </div>
          {/* 搜索按钮 - 仅在服务端模式下显示 */}
            {/* {onSearch && filterMode === 'server' && (
            {onSearch && (
              <button
                onClick={onSearch}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors 
                disabled:opacity-50 text-sm font-medium"
                disabled={loading}
                title="搜索"
              >
                <Search className="h-4 w-4" />
              </button>
            )} */}
          {/* 筛选和重置按钮 */}
          <button
                onClick={() => setShowFilters(!showFilters)}
                className={clsx(
                  'inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  showFilters
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                )}
                title={showFilters ? '隐藏筛选' : '显示筛选'}
              >
                <Filter className="w-4 h-4 mr-2" />
                筛选
              </button>

              {/* 重置按钮 */}
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center px-4 py-2.5 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                title="重置筛选条件"
              >
                <X className="w-4 h-4 mr-2" />
                重置
              </button>
        </div>
        {showFilters && <div className="pt-1 mt-2 border-t border-gray-200"></div>}
        {/* 筛选器和操作按钮 */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
            {/* 动态筛选器 - 根据 showFilters 状态显示/隐藏 */}
            {showFilters && filters.map((filter) => {
              // 特殊处理：如果是 project_version_id 或 project_version，需要从 project_version 对象中提取版本信息
              let options: string[];
              let optionLabels: Record<string, string> = {};
              
              if (filter.key === 'project_version_id' || filter.key === 'project_version') {
                // 从 project_version 对象中提取版本ID和版本名称
                const versionMap = new Map<string, string>();
                cases.forEach(c => {
                  if (c.project_version_id && c.project_version) {
                    const versionId = String(c.project_version_id);
                    const versionName = c.project_version.version_name || 
                                       c.project_version.version_code || 
                                       versionId;
                    versionMap.set(versionId, versionName);
                  }
                });
                options = Array.from(versionMap.keys());
                optionLabels = Object.fromEntries(versionMap);
              } else {
                // 普通筛选器：直接提取字段值
                options = filter.options || Array.from(
                  new Set(cases.map(c => (c as unknown as Record<string, unknown>)[filter.key]).filter(Boolean))
                ).map(String);
              }
              
              return (
                <select
                  key={filter.key}
                  value={filter.value}
                  onChange={(e) => filter.onChange(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white hover:border-gray-400"
                  aria-label={filter.label}
                  title={filter.label}
                >
                  <option value="">{filter.placeholder || `所有${filter.label}`}</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {filter.optionLabels?.[option] || optionLabels[option] || option}
                    </option>
                  ))}
                </select>
              );
            })}
          </div>
        
        {/* 视图切换器和批量操作按钮 */}
        <div className="flex-shrink-0 flex items-center justify-between py-3 border-gray-100">
          {/* 批量选择按钮 */}
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={selectAll}
              disabled={loading || displayCases.length === 0}
            >
              全选当前页
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={clearSelection}
              disabled={loading || selectedCount === 0}
            >
              清空选择
            </button>
          </div>

          {/* 视图切换器 */}
          {showViewToggle && (
            <div className="inline-flex items-center bg-gray-50 rounded-lg border border-gray-200 p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  viewMode === 'list'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
                title="列表视图"
              >
                <AlignLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">列表</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  viewMode === 'table'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
                title="表格视图"
              >
                <Table2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">表格</span>
              </button>
              <button
                onClick={() => setViewMode('card')}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  viewMode === 'card'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
                title="卡片视图"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">卡片</span>
              </button>
            </div>
          )}
        </div>

        {/* 功能用例列表 - 可滚动区域 */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-blue-600" />
                <p className="text-sm text-gray-600">加载中...</p>
              </div>
            </div>
          ) : displayCases.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <div className="text-center">
                <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p className="text-sm text-gray-600 font-medium mb-1">
                  {filterMode === 'client' && (searchTerm || filterValues) 
                    ? '没有找到符合条件的用例' 
                    : '暂无可选择的功能用例'}
                </p>
                <p className="text-xs text-gray-500">
                  {filterMode === 'client' && (searchTerm || filterValues) 
                    ? '请尝试调整搜索条件' 
                    : ''}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* 根据视图模式渲染不同的布局 */}
              {viewMode === 'list' && (
                <div className="h-full max-h-[500px] overflow-y-auto border border-gray-200 rounded-lg">
                  <div className="divide-y divide-gray-200">
                    {displayCases.map(renderListItem)}
                  </div>
                </div>
              )}
              {viewMode === 'table' && (
                <div className="w-full max-h-[500px] overflow-x-auto overflow-y-auto">
                  {renderTableView()}
                </div>
              )}
              {viewMode === 'card' && (
                <div className="h-full max-h-[500px] overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-1">
                    {displayCases.map(renderCardItem)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 分页 - 固定在底部 */}
        {pagination && onPageChange && onPageSizeChange && !loading && displayCases.length > 0 && (
          <div className="flex-shrink-0 pt-4 mt-4 border-t border-gray-200">
            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              total={pagination.total}
              totalPages={pagination.totalPages}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
              className="px-0"
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

