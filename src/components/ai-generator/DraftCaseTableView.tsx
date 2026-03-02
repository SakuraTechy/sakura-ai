import { useState } from 'react';
import { Check, Star, Eye, List, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { Tooltip, Dropdown } from 'antd';
import { getCaseTypeInfo } from '../../utils/caseTypeHelper';
import { countSteps } from '../../utils/stepsCounter';

interface DraftCaseTableViewProps {
  draftCases: any[];
  selectedTestCases: Record<string, boolean>;
  onToggleSelect: (tc: any) => void;
  onViewDetail: (tc: any) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  allSelectableCases?: any[]; // 🆕 所有可选用例（用于全选框状态判断）
  startIndex?: number; // 🆕 起始索引（用于显示正确的全局序号）
}

const priorityConfig: Record<string, { label: string; color: string; dot: string }> = {
  critical: { label: '紧急', color: 'text-red-700', dot: 'bg-red-500' },
  high: { label: '高', color: 'text-orange-700', dot: 'bg-orange-500' },
  medium: { label: '中', color: 'text-blue-700', dot: 'bg-blue-500' },
  low: { label: '低', color: 'text-gray-600', dot: 'bg-gray-400' },
};

/**
 * 表格视图 - 现代化表格设计，清晰的数据展示
 */
export function DraftCaseTableView({
  draftCases,
  selectedTestCases,
  onToggleSelect,
  onViewDetail,
  onSelectAll,
  onDeselectAll,
  pagination,
  onPageChange,
  onPageSizeChange,
  allSelectableCases,
  startIndex = 0, // 🆕 默认值为0
}: DraftCaseTableViewProps) {
  // 🆕 筛选和排序状态
  const [caseTypeFilter, setCaseTypeFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'type' | 'priority' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // 🔧 使用所有可选用例来判断全选状态，而不是当前页的用例
  const selectableCases = allSelectableCases || draftCases.filter(tc => !tc.saved || tc.modified);
  const allSelected = selectableCases.length > 0 && selectableCases.every(tc => selectedTestCases[tc.id]);
  const someSelected = selectableCases.some(tc => selectedTestCases[tc.id]);

  // 🆕 应用筛选和排序
  const filteredAndSortedCases = draftCases
    .filter(tc => {
      // 类型筛选
      if (caseTypeFilter.length > 0 && !caseTypeFilter.includes(tc.caseType || 'FULL')) {
        return false;
      }
      // 优先级筛选
      if (priorityFilter.length > 0 && !priorityFilter.includes(tc.priority || 'medium')) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortBy) return 0;
      
      if (sortBy === 'type') {
        const typeOrder = { 'SMOKE': 0, 'FULL': 1, 'ABNORMAL': 2, 'BOUNDARY': 3 };
        const aOrder = typeOrder[a.caseType as keyof typeof typeOrder] ?? 4;
        const bOrder = typeOrder[b.caseType as keyof typeof typeOrder] ?? 4;
        return sortOrder === 'asc' ? aOrder - bOrder : bOrder - aOrder;
      }
      
      if (sortBy === 'priority') {
        const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
        const aOrder = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4;
        const bOrder = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4;
        return sortOrder === 'asc' ? aOrder - bOrder : bOrder - aOrder;
      }
      
      return 0;
    });

  // 🆕 切换类型筛选
  const toggleCaseTypeFilter = (type: string) => {
    setCaseTypeFilter(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  // 🆕 切换优先级筛选
  const togglePriorityFilter = (priority: string) => {
    setPriorityFilter(prev => 
      prev.includes(priority) ? prev.filter(p => p !== priority) : [...prev, priority]
    );
  };

  // 🆕 切换排序
  const toggleSort = (column: 'type' | 'priority') => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  // 🆕 重置筛选和排序
  const resetFilters = () => {
    setCaseTypeFilter([]);
    setPriorityFilter([]);
    setSortBy(null);
    setSortOrder('asc');
  };

  // 🆕 类型筛选菜单
  const caseTypeMenu = {
    items: [
      {
        key: 'SMOKE',
        label: (
          <div className="flex items-center gap-2" onClick={() => toggleCaseTypeFilter('SMOKE')}>
            <input
              type="checkbox"
              checked={caseTypeFilter.includes('SMOKE')}
              onChange={() => {}}
              className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 pointer-events-none"
            />
            <span>🔥 冒烟用例</span>
          </div>
        ),
      },
      {
        key: 'FULL',
        label: (
          <div className="flex items-center gap-2" onClick={() => toggleCaseTypeFilter('FULL')}>
            <input
              type="checkbox"
              checked={caseTypeFilter.includes('FULL')}
              onChange={() => {}}
              className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 pointer-events-none"
            />
            <span>✅ 全量用例</span>
          </div>
        ),
      },
      {
        key: 'ABNORMAL',
        label: (
          <div className="flex items-center gap-2" onClick={() => toggleCaseTypeFilter('ABNORMAL')}>
            <input
              type="checkbox"
              checked={caseTypeFilter.includes('ABNORMAL')}
              onChange={() => {}}
              className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 pointer-events-none"
            />
            <span>⚠️ 异常用例</span>
          </div>
        ),
      },
      {
        key: 'BOUNDARY',
        label: (
          <div className="flex items-center gap-2" onClick={() => toggleCaseTypeFilter('BOUNDARY')}>
            <input
              type="checkbox"
              checked={caseTypeFilter.includes('BOUNDARY')}
              onChange={() => {}}
              className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 pointer-events-none"
            />
            <span>🎯 边界用例</span>
          </div>
        ),
      },
      { type: 'divider' },
      {
        key: 'reset',
        label: <span className="text-gray-500">清除筛选</span>,
        onClick: () => setCaseTypeFilter([]),
      },
    ],
  };

  // 🆕 优先级筛选菜单
  const priorityMenu = {
    items: [
      {
        key: 'critical',
        label: (
          <div className="flex items-center gap-2" onClick={() => togglePriorityFilter('critical')}>
            <input
              type="checkbox"
              checked={priorityFilter.includes('critical')}
              onChange={() => {}}
              className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 pointer-events-none"
            />
            <span className="text-red-700">紧急</span>
          </div>
        ),
      },
      {
        key: 'high',
        label: (
          <div className="flex items-center gap-2" onClick={() => togglePriorityFilter('high')}>
            <input
              type="checkbox"
              checked={priorityFilter.includes('high')}
              onChange={() => {}}
              className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 pointer-events-none"
            />
            <span className="text-orange-700">高</span>
          </div>
        ),
      },
      {
        key: 'medium',
        label: (
          <div className="flex items-center gap-2" onClick={() => togglePriorityFilter('medium')}>
            <input
              type="checkbox"
              checked={priorityFilter.includes('medium')}
              onChange={() => {}}
              className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 pointer-events-none"
            />
            <span className="text-blue-700">中</span>
          </div>
        ),
      },
      {
        key: 'low',
        label: (
          <div className="flex items-center gap-2" onClick={() => togglePriorityFilter('low')}>
            <input
              type="checkbox"
              checked={priorityFilter.includes('low')}
              onChange={() => {}}
              className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 pointer-events-none"
            />
            <span className="text-gray-600">低</span>
          </div>
        ),
      },
      { type: 'divider' },
      {
        key: 'reset',
        label: <span className="text-gray-500">清除筛选</span>,
        onClick: () => setPriorityFilter([]),
      },
    ],
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
      {/* 🆕 筛选提示栏 */}
      {(caseTypeFilter.length > 0 || priorityFilter.length > 0 || sortBy) && (
        <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-blue-200">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-blue-700 font-medium">当前筛选：</span>
            {caseTypeFilter.length > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                用例类型: {caseTypeFilter.map(t => getCaseTypeInfo(t).label).join(', ')}
              </span>
            )}
            {priorityFilter.length > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                优先级: {priorityFilter.map(p => priorityConfig[p]?.label || p).join(', ')}
              </span>
            )}
            {sortBy && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                排序: {sortBy === 'type' ? '类型' : '优先级'} ({sortOrder === 'asc' ? '升序' : '降序'})
              </span>
            )}
            <span className="text-blue-600">
              显示 {filteredAndSortedCases.length} / {draftCases.length} 条
            </span>
          </div>
          <button
            onClick={resetFilters}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            清除所有筛选
          </button>
        </div>
      )}

      {/* 表头 - 现代化设计 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-slate-50 via-gray-50 to-slate-50 border-b-2 border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
        <div className="w-[30px] flex justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
            onChange={() => allSelected ? onDeselectAll() : onSelectAll()}
            className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
          />
        </div>
        <span className="w-[20px] text-center">#</span>
        <span className="w-[140px]">测试场景</span>
        <span className="w-[140px]">测试点</span>
        <span className="flex-1">用例名称</span>
        
        {/* 🆕 类型列 - 带筛选和排序 */}
        <div className="w-[70px] flex items-center justify-center gap-1">
          <Dropdown menu={caseTypeMenu} trigger={['click']} placement="bottomRight">
            <button
              className={clsx(
                "flex items-center gap-0.5 hover:text-purple-600 transition-colors",
                caseTypeFilter.length > 0 && "text-purple-600 font-bold"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <span>用例类型</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </Dropdown>
          <button
            onClick={() => toggleSort('type')}
            className={clsx(
              "text-xs hover:text-purple-600 transition-colors",
              sortBy === 'type' && "text-purple-600 font-bold"
            )}
            title={sortBy === 'type' ? (sortOrder === 'asc' ? '升序' : '降序') : '点击排序'}
          >
            {sortBy === 'type' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
        </div>
        
        {/* 🆕 优先级列 - 带筛选和排序 */}
        <div className="w-[70px] flex items-center justify-center gap-1">
          <Dropdown menu={priorityMenu} trigger={['click']} placement="bottomRight">
            <button
              className={clsx(
                "flex items-center gap-0.5 hover:text-purple-600 transition-colors",
                priorityFilter.length > 0 && "text-purple-600 font-bold"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <span>优先级</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </Dropdown>
          <button
            onClick={() => toggleSort('priority')}
            className={clsx(
              "text-xs hover:text-purple-600 transition-colors",
              sortBy === 'priority' && "text-purple-600 font-bold"
            )}
            title={sortBy === 'priority' ? (sortOrder === 'asc' ? '升序' : '降序') : '点击排序'}
          >
            {sortBy === 'priority' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
        </div>
        
        <span className="w-[60px] text-center">步骤</span>
        <span className="w-[60px] text-center">质量</span>
        <span className="w-[70px] text-center">状态</span>
        <span className="w-[40px] text-center">操作</span>
      </div>

      {/* 数据行 */}
      <div className="divide-y divide-gray-100">
        {filteredAndSortedCases.map((tc, index) => {
          const saved = tc.saved && !tc.modified;
          const selected = (!saved && selectedTestCases[tc.id]) || false;
          const priority = priorityConfig[tc.priority] || priorityConfig.medium;
          const typeInfo = getCaseTypeInfo(tc.caseType);

          return (
            <div
              key={tc.id}
              className={clsx(
                "flex items-center gap-3 px-4 py-3.5 transition-all cursor-pointer group text-xs",
                "hover:bg-gradient-to-r hover:from-purple-50/50 hover:to-blue-50/30 hover:shadow-sm",
                saved ? "bg-gradient-to-r from-green-50/30 to-emerald-50/20" : 
                selected ? "bg-gradient-to-r from-purple-50/60 to-blue-50/40 shadow-sm" : 
                "bg-white"
              )}
              onClick={() => onViewDetail(tc)}
            >
              {/* 勾选框 */}
              <div className="w-[30px] flex justify-center" onClick={(e) => { e.stopPropagation(); if (!saved) onToggleSelect(tc); }}>
                {!saved ? (
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(tc)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="w-4 h-4 rounded bg-green-500 flex items-center justify-center shadow-sm">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>

              {/* 序号 - 使用简单的递增序号 */}
              <span className="w-[20px] text-center text-gray-400 font-mono font-medium">
                {startIndex + index + 1}
              </span>

              {/* 测试场景 */}
              <div className="w-[140px]">
                <Tooltip title={tc.scenarioName}>
                  <span className="text-gray-600 truncate block font-medium">
                    {tc.scenarioName || '-'}
                  </span>
                </Tooltip>
              </div>

              {/* 测试点 */}
              <div className="w-[140px]">
                <Tooltip title={tc.testPointName || tc.testPointId}>
                  <span className="text-gray-600 truncate block">
                    {tc.testPointName || tc.testPointId || '-'}
                  </span>
                </Tooltip>
              </div>

              {/* 用例名称 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{tc.name || '未命名用例'}</p>
                {tc.description && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{tc.description}</p>
                )}
              </div>

              {/* 用例类型 */}
              <div className="w-[70px] flex justify-center">
                <span className={clsx(
                  "inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-bold border shadow-sm",
                  typeInfo.tailwindBg, typeInfo.tailwindText, typeInfo.tailwindBorder
                )}>
                  {typeInfo.emoji}{typeInfo.label}
                </span>
              </div>

              {/* 优先级 */}
              <div className="w-[70px] flex items-center justify-center gap-1.5">
                <div className={clsx("w-2 h-2 rounded-full shadow-sm", priority.dot)} />
                <span className={clsx("text-xs font-bold", priority.color)}>{priority.label}</span>
              </div>

              {/* 步骤 */}
              <div className="w-[60px] flex items-center justify-center gap-1.5">
                <List className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-700">{countSteps(tc.steps)}</span>
              </div>

              {/* 质量 */}
              <div className="w-[60px] flex items-center justify-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-400" />
                <span className="text-xs font-bold text-gray-700">{tc.qualityScore || 85}</span>
              </div>

              {/* 状态 */}
              <div className="w-[70px] flex justify-center">
                {saved ? (
                  <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-1 rounded-md shadow-sm border border-green-200">已保存</span>
                ) : tc.saved && tc.modified ? (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-md shadow-sm border border-amber-200">已修改</span>
                ) : (
                  <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md shadow-sm border border-gray-200">草稿</span>
                )}
              </div>

              {/* 操作 */}
              <div className="w-[40px] flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); onViewDetail(tc); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-100 transition-all shadow-sm hover:shadow"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 分页控件 */}
      {pagination && (onPageChange || onPageSizeChange) && (
        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            共 <span className="font-semibold text-gray-700">{pagination.total}</span> 条记录，
            第 <span className="font-semibold text-gray-700">{pagination.page}</span> / <span className="font-semibold text-gray-700">{pagination.totalPages}</span> 页
          </div>
          <div className="flex space-x-4">
            {/* 分页按钮 */}
            {onPageChange && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => onPageChange(1)}
                  disabled={pagination.page === 1}
                  className={clsx(
                    'p-2 rounded',
                    pagination.page === 1
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  )}
                  title="第一页"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>

                <button
                  onClick={() => onPageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className={clsx(
                    'p-2 rounded',
                    pagination.page === 1
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  )}
                  title="上一页"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="flex items-center space-x-2 px-2">
                  <input
                    type="number"
                    min={1}
                    max={pagination.totalPages}
                    value={pagination.page}
                    onChange={(e) => {
                      const page = parseInt(e.target.value);
                      if (page >= 1 && page <= pagination.totalPages) {
                        onPageChange(page);
                      }
                    }}
                    className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-500">/ {pagination.totalPages}</span>
                </div>

                <button
                  onClick={() => onPageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className={clsx(
                    'p-2 rounded',
                    pagination.page === pagination.totalPages
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  )}
                  title="下一页"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <button
                  onClick={() => onPageChange(pagination.totalPages)}
                  disabled={pagination.page === pagination.totalPages}
                  className={clsx(
                    'p-2 rounded',
                    pagination.page === pagination.totalPages
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  )}
                  title="最后一页"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* 每页条数选择器 */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700">每页显示</span>
              {onPageSizeChange && (
                <select
                  value={pagination.pageSize}
                  onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ width: '80px' }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              )}
              <span className="text-sm text-gray-700">条</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
