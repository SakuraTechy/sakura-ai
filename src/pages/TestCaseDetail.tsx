import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Table,
  AlignLeft,
  HelpCircle,
  Loader2,
  Tag
} from 'lucide-react';
import { clsx } from 'clsx';
import { testService } from '../services/testService';
import * as systemService from '../services/systemService';
import { functionalTestCaseService } from '../services/functionalTestCaseService';
import type { TestCase, TestStepRow } from '../types/test';
import { showToast } from '../utils/toast';
import { Button } from '../components/ui/button';
import { TagInput } from '../components/ui/TagInput';
import { StepTableEditor } from '../components/StepTableEditor';
import { parseStepsText, serializeStepsToText } from '../utils/stepConverter';

interface TestCaseForm {
  name: string;
  preconditions: string;
  testData: string;
  steps: string;
  assertions: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'draft' | 'disabled';
  tags: string;
  system: string;
  module: string;
}

export function TestCaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // 判断是否为编辑模式：路径包含 /edit 或者 id 存在且不等于 'new'
  const isEditMode = location.pathname.includes('/edit') || (id !== undefined && id !== 'new');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [systemOptions, setSystemOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [moduleOptions, setModuleOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [formData, setFormData] = useState<TestCaseForm>({
    name: '',
    preconditions: '',
    testData: '',
    steps: '',
    assertions: '',
    priority: 'medium',
    status: 'active',
    tags: '',
    system: '',
    module: ''
  });

  // 步骤编辑器状态
  const [stepsEditorMode, setStepsEditorMode] = useState<'text' | 'table'>('table');
  const [stepsData, setStepsData] = useState<TestStepRow[]>([]);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [stepsSoftWrap, setStepsSoftWrap] = useState(true);
  const [stepsHelpOpen, setStepsHelpOpen] = useState(false);

  // 验证状态
  const [nameTouched, setNameTouched] = useState(false);
  const [stepsTouched, setStepsTouched] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const stepsTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 加载编辑器模式偏好
  useEffect(() => {
    const savedMode = localStorage.getItem('stepsEditorMode') as 'text' | 'table' | null;
    if (savedMode) {
      setStepsEditorMode(savedMode);
    }
  }, []);

  // 加载系统字典选项
  useEffect(() => {
    const loadSystems = async () => {
      try {
        const systems = await systemService.getActiveSystems();
        setSystemOptions(systems);
      } catch (error) {
        console.error('加载系统列表失败:', error);
        showToast.error('加载系统列表失败');
      }
    };
    loadSystems();
  }, []);

  // 根据选择的项目加载对应的模块列表
  useEffect(() => {
    const loadModules = async () => {
      if (!formData.system) {
        setModuleOptions([]);
        return;
      }

      try {
        const modules = await functionalTestCaseService.getModulesBySystem(formData.system);
        setModuleOptions(modules);
      } catch (error) {
        console.error('加载模块列表失败:', error);
        showToast.error('加载模块列表失败');
        setModuleOptions([]);
      }
    };
    loadModules();
  }, [formData.system]);

  // 加载测试用例数据（编辑模式）
  useEffect(() => {
    if (isEditMode) {
      loadTestCase();
    }
  }, [id]);

  // 解析步骤数据（表格模式）
  useEffect(() => {
    if (testCase && stepsEditorMode === 'table') {
      // 确保 steps 是字符串
      const stepsText = typeof testCase.steps === 'string'
        ? testCase.steps
        : (testCase.steps ? JSON.stringify(testCase.steps) : '');

      const parsed = parseStepsText(stepsText);
      setStepsData(parsed || []); // 确保不返回 undefined
    }
  }, [testCase, stepsEditorMode]);

  const loadTestCase = async () => {
    if (!id || id === 'new') return;

    try {
      setLoading(true);
      const response = await testService.getTestCaseById(parseInt(id));
      setTestCase(response);

      // 填充表单数据
      const stepsText = typeof response.steps === 'string'
        ? response.steps
        : (response.steps ? JSON.stringify(response.steps) : '');

      setFormData({
        name: response.name || response.title || '',
        preconditions: (response as any).preconditions || '',
        testData: (response as any).testData || '',
        steps: stepsText,
        assertions: response.assertions || '',
        priority: (response.priority as any) || 'medium',
        status: (response.status as any) || 'active',
        tags: Array.isArray(response.tags) ? response.tags.join(', ') : '',
        system: response.system || '',
        module: response.module || ''
      });
    } catch (error) {
      console.error('加载测试用例失败:', error);
      showToast.error('加载测试用例失败');
      navigate('/test-cases');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTagsChange = (tags: string[]) => {
    setFormData(prev => ({ ...prev, tags: tags.join(', ') }));
  };

  const handleStepsEditorModeChange = (mode: 'text' | 'table') => {
    // 模式切换前同步数据
    if (mode === 'table' && stepsEditorMode === 'text') {
      // 文本 -> 表格：解析文本
      const parsed = parseStepsText(formData.steps);
      setStepsData(parsed);
    } else if (mode === 'text' && stepsEditorMode === 'table') {
      // 表格 -> 文本：序列化表格数据
      const serialized = serializeStepsToText(stepsData);
      setFormData(prev => ({ ...prev, steps: serialized }));
    }

    setStepsEditorMode(mode);
    localStorage.setItem('stepsEditorMode', mode);
  };

  const handleStepsDataChange = (newStepsData: TestStepRow[]) => {
    setStepsData(newStepsData);
    // 同步到表单数据
    const serialized = serializeStepsToText(newStepsData);
    setFormData(prev => ({ ...prev, steps: serialized }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      showToast.error('请输入测试用例名称');
      setNameTouched(true);
      nameInputRef.current?.focus();
      return false;
    }

    const stepsText = stepsEditorMode === 'table'
      ? serializeStepsToText(stepsData)
      : formData.steps;

    if (!stepsText.trim()) {
      showToast.error('请输入测试步骤');
      setStepsTouched(true);
      if (stepsEditorMode === 'text') {
        stepsTextareaRef.current?.focus();
      }
      return false;
    }

    return true;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (saving || loading) return;
    if (!validateForm()) return;

    try {
      setSaving(true);

      // 准备提交数据
      const stepsText = stepsEditorMode === 'table'
        ? serializeStepsToText(stepsData)
        : formData.steps;

      const tagsArray = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean);

      const payload = {
        name: formData.name.trim(),
        preconditions: formData.preconditions.trim(),
        testData: formData.testData.trim(),
        steps: stepsText.trim(),
        assertions: formData.assertions.trim(),
        priority: formData.priority,
        status: formData.status,
        tags: tagsArray,
        system: formData.system.trim(),
        module: formData.module.trim()
      };

      if (isEditMode && id) {
        // 更新测试用例
        await testService.updateTestCase(parseInt(id), payload);
        showToast.success('测试用例更新成功');
      } else {
        // 创建测试用例
        await testService.createTestCase(payload);
        showToast.success('测试用例创建成功');
      }

      // 返回列表页
      navigate('/test-cases');
    } catch (error) {
      console.error('保存测试用例失败:', error);
      showToast.error(isEditMode ? '更新测试用例失败' : '创建测试用例失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (isEditMode && testCase) {
      // 编辑模式：重置为原始数据
      setFormData({
        name: testCase.name,
        preconditions: (testCase as any).preconditions || '',
        testData: (testCase as any).testData || '',
        steps: testCase.steps,
        assertions: testCase.assertions || '',
        priority: testCase.priority,
        status: testCase.status,
        tags: testCase.tags?.join(', ') || '',
        system: testCase.system || '',
        module: testCase.module || ''
      });
      if (stepsEditorMode === 'table') {
        const parsed = parseStepsText(testCase.steps);
        setStepsData(parsed);
      }
      showToast.info('已重置为原始数据');
    } else {
      // 新建模式：清空表单
      setFormData({
        name: '',
        preconditions: '',
        testData: '',
        steps: '',
        assertions: '',
        priority: 'medium',
        status: 'active',
        tags: '',
        system: '',
        module: ''
      });
      setStepsData([]);
      showToast.info('已清空表单');
    }
    setNameTouched(false);
    setStepsTouched(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="max-w-6xl mx-auto p-6">
        {/* 顶部导航栏 */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/test-cases')}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              返回列表
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditMode ? '编辑测试用例' : '创建测试用例'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleReset}
              disabled={saving}
              icon={<RotateCcw className="h-4 w-4 mr-2" />}
            >
              {/* <RotateCcw className="h-4 w-4 mr-2" /> */}
              {isEditMode ? '重置' : '清空'}
            </Button>
            <Button
              type="submit"
              onClick={handleSubmit}
              disabled={saving}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              icon={
                saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )
              }
            >
              {saving ? (
                <>
                  {/* <Loader2 className="h-4 w-4 mr-2 animate-spin" /> */}
                  保存中...
                </>
              ) : (
                <>
                  {/* <Save className="h-4 w-4 mr-2" /> */}
                  保存
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 表单内容 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  用例名称 <span className="text-red-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  onBlur={() => setNameTouched(true)}
                  className={clsx(
                    'w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    nameTouched && !formData.name.trim() ? 'border-red-500' : 'border-gray-300'
                  )}
                  placeholder="请输入测试用例名称"
                />
                {nameTouched && !formData.name.trim() && (
                  <p className="mt-1 text-sm text-red-600">名称不能为空</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  所属项目
                </label>
                <select
                  name="system"
                  value={formData.system}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">请选择项目</option>
                  {systemOptions.map(sys => (
                    <option key={sys.id} value={sys.name}>{sys.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  所属模块
                </label>
                <select
                  name="module"
                  value={formData.module}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!formData.system}
                >
                  <option value="">{formData.system ? '请选择模块' : '请先选择项目'}</option>
                  {moduleOptions.map(mod => (
                    <option key={mod.value} value={mod.value}>{mod.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  优先级
                </label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  状态
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="draft">草稿</option>
                  <option value="active">启用</option>
                  <option value="disabled">禁用</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  标签
                </label>
                <TagInput
                  value={(formData.tags || '').split(',').map(t => t.trim()).filter(Boolean)}
                  onChange={handleTagsChange}
                  placeholder="输入标签并按回车添加"
                />
              </div>
            </div>

            {/* 前置条件和测试数据 */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  前置条件
                </label>
                <textarea
                  name="preconditions"
                  value={formData.preconditions}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="请描述执行测试前需要满足的条件"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  测试数据
                </label>
                <textarea
                  name="testData"
                  value={formData.testData}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="请输入测试过程中使用的数据"
                />
              </div>
            </div>

            {/* 测试步骤 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  测试步骤 <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStepsHelpOpen(!stepsHelpOpen)}
                    className="text-gray-600 hover:text-gray-600"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => handleStepsEditorModeChange('table')}
                      className={clsx(
                        'px-3 py-1 rounded flex items-center gap-2 text-sm transition-colors',
                        stepsEditorMode === 'table'
                          ? 'bg-white text-blue-600 shadow'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                    >
                      <Table className="h-4 w-4" />
                      表格
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStepsEditorModeChange('text')}
                      className={clsx(
                        'px-3 py-1 rounded flex items-center gap-2 text-sm transition-colors',
                        stepsEditorMode === 'text'
                          ? 'bg-white text-blue-600 shadow'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                    >
                      <AlignLeft className="h-4 w-4" />
                      文本
                    </button>
                  </div>
                </div>
              </div>

              {stepsHelpOpen && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-700">
                  <p className="font-medium mb-1">步骤格式说明：</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>表格模式：可视化编辑，支持拖拽排序</li>
                    <li>文本模式：每行一个步骤，格式为「操作 | 预期结果」</li>
                    <li>两种模式可随时切换，数据会自动转换</li>
                  </ul>
                </div>
              )}

              {stepsEditorMode === 'table' ? (
                <StepTableEditor
                  steps={stepsData}
                  onChange={handleStepsDataChange}
                />
              ) : (
                <textarea
                  ref={stepsTextareaRef}
                  name="steps"
                  value={formData.steps}
                  onChange={handleInputChange}
                  onBlur={() => setStepsTouched(true)}
                  className={clsx(
                    'w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm',
                    stepsTouched && !formData.steps.trim() ? 'border-red-500' : 'border-gray-300',
                    stepsSoftWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'
                  )}
                  rows={stepsExpanded ? 20 : 10}
                  placeholder="请输入测试步骤，每行一个步骤&#10;格式：操作 | 预期结果&#10;示例：点击登录按钮 | 页面跳转到首页"
                />
              )}
              {stepsTouched && !formData.steps.trim() && stepsEditorMode === 'text' && (
                <p className="mt-1 text-sm text-red-600">测试步骤不能为空</p>
              )}
            </div>

            {/* 断言 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                断言
              </label>
              <textarea
                name="assertions"
                value={formData.assertions}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={5}
                placeholder="请输入测试断言（可选）"
              />
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
