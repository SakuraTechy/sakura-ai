import React, { useState, useEffect } from 'react';
import { Modal, Button, Spin, Empty, Segmented, Space, message, Tooltip } from 'antd';
import {
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons';
import { marked } from 'marked';

// 内容详情接口
export interface ContentDetail {
  title: string;
  summary?: string;
  sourceUrl?: string;
  contentText?: string;
  contentMarkdown?: string;
  contentHtml?: string;
  contentRawHtml?: string;
  extractionMeta?: {
    strategy?: string;
    durationMs?: number;
    errorMessage?: string;
  };
}

// 组件属性接口
interface ContentViewerModalProps {
  open: boolean;
  loading?: boolean;
  summaryLoading?: boolean;
  content: ContentDetail | null;
  onClose: () => void;
  onConvert?: () => void;
  convertButtonText?: string;
  convertLoading?: boolean;
  convertDisabled?: boolean;
  showConvertButton?: boolean;
  extraFooter?: React.ReactNode;
}

// 预览模式类型
type PreviewMode = 'markdown' | 'raw' | 'html_sanitized' | 'html_iframe';

// 预览模式选项
const PREVIEW_MODE_OPTIONS: Array<{ label: string; value: PreviewMode }> = [
  { label: '原文（纯文本）', value: 'raw' },
  { label: 'HTML（原貌）', value: 'html_iframe' },
  { label: 'HTML（清洗）', value: 'html_sanitized' },
  { label: 'Markdown 预览', value: 'markdown' },
];

const PREVIEW_MODES = new Set<PreviewMode>(['markdown', 'raw', 'html_sanitized', 'html_iframe']);
const PREVIEW_MODE_KEY = 'contentViewerPreviewMode';

/**
 * 标准化 Markdown 内容
 */
function normalizeMarkdownBody(content?: string): string {
  if (!content) return '';
  return content.trim();
}

/**
 * 清洗 HTML 内容，移除危险标签和属性
 */
function sanitizeHtmlForPreview(raw?: string): string {
  if (!raw) return '';
  let html = raw;
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
  
  if (!looksHtml) {
    const normalized = normalizeMarkdownBody(raw);
    return marked(normalized, { breaks: true }) as string;
  }
  
  html = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/\shref\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, ' href="#"')
    .replace(/\ssrc\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, '');
  
  return html;
}

/**
 * 为 iframe 准备 HTML 文档
 */
