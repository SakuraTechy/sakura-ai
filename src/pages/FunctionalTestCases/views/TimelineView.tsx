import React, { useMemo } from 'react';
import { Edit3, Trash2, Box, Layers, User, Target, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { ViewProps, TestCaseItem } from '../types';

export const TimelineView: React.FC<ViewProps> = ({
    organizedData,
    loading,
    onViewDetail,
    onEditCase,
    onDeleteCase,
    onExecuteCase,
}) => {
    // 按时间分组
    const groupedByTime = useMemo(() => {
        const allCases = organizedData.flatMap(scenario => (scenario.testPoints || []).flatMap(point => point.testCases || []));
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // 计算本周第一天（周一）
        const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 如果是周日，则距离周一6天
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - daysFromMonday);
        weekStart.setHours(0, 0, 0, 0);
        
        // 计算本月第一天
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        monthStart.setHours(0, 0, 0, 0);

        const groups = {
            today: [] as TestCaseItem[],
            thisWeek: [] as TestCaseItem[],
            thisMonth: [] as TestCaseItem[],
            earlier: [] as TestCaseItem[],
        };

        allCases.forEach(tc => {
            const createdDate = new Date(tc.created_at);
            createdDate.setHours(0, 0, 0, 0); // 重置时间部分，只比较日期
            
            if (createdDate.getTime() === today.getTime()) {
                groups.today.push(tc);
            } else if (createdDate >= weekStart) {
                groups.thisWeek.push(tc);
            } else if (createdDate >= monthStart) {
                groups.thisMonth.push(tc);
            } else {
                groups.earlier.push(tc);
            }
        });

        // 每组内按时间倒序排序
        Object.values(groups).forEach(group => {
            group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        });

        return groups;
    }, [organizedData]);

    const timeGroups = [
        { key: 'today', label: '今天', cases: groupedByTime.today },
        { key: 'thisWeek', label: '本周', cases: groupedByTime.thisWeek },
        { key: 'thisMonth', label: '本月', cases: groupedByTime.thisMonth },
        { key: 'earlier', label: '更早', cases: groupedByTime.earlier },
    ];

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'critical': return 'bg-red-100 text-red-700 border-red-200';
            case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'medium': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'low': return 'bg-gray-100 text-gray-700 border-gray-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const getPriorityText = (priority: string) => {
        switch (priority) {
            case 'critical': return '紧急';
            case 'high': return '高';
            case 'medium': return '中';
            case 'low': return '低';
            default: return priority;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PUBLISHED': return 'bg-green-100 text-green-700 border-green-200';
            case 'DRAFT': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'ARCHIVED': return 'bg-gray-100 text-gray-700 border-gray-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'PUBLISHED': return '已发布';
            case 'DRAFT': return '草稿';
            case 'ARCHIVED': return '已归档';
            default: return status;
        }
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (date >= today) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    };

    const TimelineCard: React.FC<{ testCase: TestCaseItem; isLast: boolean }> = ({ testCase, isLast }) => (
        <div className="flex gap-4 group">
            {/* 时间轴 */}
            <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-blue-500 ring-4 ring-blue-100 flex-shrink-0 mt-2"></div>
                {!isLast && <div className="w-0.5 bg-gray-200 flex-1 mt-2"></div>}
            </div>

            {/* 内容卡片 */}
            <div className="flex-1 pb-8">
                <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
                    {/* 时间戳 */}
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatTime(testCase.created_at)}</span>
                        <span className="text-gray-300">•</span>
                        <span>{new Date(testCase.created_at).toLocaleDateString('zh-CN')}</span>
                    </div>

                    {/* 标题和操作 */}
                    <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 text-base flex-1" title={testCase.name}>
                            {testCase.name}
                        </h3>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
                            <button
                                onClick={() => onEditCase(testCase.id)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="编辑"
                            >
                                <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => onDeleteCase(testCase.id, testCase.name)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="删除"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* 描述 */}
                    {testCase.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{testCase.description}</p>
                    )}

                    {/* 标签和信息 */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-medium border', getPriorityColor(testCase.priority))}>
                            {getPriorityText(testCase.priority)}
                        </span>
                        <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-medium border', getStatusColor(testCase.status))}>
                            {getStatusText(testCase.status)}
                        </span>
                        {/* 这里可以展示其他标签，如优先级、状态等 */}
                    </div>

                    {/* 详细信息 */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-1.5">
                            <Box className="w-3.5 h-3.5" />
                            <span>{testCase.system}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5" />
                            <span>{testCase.module}</span>
                        </div>
                        {testCase.users?.username && (
                            <div className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5" />
                                <span>{testCase.users.username}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-500 mt-4">加载测试用例中...</p>
            </div>
        );
    }

    const totalCases = Object.values(groupedByTime).reduce((sum, cases) => sum + cases.length, 0);

    if (totalCases === 0) {
        return (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
                <p className="text-gray-500">未找到符合条件的测试用例</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {timeGroups.map(({ key, label, cases }) => {
                if (cases.length === 0) return null;

                return (
                    <div key={key}>
                        <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-blue-500 rounded-full"></span>
                            {label}
                            <span className="text-sm font-normal text-gray-400 ml-1">
                                ({cases.length} 个用例)
                            </span>
                        </h2>
                        <div className="ml-4">
                            {cases.map((testCase, index) => (
                                <TimelineCard
                                    key={testCase.id}
                                    testCase={testCase}
                                    isLast={index === cases.length - 1}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
