import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Upload, Trash2, ExternalLink, Calendar, Tag, Eye, X, FileUp
} from 'lucide-react';
import { Modal, Input, Select, Pagination, Spin, Empty, Tag as AntTag, Upload as AntUpload, Tooltip } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { marked } from 'marked';
import { clsx } from 'clsx';
import { insightsService, InsightsArticle } from '../services/insightsService';
import { useAuth } from '../contexts/AuthContext';
import { showToast } from '../utils/toast';

const CATEGORY_COLORS: Record<string, string> = {
  '人工智能': 'blue',
  '安全动态': 'red',
  '其他': 'default',
  '软件工程': 'green',
  '开源工具': 'purple',
  '云计算': 'cyan',
  '前端技术': 'orange',
  '后端技术': 'geekblue',
  '数据库': 'gold',
};

const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  'market_insight': { label: '市场洞察', color: 'volcano' },
  'digest_import': { label: '日报导入', color: 'purple' },
  'manual': { label: '手动创建', color: 'cyan' },
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || 'default';
}

function getSourceConfig(source?: string | null) {
  if (!source) return { label: '日报导入', color: 'purple' };
  return SOURCE_CONFIG[source] || { label: source, color: 'default' };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function RequirementInsights() {
  const { isSuperAdmin } = useAuth();

  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<InsightsArticle[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [currentArticle, setCurrentArticle] = useState<InsightsArticle | null>(null);

  const [importLoading, setImportLoading] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchArticles = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const result = await insightsService.getArticles({
        page,
        pageSize,
        search: searchTerm,
        category: selectedCategory,
        source: selectedSource
      });
      setArticles(result.data);
      setPagination(result.pagination);
    } catch (error: any) {
      showToast.error(error.message || '获取文章列表失败');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedCategory, selectedSource]);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await insightsService.getCategories();
      setCategories(cats);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchArticles(pagination.page, pagination.pageSize);
  }, [fetchArticles]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 300);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSourceChange = (value: string) => {
    setSelectedSource(value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (page: number, pageSize: number) => {
    setPagination(prev => ({ ...prev, page, pageSize }));
    fetchArticles(page, pageSize);
  };

  const handleViewArticle = async (article: InsightsArticle) => {
    setDetailModalOpen(true);
    setDetailLoading(true);
    try {
      const detail = await insightsService.getArticleDetail(article.id);
      setCurrentArticle(detail);
    } catch (error: any) {
      showToast.error('获取文章详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleBatchImport = async (file: File) => {
    setImportLoading(true);
    try {
      const result = await insightsService.batchImportArticles(file);
      showToast.success(result.message || `成功导入 ${result.count} 篇文章`);
      fetchArticles(1, pagination.pageSize);
      fetchCategories();
    } catch (error: any) {
      showToast.error(error.message || '批量导入失败');
    } finally {
      setImportLoading(false);
    }
    return false;
  };

  const handleDeleteArticle = async (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这篇文章吗？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await insightsService.deleteArticle(id);
          showToast.success('文章已删除');
          fetchArticles(pagination.page, pagination.pageSize);
        } catch (error: any) {
          showToast.error(error.message || '删除失败');
        }
      }
    });
  };

  const renderedMarkdown = currentArticle?.content
    ? marked(currentArticle.content, { breaks: true })
    : '';

  return (
    <div className="space-y-6">
      {/* 页面标题和操作 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">行业资讯</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">汇聚行业动态与技术文章，来自市场洞察自动抓取和日报导入</p>
        </div>
        {isSuperAdmin && (
          <AntUpload
            accept=".md,.markdown"
            showUploadList={false}
            beforeUpload={(file) => { handleBatchImport(file); return false; }}
          >
            <motion.button
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={importLoading}
            >
              {importLoading ? <Spin size="small" /> : <FileUp className="h-4 w-4" />}
              <span>批量导入</span>
            </motion.button>
          </AntUpload>
        )}
      </div>

      {/* 筛选栏 */}
      <div className="bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="搜索文章标题..."
              prefix={<Search className="h-4 w-4 text-gray-400" />}
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              allowClear
            />
          </div>
          <Select
            placeholder="全部分类"
            value={selectedCategory || undefined}
            onChange={handleCategoryChange}
            allowClear
            style={{ width: 160 }}
            options={[
              ...categories.map(c => ({ label: c, value: c }))
            ]}
          />
          <Select
            placeholder="全部来源"
            value={selectedSource || undefined}
            onChange={handleSourceChange}
            allowClear
            style={{ width: 140 }}
            options={[
              { label: '市场洞察', value: 'market_insight' },
              { label: '日报导入', value: 'digest_import' },
              { label: '手动创建', value: 'manual' },
            ]}
          />
        </div>
      </div>

      {/* 数据列表 */}
      <div className="bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Spin size="large" />
          </div>
        ) : articles.length === 0 ? (
          <div className="py-20">
            <Empty description="暂无文章数据" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--color-bg-secondary)]">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-secondary)]">执行时间</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-secondary)]">分类</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-secondary)]">来源</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-secondary)]">报告标题</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-secondary)]">摘要</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-secondary)]">操作</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {articles.map((article, index) => (
                    <motion.tr
                      key={article.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(article.published_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <AntTag color={getCategoryColor(article.category)}>
                          {article.category}
                        </AntTag>
                      </td>
                      <td className="px-4 py-3">
                        <AntTag color={getSourceConfig(article.source).color} className="text-xs">
                          {getSourceConfig(article.source).label}
                        </AntTag>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-[var(--color-text-primary)]">
                          {article.title}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] max-w-xs truncate">
                        {article.summary || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Tooltip title="查看详情">
                            <motion.button
                              onClick={() => handleViewArticle(article)}
                              className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Eye className="h-4 w-4" />
                            </motion.button>
                          </Tooltip>
                          <Tooltip title="访问原文">
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Tooltip>
                          {isSuperAdmin && (
                            <Tooltip title="删除">
                              <motion.button
                                onClick={() => handleDeleteArticle(article.id)}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </motion.button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 分页 */}
      {pagination.total > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--color-text-secondary)]">
            共 {pagination.total} 条数据
          </span>
          <Pagination
            current={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            showSizeChanger
            pageSizeOptions={['10', '20', '50']}
            onChange={handlePageChange}
          />
        </div>
      )}

      {/* 文章详情弹窗 */}
      <Modal
        open={detailModalOpen}
        onCancel={() => { setDetailModalOpen(false); setCurrentArticle(null); }}
        footer={null}
        width={800}
        title={
          currentArticle ? (
            <div className="pr-8">
              <h3 className="text-lg font-semibold">{currentArticle.title}</h3>
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                <AntTag color={getCategoryColor(currentArticle.category)}>{currentArticle.category}</AntTag>
                <span>{formatDate(currentArticle.published_at)}</span>
                <a
                  href={currentArticle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 flex items-center gap-1"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  原文链接
                </a>
              </div>
            </div>
          ) : '文章详情'
        }
      >
        {detailLoading ? (
          <div className="flex justify-center py-12">
            <Spin size="large" />
          </div>
        ) : currentArticle ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert mt-4"
            dangerouslySetInnerHTML={{ __html: renderedMarkdown as string }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

export default RequirementInsights;
