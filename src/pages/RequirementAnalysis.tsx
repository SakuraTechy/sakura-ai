import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload as UploadIcon, FileText, Bot, Save, ArrowRight, ArrowLeft,
  Loader2, Edit3, Eye, RefreshCw, Settings, CheckCircle,
  AlertTriangle, Copy, Check, X
} from 'lucide-react';
import {
  Input, Select, Tooltip
} from 'antd';
import { motion } from 'framer-motion';
import { marked } from 'marked';
import { clsx } from 'clsx';
import { analysisService } from '../services/analysisService';
import * as systemService from '../services/systemService';
import { llmConfigManager } from '../services/llmConfigManager';
import { showToast } from '../utils/toast';
import { readFileContent, type FileReadResult } from '../utils/fileReader';
import { sortFilesByAxurePriority } from '../utils/axureExportPrioritize';
import { ProgressIndicator } from '../components/ai-generator/ProgressIndicator';
import { MAX_FILE_SIZE, MAX_FILES } from '../config/upload';
import { MultiFileUpload } from '../components/ai-generator/MultiFileUpload';
import { AIThinking } from '../components/ai-generator/AIThinking';

const { TextArea } = Input;

const REQUIREMENT_STEPS = [
  { name: '上传/输入', description: '上传文档或输入文本' },
  { name: 'AI 生成', description: '自动生成结构化需求' },
  { name: '保存', description: '编辑标题并保存文档' }
];

const FINALIZING_MIN_MS_DEFAULT = 2000;
const FINALIZING_MIN_MS = (() => {
  const raw = Number(import.meta.env.VITE_REQUIREMENT_FINALIZING_MIN_MS);
  if (!Number.isFinite(raw)) return FINALIZING_MIN_MS_DEFAULT;
  return Math.max(400, Math.min(3000, Math.round(raw)));
})();

