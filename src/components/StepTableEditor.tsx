import React, { useState, useCallback } from 'react';
import { Plus, Trash2, GripVertical, Copy, ArrowUp, ArrowDown } from 'lucide-react';
import { TestStepRow } from '../types/test';
import { Button } from './ui/button';

interface StepTableEditorProps {
  steps: TestStepRow[];
  onChange: (steps: TestStepRow[]) => void;
  readOnly?: boolean;
}

export function StepTableEditor({ steps, onChange, readOnly = false }: StepTableEditorProps) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: 'action' | 'expected' | 'note' } | null>(null);

  // 确保 steps 始终是数组
  const safeSteps = steps || [];

  // 添加新步骤（在末尾）
  const handleAddStep = useCallback(() => {
    const newStep: TestStepRow = {
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order: safeSteps.length + 1,
      action: '',
      expected: '',
      type: 'action'
    };
    // 直接添加新步骤，无论当前是否有步骤
    const updated = [...safeSteps, newStep];
    onChange(updated);
  }, [safeSteps, onChange]);

  // 在上方插入步骤
  const handleInsertAbove = useCallback((stepId: string) => {
    const index = safeSteps.findIndex(s => s.id === stepId);
    if (index === -1) return;
    
    const newStep: TestStepRow = {
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order: index + 1,
      action: '',
      expected: '',
      type: 'action'
    };
    
    const updated = [...safeSteps];
    updated.splice(index, 0, newStep);
    // 重新排序
    const reordered = updated.map((step, idx) => ({ ...step, order: idx + 1 }));
    onChange(reordered);
  }, [safeSteps, onChange]);

  // 在下方插入步骤
  const handleInsertBelow = useCallback((stepId: string) => {
    const index = safeSteps.findIndex(s => s.id === stepId);
    if (index === -1) return;
    
    const newStep: TestStepRow = {
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order: index + 2,
      action: '',
      expected: '',
      type: 'action'
    };
    
    const updated = [...safeSteps];
    updated.splice(index + 1, 0, newStep);
    // 重新排序
    const reordered = updated.map((step, idx) => ({ ...step, order: idx + 1 }));
    onChange(reordered);
  }, [safeSteps, onChange]);

  // 复制步骤
  const handleCopyStep = useCallback((stepId: string) => {
    const step = safeSteps.find(s => s.id === stepId);
    if (!step) return;
    
    const newStep: TestStepRow = {
      ...step,
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order: step.order + 1
    };
    
    const index = safeSteps.findIndex(s => s.id === stepId);
    const updated = [...safeSteps];
    updated.splice(index + 1, 0, newStep);
    // 重新排序
    const reordered = updated.map((step, idx) => ({ ...step, order: idx + 1 }));
    onChange(reordered);
  }, [safeSteps, onChange]);

  // 删除步骤
  const handleDeleteStep = useCallback((stepId: string) => {
    const filtered = safeSteps.filter(s => s.id !== stepId);
    // 重新排序
    const reordered = filtered.map((step, index) => ({ ...step, order: index + 1 }));
    onChange(reordered);
  }, [safeSteps, onChange]);

  // 更新步骤字段
  const handleUpdateField = useCallback((stepId: string, field: keyof TestStepRow, value: any) => {
    const updated = safeSteps.map(step =>
      step.id === stepId ? { ...step, [field]: value } : step
    );
    onChange(updated);
  }, [safeSteps, onChange]);

  // 开始编辑单元格
  const startEditing = (rowId: string, field: 'action' | 'expected' | 'note') => {
    if (!readOnly) {
      setEditingCell({ rowId, field });
    }
  };

  // 结束编辑
  const stopEditing = () => {
    setEditingCell(null);
  };

  return (
    <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* 表头 */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
        <div className="grid grid-cols-[50px_1fr_1fr_160px] gap-4 px-4 py-3 text-sm font-semibold text-gray-700">
          <div className="text-center">#</div>
          <div>操作步骤</div>
          <div>预期结果</div>
          <div className="text-center">操作</div>
        </div>
      </div>

      {/* 表格主体 */}
      <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
        {safeSteps.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-gray-400 mb-2">
              <Plus className="w-8 h-8 mx-auto opacity-50" />
            </div>
            <p className="text-sm text-gray-500 mb-4">暂无步骤</p>
            {!readOnly && (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleAddStep}
                icon={<Plus className="w-4 h-4" />}
                iconPosition="left"
              >
                <span className="leading-none">添加第一个步骤</span>
              </Button>
            )}
          </div>
        ) : (
          safeSteps.map((step, index) => (
            <div
              key={step.id}
              className="grid grid-cols-[50px_1fr_1fr_160px] gap-4 px-4 py-3 hover:bg-blue-50/50 transition-colors items-start group"
            >
              {/* 序号 */}
              <div className="flex items-center justify-center pt-2">
                <span className="text-sm font-semibold text-gray-600 bg-gray-100 rounded-full w-7 h-7 flex items-center justify-center">
                  {step.order}
                </span>
              </div>

              {/* 操作步骤 */}
              <div className="">
                {editingCell?.rowId === step.id && editingCell?.field === 'action' ? (
                  <textarea
                    autoFocus
                    value={step.action || ''}
                    onChange={(e) => handleUpdateField(step.id, 'action', e.target.value)}
                    onBlur={stopEditing}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        stopEditing();
                      }
                    }}
                    onFocus={(e) => {
                      // 将光标置于最后
                      const length = e.target.value.length;
                      e.target.setSelectionRange(length, length);
                    }}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-0 focus:ring-blue-400 focus:border-blue-400 resize-none text-sm outline-none"
                    rows={3}
                    placeholder="描述操作步骤，例如：1. 打开登录页面 2. 输入用户名和密码..."
                  />
                ) : (
                  <div
                    onClick={() => startEditing(step.id, 'action')}
                    className={`px-3 py-2 rounded-lg cursor-text min-h-[30px] text-sm leading-relaxed whitespace-pre-wrap ${
                      step.action ? 'text-gray-900 bg-white border border-gray-200' : 'text-gray-400 bg-gray-50 border border-dashed border-gray-300'
                    } ${!readOnly && 'hover:border-blue-300 hover:bg-blue-50/30 transition-all'}`}
                  >
                    {step.action || '点击输入操作步骤...'}
                  </div>
                )}
              </div>

              {/* 预期结果 */}
              <div className="">
                {editingCell?.rowId === step.id && editingCell?.field === 'expected' ? (
                  <textarea
                    autoFocus
                    value={step.expected || ''}
                    onChange={(e) => handleUpdateField(step.id, 'expected', e.target.value)}
                    onBlur={stopEditing}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        stopEditing();
                      }
                    }}
                    onFocus={(e) => {
                      // 将光标置于最后
                      const length = e.target.value.length;
                      e.target.setSelectionRange(length, length);
                    }}
                    className="w-full px-3 py-2 border border-green-300 rounded-lg focus:ring-0 focus:ring-green-400 focus:border-green-400 resize-none text-sm outline-none"
                    rows={3}
                    placeholder="描述预期结果，例如：页面跳转到首页，显示欢迎信息..."
                  />
                ) : (
                  <div
                    onClick={() => startEditing(step.id, 'expected')}
                    className={`px-3 py-2 rounded-lg cursor-text min-h-[30px] text-sm leading-relaxed whitespace-pre-wrap ${
                      step.expected ? 'text-gray-900 bg-white border border-gray-200' : 'text-gray-400 bg-gray-50 border border-dashed border-gray-300'
                    } ${!readOnly && 'hover:border-green-300 hover:bg-green-50/30 transition-all'}`}
                  >
                    {step.expected || '点击输入预期结果...'}
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center justify-center gap-0.5 pt-2 flex-wrap">
                {!readOnly && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleInsertAbove(step.id)}
                      className="text-blue-500 hover:bg-blue-50 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="在上方插入"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleInsertBelow(step.id)}
                      className="text-blue-500 hover:bg-blue-50 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="在下方插入"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleCopyStep(step.id)}
                      className="text-purple-500 hover:bg-purple-50 hover:text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="复制步骤"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDeleteStep(step.id)}
                      className="text-red-500 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="删除步骤"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部添加按钮和统计 */}
      {!readOnly && (
        <div className="border-t border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-gray-700">
            共 <span className="font-bold text-blue-600">{steps.length}</span> 个步骤
          </div>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleAddStep}
            // className="inline-flex items-center justify-center gap-2 h-9 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            icon={<Plus className="w-4 h-4" />}
            iconPosition="left"
          >
            <span className="leading-none">添加步骤</span>
          </Button>
        </div>
      )}
    </div>
  );
}
