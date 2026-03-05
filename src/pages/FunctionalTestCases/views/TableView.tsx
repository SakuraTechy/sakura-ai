import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Table, Button, Space, Tooltip, Checkbox, Pagination, Tag, Dropdown, Modal } from 'antd';
import { Edit3, Trash2, Eye, FileText, User, Bot, PlayCircle, RotateCcw, Loader2, Copy, Settings } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { ViewProps } from '../types';
import { getCaseTypeInfo } from '../../../utils/caseTypeHelper';

// 平铺后的行数据类型
interface FlatRowData {
    key: string;
    rowIndex: number;
    // 测试点信息
    test_point_id: number;
    test_point_index: number;
    test_point_name: string;
    test_purpose?: string;
    test_point_risk_level: string;
    // 测试用例信息
    id: number;
    case_id?: string;  // 🆕 格式化的用例编号
    name: string;
    description?: string;
    system: string;
    module: string;
    priority: string;
    status: string;
    section_name?: string;
    section_description?: string;  // 🆕 需求章节描述
    scenario_name?: string;  // 🆕 测试场景名称
    scenario_description?: string;  // 🆕 测试场景描述
    tags?: string;
    source?: string;
    case_type?: string;  // 🆕 用例类型
    project_version_id?: number;  // 🆕 项目版本ID
    project_version?: {  // 🆕 项目版本信息
        id: number;
        version_name: string;
        version_code: string;
        is_main: boolean;
    };
    requirement_source?: string;  // 🆕 需求来源
    execution_status?: string | null;  // 🆕 执行状态: 'pass', 'fail', 'block', null
    last_executed_at?: string | null;  // 🆕 最后执行时间
    last_executor?: string | null;  // 🆕 最后执行人
    created_at: string;
    updated_at: string;
    users?: {
        username: string;
    };
}

// 默认列宽配置
const defaultColumnWidths: Record<string, number> = {
    select: 50,
    id: 80,
    system: 180,
    module: 90,
    scenario_name: 200,
    test_point_name: 200,
    name: 320,
    project_version: 100,
    case_type: 80,
    priority: 80,
    execution_status: 90,
    source: 90,
    creator: 90,
    created_at: 160,
    updated_at: 160,
    actions: 190,  // 🆕 增加宽度以容纳复制按钮
};

// LocalStorage key for column widths
const COLUMN_WIDTHS_STORAGE_KEY = 'functional-test-cases-table-column-widths';
// LocalStorage key for visible columns
const VISIBLE_COLUMNS_STORAGE_KEY = 'functional-test-cases-table-visible-columns';

// 列配置定义
interface ColumnConfig {
    key: string;
    title: string;
    required?: boolean; // 必需列，不可隐藏
}

// 所有可配置的列
const COLUMN_CONFIGS: ColumnConfig[] = [
    { key: 'select', title: '选择', required: true },
    { key: 'id', title: 'ID', required: true },
    { key: 'system', title: '所属项目' },
    { key: 'project_version', title: '所属版本' },
    { key: 'module', title: '所属模块' },
    { key: 'scenario_name', title: '测试场景' },
    { key: 'test_point_name', title: '测试点' },
    { key: 'name', title: '用例标题' },
    { key: 'case_type', title: '用例类型' },
    { key: 'priority', title: '优先级' },
    { key: 'execution_status', title: '执行结果' },
    { key: 'source', title: '用例来源' },
    { key: 'creator', title: '创建者' },
    { key: 'created_at', title: '创建时间' },
    { key: 'updated_at', title: '更新时间' },
    { key: 'actions', title: '操作', required: true },
];