function prepareIframeSrcDocHtml(content: string, sourceUrl?: string): string {
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(content);
  
  if (looksHtml) {
    // 如果有源 URL，注入 base 标签以正确加载相对路径资源
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        const baseUrl = `${url.protocol}//${url.host}`;
        if (!/<base\s/i.test(content)) {
          content = content.replace(
            /(<head[^>]*>)/i,
            `$1<base href="${baseUrl}" />`
          );
        }
      } catch {
        // URL 解析失败，忽略
      }
    }
    return content;
  }
  
  // 如果不是 HTML，转换为 Markdown 预览
  const body = marked(normalizeMarkdownBody(content), { breaks: true }) as string;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #1f2937;
      line-height: 1.9;
      padding: 16px 20px;
      background: #fff;
    }
    img {
      max-width: 100%;
      border-radius: 8px;
    }
    pre {
      background: #0b1020;
      color: #fff;
      padding: 12px;
      border-radius: 8px;
      overflow: auto;
    }
    blockquote {
      border-left: 4px solid #8fa1d0;
      background: #faf7fb;
      padding: 10px 14px;
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

/**
 * 统一的内容查看弹窗组件
 * 支持多种预览模式：Markdown、纯文本、HTML清洗、HTML原貌
 */
export const ContentViewerModal: React.FC<ContentViewerModalProps> = ({
  open,
  loading = false,
  summaryLoading = false,
  content,
  onClose,
  onConvert,
  convertButtonText = '一键转需求文档',
  convertLoading = false,
  convertDisabled = false,
  showConvertButton = true,
  extraFooter,
}) => {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('markdown');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 加载保存的预览模式
  useEffect(() => {
    if (!open) return;
    try {
      const saved = localStorage.getItem(PREVIEW_MODE_KEY);
      if (saved && PREVIEW_MODES.has(saved as PreviewMode)) {
        setPreviewMode(saved as PreviewMode);
      } else {
        setPreviewMode('markdown');
      }
    } catch {
      setPreviewMode('markdown');
    }
  }, [open]);

  // 保存预览模式
  const handlePreviewModeChange = (mode: PreviewMode) => {
    setPreviewMode(mode);
    try {
      localStorage.setItem(PREVIEW_MODE_KEY, mode);
    } catch {
      // 忽略存储错误
    }
  };

  // 计算布局高度
  const layoutHeight = isFullscreen ? 'calc(100vh - 150px)' : 'calc(100vh - 200px)';
  const iframeMinHeight = isFullscreen ? 'calc(100vh - 310px)' : 'calc(100vh - 360px)';

  // 渲染内容
  const renderContent = () => {
    if (!content) {
      return <Empty description="暂无内容" />;
    }

    const contentToRender = normalizeMarkdownBody(
      content.contentMarkdown || content.contentText
    );

    if (!contentToRender) {
      return <Empty description="暂无正文内容" />;
    }

    switch (previewMode) {
      case 'raw':
        return (
          <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-700 m-0">
            {content.contentText}
          </pre>
        );

      case 'html_sanitized':
        return (
          <div
            className="prose prose-slate max-w-none prose-sm
              prose-img:max-w-full prose-img:rounded-lg prose-img:my-4"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtmlForPreview(
                content.contentHtml || content.contentText
              ),
            }}
          />
        );

      case 'html_iframe':
        return (
          <iframe
            title="html-preview"
            className="w-full rounded-lg border border-gray-200"
            style={{ minHeight: iframeMinHeight, background: '#fff' }}
            sandbox="allow-scripts allow-popups"
            referrerPolicy="unsafe-url"
            srcDoc={prepareIframeSrcDocHtml(
              content.contentRawHtml || content.contentHtml || content.contentText || '',
              content.sourceUrl
            )}
          />
        );

      case 'markdown':
      default:
        return (
          <div
            className="prose prose-slate max-w-none prose-sm
              prose-headings:text-gray-900 prose-headings:scroll-mt-24
              prose-h1:text-[38px] prose-h1:leading-tight prose-h1:font-extrabold prose-h1:mb-6 prose-h1:mt-2
              prose-h2:text-[32px] prose-h2:leading-tight prose-h2:font-extrabold prose-h2:mt-10 prose-h2:mb-5 prose-h2:text-[#1f4db8]
              prose-h3:text-[26px] prose-h3:leading-snug prose-h3:font-bold prose-h3:mt-8 prose-h3:mb-4 prose-h3:text-[#1f4db8]
              prose-p:text-[#1f2937] prose-p:text-[20px] prose-p:leading-[2.0] prose-p:my-5
              prose-ul:my-4 prose-ol:my-4
              prose-li:text-[#1f2937] prose-li:text-[19px] prose-li:leading-[1.9] prose-li:my-2
              prose-strong:text-gray-900
              prose-a:text-[#1f4db8] prose-a:no-underline hover:prose-a:underline
              prose-blockquote:border-l-4 prose-blockquote:border-[#8fa1d0] prose-blockquote:bg-[#faf7fb] prose-blockquote:px-5 prose-blockquote:py-3 prose-blockquote:my-6 prose-blockquote:text-[20px] prose-blockquote:leading-[1.9] prose-blockquote:font-normal
              prose-hr:my-8 prose-hr:border-[#b8c7ee]
              prose-code:text-[16px] prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
              prose-pre:bg-[#0b1020] prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:p-4
              prose-table:w-full prose-table:border-collapse prose-table:text-sm prose-table:my-5
              prose-thead:bg-blue-50
              prose-th:border prose-th:border-gray-300 prose-th:px-3 prose-th:py-2.5 prose-th:text-left prose-th:font-semibold
              prose-td:border prose-td:border-gray-300 prose-td:px-3 prose-td:py-2.5
              prose-img:max-w-full prose-img:rounded-lg prose-img:shadow-sm prose-img:border prose-img:border-gray-200 prose-img:mx-auto prose-img:my-4"
            dangerouslySetInnerHTML={{
              __html: marked(contentToRender, { breaks: true }) as string,
            }}
          />
        );
    }
  };

  return (
    <Modal
      open={open}
      title="内容查看"
      onCancel={() => {
        onClose();
        setIsFullscreen(false);
      }}
      footer={
        <div className="flex items-center w-full gap-4">
          {/* 抓取元信息 - 左侧 */}
          {content?.extractionMeta && (
            <div className="flex-1 min-w-0 text-xs text-gray-400 truncate text-left pl-3">
              抓取策略：{content.extractionMeta.strategy || '-'}
              {' · '}
              耗时：{content.extractionMeta.durationMs ?? '-'}ms
              {content.sourceUrl && (
                <>
                  {' · '}
                  来源：
                  <a
                    href={content.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    {content.sourceUrl}
                  </a>
                </>
              )}
              {content.extractionMeta.errorMessage && (
                <span className="text-red-400"> · {content.extractionMeta.errorMessage}</span>
              )}
            </div>
          )}
          <Space className="ml-auto" size="large">
            <Button onClick={() => {
              onClose();
              setIsFullscreen(false);
            }}>
              关闭
            </Button>
            {showConvertButton && onConvert && (
              <Button
                type="primary"
                loading={convertLoading}
                disabled={convertDisabled || !content || loading}
                onClick={onConvert}
              >
                {convertButtonText}
              </Button>
            )}
          </Space>
        </div>
      }
      centered
      width={isFullscreen ? '96vw' : 'min(96vw, 1200px)'}
      style={{ paddingBottom: 0 }}
      styles={{
        body: {
          maxHeight: isFullscreen ? 'calc(100vh - 120px)' : 'calc(100vh - 150px)',
          overflow: 'hidden',
        },
        footer: {
          marginTop: 5,
          paddingLeft: 5,
          paddingRight: 20,
        },
      }}
    >
      <Spin spinning={loading}>
        {loading && !content ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-5" style={{ minHeight: 240 }}>
            {/* 主图标 + 标题 */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-2xl">🤖</span>
              </div>
              <div className="text-base font-semibold text-gray-800">AI 正在抓取并分析文章内容</div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
            {/* 骨架屏 */}
            <div className="w-full max-w-lg space-y-2.5 px-6">
              <div className="h-3.5 bg-blue-100 rounded-full animate-pulse w-full" />
              <div className="h-3.5 bg-blue-100 rounded-full animate-pulse w-5/6" />
              <div className="h-3.5 bg-blue-100 rounded-full animate-pulse w-4/6" />
              <div className="h-3.5 bg-gray-100 rounded-full animate-pulse w-3/4 mt-4" />
              <div className="h-3.5 bg-gray-100 rounded-full animate-pulse w-full" />
              <div className="h-3.5 bg-gray-100 rounded-full animate-pulse w-2/3" />
            </div>
            {/* 底部说明 */}
            <div className="text-sm text-blue-500 font-medium">AI 正在智能提炼文章摘要，请稍候...</div>
          </div>
        ) : !content ? (
          <Empty description="暂无内容" />
        ) : (
          <div className="space-y-3 flex flex-col p-3" style={{ height: layoutHeight }}>
            {/* 标题和摘要 */}
            <div className="bg-gray-50 rounded-lg pt-0">
              <div className="text-lg font-semibold text-gray-900">{content.title}</div>
              {summaryLoading ? (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-blue-500">
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    AI 正在分析总结...
                  </div>
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-full" />
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-5/6" />
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-4/6" />
                  <div className="mt-1 text-xs text-gray-400">AI 正在智能提炼文章摘要，请稍候...</div>
                </div>
              ) : (
                content.summary && (
                  <Tooltip title={content.summary} placement="bottom" overlayStyle={{ maxWidth: 600 }}>
                    <div className="text-sm text-gray-600 mt-1 line-clamp-5 cursor-help">{content.summary}</div>
                  </Tooltip>
                )
              )}
            </div>

            {/* 元信息区域 - 移到顶部 */}
            {/* {extraFooter && (
              <div className="bg-gray-50 rounded-lg pt-0">
                {extraFooter}
              </div>
            )} */}

            {/* 工具栏 */}
            <div className="flex items-center justify-between gap-2">
              <Segmented
                value={previewMode}
                onChange={(value) => handlePreviewModeChange(value as PreviewMode)}
                options={PREVIEW_MODE_OPTIONS}
              />
              <Button
                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={() => setIsFullscreen((prev) => !prev)}
              >
                {isFullscreen ? '退出全屏' : '全屏阅读'}
              </Button>
            </div>

            {/* 内容区域 */}
            <div
              className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm overflow-y-auto"
              style={{ flex: 1, minHeight: 0 }}
            >
              {renderContent()}
            </div>
          </div>
        )}
      </Spin>
    </Modal>
  );
};

export default ContentViewerModal;
