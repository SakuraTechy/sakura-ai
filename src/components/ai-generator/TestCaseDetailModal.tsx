import { useState, useEffect } from 'react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, FileText, Target, CheckCircle2, AlertCircle, Edit2, Save, X, Copy, Check } from 'lucide-react';
import { Input, Modal as AntModal, Spin } from 'antd';
import { requirementDocService, RequirementDoc } from '../../services/requirementDocService';
import { marked } from 'marked';
import { showToast } from '../../utils/toast';
import { TestStepsEditor, parseStepsFromString, formatStepsToString, TestStep } from '../test-case/TestStepsEditor';
import { getCaseTypeInfo, type CaseType } from '../../utils/caseTypeHelper';

const { TextArea } = Input;

// 定义测试用例类型
interface TestCase {
  id?: string | number;
  name?: string;
  priority?: 'high' | 'medium' | 'low';
  caseType?: CaseType;   // 🆕 用例类型
  testScenario?: string;
  sectionId?: string;
  sectionName?: string;
  requirementSource?: string;    // 🆕 需求来源
  system?: string;
  module?: string;
  coverageAreas?: string;
  preconditions?: string;
  testData?: string;
  steps?: string;
  assertions?: string;
  testPoints?: Array<{
    testPoint?: string;          // 统一字段名称
    testPointName?: string;      // 兼容旧字段
    steps?: string;
    expectedResult?: string;
    riskLevel?: 'high' | 'medium' | 'low';
    description?: string;
    testPurpose?: string;        // 测试目的
    testScenario?: string;       // 测试场景
    coverageAreas?: string;       // 覆盖范围
  }>;
  [key: string]: unknown;
}

interface TestCaseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  testCase: TestCase | null;
  onSave?: (updatedTestCase: TestCase) => void;
  allCases?: TestCase[]; // 全部用例列表
  currentIndex?: number; // 当前用例索引
  onSwitchCase?: (direction: 'prev' | 'next') => void; // 切换用例
}

