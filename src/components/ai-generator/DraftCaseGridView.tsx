import React from 'react';
import { motion } from 'framer-motion';
import { Check, Star, List, Eye, Target, Folder, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { getCaseTypeInfo } from '../../utils/caseTypeHelper';
import { countSteps } from '../../utils/stepsCounter';

interface DraftCaseGridViewProps {
  testCase: any;
  selected: boolean;
  onToggleSelect: (tc: any) => void;
  onViewDetail: (tc: any) => void;
  index: number;
}

const priorityConfig: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  critical: { label: '紧急', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' },
  high: { label: '高', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' },
  medium: { label: '中', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500' },
  low: { label: '低', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', dot: 'bg-gray-400' },
};

/**
 * 网格卡片视图 - 2列紧凑卡片，信息更丰富
 */
export function DraftCaseGridView({ testCase, selected, onToggleSelect, onViewDetail, index }: DraftCaseGridViewProps) {
  const tc = testCase;
  const saved = tc.saved && !tc.modified;
  const priority = priorityConfig[tc.priority] || priorityConfig.medium;
  const typeInfo = getCaseTypeInfo(tc.caseType);
  const stepsCount = countSteps(tc.steps);

  return (
    <motion.div
      className={clsx(
        "relative rounded-xl border-2 transition-all cursor-pointer group overflow-hidden",
        saved
          ? "border-green-300 bg-gradient-to-br from-green-50/50 to-white"
          : selected
            ? "border-purple-500 bg-gradient-to-br from-purple-50/50 to-white shadow-lg ring-2 ring-purple-500/20"
            : "border-gray-200 bg-white hover:border-purple-300 hover:shadow-md"
      )}
      onClick={() => onViewDetail(tc)}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      {/* 顶部色条 */}
      <div className={clsx(
        "h-1",
        saved ? "bg-green-400" :
        tc.priority === 'critical' ? "bg-red-500" :
        tc.priority === 'high' ? "bg-orange-500" :
        tc.priority === 'medium' ? "bg-blue-500" : "bg-gray-300"
      )} />

      <div className="p-4">
        {/* 头部：序号 + 标签 + 勾选 */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-mono">#{index + 1}</span>
            <span className={clsx(
              "px-1.5 py-0.5 rounded text-[10px] font-bold border",
              typeInfo.tailwindBg, typeInfo.tailwindText, typeInfo.tailwindBorder
            )}>
              {typeInfo.emoji}{typeInfo.label}
            </span>
            <span className={clsx(
              "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
              priority.bg, priority.color, priority.border
            )}>
              {priority.label}
            </span>
            {saved && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">
                ✓ 已保存
              </span>
            )}
            {tc.saved && tc.modified && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-700 border border-yellow-200">
                已修改
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* 查看按钮 */}
            <button
              onClick={(e) => { e.stopPropagation(); onViewDetail(tc); }}
              className="p-1 rounded text-gray-300 hover:text-purple-600 hover:bg-purple-50 transition-all opacity-0 group-hover:opacity-100"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            {/* 勾选 */}
            <div
              onClick={(e) => { e.stopPropagation(); if (!saved) onToggleSelect(tc); }}
              className={clsx(
                "w-5 h-5 rounded-md flex items-center justify-center transition-all flex-shrink-0",
                saved ? "bg-green-500" : selected ? "bg-purple-500" : "border-2 border-gray-300 group-hover:border-purple-400"
              )}
            >
              {(selected || saved) && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
        </div>

        {/* 用例名称 */}
        <h4 className="text-sm font-bold text-gray-900 mb-1.5 line-clamp-2 leading-snug min-h-[1rem]">
          {tc.name || '未命名用例'}
        </h4>

        {/* 描述 */}
        <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">
          {tc.testPurpose || tc.description || '暂无描述'}
        </p>

        {/* 底部信息 */}
        <div className="flex items-center justify-between pt-2.5 border-t border-gray-100">
          <div className="flex items-center gap-10 text-xs text-gray-500">
            {tc.scenarioName && (
              <span className="flex items-center gap-1 truncate min-w-[100px]" title={tc.scenarioName}>
                <Target className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span className="truncate">{tc.scenarioName}</span>
              </span>
            )}
            {tc.testPointName && (
              <span className="flex items-center gap-1 truncate min-w-[100px]" title={tc.testPointName}>
                <CheckCircle2 className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span className="truncate">{tc.testPointName}</span>
              </span>
            )}
            {stepsCount > 0 && (
              <span className="flex items-center gap-1">
                <List className="w-3 h-3 text-gray-400" />
                {stepsCount}步
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-bold text-gray-600">{tc.qualityScore || 85}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
