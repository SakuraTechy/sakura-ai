import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Edit3 } from 'lucide-react';
import { Button } from '../ui/button';
import { clsx } from 'clsx';

interface StepCardProps {
  stepNumber: number;
  title: string | React.ReactNode;
  description?: string;
  children: React.ReactNode;
  isActive?: boolean;
  isCompleted?: boolean;
  completedSummary?: string;
  onEdit?: () => void;
  onCancel?: () => void;
  onNext?: () => void;
  nextButtonText?: string;
  nextButtonDisabled?: boolean;
  hideActions?: boolean;
}

export function StepCard({
  stepNumber,
  title,
  description,
  children,
  isActive = true,
  isCompleted = false,
  completedSummary,
  onEdit,
  onCancel,
  onNext,
  nextButtonText = '下一步',
  nextButtonDisabled = false,
  hideActions = false
}: StepCardProps) {
  // 已完成状态 - 折叠显示
  if (isCompleted) {
    return (
      <motion.div
        className="bg-gray-50 rounded-lg p-3 border border-gray-200 mb-3
                   hover:border-gray-300 transition-colors cursor-pointer"
        layout
        onClick={onEdit}
        whileHover={{ scale: 1.01 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                步骤 {stepNumber}: 已完成
              </h3>
              {completedSummary && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {completedSummary}
                </p>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
            icon={<Edit3 className="w-3.5 h-3.5" />}
          >
            {/* <Edit3 className="w-4 h-4 mr-2" /> */}
            重新编辑
          </Button>
        </div>
      </motion.div>
    );
  }

  // 激活状态 - 完整显示
  return (
    <motion.div
      className="bg-white rounded-xl shadow-lg p-5 mb-4 border-2 border-transparent
                 hover:shadow-xl transition-shadow"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {/* 头部 */}
      <div className="flex items-center gap-3 mb-4">
        {/* 步骤徽章 */}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500
                        flex items-center justify-center text-white font-bold text-base
                        shadow-md shadow-purple-500/25 flex-shrink-0">
          {stepNumber}
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-900 mb-0.5">
            {typeof title === 'string' ? title : <div className="flex items-center w-full">{title}</div>}
          </h2>
          {description && (
            <p className="text-xs text-gray-500">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="space-y-4">
        {children}
      </div>

      {/* 底部操作栏 */}
      {!hideActions && (
        <div className="flex justify-end gap-2.5 mt-5 pt-4 border-t border-gray-100">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              取消
            </Button>
          )}
          {onNext && (
            <Button variant="default" onClick={onNext} disabled={nextButtonDisabled}>
              {nextButtonText}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
