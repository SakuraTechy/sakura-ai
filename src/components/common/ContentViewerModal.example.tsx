/**
 * ContentViewerModal 使用示例
 * 
 * 这个文件展示了如何在行业资讯、市场洞察等场景中使用统一的内容查看弹窗组件
 */

import React, { useState } from 'react';
import { Button, message } from 'antd';
import { ContentViewerModal, ContentDetail } from './ContentViewerModal';

// ============ 示例 1: 行业资讯查看 ============
export const IndustryNewsExample: React.FC = () => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<ContentDetail | null>(null);

  const handleViewNews = async (url: string, title: string) => {
    setViewerOpen(true);
    setLoading(true);
    
    try {
      // 调用深读 API
      const response = await fetch(`/api/insights/deep-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title }),
      });
      
      const data = await response.json();
      setContent({
        title: data.title,
        summary: data.summary,
        sourceUrl: data.sourceUrl,
        contentText: data.contentText,
        contentMarkdown: data.contentMarkdown,
        contentHtml: data.contentHtml,
        contentRawHtml: data.contentRawHtml,
        extractionMeta: data.extractionMeta,
      });
    } catch (err: any) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToRequirement = async () => {
    try {
      // 调用转换 API
      await fetch('/api/requirements/convert-from-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: content?.title,
          content: content?.contentMarkdown || content?.contentText,
        }),
      });
      
      message.success('已成功转化为需求文档');
      setViewerOpen(false);
    } catch (err: any) {
      message.error(err.message || '转换失败');
    }
  };

  return (
    <div>
      <Button onClick={() => handleViewNews('https://example.com/news', 'AI技术应用实践')}>
        查看资讯
      </Button>

      <ContentViewerModal
        open={viewerOpen}
        loading={loading}
        content={content}
        onClose={() => setViewerOpen(false)}
        onConvert={handleConvertToRequirement}
        convertButtonText="一键转需求文档"
        showConvertButton={true}
      />
    </div>
  );
};

// ============ 示例 2: 市场洞察深读 ============
export const MarketInsightExample: React.FC = () => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<ContentDetail | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);

  const handleDeepRead = async (url: string, title: string) => {
    setViewerOpen(true);
    setLoading(true);
    
    try {
      const response = await fetch(`/api/insights/deep-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title }),
      });
      
      const data = await response.json();
      setContent(data);
    } catch (err: any) {
      message.error(err.message || '深读失败');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRequirement = async () => {
    if (!content) return;
    
    setConvertLoading(true);
    try {
      await fetch('/api/requirements/generate-from-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: content.title,
          content: content.contentMarkdown || content.contentText,
          summary: content.summary,
        }),
      });
      
      message.success('需求文档已生成成功');
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setConvertLoading(false);
    }
  };

  return (
    <div>
      <Button onClick={() => handleDeepRead('https://example.com/article', '市场趋势分析')}>
        深读文章
      </Button>

      <ContentViewerModal
        open={viewerOpen}
        loading={loading}
        content={content}
        onClose={() => setViewerOpen(false)}
        onConvert={handleGenerateRequirement}
        convertButtonText="一键转需求文档"
        convertLoading={convertLoading}
        showConvertButton={true}
      />
    </div>
  );
};

// ============ 示例 3: 纯内容查看（不带转换功能） ============
export const SimpleViewerExample: React.FC = () => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [content] = useState<ContentDetail>({
    title: '示例文档',
    summary: '这是一个示例文档的摘要',
    contentMarkdown: `
# 标题

这是正文内容...

## 子标题

- 列表项 1
- 列表项 2
    `,
    sourceUrl: 'https://example.com',
  });

  return (
    <div>
      <Button onClick={() => setViewerOpen(true)}>
        查看内容
      </Button>

      <ContentViewerModal
        open={viewerOpen}
        content={content}
        onClose={() => setViewerOpen(false)}
        showConvertButton={false}
      />
    </div>
  );
};

// ============ 示例 4: 带自定义底部操作 ============
export const CustomFooterExample: React.FC = () => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [content] = useState<ContentDetail>({
    title: '技术文档',
    contentMarkdown: '# 技术文档内容',
  });

  return (
    <div>
      <Button onClick={() => setViewerOpen(true)}>
        查看文档
      </Button>

      <ContentViewerModal
        open={viewerOpen}
        content={content}
        onClose={() => setViewerOpen(false)}
        showConvertButton={false}
        extraFooter={
          <div className="text-sm text-gray-500">
            <span>阅读进度：100%</span>
            <span className="ml-4">字数：1234</span>
          </div>
        }
      />
    </div>
  );
};
