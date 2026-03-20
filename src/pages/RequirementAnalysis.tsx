import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload as UploadIcon, FileText, Bot, Save, ArrowRight, ArrowLeft,
  Loader2, Edit3, Eye, RefreshCw, Settings
} from 'lucide-react';
import {
  Steps, Input, Select, Upload, Spin, Tooltip
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { marked } from 'marked';
import { analysisService } from '../services/analysisService';
import * as systemService from '../services/systemService';
import { llmConfigManager } from '../services/llmConfigManager';
import { showToast } from '../utils/toast';

const { TextArea } = Input;
const { Dragger } = Upload;

export function RequirementAnalysis() {
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: 上传/输入
  const [inputText, setInputText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);

  // Step 2: AI 生成
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [currentModelName, setCurrentModelName] = useState('');

  // Step 3: 保存
  const [title, setTitle] = useState('');
  const [selectedProject, setSelectedProject] = useState<number | undefined>();
  const [projects, setProjects] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProjects();
    loadModelInfo();
  }, []);

  const loadProjects = async () => {
    try {
      const result = await systemService.getActiveSystems();
      setProjects(result);
    } catch {
      // ignore
    }
  };

  const loadModelInfo = async () => {
    try {
      if (!llmConfigManager.isReady()) {
        await llmConfigManager.initialize();
      }
      const summary = llmConfigManager.getConfigSummary();
      setCurrentModelName(summary.modelName);
    } catch {
      setCurrentModelName('未配置');
    }
  };

  const handleFileUpload = async (file: File) => {
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast.error('文件大小不能超过 10MB');
      return false;
    }

    setUploadLoading(true);
    try {
      const result = await analysisService.uploadDocument(file);
      setInputText(result.text);
      setUploadedFileName(result.filename);
      showToast.success(`文件 "${result.filename}" 解析成功`);
    } catch (error: any) {
      showToast.error(error.message || '文件上传失败');
    } finally {
      setUploadLoading(false);
    }
    return false;
  };

  const handleGenerate = async () => {
    if (!inputText.trim()) {
      showToast.error('请先上传文档或输入需求文本');
      return;
    }

    setGenerating(true);
    setGeneratedContent('');
    try {
      const content = await analysisService.generateRequirement(inputText);
      setGeneratedContent(content);
      setEditContent(content);

      // 从生成内容提取标题
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        setTitle(titleMatch[1].trim());
      }

      showToast.success('需求文档生成成功');
    } catch (error: any) {
      showToast.error(error.message || 'AI 生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    const contentToSave = isEditing ? editContent : generatedContent;
    if (!title.trim()) {
      showToast.error('请输入需求文档标题');
      return;
    }
    if (!contentToSave.trim()) {
      showToast.error('需求文档内容不能为空');
      return;
    }

    setSaving(true);
    try {
      await analysisService.saveDocument({
        title,
        content: contentToSave,
        summary: contentToSave.substring(0, 200),
        sourceFilename: uploadedFileName || undefined,
        projectId: selectedProject
      });
      showToast.success('需求文档保存成功');
      navigate('/requirement-docs');
    } catch (error: any) {
      showToast.error(error.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const canGoNext = () => {
    if (currentStep === 0) return inputText.trim().length > 0;
    if (currentStep === 1) return generatedContent.trim().length > 0;
    return true;
  };

  const renderedMarkdown = generatedContent
    ? marked(isEditing ? editContent : generatedContent, { breaks: true })
    : '';

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">需求分析</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">通过 AI 上传文档或文本，一键生成结构化需求文档</p>
      </div>

      {/* 步骤条 */}
      <div className="bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] px-8 py-5">
        <Steps
          current={currentStep}
          items={[
            { title: '上传/输入', description: '上传文档或输入文本' },
            { title: 'AI 生成', description: '自动生成结构化需求' },
            { title: '保存', description: '编辑标题并保存文档' },
          ]}
        />
      </div>

      {/* Step 内容 */}
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Step 1: 上传/输入 */}
        {currentStep === 0 && (
          <div className="bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 文件上传 */}
              <div className="flex flex-col">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                  <UploadIcon className="h-4 w-4 text-purple-500" />
                  上传文档
                </h3>
                <Dragger
                  accept=".pdf,.docx,.doc,.txt,.md,.markdown"
                  showUploadList={false}
                  beforeUpload={handleFileUpload}
                  disabled={uploadLoading}
                  className="flex-1"
                >
                  <div className="py-10">
                    {uploadLoading ? (
                      <Spin size="large" />
                    ) : (
                      <>
                        <p className="mb-2">
                          <InboxOutlined style={{ fontSize: 44, color: '#9333ea' }} />
                        </p>
                        <p className="text-sm text-[var(--color-text-primary)]">点击或拖拽文件到此区域上传</p>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                          支持 PDF、Word、TXT、Markdown 格式，最大 10MB
                        </p>
                      </>
                    )}
                  </div>
                </Dragger>
                {uploadedFileName && (
                  <div className="mt-3 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">已上传: {uploadedFileName}</span>
                  </div>
                )}
              </div>

              {/* 分隔线 */}
              <div className="hidden lg:flex items-center -mx-3 relative">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-3/4 bg-[var(--color-border)]" />
                <div className="flex flex-col flex-1 pl-3">
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                    <Edit3 className="h-4 w-4 text-purple-500" />
                    直接输入文本
                  </h3>
                  <TextArea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="在此粘贴或输入需求文本内容..."
                    autoSize={{ minRows: 10, maxRows: 18 }}
                    showCount
                    maxLength={50000}
                  />
                </div>
              </div>

              {/* 移动端文本输入 */}
              <div className="lg:hidden">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-purple-500" />
                  直接输入文本
                </h3>
                <TextArea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="在此粘贴或输入需求文本内容..."
                  autoSize={{ minRows: 8, maxRows: 16 }}
                  showCount
                  maxLength={50000}
                />
              </div>
            </div>

            {/* 预览 */}
            {inputText && (
              <div className="mt-5 p-4 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-[var(--color-text-secondary)]">内容预览</h4>
                  <span className="text-xs text-[var(--color-text-secondary)]">{inputText.length.toLocaleString()} 字</span>
                </div>
                <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">
                  {inputText.substring(0, 500)}{inputText.length > 500 ? '...' : ''}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: AI 生成 */}
        {currentStep === 1 && (
          <div className="bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
            {/* 控制栏 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.button
                  onClick={handleGenerate}
                  disabled={generating || !inputText.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  whileHover={{ scale: generating ? 1 : 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      生成中...
                    </>
                  ) : generatedContent ? (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      重新生成
                    </>
                  ) : (
                    <>
                      <Bot className="h-4 w-4" />
                      生成需求文档
                    </>
                  )}
                </motion.button>

                {generatedContent && !generating && (
                  <motion.button
                    onClick={() => {
                      setIsEditing(!isEditing);
                      if (!isEditing) setEditContent(generatedContent);
                    }}
                    className="flex items-center gap-2 px-3 py-2 border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors text-sm text-[var(--color-text-primary)]"
                    whileHover={{ scale: 1.02 }}
                  >
                    {isEditing ? <Eye className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                    {isEditing ? '预览' : '编辑'}
                  </motion.button>
                )}
              </div>

              <Tooltip title="在系统设置中更改 AI 模型">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-bg-secondary)] text-xs text-[var(--color-text-secondary)] cursor-default"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>当前模型: {currentModelName || '加载中...'}</span>
                </div>
              </Tooltip>
            </div>

            {/* 生成进度 */}
            {generating && (
              <div className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <Spin />
                <span className="text-sm text-purple-600 dark:text-purple-400">
                  AI 正在分析文本并生成需求文档，请稍候（约 30-60 秒）...
                </span>
              </div>
            )}

            {/* 生成结果 */}
            {generatedContent && !generating && (
              <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
                {isEditing ? (
                  <TextArea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="!border-0 !rounded-none"
                    autoSize={{ minRows: 16, maxRows: 30 }}
                  />
                ) : (
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert p-6 max-h-[600px] overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: renderedMarkdown as string }}
                  />
                )}
              </div>
            )}

            {!generatedContent && !generating && (
              <div className="text-center py-20 text-[var(--color-text-secondary)]">
                <Bot className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-base mb-1">点击"生成需求文档"按钮开始</p>
                <p className="text-xs opacity-60">AI 将基于上一步输入的内容自动生成结构化需求文档</p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: 保存 */}
        {currentStep === 2 && (
          <div className="bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  需求文档标题 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入需求文档标题"
                  size="large"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  关联项目
                </label>
                <Select
                  value={selectedProject}
                  onChange={setSelectedProject}
                  placeholder="选择关联项目（可选）"
                  allowClear
                  size="large"
                  style={{ width: '100%' }}
                  options={projects.map(p => ({ label: p.name, value: p.id }))}
                />
              </div>
            </div>

            {/* 预览生成的内容 */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                文档内容预览
              </label>
              <div
                className="prose prose-sm max-w-none dark:prose-invert p-5 border border-[var(--color-border)] rounded-lg max-h-[450px] overflow-y-auto bg-[var(--color-bg-secondary)]"
                dangerouslySetInnerHTML={{ __html: renderedMarkdown as string }}
              />
            </div>

            <div className="flex justify-end pt-2">
              <motion.button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                whileHover={{ scale: saving ? 1 : 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    保存需求文档
                  </>
                )}
              </motion.button>
            </div>
          </div>
        )}
      </motion.div>

      {/* 底部导航 */}
      <div className="flex justify-between items-center bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] px-6 py-4">
        <motion.button
          onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
          disabled={currentStep === 0}
          className="flex items-center gap-2 px-4 py-2 border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--color-text-primary)]"
          whileHover={{ scale: currentStep === 0 ? 1 : 1.02 }}
        >
          <ArrowLeft className="h-4 w-4" />
          上一步
        </motion.button>
        <motion.button
          onClick={() => navigate('/requirement-docs')}
          className="text-sm text-purple-600 hover:text-purple-700 hover:underline transition-colors"
        >
          查看已保存的需求文档 &rarr;
        </motion.button>
        {currentStep < 2 ? (
          <motion.button
            onClick={() => setCurrentStep(prev => Math.min(2, prev + 1))}
            disabled={!canGoNext()}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            whileHover={{ scale: canGoNext() ? 1.02 : 1 }}
          >
            下一步
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        ) : (
          <div className="w-[88px]" />
        )}
      </div>
    </div>
  );
}

export default RequirementAnalysis;
