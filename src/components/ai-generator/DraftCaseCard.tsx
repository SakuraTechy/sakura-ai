import React from 'react';
import { motion } from 'framer-motion';
import { Check, Star, Tag, List } from 'lucide-react';
import { clsx } from 'clsx';

interface DraftCaseCardProps {
  id: string;
  name: string;
  description?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  qualityScore?: number;
  batchNumber: number;
  stepsCount?: number;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  // 新增字段
  sectionId?: string;
  sectionName?: string;
  testPointsCount?: number;
  testPurpose?: string;
  testCase?: any;  // 完整的测试用例数据
  onViewDetail?: (testCase: any) => void;  // 点击查看详情
  saved?: boolean;  // 🆕 是否已保存
}

const priorityMap = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低'
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3 }
  }
};

export function DraftCaseCard({
  id,
  name,
  description,
  priority,
  qualityScore = 85,
  batchNumber,
  stepsCount = 0,
  selected,
  onToggleSelect,
  sectionId,
  sectionName,
  testPointsCount,
  testPurpose,
  testCase,
  onViewDetail,
  saved = false
}: DraftCaseCardProps) {
  return (
    <motion.div
      variants={itemVariants}
      layout
      className={clsx(
        "relative bg-white rounded-lg p-3.5 border-2 transition-all duration-200",
        "cursor-pointer hover:shadow-md",
        saved
          ? "border-green-300 bg-green-50/30"  // 🆕 已保存的样式
          : selected
          ? "border-purple-500 shadow-md ring-2 ring-purple-500/20"
          : "border-gray-200 hover:border-purple-300"
      )}
      onClick={() => onViewDetail?.(testCase)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* 选中指示器 */}
      <div
        className="absolute top-2.5 right-2.5 z-10"
        onClick={(e) => {
          e.stopPropagation();
          if (!saved) {  // 🆕 已保存的用例禁用选择
            onToggleSelect(id);
          }
        }}
      >
        <motion.div
          className={clsx(
            "w-6 h-6 rounded-full flex items-center justify-center transition-all",
            saved
              ? "bg-green-500 cursor-not-allowed"  // 🆕 已保存状态
              : selected
              ? "bg-gradient-to-br from-purple-500 to-blue-500"
              : "bg-gray-200"
          )}
          whileTap={saved ? {} : { scale: 0.9 }}  // 🆕 已保存时不响应点击动画
        >
          {(selected || saved) && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Check className="w-3.5 h-3.5 text-white" />
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* 章节标记 */}
      {sectionId ? (
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span className="px-2 py-0.5 bg-purple-100 text-purple-700
                         text-[10px] font-medium rounded-full">
            章节 {sectionId}
          </span>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700
                         text-[10px] font-medium rounded-full">
            批次 {batchNumber}
          </span>
        </div>
      ) : (
        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-blue-100 text-blue-700
                       text-[10px] font-medium rounded-full">
          批次 {batchNumber}
        </span>
      )}

      {/* 用例内容 */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-gray-900 mb-1.5 line-clamp-2
                       min-h-[1rem]">
          {name}
        </h4>

        {/* 显示测试目的或描述 */}
        <p className="text-xs text-gray-500 mb-1.5 line-clamp-2">
          {testPurpose || description || '暂无描述'}
        </p>

        {/* 章节名称 */}
        {sectionName && (
          <p className="text-xs text-gray-600 mb-3">
            📄 {sectionName}
          </p>
        )}

        {/* 元数据 */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          {/* 优先级 */}
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-gray-600" />
            <span className={clsx(
              "text-[10px] font-medium",
              priority === 'critical' && "text-red-600",
              priority === 'high' && "text-orange-600",
              priority === 'medium' && "text-blue-600",
              priority === 'low' && "text-gray-600"
            )}>
              {priorityMap[priority]}
            </span>
          </div>

          {/* 测试点数量 */}
          {testPointsCount && testPointsCount > 0 ? (
            <div className="flex items-center gap-1 text-xs text-gray-700">
              <List className="w-3.5 h-3.5" />
              <span>{testPointsCount} 个测试点</span>
            </div>
          ) : stepsCount > 0 ? (
            <div className="flex items-center gap-1 text-xs text-gray-700">
              <List className="w-3.5 h-3.5" />
              <span>{stepsCount} 步</span>
            </div>
          ) : null}

          {/* 质量评分 */}
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-semibold text-gray-700">
              {qualityScore}/100
            </span>
          </div>
        </div>

        {/* 🆕 已保存标识 */}
        {saved && (
          <div className="mt-2.5 pt-2.5 border-t border-green-200">
            <div className="flex items-center justify-center gap-1.5 text-green-600">
              <Check className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">已保存到用例库</span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
