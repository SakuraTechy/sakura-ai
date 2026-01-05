import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Table, Button, Tooltip, Checkbox, Tag, Space } from 'antd';
import { 
  Terminal, 
  Square, 
  RefreshCw, 
  User, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Activity,
  RotateCcw,
  ChevronLeft,
  ChevronsLeft,
  ChevronRight as ChevronRightIcon,
  ChevronsRight
} from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { tr } from 'date-fns/locale';

// 测试运行接口定义
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
  // 🔥 新增：测试用例相关信息
  system?: string;
  module?: string;
  tags?: string[];
  priority?: 'high' | 'medium' | 'low';
  projectVersion?: string;
}

// 表格行数据类型
interface TableRowData extends TestRun {
  key: string;
  rowIndex: number;
}

interface TestRunsDetailedTableProps {
  testRuns: TestRun[];
  selectedRunIds: Set<string>;
  stoppingTests: Set<string>;
  onStopTest: (run: TestRun) => void;
  onViewLogs: (run: TestRun) => void;
  onSelectRun: (runId: string) => void;
  onSelectAll: () => void;
  selectAll: boolean;
  // 🔥 新增：分页相关 props
  total: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
}

// 默认列宽配置
const defaultColumnWidths: Record<string, number> = {
  select: 50,
  name: 400,
  system: 150,
  projectVersion: 100,
  module: 100,
  tags: 80,
  priority: 80,
  status: 80,
  environment: 80,
  progress: 100,
  steps: 140,
  executor: 100,
  startTime: 140,
  endTime: 140,
  duration: 100,
  actions: 60,
};