export const TableView: React.FC<ViewProps> = ({
    testCases,
    loading,
    selectedPoints,
    onToggleSelectPoint,
    onBatchSelectPoints,
    onViewDetail,
    onEditCase,
    onDeleteCase,
    onCopyCase,
    onViewLogs,
    onExecuteCase,
    pagination,
    onPageChange,
    runningTestId  // 🆕 接收正在运行的测试ID
}) => {
    // 🔥 列宽状态管理 - 从 localStorage 恢复
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
        try {
            const saved = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                console.log('📏 [TableView] 恢复列宽:', parsed);
                return parsed;
            }
        } catch (error) {
            console.error('恢复列宽失败:', error);
        }
        console.log('📏 [TableView] 使用默认列宽（空对象）');
        return {};
    });
    const isInitializedRef = useRef(false);
    
    // 🆕 列显示状态管理 - 从 localStorage 恢复
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem(VISIBLE_COLUMNS_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                console.log('👁️ [TableView] 恢复列显示状态:', parsed);
                return new Set(parsed);
            }
        } catch (error) {
            console.error('恢复列显示状态失败:', error);
        }
        // 默认显示所有列
        console.log('👁️ [TableView] 使用默认列显示状态（全部显示）');
        return new Set(COLUMN_CONFIGS.map(col => col.key));
    });
    
    // 🆕 列配置弹窗状态
    const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
    
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
        
        // 获取当前宽度：优先使用 columnWidths，否则使用默认值
        const startWidth = columnWidths[columnKey] !== undefined
            ? columnWidths[columnKey]
            : (defaultColumnWidths[columnKey] || 100);
        
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
            
            // 直接更新状态，因为我们只在拖动时更新
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

    // 🔥 保存列宽到 localStorage
    useEffect(() => {
        // 只有当列宽不为空时才保存（避免保存初始空对象）
        if (Object.keys(columnWidths).length > 0) {
            try {
                console.log('💾 [TableView] 保存列宽:', columnWidths);
                localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
            } catch (error) {
                console.error('保存列宽失败:', error);
            }
        }
    }, [columnWidths]);
    
    // 🆕 保存列显示状态到 localStorage
    useEffect(() => {
        try {
            const visibleArray = Array.from(visibleColumns);
            console.log('💾 [TableView] 保存列显示状态:', visibleArray);
            localStorage.setItem(VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(visibleArray));
        } catch (error) {
            console.error('保存列显示状态失败:', error);
        }
    }, [visibleColumns]);

    // 将测试用例数据转换为平铺的行数据
    const flatData: FlatRowData[] = useMemo(() => {
        if (!testCases || testCases.length === 0) return [];

        return testCases.map((row, index) => ({
            key: `${row.test_point_id || row.id}-${index}`,
            // 🆕 序号倒序：总数 - 当前位置，最新的数据序号最大
            rowIndex: (pagination?.total || testCases.length) - ((pagination?.page || 1) - 1) * (pagination?.pageSize || 20) - index,
            // 测试点信息
            test_point_id: row.test_point_id,
            test_point_index: row.test_point_index,
            test_point_name: row.test_point_name || '未命名测试点',
            test_purpose: row.test_purpose,
            test_point_risk_level: row.test_point_risk_level || 'medium',
            // 测试用例信息
            id: row.id,
            case_id: row.case_id,  // 🆕 格式化的用例编号
            name: row.name || '未命名用例',
            description: row.description,
            system: row.system || '-',
            module: row.module || '-',
            priority: row.priority || 'medium',
            status: row.status || 'DRAFT',
            section_name: row.section_name || '未分类',
            scenario_name: row.scenario_name,  // 🆕 测试场景名称
            scenario_description: row.scenario_description,  // 🆕 测试场景描述
            section_description: row.section_description,  // 🆕 测试场景描述
            tags: row.tags,
            source: row.source || 'MANUAL',
            case_type: row.case_type || 'FULL',  // 🆕 用例类型
            project_version_id: row.project_version_id,  // 🆕 项目版本ID
            project_version: row.project_version,  // 🆕 项目版本信息
            requirement_source: row.requirement_source,  // 🆕 需求来源
            execution_status: row.execution_status,  // 🆕 执行状态
            last_executed_at: row.last_executed_at,  // 🆕 最后执行时间
            last_executor: row.last_executor,  // 🆕 最后执行人
            created_at: row.created_at,
            updated_at: row.updated_at,
            users: row.users
        }));
    }, [testCases, pagination?.page, pagination?.pageSize, pagination?.total]);

    // 优先级配置
    const getPriorityConfig = (priority: string) => {
        switch (priority) {
            case 'critical': return { color: '#c53030', bg: '#fed7d7', text: '紧急' };
            case 'high': return { color: '#c53030', bg: '#fed7d7', text: '高' };
            case 'medium': return { color: '#c05621', bg: '#feebc8', text: '中' };
            case 'low': return { color: '#2f855a', bg: '#c6f6d5', text: '低' };
            default: return { color: '#4a5568', bg: '#e2e8f0', text: priority };
        }
    };

    // 来源配置
    const getSourceConfig = (source: string) => {
        if (source === 'AI_GENERATED') {
            return { color: '#6b46c1', bg: '#e9d8fd', text: 'AI生成', icon: <Bot className="w-3 h-3 mr-1" /> };
        }
        return { color: '#4a5568', bg: '#e2e8f0', text: '手动创建', icon: <User className="w-3 h-3 mr-1" /> };
    };

    // 🆕 用例类型配置
    const getCaseTypeConfig = (caseType: string) => {
        const typeInfo = getCaseTypeInfo(caseType);
        return { 
            color: typeInfo.color, 
            bg: typeInfo.bgColor, 
            text: `${typeInfo.emoji} ${typeInfo.label}` 
        };
    };

    // 格式化日期
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };
    const formatDate1 = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (date >= today) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    };

    // 🆕 计算当前页全选状态
    const currentPagePointIds = useMemo(() => {
        return flatData.map(row => row.test_point_id);
    }, [flatData]);

    const currentPageSelectedCount = useMemo(() => {
        return currentPagePointIds.filter(id => selectedPoints.has(id)).length;
    }, [currentPagePointIds, selectedPoints]);

    const isAllCurrentPageSelected = currentPagePointIds.length > 0 && currentPageSelectedCount === currentPagePointIds.length;
    const isIndeterminate = currentPageSelectedCount > 0 && currentPageSelectedCount < currentPagePointIds.length;

    // 表格列定义
    const columns: ColumnsType<FlatRowData> = useMemo(() => [
        {
            title: (
                <div style={{ paddingLeft: '16px' }}>
                    <Checkbox
                        checked={isAllCurrentPageSelected}
                        indeterminate={isIndeterminate}
                        onChange={(e) => {
                            if (onBatchSelectPoints) {
                                // 使用批量选择函数，一次性更新状态
                                onBatchSelectPoints(currentPagePointIds, e.target.checked);
                            } else {
                                // 降级处理：逐个调用
                                currentPagePointIds.forEach(id => {
                                    const isSelected = selectedPoints.has(id);
                                    if (e.target.checked && !isSelected) {
                                        onToggleSelectPoint(id);
                                    } else if (!e.target.checked && isSelected) {
                                        onToggleSelectPoint(id);
                                    }
                                });
                            }
                        }}
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
                        checked={selectedPoints.has(record.test_point_id)}
                        onChange={() => onToggleSelectPoint(record.test_point_id)}
                    />
                </div>
            ),
        },
        // {
        //     title: '序号',
        //     dataIndex: 'rowIndex',
        //     key: 'rowIndex',
        //     width: 50,
        //     fixed: 'left',
        //     render: (index: number) => (
        //         <span className="text-gray-500 font-medium">{index}</span>
        //     ),
        // },
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 80,
            sorter: (a, b) => a.id - b.id,
            sortDirections: ['ascend', 'descend'],
            defaultSortOrder: 'ascend',
            render: (id: number) => (
                <span className="font-mono font-semibold text-indigo-600 text-sm whitespace-nowrap">
                    {/* {record.case_id ? record.case_id : `TC_${String(id).padStart(5, '0')}`} */}
                    {`TC_${String(id).padStart(5, '0')}`}
                </span>
            ),
        },
        {
            title: <div style={{ paddingRight: '24px' }}>所属项目</div>,
            dataIndex: 'system',
            key: 'system',
            width: 180,
            fixed: 'left',
            ellipsis: { showTitle: false },
            render: (text: string) => (
                <div style={{ paddingRight: '0px' }}>
                    <Tooltip title={<div className="text-xs">
                            <div className="font-medium">{text || '-'}</div>
                        </div>
                    } 
                    placement="topLeft"
                    styles={{ body: { padding: '8px' } }}
                >
                        <span className="text-gray-700 block truncate">{text || '-'}</span>
                    </Tooltip>
                </div>
            ),
        },
        { 
            title: '所属版本',
            dataIndex: 'project_version',
            key: 'project_version',
            width: 120,
            ellipsis: { showTitle: false },
            render: (_text: string, record) => (
                <Tooltip title={<div className="text-xs">
                            <div className="font-medium">{record.project_version?.version_name || '-'}</div>
                        </div>
                    } 
                    placement="topLeft"
                    styles={{ body: { padding: '8px' } }}
                >
                    <span className="text-gray-700 block truncate">{record.project_version?.version_name || '-'}</span>
                </Tooltip>
            ),
        },
        {
            title: <div style={{ paddingLeft: '5px' }}>所属模块</div>,
            dataIndex: 'module',
            key: 'module',
            width: 90,
            ellipsis: { showTitle: false },
            render: (text: string) => (
                <div style={{ paddingLeft: '5px' }}>
                <Tooltip title={<div className="text-xs">
                            <div className="font-medium">{text || '-'}</div>
                        </div>
                    } 
                    placement="topLeft"
                    styles={{ body: { padding: '8px' } }}
                >
                    <span className="text-gray-700 truncate">{text || '-'}</span>
                </Tooltip>
                </div>
            ),
        },
        {
            title: '测试场景',
            dataIndex: 'scenario_name',  // 🔧 改为显示测试场景名称
            key: 'scenario_name',
            width: 150,
            ellipsis: { showTitle: false },
            render: (text: string, record) => (
                <Tooltip 
                    title={
                        <div className="text-xs">
                            <div className="font-medium">{text || record.scenario_name || '未分类'}</div>
                            {record.scenario_description && (
                                <div className="mt-1 text-gray-300">{record.scenario_description}</div>
                            )}
                        </div>
                    } 
                    placement="topLeft"
                    styles={{ body: { minWidth: '360px', maxWidth: '450px', padding: '8px' } }}
                >
                    <div className="overflow-hidden">
                        <div className="text-gray-800 font-medium truncate">{text || record.scenario_name || '未分类'}</div>
                        {record.scenario_description && (
                            <div className="text-xs text-gray-500 mt-0.5 truncate">
                                {/* {record.scenario_description} */}
                            </div>
                        )}
                    </div>
                </Tooltip>
            ),
        },
        {
            title: '测试点',
            dataIndex: 'test_point_name',
            key: 'test_point_name',
            width: 150,
            ellipsis: { showTitle: false },
            render: (text: string, record) => (
                <Tooltip 
                    title={
                        <div className="text-xs">
                            <div className="font-medium">{text}</div>
                            {record.test_purpose && (
                                <div className="mt-1 text-gray-300">{record.test_purpose}</div>
                            )}
                        </div>
                    } 
                    placement="topLeft"
                    styles={{ body: { minWidth: '360px', maxWidth: '450px', padding: '8px' } }}
                >
                    <div className="overflow-hidden">
                        <div className="flex flex-col items-normal gap-0">
                            <span className="text-gray-700 truncate">{text}</span>
                            {record.test_purpose && (
                                <div className="text-xs text-gray-500 mt-0.5 truncate">
                                    {/* {record.test_purpose} */}
                                </div>
                            )}
                        </div>
                    </div>
                </Tooltip>
            ),
        },
        // {
        //     title: '用例ID',
        //     dataIndex: 'id',
        //     key: 'id',
        //     width: 80,
        //     render: (id: number) => (
        //         <span className="font-mono font-semibold text-indigo-600 text-sm whitespace-nowrap">
        //             {/* {record.case_id ? record.case_id : `TC_${String(id).padStart(5, '0')}`} */}
        //             {`TC_${String(id).padStart(5, '0')}`}
        //         </span>
        //     ),
        // },
        {
            title: '用例标题',
            dataIndex: 'name',
            key: 'name',
            width: 370,
            ellipsis: { showTitle: false },
            render: (text: string, record) => (
                <Tooltip 
                    title={
                        <div className="text-xs">
                            <div className="font-medium">{text}</div>
                            {record.description && (
                                <div className="mt-1 text-gray-300">{record.description}</div>
                            )}
                        </div>
                    }
                    placement="topLeft"
                    styles={{ body: { minWidth: '460px', maxWidth: '550px', padding: '8px' } }}
                >
                    <div className="overflow-hidden">
                        <div className="text-gray-900 font-medium truncate">
                            {text}
                        </div>
                        {record.description && (
                            <div className="text-xs text-gray-500 mt-0.5 truncate">
                                {/* {record.description} */}
                            </div>
                        )}
                    </div>
                </Tooltip>
            ),
        },
        // {
        //     title: '用例版本',
        //     dataIndex: 'project_version',
        //     key: 'project_version',
        //     width: 120,
        //     align: 'center',
        //     sorter: (a, b) => (a.project_version?.version_code || '').localeCompare(b.project_version?.version_code || ''),
        //     sortDirections: ['ascend', 'descend'],
        //     defaultSortOrder: 'ascend',
        //     render: (version: FlatRowData['project_version']) => {
        //         if (!version) {
        //             return <span className="text-gray-400 text-xs">-</span>;
        //         }
        //         return (
        //             <Tooltip title={`${version.version_name} (${version.version_code})`}>
        //                 <span
        //                     className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        //                     style={{ 
        //                         backgroundColor: version.is_main ? '#c6f6d5' : '#e2e8f0', 
        //                         color: version.is_main ? '#276749' : '#4a5568' 
        //                     }}
        //                 >
        //                     {version.is_main && <span>⭐</span>}
        //                     <span className="truncate max-w-[100px]">{version.version_name}</span>
        //                 </span>
        //             </Tooltip>
        //         );
        //     },
        // },
        {
            title: '用例类型',
            dataIndex: 'case_type',
            key: 'case_type',
            width: 80,
            align: 'center',
            // sorter: (a, b) => a.case_type?.localeCompare(b.case_type || '') || 0,
            // sortDirections: ['ascend', 'descend'],
            // defaultSortOrder: 'ascend',
            render: (caseType: string) => {
                const config = getCaseTypeConfig(caseType);
                return (
                    <span
                        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                        style={{ backgroundColor: config.bg, color: config.color }}
                    >
                        {config.text}
                    </span>
                );
            },
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            key: 'priority',
            width: 80,
            align: 'center',
            // sorter: (a, b) => a.priority?.localeCompare(b.priority || '') || 0,
            // sortDirections: ['ascend', 'descend'],
            // defaultSortOrder: 'ascend',
            render: (priority: string) => {
                const config = getPriorityConfig(priority);
                return (
                    <span
                        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                        style={{ backgroundColor: config.bg, color: config.color }}
                    >
                        {config.text}
                    </span>
                );
            },
        },
        // { 
        //     title: '执行状态',
        //     dataIndex: 'status',
        //     key: 'status',
        //     width: 90,
        //     align: 'center',
        //     render: (status: string) => {
        //         const getStatusColor = (status: string) => {
        //             switch (status) {
        //                 case 'completed': return 'green';
        //                 case 'running': return 'red';
        //                 case 'pending': return 'gray';
        //                 default: return 'gray';
        //             }
        //         };
        //         const getStatusText = (status: string) => {
        //             switch (status) {
        //                 case 'completed': return '已完成';
        //                 case 'running': return '进行中';
        //                 case 'pending': return '未开始';
        //                 default: return '已完成';
        //             }
        //         };
        //         return <Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>;
        //     },
        // },
        {
            title: '执行结果',
            dataIndex: 'execution_status',
            key: 'execution_status',
            width: 90,
            align: 'center',
            // sorter: (a, b) => a.execution_status?.localeCompare(b.execution_status || '') || 0,
            // sortDirections: ['ascend', 'descend'],
            // defaultSortOrder: 'ascend',
            render: (execution_status: string | null, record: FlatRowData) => {
                // 根据实际执行结果展示状态
                const getStatusConfig = (status: string | null) => {
                    switch (status) {
                        case 'pass':
                            return { color: 'success', text: '✓ 通过', icon: '✓' };
                        case 'fail':
                            return { color: 'error', text: '✗ 失败', icon: '✗' };
                        case 'block':
                            return { color: 'warning', text: '⚠ 阻塞', icon: '⚠' };
                        default:
                            return { color: 'default', text: '未知', icon: '' };
                    }
                };
                const config = getStatusConfig(execution_status);
                return (
                    <Tooltip 
                        placement="top"
                        styles={{ body: { padding: '8px', fontSize: '13px' } }}
                        title={
                            execution_status && record.last_executed_at ? (
                                <div>
                                    <div>执行人: {record.last_executor || '未知'}</div>
                                    <div>执行时间: {new Date(record.last_executed_at).toLocaleString('zh-CN')}</div>
                                    <div>执行结果: {execution_status === 'pass' ? '通过' : execution_status === 'fail' ? '失败' : execution_status === 'block' ? '阻塞' : '未知'}</div>
                                </div>
                            ) : '暂无执行记录'
                        }
                    >
                        <Tag color={config.color}>{config.text}</Tag>
                        {/* {execution_status === 'pass' && <Tag className='inline-flex items-center gap-1' color="success"><CheckCircle className="w-4 h-4 text-green-500 dark:text-green-500" /> 通过</Tag>}
                        {execution_status === 'fail' && <Tag className='inline-flex items-center gap-1' color="error"><XCircle className="w-4 h-4 text-red-500" /> 失败</Tag>}
                        {execution_status === 'block' && <Tag className='inline-flex items-center gap-1' color="warning"><AlertCircle className="w-4 h-4 text-orange-500" /> 阻塞</Tag>}
                        {execution_status === null && <Tag className='inline-flex items-center gap-1' color="default"><Clock className="w-4 h-4 text-gray-500" /> 未执行</Tag>} */}
                    </Tooltip>
                );
            },
        },
        // {
        //     title: '风险',
        //     dataIndex: 'test_point_risk_level',
        //     key: 'risk_level',
        //     width: 70,
        //     align: 'center',
        //     render: (risk: string) => {
        //         const config = getRiskConfig(risk);
        //         return (
        //             <span
        //                 className="inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        //                 style={{ backgroundColor: config.bg, color: config.color }}
        //             >
        //                 {config.text}
        //             </span>
        //         );
        //     },
        // },
        {
            title: '用例来源',
            dataIndex: 'source',
            key: 'source',
            width: 90,
            align: 'center',
            // sorter: (a, b) => a.source?.localeCompare(b.source || '') || 0,
            // sortDirections: ['ascend', 'descend'],
            // defaultSortOrder: 'ascend',
            render: (source: string) => {
                const config = getSourceConfig(source);
                return (
                    <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                        style={{ backgroundColor: config.bg, color: config.color }}
                    >
                        {config.icon}
                        <span className="ml-0.5">{source === 'AI_GENERATED' ? 'AI' : '手动'}</span>
                    </span>
                );
            },
        },
        {
            title: '创建者',
            dataIndex: 'users',
            key: 'creator',
            width: 90,
            align: 'center',
            ellipsis: { showTitle: false },
            render: (users: { username: string } | undefined) => (
                <Tooltip title={users?.username} placement="topLeft">
                    <div className="flex items-center justify-center gap-1 text-gray-600 overflow-hidden">
                        <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-sm truncate">{users?.username || '-'}</span>
                    </div>
                </Tooltip>
            ),
        },
        {
            title: '创建时间',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 150,
            // align: 'center',
            render: (date: string) => (
                <span className="text-gray-500 text-sm whitespace-nowrap">
                    {formatDate(date)}
                </span>
            ),
        },
        {
            title: '更新时间',
            dataIndex: 'updated_at',
            key: 'updated_at',
            width: 150,
            // align: 'center',
            render: (date: string) => (
                <span className="text-gray-500 text-sm whitespace-nowrap">
                    {formatDate(date)}
                </span>
            ),
        },
        {
            title: <div style={{ paddingLeft: '4px', textAlign: 'left' }}>操作</div>,
            key: 'actions',
            width: 190,
            fixed: 'right',
            // align: 'center',
            render: (_, record) => (
                <Space size={8} className="flex-nowrap">
                    <Tooltip title="查看详情">
                        <Button
                            type="text"
                            size="small"
                            className="!px-1.5 hover:!bg-blue-50 hover:!text-blue-600 transition-all"
                            icon={<Eye className="w-4 h-4" />}
                            onClick={() => onViewDetail(record.id)}
                        />
                    </Tooltip>
                    <Tooltip title="编辑">
                        <Button
                            type="text"
                            size="small"
                            className="!px-1.5 hover:!bg-indigo-50 hover:!text-indigo-600 transition-all"
                            icon={<Edit3 className="w-4 h-4" />}
                            onClick={() => onEditCase(record.id)}
                        />
                    </Tooltip>
                    <Tooltip title="复制">
                        <Button
                            type="text"
                            size="small"
                            className="!px-1.5 hover:!bg-purple-50 hover:!text-purple-600 transition-all"
                            icon={<Copy className="w-4 h-4" />}
                            onClick={() => onCopyCase(record.id)}
                        />
                    </Tooltip>
                    <Dropdown
                        menu={{
                            items: [
                                {
                                    key: 'default',
                                    label: '功能测试',
                                    icon: <PlayCircle className="w-3.5 h-3.5" />,
                                    onClick: () => onExecuteCase(record.id, 'alt'),
                                    disabled: runningTestId === record.id,
                                },
                                {
                                    key: 'ui-auto',
                                    label: runningTestId === record.id ? (
                                        <span className="flex items-center gap-1">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            执行中...
                                        </span>
                                    ) : (
                                        'UI自动化测试'
                                    ),
                                    icon: runningTestId === record.id ? null : <PlayCircle className="w-3.5 h-3.5" />,
                                    onClick: () => onExecuteCase(record.id, 'ui-auto'),
                                    disabled: runningTestId === record.id,
                                },
                            ],
                        }}
                        trigger={['click']}
                        placement="bottomCenter"
                    >
                        <Tooltip title="执行用例">
                            <Button
                                type="text"
                                size="small"
                                className="!px-1.5 hover:!bg-emerald-50 hover:!text-emerald-600 transition-all"
                                icon={runningTestId === record.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                ) : (
                                    <PlayCircle className="w-4 h-4" />
                                )}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </Tooltip>
                    </Dropdown>
                    {/* <Tooltip title="执行用例">
                        <Button
                            type="text"
                            size="small"
                            className="!px-1.5 hover:!bg-emerald-50 hover:!text-emerald-600 transition-all"
                            icon={<PlayCircle className="w-4 h-4" />}
                            onClick={() => onExecuteCase(record.id, 'alt')}
                        />
                    </Tooltip> */}
                    <Tooltip title="执行日志">
                        <Button
                            type="text"
                            size="small"
                            className="!px-1.5 hover:!bg-green-50 hover:!text-green-600 transition-all"
                            icon={<FileText className="w-4 h-4" />}
                            onClick={() => onViewLogs(record.id)}
                        />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button
                            type="text"
                            size="small"
                            danger
                            className="!px-1.5 hover:!bg-red-50 transition-all"
                            icon={<Trash2 className="w-4 h-4" />}
                            onClick={() => onDeleteCase(record.id)}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ], [
        isAllCurrentPageSelected,
        isIndeterminate,
        currentPagePointIds,
        selectedPoints,
        onBatchSelectPoints,
        onToggleSelectPoint,
        onViewDetail,
        onEditCase,
        onCopyCase,
        onDeleteCase,
        onViewLogs,
        onExecuteCase,
        runningTestId,
    ]);

    // 🔥 初始化列宽：只有当 localStorage 中没有保存的列宽时才使用默认值
    useEffect(() => {
        if (!isInitializedRef.current && columns.length > 0) {
            // 检查是否已经从 localStorage 恢复了列宽
            const hasRestoredWidths = Object.keys(columnWidths).length > 0;
            
            if (!hasRestoredWidths) {
                // 只有当没有恢复的列宽时，才使用默认值初始化
                console.log('📏 [TableView] 使用默认列宽初始化');
                const initialWidths: Record<string, number> = {};
                columns.forEach((col) => {
                    const columnKey = col.key as string;
                    if (columnKey) {
                        // 优先使用列定义中的 width，否则使用 defaultColumnWidths，最后使用 100
                        initialWidths[columnKey] = (col.width as number) || defaultColumnWidths[columnKey] || 100;
                    }
                });
                setColumnWidths(initialWidths);
            } else {
                console.log('📏 [TableView] 已从 localStorage 恢复列宽，跳过默认初始化');
            }
            isInitializedRef.current = true;
        }
    }, [columns, columnWidths]);

    // 双击重置单列宽度
    const handleDoubleClick = useCallback((key: string, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        // 重置时，优先使用列定义中的宽度，否则使用默认值
        const col = columns.find(c => c.key === key);
        const resetWidth = (col?.width as number) || defaultColumnWidths[key] || 100;
        setColumnWidths((prev) => ({
            ...prev,
            [key]: resetWidth,
        }));
    }, [columns]);

    // 重置所有列宽
    const handleResetAllWidths = useCallback(() => {
        const resetWidths: Record<string, number> = {};
        columns.forEach((col) => {
            const columnKey = col.key as string;
            if (columnKey) {
                // 重置时，优先使用列定义中的宽度，否则使用默认值
                resetWidths[columnKey] = (col.width as number) || defaultColumnWidths[columnKey] || 100;
            }
        });
        setColumnWidths(resetWidths);
    }, [columns]);
    
    // 🆕 切换列显示状态
    const handleToggleColumn = useCallback((columnKey: string) => {
        setVisibleColumns(prev => {
            const newSet = new Set(prev);
            if (newSet.has(columnKey)) {
                newSet.delete(columnKey);
            } else {
                newSet.add(columnKey);
            }
            return newSet;
        });
    }, []);
    
    // 🆕 全选/取消全选列
    const handleToggleAllColumns = useCallback((checked: boolean) => {
        if (checked) {
            // 全选：显示所有列
            setVisibleColumns(new Set(COLUMN_CONFIGS.map(col => col.key)));
        } else {
            // 取消全选：只保留必需列
            setVisibleColumns(new Set(COLUMN_CONFIGS.filter(col => col.required).map(col => col.key)));
        }
    }, []);
    
    // 🆕 重置列显示状态
    const handleResetColumnVisibility = useCallback(() => {
        setVisibleColumns(new Set(COLUMN_CONFIGS.map(col => col.key)));
    }, []);

    // 将列配置转换为可调整宽度的列配置，并根据 visibleColumns 过滤
    const resizableColumns: ColumnsType<FlatRowData> = useMemo(() => {
        console.log('🔄 [TableView] 重新计算列配置，当前 columnWidths:', columnWidths);
        console.log('🔄 [TableView] 当前可见列:', Array.from(visibleColumns));
        
        // 🆕 先过滤出可见的列
        const filteredColumns = columns.filter(col => {
            const columnKey = col.key as string;
            return visibleColumns.has(columnKey);
        });
        
        return filteredColumns.map((col) => {
            const columnKey = col.key as string;
            // 宽度优先级：1. columnWidths（用户调整后的值） 2. col.width（列定义中的值） 3. defaultColumnWidths 4. 100
            const currentWidth = columnWidths[columnKey] !== undefined 
                ? columnWidths[columnKey] 
                : ((col.width as number) || defaultColumnWidths[columnKey] || 100);
            
            if (columnKey && columnWidths[columnKey] !== undefined) {
                console.log(`  📏 列 ${columnKey}: 使用保存的宽度 ${currentWidth}px`);
            }
            
            const originalTitle = col.title;
            
            // 为标题添加拖动区域（覆盖在原有分割线位置）
            const titleWithHandle = (
                <>
                    {originalTitle as React.ReactNode}
                    {/* 拖动区域 - 覆盖在表格原有分割线上 */}
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
    }, [columns, columnWidths, visibleColumns, handleMouseDown, handleDoubleClick]);

    // 处理分页变化
    const handlePageChange = (page: number, pageSize: number) => {
        if (onPageChange) {
            onPageChange(page, pageSize);
        }
    };

    if (loading) {
        return (
            <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="text-gray-500 mt-4">加载测试用例中...</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* 表格 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <Table
                    columns={resizableColumns}
                    dataSource={flatData}
                    rowKey="key"
                    loading={loading}
                    pagination={false}
                    scroll={{ x: 1900, y: 'calc(100vh - 420px)' }}
                    size="middle"
                    className="functional-test-table"
                    tableLayout="fixed"
                    rowClassName={(record, index) => {
                        // 对同一测试场景的行添加分组效果
                        const prevRecord = flatData[index - 1];
                        if (index > 0 && prevRecord && prevRecord.section_name !== record.section_name) {
                            return 'border-t-2 border-t-gray-200';
                        }
                        return '';
                    }}
                    locale={{
                        emptyText: (
                            <div className="py-16 text-center">
                                <div className="text-gray-400 mb-2">
                                    <FileText className="w-12 h-12 mx-auto" />
                                </div>
                                <p className="text-gray-500">未找到符合条件的测试用例</p>
                            </div>
                        )
                    }}
                />

                {/* 分页 */}
                {pagination && pagination.total > 0 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-4">
                            <div className="text-sm text-gray-500">
                                共 <span className="font-semibold text-gray-700">{pagination.total}</span> 条记录，
                                第 <span className="font-semibold text-gray-700">{pagination.page}</span> / <span className="font-semibold text-gray-700">{pagination.totalPages}</span> 页
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
                            <Tooltip title="列显示设置">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<Settings className="w-3.5 h-3.5" />}
                                    onClick={() => setColumnSettingsVisible(true)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    列设置
                                </Button>
                            </Tooltip>
                        </div>
                        <Pagination
                            current={pagination.page}
                            pageSize={pagination.pageSize}
                            total={pagination.total}
                            showSizeChanger
                            showQuickJumper
                            pageSizeOptions={['10', '20', '50', '100']}
                            onChange={handlePageChange}
                            onShowSizeChange={handlePageChange}
                            locale={{
                                items_per_page: '条/页',
                                jump_to: '跳至',
                                page: '页',
                                prev_page: '上一页',
                                next_page: '下一页'
                            }}
                        />
                    </div>
                )}
            </div>
            
            {/* 🆕 列显示设置弹窗 */}
            <Modal
                title={
                    <div className="flex items-center gap-2">
                        <Settings className="w-5 h-5 text-blue-600" />
                        <span>列显示设置</span>
                    </div>
                }
                open={columnSettingsVisible}
                onCancel={() => setColumnSettingsVisible(false)}
                footer={
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Button
                                size="small"
                                onClick={() => handleToggleAllColumns(true)}
                            >
                                全选
                            </Button>
                            <Button
                                size="small"
                                onClick={() => handleToggleAllColumns(false)}
                            >
                                取消全选
                            </Button>
                            <Button
                                size="small"
                                icon={<RotateCcw className="w-3.5 h-3.5" />}
                                onClick={handleResetColumnVisibility}
                            >
                                重置
                            </Button>
                        </div>
                        <Button
                            type="primary"
                            onClick={() => setColumnSettingsVisible(false)}
                        >
                            确定
                        </Button>
                    </div>
                }
                width={500}
                centered
            >
                <div className="space-y-2 max-h-[60vh] overflow-y-auto py-2">
                    {COLUMN_CONFIGS.map(col => (
                        <div
                            key={col.key}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                visibleColumns.has(col.key)
                                    ? 'bg-blue-50 border-blue-200'
                                    : 'bg-gray-50 border-gray-200'
                            } ${col.required ? 'opacity-60' : 'hover:shadow-sm cursor-pointer'}`}
                            onClick={() => !col.required && handleToggleColumn(col.key)}
                        >
                            <div className="flex items-center gap-3">
                                <Checkbox
                                    checked={visibleColumns.has(col.key)}
                                    disabled={col.required}
                                    onChange={() => handleToggleColumn(col.key)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <span className={`font-medium ${
                                    visibleColumns.has(col.key) ? 'text-gray-900' : 'text-gray-500'
                                }`}>
                                    {col.title}
                                </span>
                            </div>
                            {col.required && (
                                <Tag color="blue" className="text-xs">
                                    必需
                                </Tag>
                            )}
                        </div>
                    ))}
                </div>
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-start gap-2 text-xs text-blue-700">
                        <span className="flex-shrink-0 mt-0.5">💡</span>
                        <div>
                            <div className="font-medium mb-1">提示</div>
                            <ul className="space-y-1 list-disc list-inside">
                                <li>勾选列将在表格中显示，取消勾选则隐藏</li>
                                <li>标记为"必需"的列无法隐藏</li>
                                <li>设置会自动保存，刷新页面后保持</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
