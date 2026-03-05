import React, { useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { FilterState } from '../types';
import { SystemOption } from '../../../types/test';

// 🆕 筛选选项类型
interface FilterOptions {
    systems: string[];
    modules: string[];
    scenarios: string[];
    creators: { id: number; username: string }[];
    projectVersions?: string[];  // 🆕 项目版本列表
}

interface FilterBarProps {
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
    onSearch: () => void;
    onReset: () => void;
    systemOptions: SystemOption[];
    filterOptions?: FilterOptions;  // 🆕 动态筛选选项
}

export const FilterBar: React.FC<FilterBarProps> = ({
    filters,
    setFilters,
    onSearch,
    onReset,
    systemOptions,
    filterOptions
}) => {
    const [showAdvanced, setShowAdvanced] = useState(false);

    // 🔍 调试：监听 filterOptions 变化
    React.useEffect(() => {
        console.log('🔍 [FilterBar] filterOptions 变化:', filterOptions);
        console.log('🔍 [FilterBar] projectVersions:', filterOptions?.projectVersions);
    }, [filterOptions]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSearch();
        }
    };

    const handleChange = (key: keyof FilterState, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
            <div className="flex items-center gap-3">
                {/* Main Search */}
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="搜索测试场景、测试点、用例名称、创建人..."
                        value={filters.search}
                        onChange={e => handleChange('search', e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg 
                     focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                     transition-all duration-200"
                    />
                </div>

                {/* Quick Filters */}
                <select
                    value={filters.system}
                    onChange={e => handleChange('system', e.target.value)}
                    className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                   focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                    <option value="">所有项目</option>
                    {/* 🆕 优先使用动态选项，否则使用 systemOptions */}
                    {(filterOptions?.systems || systemOptions.map(s => s.name)).map(sys => (
                        <option key={sys} value={sys}>{sys}</option>
                    ))}
                </select>

                {/* 🆕 版本筛选 - 依赖于系统选择 */}
                <select
                    value={filters.projectVersion}
                    onChange={e => {
                        console.log('🔍 [FilterBar] 版本选择变化:', e.target.value);
                        handleChange('projectVersion', e.target.value);
                    }}
                    disabled={!filters.system}  // 未选择系统时禁用
                    className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                   focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    onFocus={() => {
                        console.log('🔍 [FilterBar] 版本下拉框获得焦点');
                        console.log('🔍 [FilterBar] filterOptions:', filterOptions);
                        console.log('🔍 [FilterBar] projectVersions:', filterOptions?.projectVersions);
                        console.log('🔍 [FilterBar] projectVersions length:', filterOptions?.projectVersions?.length);
                    }}
                >
                    <option value="">{!filters.system ? '请先选择项目' : '所有版本'}</option>
                    {(() => {
                        console.log('🔍 [FilterBar] 渲染版本选项，projectVersions:', filterOptions?.projectVersions);
                        if (filterOptions?.projectVersions && filterOptions.projectVersions.length > 0) {
                            console.log('🔍 [FilterBar] 渲染版本列表:', filterOptions.projectVersions);
                            return filterOptions.projectVersions.map(version => (
                                <option key={version} value={version}>{version}</option>
                            ));
                        } else if (filters.system) {
                            console.log('🔍 [FilterBar] 显示暂无版本数据');
                            return <option disabled>暂无版本数据</option>;
                        }
                        return null;
                    })()}
                </select>

                <select
                                    value={filters.module}
                                    onChange={e => handleChange('module', e.target.value)}
                                    className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                   focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                >
                                    <option value="">所有模块</option>
                                    {filterOptions?.modules?.map(mod => (
                                        <option key={mod} value={mod}>{mod}</option>
                                    ))}
                                </select>
                {/* <select
                    value={filters.status}
                    onChange={e => handleChange('status', e.target.value)}
                    className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                   focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                    <option value="">所有状态</option>
                    <option value="PUBLISHED">已发布</option>
                    <option value="DRAFT">草稿</option>
                    <option value="ARCHIVED">已归档</option>
                </select> */}

                {/* 🆕 用例类型筛选 */}
                <select
                    value={filters.caseType}
                    onChange={e => handleChange('caseType', e.target.value)}
                    className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                   focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                    <option value="">所有类型</option>
                    <option value="SMOKE">🔥 冒烟</option>
                    <option value="FULL">📋 全量</option>
                    <option value="ABNORMAL">🚨 异常</option>
                    <option value="BOUNDARY">🔍 边界</option>
                    <option value="PERFORMANCE">⚡ 性能</option>
                    <option value="SECURITY">🔒 安全</option>
                    <option value="USABILITY">👍 可用性</option>
                    <option value="COMPATIBILITY">🔄 兼容性</option>
                    <option value="RELIABILITY">💪 可靠性</option>
                </select>

                {/* 🆕 执行结果筛选 */}
                <select
                    value={filters.executionStatus}
                    onChange={e => handleChange('executionStatus', e.target.value)}
                    className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                   focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                    <option value="">所有结果</option>
                    <option value="pending">⏳ 未执行</option>
                    <option value="pass">✅ 通过</option>
                    <option value="fail">❌ 失败</option>
                    <option value="block">🚫 阻塞</option>
                    <option value="skip">⏭️ 跳过</option>
                </select>
                
                {/* Actions */}
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className={clsx(
                        'inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        showAdvanced
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    )}
                >
                    <Filter className="w-4 h-4 mr-2" />
                    筛选
                </button>

                <button
                    onClick={onReset}
                    className="inline-flex items-center px-4 py-2.5 text-gray-600 hover:text-gray-900
                   border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                    <X className="w-4 h-4 mr-2" />
                    重置
                </button>
            </div>

            {/* Advanced Filters */}
            <AnimatePresence>
                {showAdvanced && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="pt-2 mt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            <div className="space-y-1">
                                {/* <label className="text-xs font-medium text-gray-500">模块</label>
                                <select
                                    value={filters.module}
                                    onChange={e => handleChange('module', e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                           focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                >
                                    <option value="">所有模块</option>
                                    {filterOptions?.modules?.map(mod => (
                                        <option key={mod} value={mod}>{mod}</option>
                                    ))}
                                </select> */}
                                <label className="text-xs font-medium text-gray-500">所属场景</label>
                                <select
                    value={filters.sectionName}
                    onChange={e => handleChange('sectionName', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                           focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                    <option value="">所有场景</option>
                    {filterOptions?.scenarios?.map(scenario => (
                        <option key={scenario} value={scenario}>{scenario}</option>
                    ))}
                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500">优先级</label>
                                <select
                                    value={filters.priority}
                                    onChange={e => handleChange('priority', e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                           focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                >
                                    <option value="">所有优先级</option>
                                    <option value="critical">紧急</option>
                                    <option value="high">高</option>
                                    <option value="medium">中</option>
                                    <option value="low">低</option>
                                </select>
                            </div>

                            {/* <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500">风险等级</label>
                                <select
                                    value={filters.riskLevel}
                                    onChange={e => handleChange('riskLevel', e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                           focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                >
                                    <option value="">所有风险</option>
                                    <option value="high">高</option>
                                    <option value="medium">中</option>
                                    <option value="low">低</option>
                                </select>
                            </div> */}

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500">创建人</label>
                                <select
                                    value={filters.createdBy}
                                    onChange={e => handleChange('createdBy', e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                           focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                >
                                    <option value="">所有创建人</option>
                                    {filterOptions?.creators?.map(creator => (
                                        <option key={creator.id} value={creator.username}>{creator.username}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500">来源</label>
                                <select
                                    value={filters.source}
                                    onChange={e => handleChange('source', e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                           focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                >
                                    <option value="">所有来源</option>
                                    <option value="AI_GENERATED">AI 生成</option>
                                    <option value="MANUAL">手动创建</option>
                                </select>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