export function TestRunsDetailedTable({
  testRuns,
  selectedRunIds,
  stoppingTests,
  onStopTest,
  onViewLogs,
  onSelectRun,
  onSelectAll,
  selectAll,
  total,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading = false
}: TestRunsDetailedTableProps) {
  // 列宽状态管理
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({ ...defaultColumnWidths });
  
  // 拖动状态
  const dragStateRef = useRef<{
    isDragging: boolean;
    startX: number;
    startWidth: number;
    columnKey: string;
  } | null>(null);

  // 开始拖动
  const handleMouseDown = useCallback((columnKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startWidth = columnWidths[columnKey] || defaultColumnWidths[columnKey] || 100;
    
    dragStateRef.current = {
      isDragging: true,
      startX: e.clientX,
      startWidth,
      columnKey,
    };
    
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columnWidths]);

  // 拖动过程
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current?.isDragging) return;
      
      const { startX, startWidth, columnKey } = dragStateRef.current;
      const diff = e.clientX - startX;
      const newWidth = Math.max(50, Math.min(800, startWidth + diff));
      
      setColumnWidths(prev => ({
        ...prev,
        [columnKey]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      if (dragStateRef.current?.isDragging) {
        dragStateRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 双击重置单列宽度
  const handleDoubleClick = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setColumnWidths((prev) => ({
      ...prev,
      [key]: defaultColumnWidths[key] || 100,
    }));
  }, []);

  // 重置所有列宽
  const handleResetAllWidths = useCallback(() => {
    setColumnWidths({ ...defaultColumnWidths });
  }, []);

  // 安全的日期格式化
  const safeFormat = (date: Date | null | undefined, formatStr: string): string => {
    try {
      if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return '-';
      }
      return format(date, formatStr);
    } catch (error) {
      return '日期格式化错误';
    }
  };

  // 状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  // 状态配置
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'running':
        return { color: 'processing', text: '执行中' };
      case 'completed':
        return { color: 'success', text: '已完成' };
      case 'failed':
        return { color: 'error', text: '失败' };
      case 'queued':
        return { color: 'warning', text: '队列中' };
      case 'cancelled':
        return { color: 'default', text: '已取消' };
      default:
        return { color: 'default', text: '未知' };
    }
  };

  // 转换为表格数据
  const tableData: TableRowData[] = useMemo(() => {
    return testRuns.map((run, index) => ({
      ...run,
      key: run.id || `run-${index}`,
      rowIndex: testRuns.length - index, // 倒序序号
    }));
  }, [testRuns]);

  // 全选状态
  const isIndeterminate = selectedRunIds.size > 0 && selectedRunIds.size < testRuns.length;

  // 表格列定义
  const columns: ColumnsType<TableRowData> = useMemo(() => [
    {
      title: (
        <div style={{ paddingLeft: '16px' }}>
          <Checkbox
            checked={selectAll}
            indeterminate={isIndeterminate}
            onChange={onSelectAll}
          />
        </div>
      ),
      dataIndex: 'select',
      key: 'select',
      width: 50,
      fixed: 'left',
      render: (_, record) => (
        <div style={{ paddingLeft: '15px' }}>
          <Checkbox
            checked={selectedRunIds.has(record.id)}
            onChange={() => onSelectRun(record.id)}
          />
        </div>
      ),
    },
    {
      title: '所属项目',
      dataIndex: 'system',
      key: 'system',
      width: 100,
      // align: 'center',
      // sorter: (a, b) => (a.system || '').localeCompare(b.system || ''),
      render: (system: string) => (
        <div className="flex items-center justify-left">
          <span className="text-sm text-gray-700 truncate max-w-50" title={system || '-'}>
            {system || '-'}
          </span>
        </div>
      ),
    },
    {
      title: '所属版本',
      dataIndex: 'projectVersion',
      key: 'projectVersion',
      width: 100,
      // align: 'center',
      // sorter: (a, b) => (a.projectVersion || '').localeCompare(b.projectVersion || ''),
      render: (projectVersion: string) => (
        <div className="flex items-center justify-center">
          <span className="text-sm text-gray-700 truncate max-w-24" title={projectVersion || '-'}>
            {projectVersion || '-'}
          </span>
        </div>
      ),
    },
    {
      title: '所属模块',
      dataIndex: 'module',
      key: 'module',
      width: 100,
      align: 'center',
      // sorter: (a, b) => (a.module || '').localeCompare(b.module || ''),
      render: (module: string) => (
        <div className="flex items-center justify-center">
          <span className="text-sm text-gray-700 truncate max-w-24" title={module || '-'}>
            {module || '-'}
          </span>
        </div>
      ),
    },
    {
      title: '用例名称',
      dataIndex: 'name',
      key: 'name',
      width: 300,
      ellipsis: { showTitle: false },
      sorter: (a, b) => a.name.localeCompare(b.name),
      // defaultSortOrder: 'descend',
      render: (text: string, record) => (
        <Tooltip 
          title={
            <div className="text-xs space-y-1">
              <div className="text-gray-300">用例ID: {record.testCaseId}</div>
              <div className="font-medium">用例名称: {text}</div>
              <div className="text-gray-300">运行ID: {record.id}</div>
              {record.error && (
                <div className="text-red-300">错误: {record.error}</div>
              )}
            </div>
          }
          styles={{ body: { minWidth: '460px', maxWidth: '550px', padding: '8px' } }}
          placement="topLeft"
        >
          <div className="overflow-hidden">
            <div className="text-gray-900 font-medium truncate">{text}</div>
            {record.error && (
              <div className="text-xs text-red-600 mt-0.5 truncate">
                错误: {record.error}
              </div>
            )}
          </div>
        </Tooltip>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 120,
      align: 'center',
      render: (tags: string[]) => (
        <div className="flex items-center justify-center flex-wrap gap-1">
          {tags && Array.isArray(tags) && tags.length > 0 ? (
            tags.slice(0, 2).map((tag, idx) => (
              <Tag key={idx} color="purple" style={{ marginInlineEnd: 0 }}>
                {tag}
              </Tag>
            ))
          ) : (
            <span className="text-sm text-gray-400">-</span>
          )}
          {tags && Array.isArray(tags) && tags.length > 2 && (
            <span className="text-xs text-gray-500">+{tags.length - 2}</span>
          )}
        </div>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      align: 'center',
      // sorter: (a, b) => {
      //   const priorityOrder = { high: 3, medium: 2, low: 1 };
      //   return (priorityOrder[a.priority as keyof typeof priorityOrder] || 0) - 
      //          (priorityOrder[b.priority as keyof typeof priorityOrder] || 0);
      // },
      render: (priority: string) => {
        if (!priority) return <span className="text-sm text-gray-400">-</span>;
        const colorMap = {
          high: 'error',
          medium: 'warning',
          low: 'default'
        };
        const textMap = {
          high: '高',
          medium: '中',
          low: '低'
        };
        return (
          <Tag color={colorMap[priority as keyof typeof colorMap] || 'default'} style={{ marginInlineEnd: 0 }}>
            {textMap[priority as keyof typeof textMap] || priority}
          </Tag>
        );
      },
    },
    {
      title: '执行状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      // sorter: (a, b) => a.status.localeCompare(b.status),
      render: (status: string) => {
        const config = getStatusConfig(status);
        return (
          <div className="flex items-center justify-center gap-2">
            {/* {getStatusIcon(status)} */}
            <Tag style={{ marginInlineEnd: 0 }} color={config.color}>{config.text}</Tag>
          </div>
        );
      },
    },
    {
      title: '执行环境',
      dataIndex: 'environment',
      key: 'environment',
      width: 100,
      align: 'center',
      // sorter: (a, b) => a.environment.localeCompare(b.environment),
      render: (environment: string) => (
        <div className="flex items-center justify-center gap-2">
          <Tag color="default" style={{ marginInlineEnd: 0 }}>{environment}</Tag>
        </div>
      ),
    },
    {
      title: '执行进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 100,
      align: 'center',
      // sorter: (a, b) => a.progress - b.progress,
      render: (progress: number, record) => {
        if (record.status === 'running') {
          return (
            <div className="w-full">
              <div className="flex items-center justify-center text-xs text-gray-600 mb-1">
                <span>{record.completedSteps}/{record.totalSteps}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          );
        }
        return (
          <span className="text-sm text-gray-600">
            {record.completedSteps}/{record.totalSteps} ({progress}%)
          </span>
        );
      },
    },
    {
      title: '执行结果',
      key: 'steps',
      width: 120,
      align: 'center',
      render: (_, record) => (
        <div className="flex items-center justify-center gap-3 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-green-600 font-medium">{record.passedSteps}</span>
            <span className="text-gray-400 text-xs">通过</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-red-600 font-medium">{record.failedSteps}</span>
            <span className="text-gray-400 text-xs">失败</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-orange-600 font-medium">{record.totalSteps-record.passedSteps-record.failedSteps}</span>
            <span className="text-gray-400 text-xs">阻塞</span>
          </div>
        </div>
      ),
    },
    {
      title: '执行者',
      dataIndex: 'executor',
      key: 'executor',
      width: 100,
      align: 'center',
      // sorter: (a, b) => a.executor.localeCompare(b.executor),
      render: (executor: string) => (
        <div className="flex items-center justify-start gap-1 overflow-hidden">
          <User className="w-7 h-7 text-gray-400" />
          <span className="text-sm text-gray-600 max-w-30 truncate" title={executor || '-'}>
            {executor}
          </span>
        </div>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 160,
      // sorter: (a, b) => {
      //   const aTime = a.startTime instanceof Date ? a.startTime.getTime() : 0;
      //   const bTime = b.startTime instanceof Date ? b.startTime.getTime() : 0;
      //   return aTime - bTime;
      // },
      // defaultSortOrder: 'descend',
      render: (startTime: Date, record: TableRowData) => {
        // 🔥 修复：优先使用 actualStartedAt（用例实际开始执行时间），其次是 startedAt，最后才是 startTime
        // 如果都没有，尝试从日志中提取开始时间
        let displayTime: Date | null = null;
        
        // 优先使用 actualStartedAt
        if ((record as any).actualStartedAt) {
          displayTime = (record as any).actualStartedAt instanceof Date 
            ? (record as any).actualStartedAt 
            : new Date((record as any).actualStartedAt);
        }
        // 其次使用 startedAt
        else if ((record as any).startedAt) {
          displayTime = (record as any).startedAt instanceof Date 
            ? (record as any).startedAt 
            : new Date((record as any).startedAt);
        }
        // 最后使用 startTime
        else if (startTime) {
          displayTime = startTime instanceof Date ? startTime : new Date(startTime);
        }
        // 如果都没有，尝试从日志中提取
        else if (record.logs && record.logs.length > 0) {
          const sortedLogs = [...record.logs].sort((a, b) => {
            const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
            const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
            return timeA - timeB;
          });
          if (sortedLogs.length > 0) {
            const firstLog = sortedLogs[0];
            displayTime = firstLog.timestamp instanceof Date ? firstLog.timestamp : new Date(firstLog.timestamp);
          }
        }
        
        return (
          <div className="flex items-center gap-1 text-sm text-gray-600">
            {/* <Clock className="w-3.5 h-3.5 text-gray-400" /> */}
            <span className="truncate">
              {safeFormat(displayTime, 'yyyy-MM-dd HH:mm:ss')}
            </span>
          </div>
        );
      },
    },
    {
      title: '结束时间',
      dataIndex: 'endTime',
      key: 'endTime',
      width: 160,
      // sorter: (a, b) => {
      //   const aTime = a.endTime instanceof Date ? a.endTime.getTime() : 0;
      //   const bTime = b.endTime instanceof Date ? b.endTime.getTime() : 0;
      //   return aTime - bTime;
      // },
      // defaultSortOrder: 'descend',
      render: (endTime: Date) => (
        <div className="flex items-center gap-1 text-sm text-gray-600">
          {/* <Clock className="w-3.5 h-3.5 text-gray-400" /> */}
          <span className="truncate">
            {safeFormat(endTime, 'yyyy-MM-dd HH:mm:ss')}
          </span>
        </div>
      ),
    },
    {
      title: '执行时长',
      dataIndex: 'duration',
      key: 'duration',
      width: 100,
      align: 'center',
      // sorter: (a, b) => a.duration.localeCompare(b.duration),
      render: (duration: string) => (
        <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span className="truncate">{duration}</span>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size={8} className="flex-nowrap">
          {(record.status === 'running' || record.status === 'queued') && (
            <Tooltip title={stoppingTests.has(record.id) ? "正在停止..." : "停止测试"}>
              <Button
                type="text"
                size="small"
                danger={!stoppingTests.has(record.id)}
                disabled={stoppingTests.has(record.id)}
                className="!px-1.5 hover:!bg-red-50 transition-all"
                icon={stoppingTests.has(record.id) ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                onClick={() => onStopTest(record)}
              />
            </Tooltip>
          )}
          {record.status !== 'queued' && (
            <Tooltip title="查看日志">
              <Button
                type="text"
                size="small"
                className="px-1 pt-1 hover:!bg-blue-50 hover:!text-blue-600 transition-all"
                icon={<Terminal className="w-4 h-4" />}
                onClick={() => onViewLogs(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ], [
    selectAll,
    isIndeterminate,
    selectedRunIds,
    stoppingTests,
    onSelectAll,
    onSelectRun,
    onStopTest,
    onViewLogs,
  ]);

  // 将列配置转换为可调整宽度的列配置
  const resizableColumns: ColumnsType<TableRowData> = useMemo(() => {
    return columns.map((col) => {
      const columnKey = col.key as string;
      const currentWidth = columnWidths[columnKey] || (col.width as number) || 100;
      const originalTitle = col.title;
      
      // 为标题添加拖动区域
      const titleWithHandle = (
        <>
          {originalTitle as React.ReactNode}
          {/* 拖动区域 */}
          <div
            className="column-resize-handle"
            onMouseDown={(e) => handleMouseDown(columnKey, e)}
            onDoubleClick={(e) => handleDoubleClick(columnKey, e)}
          />
        </>
      );
      
      return {
        ...col,
        title: titleWithHandle,
        width: currentWidth,
      };
    });
  }, [columns, columnWidths, handleMouseDown, handleDoubleClick]);

  return (
    <>
      <Table
        columns={resizableColumns}
        dataSource={tableData}
        rowKey="key"
        pagination={false}
        scroll={{ x: 2000, y: 'calc(100vh - 420px)' }}
        size="small"
        className="functional-test-table"
        tableLayout="fixed"
        locale={{
          emptyText: (
            <div className="py-16 text-center">
              <div className="text-gray-400 mb-2">
                <Activity className="w-12 h-12 mx-auto" />
              </div>
              <p className="text-gray-500">暂无测试运行记录</p>
            </div>
          )
        }}
      />

      {/* 底部工具栏 - 集成分页 */}
      {!loading && total > 0 && (
        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50">
          {/* 左侧：记录数和重置列宽 */}
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500">
              共 <span className="font-semibold text-gray-700">{total}</span> 条记录，
              第 <span className="font-semibold text-gray-700">{currentPage}</span> / <span className="font-semibold text-gray-700">{Math.ceil(total / pageSize)}</span> 页
            </div>
            <Tooltip title="重置列宽（双击列边框可重置单列）">
              <Button
                type="text"
                size="small"
                icon={<RotateCcw className="w-3.5 h-3.5" />}
                onClick={handleResetAllWidths}
                className="text-gray-400 hover:text-gray-600"
              >
                重置列宽
              </Button>
            </Tooltip>
          </div>

          {/* 右侧：分页控件 */}
          <div className="flex space-x-4">
            {/* 分页按钮 */}
            <div className="flex items-center space-x-1">
              {/* 第一页 */}
              <button
                onClick={() => onPageChange(1)}
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
                onClick={() => onPageChange(currentPage - 1)}
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
                      onPageChange(page);
                    }
                  }}
                  className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">/ {Math.ceil(total / pageSize)}</span>
              </div>

              {/* 下一页 */}
              <button
                onClick={() => onPageChange(currentPage + 1)}
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
                onClick={() => onPageChange(Math.ceil(total / pageSize))}
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

            {/* 每页条数选择器 */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700">每页显示</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ width: '80px' }}
                title="选择每页显示的记录数"
                aria-label="选择每页显示的记录数"
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
    </>
  );
}