export function RequirementAnalysis() {
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: 上传/输入
  const [inputText, setInputText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');

  // 文件列表（用于上传后预览）
  const [axureFiles, setAxureFiles] = useState<File[]>([]);

  // 文件预览状态（复制自 AI 生成需求页面的交互）
  const [filePreviewResult, setFilePreviewResult] = useState<FileReadResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [filePreviewMode, setFilePreviewMode] = useState<'preview' | 'edit'>('preview');
  const [fileContentCopied, setFileContentCopied] = useState(false);

  // Step 2: AI 生成
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [currentModelName, setCurrentModelName] = useState('');
  const [generateProgress, setGenerateProgress] = useState<{
    phase?: string;
    current?: number;
    total?: number;
    message?: string;
  }>({});
  const [generateElapsedSec, setGenerateElapsedSec] = useState(0);
  const generateStartRef = useRef<number | null>(null);
  const generateAbortRef = useRef<AbortController | null>(null);

  // Step 3: 保存
  const [title, setTitle] = useState('');
  const [selectedProject, setSelectedProject] = useState<number | undefined>();
  const [selectedProjectVersionId, setSelectedProjectVersionId] = useState<number | undefined>();
  const [projects, setProjects] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // 动态计算容器高度
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState('calc(100vh - 180px)');

  useEffect(() => {
    const calculateHeight = () => {
      // 获取视口高度
      const vh = window.innerHeight;
      // 检查是否全屏
      const isFullscreen = document.fullscreenElement !== null || document.querySelector('.app-fullscreen') !== null;
      
      let height;
      if (isFullscreen) {
        // 全屏模式：100vh - main的padding (24px + 16px) = vh - 40
        // 但实际上全屏时顶栏和TabBar隐藏，main占满整个视口
        height = vh - 40;
      } else {
        // 普通模式：100vh - 顶栏(80px) - TabBar(48px) - main的padding(24px + 16px) = vh - 168
        height = vh - 168;
      }
      
      console.log(`[RequirementAnalysis] 高度计算: vh=${vh}, isFullscreen=${isFullscreen}, height=${height}`);
      setContainerHeight(`${height}px`);
    };

    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    document.addEventListener('fullscreenchange', calculateHeight);
    
    // 监听 app-fullscreen 类变化
    const observer = new MutationObserver(calculateHeight);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('resize', calculateHeight);
      document.removeEventListener('fullscreenchange', calculateHeight);
      observer.disconnect();
    };
  }, []);

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
      const config = llmConfigManager.getCurrentConfig();
      setCurrentModelName(config.model || llmConfigManager.getConfigSummary().modelName);
    } catch {
      setCurrentModelName('未配置');
    }
  };

  useEffect(() => {
    if (!generating) return;
    generateStartRef.current = Date.now();
    setGenerateElapsedSec(0);
    const timer = window.setInterval(() => {
      if (generateStartRef.current) {
        setGenerateElapsedSec(Math.floor((Date.now() - generateStartRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  const isChunkMergeProgress = (p: typeof generateProgress) => {
    const phase = p.phase;
    return (
      (p.total ?? 0) > 0 ||
      phase === 'chunking' ||
      phase === 'chunk_progress' ||
      phase === 'merging'
    );
  };

  const getGeneratePercent = () => {
    if (!generating) return 0;
    if (generateProgress.phase === 'done') return 100;
    if (generateProgress.phase === 'merging') return 92;
    if (generateProgress.phase === 'finalizing') return 96;
    if (generateProgress.phase === 'generating') return 52;
    if (generateProgress.total && generateProgress.total > 0) {
      const c = Math.max(0, Math.min(generateProgress.current || 0, generateProgress.total));
      return Math.max(10, Math.min(90, Math.round((c / generateProgress.total) * 85)));
    }
    if (generateProgress.phase === 'chunking') return 12;
    if (generateProgress.phase === 'preprocess') return 6;
    return 3;
  };

  const getGenerateSubtitle = () => {
    if (!generating) return '';
    const elapsedText = `已耗时 ${generateElapsedSec} 秒`;
    if (generateProgress.total && (generateProgress.current || 0) <= 0) {
      return `${elapsedText}，预计剩余计算中...`;
    }
    if (generateProgress.total && (generateProgress.current || 0) > 0) {
      const current = generateProgress.current || 0;
      const total = generateProgress.total;
      const avg = generateElapsedSec / Math.max(1, current);
      const remain = Math.max(0, Math.round(avg * (total - current)));
      return `${elapsedText}，预计剩余 ${remain} 秒`;
    }
    return elapsedText;
  };

  const getChunkProgressLabel = () => {
    const p = generateProgress;
    if (isChunkMergeProgress(p)) {
      if (!p.total) return 'AI分片处理与合并（准备中...）';
      return `AI分片处理与合并中 (${p.current || 0}/${p.total})`;
    }
    if (p.phase === 'generating') return 'AI生成结构化文档中';
    if (p.phase === 'finalizing') return '结构化内容生成完成';
    return 'AI 生成结构化需求文档';
  };

  const handleFileUpload = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      showToast.error('文件大小不能超过 10MB');
      return;
    }
    try {
      const result = await readFileContent(file);
      if (!result.success) {
        throw new Error(result.error || '文件解析失败');
      }
      setInputText(result.content);
      setUploadedFileName(result.fileName);

      const warnings = result.formatWarnings;
      if (warnings && warnings.length > 0) {
        showToast.warning(warnings[0]);
      }

      showToast.success(`文件 "${result.fileName}" 解析成功`);
    } catch (error: any) {
      showToast.error(error.message || '文件解析失败');
    }
  };

  /** 多个主文件（含文件夹选择）时按路径排序后合并为一段输入，与 ZIP 解压合并行为一致 */
  const handleMergedFileUpload = async (mainFiles: File[]) => {
    const sorted = sortFilesByAxurePriority([...mainFiles]);

    for (const file of sorted) {
      if (file.size > MAX_FILE_SIZE) {
        showToast.error(`文件过大（超过 10MB）：${file.name}`);
        return;
      }
    }

    if (sorted.length === 1) {
      await handleFileUpload(sorted[0]);
      return;
    }

    try {
      const parts: string[] = [];
      const allWarnings: string[] = [];
      for (const file of sorted) {
        const result = await readFileContent(file);
        if (!result.success) {
          throw new Error(`${file.name}：${result.error || '解析失败'}`);
        }
        const label = file.webkitRelativePath || file.name;
        parts.push(`\n\n## 文件：${label}\n\n${result.content}`);
        if (result.formatWarnings?.length) {
          allWarnings.push(...result.formatWarnings.map(w => `${file.name}：${w}`));
        }
      }
      setInputText(parts.join('\n'));
      setUploadedFileName(`合并 ${sorted.length} 个文件`);

      if (allWarnings.length > 0) {
        showToast.warning(allWarnings[0]);
      }
      showToast.success(`已合并 ${sorted.length} 个文件`);
    } catch (error: any) {
      showToast.error(error.message || '文件解析失败');
    }
  };

  // 选择文件后：自动读取主文件（多个时合并），填充输入文本（用于后续 AI 生成）
  const handleFilesChange = (files: File[]) => {
    setAxureFiles(files);

    const supportedMainExt = ['.html', '.htm', '.pdf', '.docx', '.doc', '.md', '.markdown', '.txt', '.zip'];
    const mainFiles = files.filter(f =>
      supportedMainExt.some(ext => f.name.toLowerCase().endsWith(ext))
    );

    if (mainFiles.length === 0) {
      setInputText('');
      setUploadedFileName('');
      setGeneratedContent('');
      setEditContent('');
      return;
    }

    void handleMergedFileUpload(mainFiles);
  };

  const handleClearPreview = () => {
    setShowFilePreview(false);
    setFilePreviewResult(null);
    setFileContentCopied(false);
    setFilePreviewMode('preview');
  };

  const handleCopyFileContent = async () => {
    if (!filePreviewResult?.content) {
      showToast.warning('没有可复制的内容');
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(filePreviewResult.content);
        setFileContentCopied(true);
        showToast.success('已复制到剪贴板');
        setTimeout(() => setFileContentCopied(false), 2000);
        return;
      }

      // 降级：使用临时 textarea
      const textarea = document.createElement('textarea');
      textarea.value = filePreviewResult.content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (successful) {
        setFileContentCopied(true);
        showToast.success('已复制到剪贴板');
        setTimeout(() => setFileContentCopied(false), 2000);
      } else {
        showToast.error('复制失败，请手动选择并复制');
      }
    } catch (error) {
      console.error('复制失败:', error);
      showToast.error('复制失败，请手动选择并复制');
    }
  };

  // 上传后文件预览（复用 AI 生成需求页面的交互）
  const handlePreviewFile = async (file?: File) => {
    // 如果已经在预览状态，点击同一个文件则关闭预览
    if (showFilePreview && file && filePreviewResult?.fileName === file.name) {
      handleClearPreview();
      return;
    }

    let targetFile = file;

    if (!targetFile) {
      if (axureFiles.length === 0) {
        showToast.warning('请先上传文件');
        return;
      }

      const supportedMainExt = ['.html', '.htm', '.pdf', '.docx', '.md', '.markdown', '.txt', '.doc', '.zip'];
      targetFile = axureFiles.find(f =>
        supportedMainExt.some(ext => f.name.toLowerCase().endsWith(ext))
      );

      if (!targetFile) {
        showToast.warning(
          '文件格式不支持，请上传 HTML / HTM / JS / PDF / DOC / DOCX / Markdown / TXT / ZIP'
        );
        return;
      }
    }

    setPreviewLoading(true);
    try {
      const result = await readFileContent(targetFile);

      if (!result.success) {
        showToast.error(result.error || '无法读取文件内容');
        return;
      }

      setFilePreviewResult(result);
      setShowFilePreview(true);
      showToast.success(`成功读取文件内容（${result.content.length} 字符）`);
    } catch (error: any) {
      console.error('文件读取错误:', error);
      showToast.error(error?.message || '读取文件时发生未知错误');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!inputText.trim()) {
      showToast.error('请先上传文档或输入需求文本');
      return;
    }

    setGenerating(true);
    setGeneratedContent('');
    setGenerateProgress({ phase: 'start', message: '开始分析文本内容' });
    generateAbortRef.current = new AbortController();
    try {
      const { content, inputTruncated } = await analysisService.generateRequirementStream(inputText, {
        onProgress: (event) => setGenerateProgress(event),
        signal: generateAbortRef.current.signal
      });
      setGenerateProgress({ phase: 'finalizing', message: '正在整理并输出文档' });
      await new Promise((resolve) => window.setTimeout(resolve, FINALIZING_MIN_MS));
      setGenerateProgress({ phase: 'done', message: '生成完成' });
      setGeneratedContent(content);
      setEditContent(content);

      if (inputTruncated) {
        showToast.warning('输入内容过长，已自动截断后再发送模型；建议减少文件或分批生成。');
      }

      // 从生成内容提取标题
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        setTitle(titleMatch[1].trim());
      }

      showToast.success('需求文档生成成功');
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        showToast.warning('已取消本次生成');
      } else {
        showToast.error(error.message || 'AI 生成失败，请重试');
      }
    } finally {
      generateAbortRef.current = null;
      setGenerating(false);
    }
  };

  const handleCancelGenerate = () => {
    generateAbortRef.current?.abort();
  };

  const handleSave = async () => {
    // 预览/保存都应基于“当前编辑后的内容”
    const contentToSave = editContent || generatedContent;
    if (!title.trim()) {
      showToast.error('请输入需求文档标题');
      return;
    }
    if (!contentToSave.trim()) {
      showToast.error('需求文档内容不能为空');
      return;
    }

    if (!selectedProjectVersionId) {
      showToast.error('请选择对应项目版本后再保存');
      return;
    }

    setSaving(true);
    try {
      const selectedSystemName = selectedProject
        ? (projects.find(p => p.id === selectedProject) as any)?.name
        : undefined;

      await analysisService.saveDocument({
        title,
        content: contentToSave,
        summary: contentToSave.substring(0, 200),
        sourceFilename: uploadedFileName || undefined,
        projectId: selectedProject,
        projectVersionId: selectedProjectVersionId,
        // 后端 requirement_documents.system 字段需要显式传入；这里用关联项目名称作为系统名称
        system: selectedSystemName
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
    ? marked(editContent, { breaks: true })
    : '';

  const selectedProjectVersions = selectedProject
    ? ((projects.find(p => p.id === selectedProject) as any)?.project_versions as Array<any> | undefined) ?? []
    : [];

  const handleProjectChange = (value: number | undefined) => {
    const projectId = value;
    setSelectedProject(projectId);

    if (!projectId) {
      setSelectedProjectVersionId(undefined);
      return;
    }

    const project = projects.find(p => p.id === projectId) as any | undefined;
    const versions: Array<any> = project?.project_versions ?? [];
    const mainVersion = versions.find(v => v.is_main) ?? versions[0];
    setSelectedProjectVersionId(mainVersion?.id);
  };

  const handleVersionChange = (value: number | undefined) => {
    setSelectedProjectVersionId(value);
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-3" style={{ height: containerHeight, maxHeight: containerHeight }}>
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">需求分析</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">通过 AI 上传文档或文本，一键生成结构化需求文档</p>
      </div>

      {/* 步骤条 */}
      <div className="bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] px-8 py-4">
        <ProgressIndicator
          currentStep={currentStep}
          totalSteps={REQUIREMENT_STEPS.length}
          steps={REQUIREMENT_STEPS}
        />
      </div>

      {/* Step 内容 */}
      <div className="flex-1 min-h-0 max-h-full overflow-y-auto">
        {/* Step 1: 上传/输入 */}
        {currentStep === 0 && (
          <div className="h-full bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] p-6 flex flex-col overflow-y-auto">
            {/* 上传和输入区域 */}
            <div className={clsx(
              "grid grid-cols-1 lg:grid-cols-2 gap-6",
              (previewLoading || showFilePreview) ? "flex-shrink-0" : "flex-1 min-h-0"
            )}>
              {/* 文件上传 */}
              <div className="flex flex-col min-h-0">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2 flex-shrink-0">
                  <UploadIcon className="h-4 w-4 text-purple-500" />
                  上传文档
                </h3>
                <div className={clsx(
                  (previewLoading || showFilePreview) ? "" : "flex-1 min-h-0 overflow-y-auto"
                )}>
                  <MultiFileUpload
                    onFilesChange={handleFilesChange}
                    onPreviewFile={handlePreviewFile}
                    onClearPreview={handleClearPreview}
                    hidePageName
                    previewingFileName={showFilePreview ? filePreviewResult?.fileName : undefined}
                    maxFiles={MAX_FILES}
                    maxSize={MAX_FILE_SIZE}
                  />
                </div>
              </div>

              {/* 分隔线 */}
              <div className="hidden lg:flex items-stretch relative">
                {/* <div className="absolute left-0 top-0 w-px h-full bg-[var(--color-border)]" /> */}
                <div className="flex flex-col flex-1 min-h-0">
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2 flex-shrink-0">
                    <Edit3 className="h-4 w-4 text-purple-500" />
                    直接输入文本
                  </h3>
                  <TextArea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="在此粘贴或输入需求文本内容..."
                    autoSize={false}
                    showCount
                    maxLength={100000}
                    className="flex-1 min-h-0"
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

            {/* 文件预览区域 - 独立区域，在 grid 之外 */}
            {(previewLoading || (showFilePreview && filePreviewResult && !previewLoading)) && (
              <div className="mt-6 flex-shrink-0">
                {previewLoading && (
                  <AIThinking
                    title="正在读取文件内容..."
                    subtitle="正在提取文件中的文本内容，请稍候"
                    progressItems={[
                      { label: '读取文件数据...', status: 'processing' },
                      { label: '解析文件格式', status: 'pending' },
                      { label: '提取文本内容', status: 'pending' }
                    ]}
                  />
                )}

                {showFilePreview && filePreviewResult && !previewLoading && (
                  <motion.div
                    className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border-2 border-blue-200/60 shadow-lg flex flex-col"
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                  <div className="flex flex-col">
                    <h4 className="flex items-center gap-3 text-xl font-bold text-blue-900 mb-2 flex-shrink-0">
                      <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg flex-shrink-0">
                        {filePreviewResult.isScannedPdf ? (
                          <AlertTriangle className="w-7 h-7 text-white" />
                        ) : (
                          <CheckCircle className="w-7 h-7 text-white" />
                        )}
                      </span>
                      <span>
                        {filePreviewResult.isScannedPdf
                          ? '⚠️ 检测到扫描版PDF'
                          : '文件读取成功！'}
                      </span>
                    </h4>
                    <div className="grid grid-cols-3 gap-3 mb-3 flex-shrink-0">
                      <div className="text-center bg-white/60 rounded-lg p-3 border border-blue-200/40">
                        <div className="text-sm text-blue-600 font-medium mb-1">文件名</div>
                        <div className="text-xs text-gray-700 font-semibold truncate">{filePreviewResult.fileName}</div>
                      </div>
                      <div className="text-center bg-white/60 rounded-lg p-3 border border-blue-200/40">
                        <div className="text-sm text-blue-600 font-medium mb-1">文件类型</div>
                        <div className="text-xs text-gray-900 font-bold">{filePreviewResult.fileType}</div>
                      </div>
                      <div className="text-center bg-white/60 rounded-lg p-3 border border-blue-200/40">
                        <div className="text-sm text-blue-600 font-medium mb-1">内容长度</div>
                        <div className="text-xs text-gray-900 font-bold">{filePreviewResult.content.length} 字符</div>
                      </div>
                    </div>

                    {filePreviewResult.formatWarnings && filePreviewResult.formatWarnings.length > 0 && (
                      <div
                      className={clsx(
                          'rounded-lg p-3 mb-3 border-2 flex-shrink-0',
                          filePreviewResult.isScannedPdf
                            ? 'bg-red-50 border-red-300'
                            : 'bg-orange-50 border-orange-300'
                        )}
                      >
                        <h5
                          className={clsx(
                            'text-sm font-bold mb-2 flex items-center gap-2',
                            filePreviewResult.isScannedPdf ? 'text-red-800' : 'text-orange-800'
                          )}
                        >
                          <AlertTriangle className="w-4 h-4" />
                          {filePreviewResult.isScannedPdf ? '严重警告' : '格式提示'}
                        </h5>
                        <ul
                          className={clsx(
                            'text-xs space-y-1.5',
                            filePreviewResult.isScannedPdf ? 'text-red-700' : 'text-orange-700'
                          )}
                        >
                          {filePreviewResult.formatWarnings.map((warning, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="mt-0.5">•</span>
                              <span>{warning}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(filePreviewResult.hasImages || filePreviewResult.fileType === 'DOCX') && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 flex-shrink-0">
                        <p className="text-xs text-blue-800 font-medium flex items-start gap-2">
                          <span className="text-blue-500 mt-0.5">💡</span>
                          <span>
                            {filePreviewResult.fileType === 'DOCX' && '已尽可能保留表格、列表、标题等格式结构。'}
                            {filePreviewResult.hasImages && '图片内容无法直接提取，AI将基于文本内容生成需求。如需包含图片描述，请在"补充业务规则"中手动添加。'}
                          </span>
                        </p>
                      </div>
                    )}

                    <div className="bg-white rounded-lg border border-blue-200 p-4 flex flex-col">
                      <div className="flex items-center justify-between mb-3 flex-shrink-0">
                        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" />
                          文件内容
                          <span className="text-xs text-gray-400 font-normal ml-2">
                            {filePreviewResult.content?.length || 0} 字 · {filePreviewResult.content?.split('\n').length || 0} 行
                          </span>
                        </h3>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                            <button
                              onClick={() => setFilePreviewMode('preview')}
                              className={clsx(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                                filePreviewMode === 'preview'
                                  ? 'bg-white text-blue-600 shadow-sm'
                                  : 'text-gray-600 hover:text-gray-900'
                              )}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              预览
                            </button>
                            <button
                              onClick={() => setFilePreviewMode('edit')}
                              className={clsx(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                                filePreviewMode === 'edit'
                                  ? 'bg-white text-blue-600 shadow-sm'
                                  : 'text-gray-600 hover:text-gray-900'
                              )}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              编辑
                            </button>
                          </div>

                          <button
                            onClick={handleCopyFileContent}
                            className={clsx(
                              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                              fileContentCopied
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                            )}
                          >
                            {fileContentCopied ? (
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
                          <button
                            onClick={handleClearPreview}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                          >
                            <X className="w-3.5 h-3.5" />
                            关闭
                          </button>
                        </div>
                      </div>

                      <div
                        className="bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto select-text"
                        style={{ maxHeight: '400px' }}
                      >
                        {filePreviewMode === 'preview' ? (
                          (filePreviewResult.fileType === 'Markdown' ||
                            filePreviewResult.fileType === 'DOCX' ||
                            filePreviewResult.content.includes('# ') ||
                            filePreviewResult.content.includes('## ')) ? (
                            <div
                              className="prose prose-slate max-w-none prose-sm select-text
                                prose-headings:text-gray-900
                                prose-h1:text-xl prose-h1:font-bold prose-h1:mb-3 prose-h1:border-b prose-h1:border-gray-200 prose-h1:pb-2
                                prose-h2:text-lg prose-h2:font-semibold prose-h2:mt-4 prose-h2:mb-2 prose-h2:text-blue-700
                                prose-h3:text-base prose-h3:font-semibold prose-h3:mt-3 prose-h3:mb-2
                                prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-2
                                prose-ul:my-2 prose-ol:my-2
                                prose-li:text-gray-700 prose-li:my-0.5
                                prose-strong:text-gray-900
                                prose-table:w-full prose-table:border-collapse prose-table:text-xs prose-table:my-3
                                prose-thead:bg-blue-50
                                prose-th:border prose-th:border-gray-300 prose-th:p-2 prose-th:text-left prose-th:font-semibold
                                prose-td:border prose-td:border-gray-300 prose-td:p-2
                                prose-img:max-w-full prose-img:h-auto prose-img:rounded-lg prose-img:shadow-sm"
                              dangerouslySetInnerHTML={{
                                __html: marked.parse(filePreviewResult.content) as string
                              }}
                            />
                          ) : (
                            <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words font-mono max-w-full overflow-wrap-anywhere select-text">
                              {filePreviewResult.content}
                            </pre>
                          )
                        ) : (
                          <textarea
                            value={filePreviewResult.content}
                            onChange={(e) => {
                              const newContent = e.target.value;
                              setFilePreviewResult(prev =>
                                prev ? { ...prev, content: newContent } : null
                              );
                              // 同步更新 inputText，确保 AI 生成使用编辑后的内容
                              setInputText(newContent);
                            }}
                            className="w-full h-full min-h-[350px] bg-white border border-gray-300 rounded-lg p-3 text-xs text-gray-700 font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            placeholder="在此编辑文件内容..."
                            spellCheck={false}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: AI 生成 */}
        {currentStep === 1 && (
          <div className="h-full min-h-0 bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
            {/* 顶部：当前模型 */}
            <div className="flex-shrink-0 px-3 pt-3 pb-2">
              <div className="w-full flex items-center justify-end">
                <Tooltip title="在系统设置中更改 AI 模型">
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-bg-secondary)] text-xs text-[var(--color-text-secondary)] cursor-default"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>当前模型: {currentModelName || '加载中...'}</span>
                  </div>
                </Tooltip>
              </div>
            </div>

            {/* 中间区域：空状态 / 生成中 AIThinking 垂直居中；有结果时占满 */}
            <div
              className={clsx(
                'flex-1 min-h-0 flex flex-col px-3',
                generating ? 'pb-0' : 'pb-3'
              )}
            >
              {/* 生成结果 */}
              {generatedContent && !generating && (
              <div className="flex-1 min-h-0 flex flex-col border border-[var(--color-border)] rounded-lg overflow-hidden">
                {/* 右上角：预览/编辑切换 */}
                <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">
                    需求文档内容
                  </div>
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                        !isEditing ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                      )}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      预览
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(true);
                      }}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                        isEditing ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                      )}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      编辑
                    </button>
                  </div>
                </div>
                {isEditing ? (
                  <TextArea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="!border-0 !rounded-none flex-1 min-h-0"
                    autoSize={false}
                  />
                ) : (
                  <div
                    className="flex-1 min-h-0 prose prose-sm max-w-none dark:prose-invert p-6 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: renderedMarkdown as string }}
                  />
                )}
              </div>
            )}

            {!generatedContent && !generating && (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-4 min-h-[12rem] text-[var(--color-text-secondary)]">
                <Bot className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-base mb-1">AI 将基于上一步输入的内容自动生成结构化需求文档</p>
                <p className="text-xs opacity-60 mt-2">
                  可在下方点击「生成需求文档」开始生成
                </p>
              </div>
            )}

            {generating && (
              <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-2 py-6 w-full max-w-lg mx-auto">
                <AIThinking
                  title="AI 正在分析并生成需求文档"
                  subtitle={`${getGenerateSubtitle()}${generateProgress.message ? ` · ${generateProgress.message}` : ''}`}
                  progressItems={(() => {
                    const phase = generateProgress.phase;
                    const chunkFlow = isChunkMergeProgress(generateProgress);
                    const step1Done =
                      phase === 'preprocess' ||
                      phase === 'generating' ||
                      phase === 'finalizing' ||
                      phase === 'chunking' ||
                      phase === 'chunk_progress' ||
                      phase === 'merging' ||
                      phase === 'done';
                    const step2Status: 'completed' | 'processing' | 'pending' = chunkFlow
                      ? phase === 'chunking' || phase === 'chunk_progress'
                        ? 'processing'
                        : phase === 'merging' || phase === 'done'
                          ? 'completed'
                          : 'pending'
                      : phase === 'generating'
                        ? 'processing'
                        : phase === 'finalizing' || phase === 'done'
                          ? 'completed'
                          : 'pending';
                    const step3Status: 'completed' | 'processing' | 'pending' = chunkFlow
                      ? phase === 'merging'
                        ? 'processing'
                        : phase === 'done'
                          ? 'completed'
                          : 'pending'
                      : phase === 'finalizing'
                        ? 'processing'
                        : phase === 'done'
                        ? 'completed'
                        : 'pending';
                    return [
                      {
                        label: '读取并净化原始文本',
                        status: step1Done ? 'completed' : 'processing'
                      },
                      {
                        label: getChunkProgressLabel(),
                        status: step2Status
                      },
                      {
                        label: chunkFlow ? '合并结果并生成文档' : '整理并输出需求文档',
                        status: step3Status
                      }
                    ];
                  })()}
                />
              </div>
            )}
            </div>

            {/* 底部：生成进度条，与卡片底边融合 */}
            {generating && (
              <div className="flex-shrink-0 w-full border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]/60">
                <div className="px-3 pt-2.5 pb-2 relative">
                  <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-2">
                    <span>生成进度</span>
                    <span>{getGeneratePercent()}%</span>
                  </div>
                  <div className="relative h-1 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500"
                      style={{ width: `${getGeneratePercent()}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: 保存 */}
        {currentStep === 2 && (
          <div className="h-full bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] p-4 space-y-3 flex flex-col">
            <div className="flex items-end gap-4">
              {/* 需求文档标题 */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  需求文档标题 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入需求文档标题"
                  style={{ height: '40px' }}
                />
              </div>
              
              {/* 关联项目 */}
              <div style={{ width: '25%' }}>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  关联项目 <span className="text-red-500">*</span>
                </label>
                <Select
                  value={selectedProject}
                  onChange={(value) => handleProjectChange(value !== undefined ? Number(value) : undefined)}
                  placeholder="选择关联项目"
                  size="large"
                  style={{ width: '100%' }}
                  options={projects.map(p => ({ label: p.name, value: p.id }))}
                />
              </div>

              {/* 关联版本 */}
              <div style={{ width: '25%' }}>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  关联版本 <span className="text-red-500">*</span>
                </label>
                <Select
                  value={selectedProjectVersionId}
                  onChange={(value) => handleVersionChange(value !== undefined ? Number(value) : undefined)}
                  placeholder={selectedProject ? '选择对应版本' : '先选择项目'}
                  size="large"
                  style={{ width: '100%' }}
                  disabled={!selectedProject || selectedProjectVersions.length === 0}
                  options={selectedProjectVersions.map(v => ({
                    label: `${v.version_name ?? ''}${v.version_code ? ` (${v.version_code})` : ''}`,
                    value: v.id
                  }))}
                />
              </div>
            </div>

            {/* 预览生成的内容 */}
            <div className="flex-1 min-h-0 flex flex-col">
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                文档内容预览
              </label>
              <div
                className="flex-1 min-h-0 prose prose-sm max-w-none dark:prose-invert p-5 border border-[var(--color-border)] rounded-lg overflow-y-auto bg-[var(--color-bg-secondary)]"
                dangerouslySetInnerHTML={{ __html: renderedMarkdown as string }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 底部导航 */}
      <div className="flex-shrink-0 flex flex-wrap justify-between items-center gap-3 bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] p-3">
        <motion.button
          onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
          disabled={currentStep === 0}
          className="flex items-center gap-2 px-4 py-2 border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--color-text-primary)]"
          whileHover={{ scale: currentStep === 0 ? 1 : 1.02 }}
        >
          <ArrowLeft className="h-4 w-4" />
          上一步
        </motion.button>
        {/* <motion.button
          onClick={() => navigate('/requirement-docs')}
          className="text-sm text-purple-600 hover:text-purple-700 hover:underline transition-colors"
        >
          查看已保存的需求文档 &rarr;
        </motion.button> */}
        {currentStep < 2 ? (
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Step 2 专属：生成/编辑按钮放到底部，与上一步/下一步同区域 */}
            {currentStep === 1 && (
              <>
                {!generatedContent && !generating && (
                  <motion.button
                    onClick={handleGenerate}
                    disabled={!inputText.trim() || generating}
                    className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    whileHover={{ scale: !inputText.trim() || generating ? 1 : 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Bot className="h-4 w-4" />
                    生成需求文档
                  </motion.button>
                )}

                {generatedContent && !generating && (
                  <motion.button
                    onClick={handleGenerate}
                    disabled={generating || !inputText.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <RefreshCw className="h-4 w-4" />
                    重新生成
                  </motion.button>
                )}

                {generating && (
                  <motion.button
                    onClick={handleCancelGenerate}
                    className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                  >
                    <X className="h-4 w-4" />
                    取消生成
                  </motion.button>
                )}
              </>
            )}

            <motion.button
              onClick={() => setCurrentStep(prev => Math.min(2, prev + 1))}
              disabled={!canGoNext()}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              whileHover={{ scale: canGoNext() ? 1.02 : 1 }}
            >
              下一步
              <ArrowRight className="h-4 w-4" />
            </motion.button>
          </div>
        ) : (
          <motion.button
            onClick={handleSave}
            disabled={saving || !title.trim() || !selectedProject || !selectedProjectVersionId}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
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
        )}
      </div>
    </div>
  );
}

export default RequirementAnalysis;