export function TestCaseDetailModal({
  isOpen,
  onClose,
  testCase,
  onSave,
  allCases = [],
  currentIndex = 0,
  onSwitchCase
}: TestCaseDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCase, setEditedCase] = useState<TestCase | null>(null);
  
  // 🆕 需求文档详情弹窗状态
  const [requirementModalOpen, setRequirementModalOpen] = useState(false);
  const [currentRequirementDoc, setCurrentRequirementDoc] = useState<RequirementDoc | null>(null);
  const [requirementLoading, setRequirementLoading] = useState(false);
  
  // 🆕 从需求文档获取模块信息
  const [docModule, setDocModule] = useState<string | undefined>(undefined);
  
  // 🆕 复制状态
  const [copied, setCopied] = useState(false);

  // 🆕 测试步骤状态（解析后的结构化数据）
  const [testSteps, setTestSteps] = useState<TestStep[]>([]);
  
  // 🆕 组件数据准备状态（用于防止快速切换时显示空白内容）
  const [isDataReady, setIsDataReady] = useState(false);

  // 当testCase变化时，重置编辑状态和所有相关状态
  useEffect(() => {
    if (testCase) {
      // 🔥 先标记数据未准备好，避免显示旧数据
      setIsDataReady(false);
      
      // 🔥 完全重置所有状态，避免缓存上一条用例的数据
      setEditedCase({ ...testCase });
      setIsEditing(false);
      setCopied(false);
      
      // 解析测试步骤
      const stepsStr = testCase.steps || '';
      const parsedSteps = parseStepsFromString(stepsStr);
      setTestSteps(parsedSteps);
      
      // 清空需求文档相关状态
      setCurrentRequirementDoc(null);
      setDocModule(undefined);
      
      // 🔥 短暂延迟后标记数据准备完成（确保状态更新已完成）
      setTimeout(() => {
        setIsDataReady(true);
      }, 50);
    } else {
      // 🔥 如果 testCase 为 null，清空所有状态
      setIsDataReady(false);
      setEditedCase(null);
      setIsEditing(false);
      setCopied(false);
      setTestSteps([]);
      setCurrentRequirementDoc(null);
      setDocModule(undefined);
    }
  }, [testCase]);
  
  // 🆕 从需求文档获取模块信息（带取消令牌，避免竞态条件）
  useEffect(() => {
    // 🔥 使用 AbortController 来取消之前的请求
    let isCancelled = false;
    
    const fetchDocModule = async () => {
      const caseWithDocId = testCase as TestCase & { requirement_doc_id?: number; requirementDocId?: number };
      const requirementDocId = caseWithDocId.requirement_doc_id || caseWithDocId.requirementDocId;
      
      if (requirementDocId) {
        try {
          const doc = await requirementDocService.getById(requirementDocId);
          // 🔥 只有在请求未被取消时才更新状态
          if (!isCancelled) {
            setDocModule(doc.module);
          }
        } catch (error) {
          if (!isCancelled) {
            console.error('获取需求文档模块信息失败:', error);
            setDocModule(undefined);
          }
        }
      } else {
        if (!isCancelled) {
          setDocModule(undefined);
        }
      }
    };
    
    if (testCase) {
      fetchDocModule();
    } else {
      setDocModule(undefined);
    }
    
    // 🔥 清理函数：组件卸载或 testCase 变化时取消请求
    return () => {
      isCancelled = true;
    };
  }, [testCase]);

  if (!testCase) return null;

  const hasMultipleCases = allCases && allCases.length > 1;
  
  // 🆕 字段名标准化：将下划线命名转换为驼峰命名
  type TestCaseWithDbFields = TestCase & {
    section_id?: string;
    section_name?: string;
    requirement_source?: string;
    requirement_doc_id?: number;
    requirementDocId?: number;
    test_scenario?: string;
  };
  
  const testCaseWithDb = testCase as TestCaseWithDbFields;
  
  // 统一获取需求文档ID（优先使用requirementDocId，兼容requirement_doc_id）
  const docId = testCaseWithDb.requirementDocId || testCaseWithDb.requirement_doc_id;
  
  const normalizedTestCase: TestCase & TestCaseWithDbFields = {
    ...testCase,
    sectionId: testCase.sectionId || testCaseWithDb.section_id,
    sectionName: testCase.sectionName || testCaseWithDb.section_name,
    requirementSource: testCase.requirementSource || testCaseWithDb.requirement_source,
    testScenario: testCase.testScenario || testCaseWithDb.test_scenario,
    requirementDocId: docId,  // 🆕 统一使用驼峰命名
    requirement_doc_id: docId,  // 🆕 保留下划线命名以兼容
    module: docModule || testCase.module,  // 🆕 优先使用需求文档的模块信息
  };
  
  const currentCase = isEditing ? editedCase : normalizedTestCase;

  if (!currentCase) return null;

  // 判断是否显示测试用例的步骤（如果测试用例有独立的步骤，优先显示；否则显示测试点的步骤）
  const hasTestCaseSteps = currentCase.steps && typeof currentCase.steps === 'string' && currentCase.steps.trim().length > 0;
  // const hasTestCaseAssertions = currentCase.assertions && typeof currentCase.assertions === 'string' && currentCase.assertions.trim().length > 0;

  // 如果测试用例没有步骤，则从测试点获取
  const displaySteps = hasTestCaseSteps ? (currentCase.steps as string) : (currentCase.testPoints?.[0]?.steps || '');
  // const displayAssertions = hasTestCaseAssertions ? (currentCase.assertions as string) : (currentCase.testPoints?.[0]?.expectedResult || '');

  // 处理测试步骤中的测试数据填充
  const renderStepsWithTestData = (steps: string | string[] | unknown, testData?: string): string => {
    if (!steps) return '';

    // 确保 steps 是字符串
    let stepsStr: string;
    if (Array.isArray(steps)) {
      stepsStr = steps.join('\n');
    } else if (typeof steps !== 'string') {
      stepsStr = String(steps);
    } else {
      stepsStr = steps;
    }

    if (!testData) return stepsStr;

    // 简单的占位符替换：将 {testData} 或类似的占位符替换为实际测试数据
    let result = stepsStr;
    // 替换常见的占位符格式
    result = result.replace(/\{testData\}/g, testData);
    result = result.replace(/\{测试数据\}/g, testData);
    result = result.replace(/\$\{testData\}/g, testData);

    return result;
  };

  const filledSteps = renderStepsWithTestData(displaySteps || '', currentCase.testData);

  const handleSave = () => {
    if (onSave && editedCase) {
      console.log('🔄 [TestCaseDetailModal] 保存编辑后的测试用例:', {
        id: editedCase.id,
        name: editedCase.name,
        steps: editedCase.steps?.substring(0, 100),
        assertions: editedCase.assertions?.substring(0, 100)
      });
      onSave(editedCase);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditedCase({ ...testCase });
    setIsEditing(false);
  };

  const updateField = (field: string, value: string | number | undefined) => {
    console.log(`🔄 [TestCaseDetailModal] 更新字段 ${field}:`, value);
    setEditedCase((prev: TestCase | null) => {
      if (!prev) {
        // 如果 prev 为 null，从 testCase 初始化
        if (testCase) {
          const newCase = {
            ...testCase,
            [field]: value
          };
          console.log(`🔄 [TestCaseDetailModal] 初始化editedCase:`, newCase);
          return newCase;
        }
        return null;
      }
      const newCase = {
        ...prev,
        [field]: value
      };
      console.log(`🔄 [TestCaseDetailModal] 更新editedCase:`, newCase);
      return newCase;
    });
  };

  // 🆕 处理测试步骤变化
  const handleStepsChange = (steps: TestStep[]) => {
    console.log('🔄 [TestCaseDetailModal] 测试步骤变化:', steps);
    setTestSteps(steps);
    // 将步骤数组转换回字符串格式保存
    const stepsStr = formatStepsToString(steps);
    console.log('🔄 [TestCaseDetailModal] 转换后的steps字符串:', stepsStr);
    updateField('steps', stepsStr);
    
    // 同时更新 assertions 字段（汇总所有预期结果）
    const assertionsStr = steps
      .map((step, index) => step.expected ? `${index + 1}. ${step.expected}` : '')
      .filter(Boolean)
      .join('\n');
    console.log('🔄 [TestCaseDetailModal] 转换后的assertions字符串:', assertionsStr);
    updateField('assertions', assertionsStr);
  };

  // 🆕 处理查看需求文档详情
  const handleViewRequirement = async () => {
    const caseWithDocId = currentCase as TestCase & { requirement_doc_id?: number; requirementDocId?: number };
    const requirementDocId = caseWithDocId.requirement_doc_id || caseWithDocId.requirementDocId;
    
    if (!requirementDocId) {
      showToast.warning('未找到关联的需求文档');
      return;
    }

    setRequirementModalOpen(true);
    setRequirementLoading(true);
    setCopied(false); // 重置复制状态
    
    try {
      const doc = await requirementDocService.getById(requirementDocId);
      setCurrentRequirementDoc(doc);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      showToast.error('加载需求文档失败: ' + errorMessage);
      setRequirementModalOpen(false);
    } finally {
      setRequirementLoading(false);
    }
  };
  
  // 🆕 复制需求文档内容
  const handleCopyRequirementDoc = async () => {
    if (!currentRequirementDoc?.content) {
      showToast.warning('没有可复制的内容');
      return;
    }
    
    try {
      // 方法1：使用现代 Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(currentRequirementDoc.content);
        setCopied(true);
        showToast.success('已复制到剪贴板');
        setTimeout(() => setCopied(false), 2000);
      } else {
        // 方法2：降级使用传统方法
        const textarea = document.createElement('textarea');
        textarea.value = currentRequirementDoc.content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (successful) {
          setCopied(true);
          showToast.success('已复制到剪贴板');
          setTimeout(() => setCopied(false), 2000);
        } else {
          showToast.error('复制失败，请手动选择并复制');
        }
      }
    } catch (error) {
      console.error('复制失败:', error);
      showToast.error('复制失败，请手动选择并复制');
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 当需求文档弹窗打开时，隐藏外层Modal
  const shouldShowCaseModal = isOpen && !requirementModalOpen;
  
  return (
    <>
    <Modal
      isOpen={shouldShowCaseModal}
      onClose={onClose}
      showCloseButton={true}
      title={
        <div className="flex items-center gap-3 w-full">
          <FileText className="w-5 h-5 text-purple-600 flex-shrink-0" />
          <span className="font-semibold">测试用例详情</span>
          {hasMultipleCases && (
            <>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                {currentIndex + 1} / {allCases.length}
              </span>
              <div className="flex items-center gap-0.5 ml-2">
                <button
                  onClick={() => onSwitchCase?.('prev')}
                  className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-gray-900 rounded-md transition-colors"
                  title="上一个"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onSwitchCase?.('next')}
                  className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-gray-900 rounded-md transition-colors"
                  title="下一个"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      }
      size="wide"
      closeOnClickOutside={false}
      footer={
        <div className="flex items-center justify-between w-full">
          {hasMultipleCases && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="default"
                onClick={() => onSwitchCase?.('prev')}
                className="h-9 px-4 border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 transition-all"
                icon={<ChevronLeft className="w-4 h-4" />}
              >
                上一个
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() => onSwitchCase?.('next')}
                className="h-9 px-4 border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 transition-all"
                icon={<ChevronRight className="w-4 h-4" />}
                iconPosition="right"
              >
                下一个
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  size="default"
                  className="h-9 px-4 border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 transition-all"
                  icon={<X className="w-4 h-4" />}
                >
                  取消
                </Button>
                <Button
                  variant="default"
                  onClick={handleSave}
                  size="default"
                  className="h-9 px-4 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white border-0 shadow-sm hover:shadow-md active:shadow transition-all"
                  icon={<Save className="w-4 h-4 mr-1.5" />}
                >
                  保存
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (testCase) {
                      setEditedCase({ ...testCase });
                      setIsEditing(true);
                    }
                  }}
                  size="default"
                  className="h-9 px-4 border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 transition-all"
                  icon={<Edit2 className="w-4 h-4 mr-1.5" />}
                >
                  编辑
                </Button>
                <Button
                  variant="default"
                  onClick={onClose}
                  size="default"
                  className="h-9 px-4 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white border-0 shadow-sm hover:shadow-md active:shadow transition-all"
                  icon={<X className="w-4 h-4" />}
                >
                  关闭
                </Button>
              </>
            )}
          </div>
        </div>
      }
      contentPadding="md"
    >
      {/* 🔥 数据加载中显示 loading 状态 */}
      {!isDataReady ? (
        <div className="flex items-center justify-center py-20">
          <Spin size="large" tip="加载用例数据中..." />
        </div>
      ) : (
        <div className="space-y-5 pb-6">
        {/* 顶部：用例名称和关键信息 */}
        <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-purple-50 rounded-xl p-6 border-2 border-purple-200">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              {isEditing ? (
                <Input
                  value={editedCase?.name || ''}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="text-xl font-bold mb-3"
                  placeholder="测试用例名称"
                />
              ) : (
                <h2 className="text-xl font-bold text-gray-900 mb-3">{currentCase.name}</h2>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {isEditing ? (
                  <select
                    value={editedCase?.priority || testCase?.priority || 'medium'}
                    onChange={(e) => {
                      const value = e.target.value as 'high' | 'medium' | 'low';
                      updateField('priority', value);
                    }}
                    className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                    title="选择优先级"
                    aria-label="选择优先级"
                  >
                    <option value="high">高优先级</option>
                    <option value="medium">中优先级</option>
                    <option value="low">低优先级</option>
                  </select>
                ) : (
                  currentCase.priority && (
                    <span className={clsx(
                      "px-3 py-1 rounded-full text-xs font-semibold",
                      currentCase.priority === 'high' && "bg-red-100 text-red-700 border border-red-300",
                      currentCase.priority === 'medium' && "bg-yellow-100 text-yellow-700 border border-yellow-300",
                      currentCase.priority === 'low' && "bg-green-100 text-green-700 border border-green-300"
                    )}>
                      {currentCase.priority === 'high' ? '高优先级' : currentCase.priority === 'medium' ? '中优先级' : '低优先级'}
                    </span>
                  )
                )}
                {/* 🆕 用例类型 */}
                {isEditing ? (
                  <select
                    value={editedCase?.caseType || testCase?.caseType || 'FULL'}
                    onChange={(e) => {
                      const value = e.target.value as 'SMOKE' | 'FULL';
                      updateField('caseType', value);
                    }}
                    className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                    title="选择用例类型"
                    aria-label="选择用例类型"
                  >
                    <option value="SMOKE">🔥 冒烟用例</option>
                    <option value="FULL">📋 全量用例</option>
                    <option value="ABNORMAL">🚨 异常用例</option>
                    <option value="BOUNDARY">🔍 边界用例</option>
                    <option value="PERFORMANCE">⚡ 性能用例</option>
                    <option value="SECURITY">🔒 安全用例</option>
                    <option value="USABILITY">👍 可用性用例</option>
                    <option value="COMPATIBILITY">🔄 兼容性用例</option>
                    <option value="RELIABILITY">🔄 可靠性用例</option>
                  </select>
                ) : (
                  currentCase.caseType && (() => {
                    const typeInfo = getCaseTypeInfo(currentCase.caseType);
                    return (
                      <span className={clsx(
                        "px-3 py-1 rounded-full text-xs font-semibold border",
                        typeInfo.tailwindBg,
                        typeInfo.tailwindText,
                        typeInfo.tailwindBorder
                      )}>
                        {typeInfo.emoji} {typeInfo.label}用例
                      </span>
                    );
                  })()
                )}
              </div>
            </div>
          </div>

          {/* 系统信息、关联需求、关联场景和关联测试点 - 同一行显示 */}
          <div className="flex flex-wrap items-start gap-3 pt-4 border-t border-purple-200">
            {/* 所属项目 */}
            <div className="flex-shrink-0 min-w-[140px]">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">所属项目</div>
              {/* {isEditing ? (
                <Input
                  value={editedCase?.system || ''}
                  onChange={(e) => updateField('system', e.target.value)}
                  placeholder="项目名称"
                />
              ) : (
                <div className="text-sm font-medium text-gray-900">{currentCase.system || '未指定'}</div>
              )} */}
              <div className="text-sm font-medium text-gray-900">{currentCase.system || '未指定'}</div>
            </div>
            
            {/* 所属模块 */}
            <div className="flex-shrink-0 min-w-[100px]">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">所属模块</div>
              {/* {isEditing ? (
                <Input
                  value={editedCase?.module || ''}
                  onChange={(e) => updateField('module', e.target.value)}
                  placeholder="模块名称"
                />
              ) : (
                <div className="text-sm font-medium text-gray-900">{currentCase.module || '未指定'}</div>
              )} */}
              <div className="text-sm font-medium text-gray-900">{currentCase.module || '未指定'}</div>
            </div>

            {/* 🆕 关联需求 */}
            {(currentCase.requirementSource || currentCase.sectionId) && (
              <div className="flex-shrink-0">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">关联需求</div>
                <button
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap"
                  onClick={handleViewRequirement}
                  title="点击查看需求文档"
                >
                  <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="max-w-[200px] truncate">
                    {currentCase.requirementSource 
                      ? currentCase.requirementSource
                      : (currentCase.sectionId ? `${currentCase.sectionId}${currentCase.sectionName ? ' ' + currentCase.sectionName : ''}` : (currentCase.sectionName || '未命名需求'))}
                  </span>
                </button>
              </div>
            )}

            {/* 🆕 关联场景 */}
            {currentCase.testScenario && (
              <div className="flex-shrink-0">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">关联场景</div>
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-lg border border-purple-200 whitespace-nowrap"
                  title={currentCase.testScenario}
                >
                  <Target className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="max-w-[200px] truncate">{currentCase.testScenario}</span>
                </span>
              </div>
            )}

            {/* 关联测试点 */}
            {currentCase.testPoints && currentCase.testPoints.length > 0 && (
              <div className="flex-shrink-0">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">关联测试点</div>
                <div className="flex flex-wrap gap-1.5">
                  {currentCase.testPoints.map((tp, index) => {
                    // 统一字段名称：优先使用 testPoint，兼容 testPointName
                    const testPointName = tp.testPoint || tp.testPointName || '未命名测试点';
                    return (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg border border-blue-200 whitespace-nowrap"
                        title={testPointName || tp.description}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="max-w-[200px] truncate">{testPointName}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 覆盖范围 */}
            {currentCase.coverageAreas && (
              <div className="flex-1 min-w-[140px]">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">覆盖范围</div>
                {isEditing ? (
                  <Input
                    value={editedCase?.coverageAreas || ''}
                    onChange={(e) => updateField('coverageAreas', e.target.value)}
                    placeholder="覆盖范围"
                  />
                ) : (
                  <div className="text-sm font-medium text-gray-900 line-clamp-2">{currentCase.coverageAreas}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 前置条件和测试数据 */}
        <div className="grid grid-cols-2 gap-4">
          {/* 前置条件 - 有数据时才显示 */}
          {currentCase.preconditions && (
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <label className="text-xs font-semibold text-amber-800 uppercase tracking-wide">前置条件</label>
              </div>
              {isEditing ? (
                <TextArea
                  value={editedCase?.preconditions || ''}
                  onChange={(e) => updateField('preconditions', e.target.value)}
                  rows={4}
                  placeholder="前置条件"
                />
              ) : (
                <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {currentCase.preconditions ? (
                  <p>{currentCase.preconditions}</p>
                ) : (
                  <p className="text-gray-400 italic">无</p>
                )}
                </div>
                // <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{currentCase.preconditions}</p>
              )}
            </div>
          )}
          
          {/* 测试数据 - 始终显示，没有数据时显示空状态 */}
          <div className={`bg-blue-50 rounded-lg p-4 border border-blue-200 ${!currentCase.preconditions ? 'col-span-2' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <label className="text-xs font-semibold text-blue-800 uppercase tracking-wide">测试数据</label>
            </div>
            {isEditing ? (
              <TextArea
                value={editedCase?.testData || ''}
                onChange={(e) => updateField('testData', e.target.value)}
                rows={4}
                placeholder="测试数据（如：用户名：admin，密码：123456）"
              />
            ) : (
              <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {currentCase.testData ? (
                  <p>{currentCase.testData}</p>
                ) : (
                  <p className="text-gray-400 italic">无</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 测试步骤（新版设计） */}
        {(filledSteps || testSteps.length > 0) && (
          <div className="bg-white rounded-xl p-6 border-2 border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-1 h-6 bg-gradient-to-b from-purple-500 to-blue-500 rounded"></div>
              <h3 className="text-lg font-semibold text-gray-900">测试步骤</h3>
              {currentCase.testData && !isEditing && (
                <span className="text-xs text-blue-600 ml-2">（已填充测试数据）</span>
              )}
            </div>

            <TestStepsEditor
              steps={testSteps}
              isEditing={isEditing}
              onChange={handleStepsChange}
            />
          </div>
        )}
      </div>
      )}
    </Modal>
    
    {/* 🆕 需求文档详情弹窗 */}
    <AntModal
      title={
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <span>需求文档详情</span>
          {currentRequirementDoc && (
            <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">
              #{currentRequirementDoc.id}
            </span>
          )}
        </div>
      }
      open={requirementModalOpen}
      onCancel={() => {
        setRequirementModalOpen(false);
        setCurrentRequirementDoc(null);
      }}
      footer={null}
      width={1200}
      centered
      maskClosable={true}
      keyboard={true}
      zIndex={2000}
      getContainer={() => document.body}
      styles={{
        content: {
          minHeight: '95vh',
          display: 'flex',
          flexDirection: 'column'
        },
        body: {
          flex: 1,
          overflow: 'auto',
          padding: '20px',
          userSelect: 'text'
        }
      }}
      className="requirement-doc-modal"
      destroyOnHidden={true}
    >
      {requirementLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spin size="large" />
        </div>
      ) : currentRequirementDoc && (
        <div className="flex flex-col gap-6 h-full">
          {/* 文档信息 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h2 className="text-xl font-bold text-gray-900 mb-2">{currentRequirementDoc.title}</h2>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {currentRequirementDoc.project && (
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  {currentRequirementDoc.project.name}
                  {currentRequirementDoc.project_version && ` / ${currentRequirementDoc.project_version.version_name}`}
                  {currentRequirementDoc.module && ` / ${currentRequirementDoc.module}`}
                </span>
              )}
              {currentRequirementDoc.users && (
                <span className="flex items-center gap-1">
                  <span>👤</span>
                  {currentRequirementDoc.users.username}
                </span>
              )}
              <span className="flex items-center gap-1">
                <span>📅</span>
                {formatDate(currentRequirementDoc.created_at)}
              </span>
            </div>
          </div>
          
          {/* 需求文档内容 */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                需求文档内容
                <span className="text-xs text-gray-400 font-normal ml-2">
                  {currentRequirementDoc.content?.length || 0} 字 · {currentRequirementDoc.content?.split('\n').length || 0} 行
                </span>
              </h3>
              <button
                onClick={handleCopyRequirementDoc}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                  copied
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                )}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    复制全部
                  </>
                )}
              </button>
            </div>
            <div 
              className="bg-white border border-gray-200 rounded-lg p-6 flex-1 overflow-y-auto select-text"
              style={{ minHeight: '400px', maxHeight: 'calc(95vh - 250px)' }}
            >
              <div
                className="prose prose-slate max-w-none prose-sm select-text
                  prose-headings:text-gray-900
                  prose-h1:text-2xl prose-h1:font-bold prose-h1:mb-4 prose-h1:border-b prose-h1:border-gray-200 prose-h1:pb-2
                  prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-6 prose-h2:mb-3 prose-h2:text-blue-700
                  prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-2
                  prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-3
                  prose-ul:my-3 prose-ol:my-3
                  prose-li:text-gray-700 prose-li:my-1
                  prose-strong:text-gray-900
                  prose-table:w-full prose-table:border-collapse prose-table:text-sm prose-table:my-4
                  prose-thead:bg-blue-50
                  prose-th:border prose-th:border-gray-300 prose-th:p-2 prose-th:text-left prose-th:font-semibold
                  prose-td:border prose-td:border-gray-300 prose-td:p-2
                "
                dangerouslySetInnerHTML={{ __html: marked.parse(currentRequirementDoc.content || '') as string }}
              />
            </div>
          </div>
        </div>
      )}
    </AntModal>
    </>
  );
}
