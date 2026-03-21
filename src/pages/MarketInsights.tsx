import { useState, useEffect, useCallback, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  Table, Button, Input, Select, DatePicker, Space, Modal, Form, Switch,
  Tag, message, Popconfirm, Card, Descriptions, Upload, Spin, InputNumber, Tabs, Empty, Segmented
} from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined,
  DeleteOutlined, EyeOutlined, PlayCircleOutlined, FileTextOutlined,
  ArrowLeftOutlined, EditOutlined, ImportOutlined, FullscreenOutlined, FullscreenExitOutlined
} from '@ant-design/icons';
import { marked } from 'marked';
import dayjs from 'dayjs';
import {
  marketInsightService,
  MarketInsightTask,
  MarketInsightReport,
  CreateTaskParams,
  MarketSourceConfig,
} from '../services/marketInsightService';
import { insightsService, DeepReadDetail } from '../services/insightsService';
import { getApiBaseUrl } from '../config/api';
import { getProjectVersions } from '../services/systemService';
import {
  buildMarketInsightGroupedSelectOptions,
  marketInsightBuiltinSourceMap,
} from '../constants/marketInsightBuiltinSources';
import { MARKET_INSIGHT_TASK_LAYOUT } from '../constants/marketInsightTaskLayout';
import { MARKET_INSIGHT_CATEGORY_FILTER_OPTIONS } from '../constants/marketInsightCategories';
import { normalizeReportMarkdownBody } from '../utils/markdownReportNormalize';
import { prepareIframeSrcDocHtml } from '../utils/deepReadIframeHtml';
import { extractReportArticleLinks } from '../utils/marketInsightReportArticles';
import {
  MarketInsightQuickCreate,
  MARKET_INSIGHT_QUICK_CREATE_COPY,
} from '../components/marketInsight/MarketInsightQuickCreate';
import { AIThinking } from '../components/ai-generator/AIThinking';

/** 内置源下拉分组（模块级缓存，避免每次渲染重建） */
const GROUPED_MARKET_INSIGHT_SOURCE_OPTIONS = buildMarketInsightGroupedSelectOptions();

/** 多选变化时同步 builtin_urls：保留仍选中项的已填 URL，新选中的用默认地址 */
function syncBuiltinUrlsForSelection(
  prev: Record<string, string> | undefined,
  selectedIds: string[]
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const id of selectedIds) {
    const base = marketInsightBuiltinSourceMap.get(id);
    if (!base) continue;
    const kept = prev?.[id]?.trim();
    next[id] = kept || base.url;
  }
  return next;
}

/** Select 多选 value 规范为 string[]（过滤无效值） */
function normalizeSourceConfigIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((x) => {
      let id = '';
      if (typeof x === 'string') id = x;
      else if (x && typeof x === 'object' && 'value' in x) {
        const v = (x as { value: unknown }).value;
        id = typeof v === 'string' ? v : String(v ?? '');
      }
      return id.trim() || '';
    })
    .filter((id) => id && id !== 'undefined' && !seen.has(id) && seen.add(id));
}

function displayLabelForBuiltinTag(value: unknown, label: ReactNode): string {
  const id = value == null || value === 'undefined' ? '' : String(value).trim();
  if (!id) return '';
  const meta = marketInsightBuiltinSourceMap.get(id);
  if (meta?.name) return meta.name;
  if (typeof label === 'string' || typeof label === 'number') return String(label);
  return id;
}

const { RangePicker } = DatePicker;
const { TextArea } = Input;

type ViewType = 'reportList' | 'taskConfig' | 'reportDetail';

export function MarketInsights() {
  const [currentView, setCurrentView] = useState<ViewType>('reportList');
  const [editingTask, setEditingTask] = useState<MarketInsightTask | null>(null);
  const [viewingReport, setViewingReport] = useState<MarketInsightReport | null>(null);
  const [reportListTab, setReportListTab] = useState<'reports' | 'tasks'>('reports');

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      {currentView === 'reportList' && (
        <ReportListView
          defaultTab={reportListTab}
          onReportListTabChange={setReportListTab}
          onNewTask={() => { setEditingTask(null); setCurrentView('taskConfig'); }}
          onViewReport={(report) => { setViewingReport(report); setCurrentView('reportDetail'); }}
          onEditTask={(task) => { setEditingTask(task); setCurrentView('taskConfig'); }}
        />
      )}
      {currentView === 'taskConfig' && (
        <TaskConfigView
          task={editingTask}
          onBack={() => setCurrentView('reportList')}
          onSaved={() => { setReportListTab('tasks'); setCurrentView('reportList'); }}
        />
      )}
      {currentView === 'reportDetail' && viewingReport && (
        <ReportDetailView
          report={viewingReport}
          onBack={() => setCurrentView('reportList')}
        />
      )}
    </div>
  );
}

// ======================== 报告列表视图 ========================

const REPORT_POLL_INTERVAL_MS = 2000;
const REPORT_POLL_MAX_MS = 5 * 60 * 1000;

/** 与 `readFileContent`（需求分析页同款）支持的扩展名一致 */
const MARKET_REPORT_IMPORT_ACCEPT =
  '.md,.markdown,.txt,.html,.htm,.pdf,.docx,.doc,.json,.csv';
const MARKET_REPORT_IMPORT_EXT_RE =
  /\.(md|markdown|txt|html|htm|pdf|docx|doc|json|csv)$/i;

function ReportListView({
  defaultTab,
  onReportListTabChange,
  onNewTask,
  onViewReport,
  onEditTask,
}: {
  defaultTab: 'reports' | 'tasks';
  onReportListTabChange?: (tab: 'reports' | 'tasks') => void;
  onNewTask: () => void;
  onViewReport: (report: MarketInsightReport) => void;
  onEditTask: (task: MarketInsightTask) => void;
}) {
  const [activeTab, setActiveTab] = useState<'reports' | 'tasks'>(defaultTab);
  const reportPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reportPollBusyRef = useRef(false);
  const reportPollStartedAtRef = useRef(0);
  const [reports, setReports] = useState<MarketInsightReport[]>([]);
  const [tasks, setTasks] = useState<MarketInsightTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [importingReport, setImportingReport] = useState(false);
  const [selectedReportIds, setSelectedReportIds] = useState<number[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);

  const loadReports = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await marketInsightService.getReportList({
        page,
        pageSize: pagination.pageSize,
        search: searchText || undefined,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        startDate: dateRange?.[0]?.format('YYYY-MM-DD') || undefined,
        endDate: dateRange?.[1]?.format('YYYY-MM-DD') || undefined,
      });
      setReports(result.data);
      setPagination(result.pagination);
      setSelectedReportIds((prev) => prev.filter((id) => result.data.some((item: MarketInsightReport) => item.id === id)));
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, searchText, statusFilter, categoryFilter, dateRange]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await marketInsightService.getTaskList();
      setTasks(result.data);
      setSelectedTaskIds((prev) => prev.filter((id) => result.data.some((item: MarketInsightTask) => item.id === id)));
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const stopReportPolling = useCallback(() => {
    if (reportPollTimerRef.current) {
      clearInterval(reportPollTimerRef.current);
      reportPollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopReportPolling();
  }, [stopReportPolling]);

  useEffect(() => {
    if (activeTab === 'reports') loadReports();
    else loadTasks();
  }, [activeTab, loadReports, loadTasks]);

  const handleDeleteReport = async (id: number) => {
    try {
      await marketInsightService.deleteReport(id);
      message.success('报告已删除');
      loadReports(pagination.page);
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleDeleteTask = async (id: number) => {
    try {
      await marketInsightService.deleteTask(id);
      message.success('任务已删除');
      loadTasks();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleBatchDeleteReports = async () => {
    if (!selectedReportIds.length) return;
    try {
      await marketInsightService.batchDeleteReports(selectedReportIds);
      message.success(`已删除 ${selectedReportIds.length} 份报告`);
      setSelectedReportIds([]);
      loadReports(1);
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleBatchDeleteTasks = async () => {
    if (!selectedTaskIds.length) return;
    try {
      await marketInsightService.batchDeleteTasks(selectedTaskIds);
      message.success(`已删除 ${selectedTaskIds.length} 个任务`);
      setSelectedTaskIds([]);
      loadTasks();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleExecuteTask = async (id: number) => {
    try {
      const { reportId } = await marketInsightService.executeTask(id);
      await startPollingReport(reportId, '任务已开始执行');
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const startPollingReport = useCallback(async (reportId: number, startMessage?: string) => {
    stopReportPolling();
    setActiveTab('reports');
    onReportListTabChange?.('reports');
    if (startMessage) {
      message.success(startMessage);
    }
    reportPollStartedAtRef.current = Date.now();

    const pollOnce = async () => {
      if (reportPollBusyRef.current) return;
      if (Date.now() - reportPollStartedAtRef.current > REPORT_POLL_MAX_MS) {
        stopReportPolling();
        message.warning('报告生成时间较长，请稍后刷新报告列表查看');
        return;
      }
      reportPollBusyRef.current = true;
      try {
        const report = await marketInsightService.getReportById(reportId);
        await loadReports(1);
        if (report.status === 'success' || report.status === 'failed') {
          stopReportPolling();
          await loadReports(1);
          loadTasks();
          if (report.status === 'success') {
            message.success('报告已生成');
          } else {
            message.error(report.summary?.trim() || '报告生成失败');
          }
        }
      } catch (err: any) {
        stopReportPolling();
        message.error(err.message);
      } finally {
        reportPollBusyRef.current = false;
      }
    };

    await pollOnce();
    reportPollTimerRef.current = setInterval(() => {
      void pollOnce();
    }, REPORT_POLL_INTERVAL_MS);
  }, [loadReports, loadTasks, onReportListTabChange, stopReportPolling]);

  const handleImportReport = async (file: File) => {
    if (!MARKET_REPORT_IMPORT_EXT_RE.test(file.name)) {
      message.warning('不支持该格式，请使用 Markdown、TXT、HTML、PDF、Word、JSON 或 CSV');
      return;
    }
    setImportingReport(true);
    try {
      const res = (await marketInsightService.importReport(file)) as { parseWarnings?: string[] };
      if (res.parseWarnings?.length) {
        message.warning(res.parseWarnings[0]);
      }
      message.success('报告导入成功');
      loadReports();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setImportingReport(false);
    }
  };

  const reportColumns = [
    {
      title: '任务名称',
      dataIndex: 'task',
      key: 'task',
      ellipsis: true,
      width: 200,
      render: (task: any) => task?.title || '-',
    },
    {
      title: '报告标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      width: 250,
    },
    {
      title: '摘要',
      dataIndex: 'summary',
      key: 'summary',
      ellipsis: true,
      width: 500,
      render: (v: string) => v || '-',
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (v: string) => <Tag>{v || '其他'}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          success: { color: 'green', text: '成功' },
          failed: { color: 'red', text: '失败' },
          running: { color: 'blue', text: '执行中' },
        };
        const info = statusMap[status] || { color: 'default', text: status };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '执行时间',
      dataIndex: 'executed_at',
      key: 'executed_at',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_: any, record: MarketInsightReport) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onViewReport(record)}>
            查看
          </Button>
          <Popconfirm title="确定删除此报告？" onConfirm={() => handleDeleteReport(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const triggerTypeMap: Record<string, string> = {
    daily: '每日',
    weekly: '每周',
    monthly: '每月',
    custom: '自定义',
  };

  const taskColumns = [
    {
      title: '任务名称',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '触发方式',
      dataIndex: 'trigger_type',
      key: 'trigger_type',
      width: 100,
      render: (v: string) => triggerTypeMap[v] || v,
    },
    {
      title: '执行时间',
      dataIndex: 'trigger_time',
      key: 'trigger_time',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag>,
    },
    {
      title: '报告数',
      dataIndex: '_count',
      key: 'report_count',
      width: 80,
      render: (count: any) => count?.reports ?? 0,
    },
    {
      title: '上次执行',
      dataIndex: 'last_executed_at',
      key: 'last_executed_at',
      width: 170,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 250,
      render: (_: any, record: MarketInsightTask) => (
        <Space>
          <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => handleExecuteTask(record.id)}>
            执行
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEditTask(record)}>
            编辑
          </Button>
          <Popconfirm title="删除任务将同时删除所有关联报告，确定？" onConfirm={() => handleDeleteTask(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">市场洞察</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">基于 AI 自动抓取行业资讯并生成洞察报告，支持定时任务与日报导入</p>
        </div>
        <Space>
          <MarketInsightQuickCreate
            copy={MARKET_INSIGHT_QUICK_CREATE_COPY}
            switchToReportsTab={() => {
              setActiveTab('reports');
              onReportListTabChange?.('reports');
            }}
            onPollTick={() => loadReports(1)}
            onSettled={async () => {
              await loadReports(1);
              loadTasks();
            }}
          />
          <Upload
            accept={MARKET_REPORT_IMPORT_ACCEPT}
            showUploadList={false}
            beforeUpload={async (file) => {
              await handleImportReport(file);
              return false;
            }}
          >
            <Button icon={<ImportOutlined />} loading={importingReport}>
              导入报告
            </Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={onNewTask}>
            新建洞察任务
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          const tab = key as 'reports' | 'tasks';
          setActiveTab(tab);
          onReportListTabChange?.(tab);
        }}
        items={[
          {
            key: 'tasks',
            label: '洞察任务',
            children: (
              <Card bodyStyle={{ padding: 0 }}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm text-gray-500">
                    已选 {selectedTaskIds.length} 项
                  </span>
                  <Popconfirm
                    title={`确定删除选中的 ${selectedTaskIds.length} 个任务？`}
                    description="删除任务将同时删除其关联报告。"
                    onConfirm={handleBatchDeleteTasks}
                    disabled={selectedTaskIds.length === 0}
                  >
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      disabled={selectedTaskIds.length === 0}
                    >
                      批量删除
                    </Button>
                  </Popconfirm>
                </div>
                <Table
                  columns={taskColumns}
                  dataSource={tasks}
                  rowKey="id"
                  loading={loading}
                  rowSelection={{
                    selectedRowKeys: selectedTaskIds,
                    onChange: (keys) => setSelectedTaskIds(keys.map((k) => Number(k)).filter((n) => Number.isFinite(n))),
                  }}
                  pagination={false}
                />
              </Card>
            ),
          },
          {
            key: 'reports',
            label: '洞察报告',
            children: (
              <>
                <Card className="mb-4" bodyStyle={{ padding: '16px' }}>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">关键词</div>
                      <Input
                        placeholder="搜索报告标题/摘要"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ width: 510, height: 40  }}
                        allowClear
                      />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">状态</div>
                      <Select
                        placeholder="全部"
                        value={statusFilter || undefined}
                        onChange={(v) => setStatusFilter(v || '')}
                        style={{ width: 150, height: 40  }}
                        allowClear
                        options={[
                          { label: '成功', value: 'success' },
                          { label: '失败', value: 'failed' },
                          { label: '执行中', value: 'running' },
                        ]}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">分类</div>
                      <Select
                        placeholder="全部"
                        value={categoryFilter || undefined}
                        onChange={(v) => setCategoryFilter(v || '')}
                        style={{ width: 150, height: 40  }}
                        allowClear
                        options={MARKET_INSIGHT_CATEGORY_FILTER_OPTIONS}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">时间范围</div>
                      <RangePicker
                        value={dateRange as any}
                        onChange={(dates) => setDateRange(dates as any)}
                        style={{ width: 300, height: 40 }}
                        format="YYYY-MM-DD"
                      />
                    </div>
                    <Button type="primary" icon={<SearchOutlined />} onClick={() => loadReports(1)}>
                      搜索
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => {
                        setSearchText('');
                        setStatusFilter('');
                        setCategoryFilter('');
                        setDateRange(null);
                        loadReports(1);
                      }}
                    >
                      重置
                    </Button>
                    <Popconfirm
                      title={`确定删除选中的 ${selectedReportIds.length} 份报告？`}
                      onConfirm={handleBatchDeleteReports}
                      disabled={selectedReportIds.length === 0}
                    >
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        disabled={selectedReportIds.length === 0}
                      >
                        批量删除（已选 {selectedReportIds.length}）
                      </Button>
                    </Popconfirm>
                  </div>
                </Card>
                <Card bodyStyle={{ padding: 0 }}>
                  <Table
                    columns={reportColumns}
                    dataSource={reports}
                    rowKey="id"
                    loading={loading}
                    rowSelection={{
                      selectedRowKeys: selectedReportIds,
                      onChange: (keys) => setSelectedReportIds(keys.map((k) => Number(k)).filter((n) => Number.isFinite(n))),
                    }}
                    pagination={{
                      current: pagination.page,
                      pageSize: pagination.pageSize,
                      total: pagination.total,
                      showSizeChanger: true,
                      showTotal: (total) => `共 ${total} 条`,
                      onChange: (page, pageSize) => {
                        setPagination(prev => ({ ...prev, page, pageSize }));
                        loadReports(page);
                      },
                    }}
                  />
                </Card>
              </>
            ),
          },
        ]}
      />
    </>
  );
}

// ======================== 任务配置视图 ========================

function TaskConfigView({
  task,
  onBack,
  onSaved,
}: {
  task: MarketInsightTask | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isEdit = !!task;
  const sourceIdsRaw = Form.useWatch('source_config_ids', form);
  const sourceIdsWatch = normalizeSourceConfigIds(sourceIdsRaw);

  useEffect(() => {
    if (task) {
      let dataSources: string[] = [];
      const selectedBuiltins: MarketSourceConfig[] = [];
      try {
        const parsed = task.data_sources ? JSON.parse(task.data_sources) : [];
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
          dataSources = parsed.map(String).filter(Boolean);
        } else if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (!item || typeof item !== 'object') continue;
            const id = (item as MarketSourceConfig).id;
            if (typeof id === 'string' && id.startsWith('custom-rss-')) {
              const u = (item as MarketSourceConfig).url;
              if (u) dataSources.push(String(u));
            } else if (typeof id === 'string' && marketInsightBuiltinSourceMap.has(id)) {
              selectedBuiltins.push(item as MarketSourceConfig);
            }
          }
        }
      } catch { /* ignore */ }

      const builtin_urls: Record<string, string> = {};
      const source_config_ids = selectedBuiltins.map((s) => s.id).filter(Boolean);
      for (const s of selectedBuiltins) {
        if (s.id && s.url) builtin_urls[s.id] = s.url;
      }

      form.setFieldsValue({
        title: task.title,
        description: task.description || '',
        trigger_type: task.trigger_type,
        trigger_time: task.trigger_time,
        trigger_day: task.trigger_day,
        data_sources: dataSources.join('\n'),
        source_config_ids,
        builtin_urls,
        is_active: task.is_active,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        trigger_type: 'daily',
        trigger_time: '02:00',
        is_active: true,
        source_config_ids: [],
        builtin_urls: {},
      });
    }
  }, [task, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const ids: string[] = values.source_config_ids || [];
      const urlsObj: Record<string, string> = values.builtin_urls || {};
      const source_configs: MarketSourceConfig[] = ids
        .map((id: string) => {
          const base = marketInsightBuiltinSourceMap.get(id);
          if (!base) return null;
          const raw = (urlsObj[id] ?? base.url) as string;
          const url = typeof raw === 'string' ? raw.trim() : '';
          return { ...base, url: url || base.url };
        })
        .filter(Boolean) as MarketSourceConfig[];

      const params: CreateTaskParams = {
        title: values.title,
        description: values.description,
        trigger_type: values.trigger_type,
        trigger_time: values.trigger_time,
        trigger_day: values.trigger_day,
        data_sources: values.data_sources
          ? values.data_sources.split('\n').map((s: string) => s.trim()).filter(Boolean)
          : [],
        source_configs,
        is_active: values.is_active,
      };

      if (isEdit && task) {
        await marketInsightService.updateTask(task.id, params);
        message.success('任务更新成功');
      } else {
        await marketInsightService.createTask(params);
        message.success('任务创建成功');
      }
      onSaved();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeBuiltinSource = (id: string) => {
    const ids = (form.getFieldValue('source_config_ids') || []) as string[];
    const next = ids.filter((x) => x !== id);
    const prevUrls = form.getFieldValue('builtin_urls') as Record<string, string> | undefined;
    form.setFieldsValue({
      source_config_ids: next,
      builtin_urls: syncBuiltinUrlsForSelection(prevUrls, next),
    });
  };

  const taskGridTemplate =
    typeof MARKET_INSIGHT_TASK_LAYOUT.leftFr === 'number' && typeof MARKET_INSIGHT_TASK_LAYOUT.rightFr === 'number'
      ? `minmax(0,${MARKET_INSIGHT_TASK_LAYOUT.leftFr}fr) minmax(0,${MARKET_INSIGHT_TASK_LAYOUT.rightFr}fr)`
      : 'minmax(0,1fr) minmax(0,1fr)';

  const formShellStyle: CSSProperties = {
    ...(MARKET_INSIGHT_TASK_LAYOUT.contentMaxWidthPx != null
      ? { maxWidth: MARKET_INSIGHT_TASK_LAYOUT.contentMaxWidthPx }
      : {}),
    ...( {
      ['--mi-task-cols' as string]: taskGridTemplate,
    } as CSSProperties),
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col dark:bg-gray-950">
      {/* 顶栏（对齐原型） */}
      {/* <div className="sticky top-0 z-[99] flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 border-0 bg-transparent text-base text-[#4e5969] transition-colors hover:text-[#1677ff] dark:text-gray-300 dark:hover:text-[#4096ff]"
          >
            ← 返回
          </button>
          <h1 className="text-xl font-semibold text-[#1d2129] dark:text-gray-100">{pageTitle}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#00b42a] dark:text-green-400">
          <span className="inline-block h-2 w-2 rounded-full bg-[#00b42a] dark:bg-green-400" />
          系统正常
        </div>
      </div> */}

      <Form
        form={form}
        layout="vertical"
        className="mx-auto flex h-full min-h-0 w-full flex-col"
        style={formShellStyle}
        requiredMark={false}
      >
        <div className="grid h-full min-h-0 w-full grid-cols-1 gap-6 lg:[grid-template-columns:var(--mi-task-cols)] lg:items-start">
          {/* 左侧：任务基础配置 */}
          <div className="flex h-full min-w-0 min-h-0 flex-col overflow-y-auto rounded-xl bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.05)] dark:border dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
            <h2 className="mb-5 border-b border-[#e5e6eb] pb-3 text-lg font-semibold text-[#1d2129] dark:border-gray-700 dark:text-gray-100">
              任务基础配置
            </h2>

            <Form.Item
              label={<span className="text-sm font-medium text-[#333] after:ml-0.5 after:text-[#f53f3f] after:content-['*'] dark:text-gray-200">任务名称</span>}
              name="title"
              rules={[{ required: true, message: '请输入任务名称' }]}
            >
              <Input placeholder="请输入任务名称，例如：每日 AI 安全洞察" className="rounded-md" />
            </Form.Item>

            <Form.Item
              label={<span className="text-sm font-medium text-[#333] dark:text-gray-200">任务描述（可选）</span>}
              name="description"
            >
              <TextArea rows={3} placeholder="描述任务用途、抓取范围、目标等" className="min-h-[80px] resize-y rounded-md" />
            </Form.Item>

            <Form.Item
              label={<span className="text-sm font-medium text-[#333] after:ml-0.5 after:text-[#f53f3f] after:content-['*'] dark:text-gray-200">触发方式</span>}
              name="trigger_type"
              rules={[{ required: true, message: '请选择触发方式' }]}
            >
              <Select
                className="rounded-md"
                options={[
                  { label: '每日定时执行', value: 'daily' },
                  { label: '每周执行一次', value: 'weekly' },
                  { label: '每月执行一次', value: 'monthly' },
                  { label: '自定义 (Cron 表达式)', value: 'custom' },
                ]}
              />
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) => prev.trigger_type !== cur.trigger_type}
            >
              {({ getFieldValue }) => {
                const type = getFieldValue('trigger_type');
                return (
                  <>
                    {type !== 'custom' && (
                      <Form.Item
                        label={<span className="text-sm font-medium text-[#333] after:ml-0.5 after:text-[#f53f3f] after:content-['*'] dark:text-gray-200">执行时间</span>}
                        name="trigger_time"
                        rules={[{ required: true, message: '请输入执行时间' }]}
                        extra={<span className="text-xs text-[#86909c]">建议选择凌晨低峰时段（HH:mm）</span>}
                      >
                        <Input placeholder="02:00" className="max-w-[140px] rounded-md" />
                      </Form.Item>
                    )}
                    {type === 'weekly' && (
                      <Form.Item
                        label={<span className="text-sm font-medium text-[#333] after:ml-0.5 after:text-[#f53f3f] after:content-['*'] dark:text-gray-200">星期几</span>}
                        name="trigger_day"
                        rules={[{ required: true, message: '请选择星期' }]}
                      >
                        <Select
                          className="rounded-md"
                          options={[
                            { label: '周一', value: 1 },
                            { label: '周二', value: 2 },
                            { label: '周三', value: 3 },
                            { label: '周四', value: 4 },
                            { label: '周五', value: 5 },
                            { label: '周六', value: 6 },
                            { label: '周日', value: 0 },
                          ]}
                        />
                      </Form.Item>
                    )}
                    {type === 'monthly' && (
                      <Form.Item
                        label={<span className="text-sm font-medium text-[#333] after:ml-0.5 after:text-[#f53f3f] after:content-['*'] dark:text-gray-200">每月几号</span>}
                        name="trigger_day"
                        rules={[{ required: true, message: '请输入日期' }]}
                      >
                        <InputNumber min={1} max={31} placeholder="1-31" className="w-full max-w-[140px] rounded-md" />
                      </Form.Item>
                    )}
                    {type === 'custom' && (
                      <Form.Item
                        label={<span className="text-sm font-medium text-[#333] after:ml-0.5 after:text-[#f53f3f] after:content-['*'] dark:text-gray-200">Cron 表达式</span>}
                        name="trigger_time"
                        rules={[{ required: true, message: '请输入 Cron 表达式' }]}
                      >
                        <Input placeholder="例如: 0 2 * * * (每天凌晨 2 点)" className="rounded-md" />
                      </Form.Item>
                    )}
                  </>
                );
              }}
            </Form.Item>

            <div className="mb-0 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-[#333] dark:text-gray-200">启用任务</span>
              <Form.Item name="is_active" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </div>

            <div className="mt-8 flex justify-end gap-3 border-t border-[#e5e6eb] pt-5 dark:border-gray-700">
              <Button size="large" className="h-10 rounded-md border-0 bg-[#f2f3f5] px-5 font-medium text-[#4e5969] hover:bg-[#e5e6eb] dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700" onClick={onBack}>
                取消
              </Button>
              <Button
                type="primary"
                size="large"
                className="h-10 rounded-md border-0 bg-[#1677ff] px-5 font-medium hover:bg-[#0f6adc]"
                loading={saving}
                onClick={handleSubmit}
              >
                {isEdit ? '保存修改' : '创建任务'}
              </Button>
            </div>
          </div>

          {/* 右侧：数据源配置（对齐原型布局与滚动区） */}
          <div className="flex h-full min-w-0 min-h-0 flex-col overflow-y-auto rounded-xl bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.05)] dark:border dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
            <h3 className="mb-4 shrink-0 text-base font-semibold text-[#1d2129] dark:text-gray-100">数据源配置</h3>

            <div className="shrink-0">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#1d2129] dark:text-gray-200">内置数据源</span>
                <span className="rounded bg-[#f2f3f5] px-2 py-1 text-xs text-[#4e5969] dark:bg-gray-800 dark:text-gray-300">RSS / API / Web</span>
              </div>
              <p className="mb-2 text-xs text-[#86909c] dark:text-gray-500">
                下方下拉支持分组浏览与搜索，可一次多选；选中后在列表中修改各源地址
              </p>
              {/*
                Select 必须是 Form.Item 的直接子节点，否则 value/onChange 无法注入，表单不更新、下方列表会一直为空。
              */}
              <Form.Item
                name="source_config_ids"
                className="mb-0 min-w-0"
                getValueFromEvent={normalizeSourceConfigIds}
              >
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="title"
                  listHeight={580}
                  placeholder="展开分组或搜索后多选数据源"
                  className="market-insight-builtin-select w-full min-w-0 max-w-full rounded-md"
                  popupMatchSelectWidth={false}
                  styles={{ popup: { root: { minWidth: 320, maxWidth: 'min(100vw - 2rem, 520px)' } } }}
                  tagRender={(props) => {
                    const { label, value, closable, onClose } = props;
                    const id = value == null ? '' : String(value).trim();
                    if (!id || id === 'undefined') return <span className="hidden" aria-hidden />;
                    const meta = marketInsightBuiltinSourceMap.get(id);
                    const text = displayLabelForBuiltinTag(id, label) || id;
                    const full = meta
                      ? `${meta.name} (${meta.type.toUpperCase()})${meta.domainL1 ? ` · ${meta.domainL1}` : ''}`
                      : text;
                    return (
                      <Tag
                        closable={closable}
                        onClose={onClose}
                        title={full}
                        className="mb-0.5 mr-1 inline-flex min-w-0 max-w-full cursor-default border-[#e5e6eb] bg-[#f2f3f5] px-2 py-0.5 text-xs leading-normal text-[#1d2129] dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        {/* 不用 truncate：避免「arXiv…(cs.C…」类名称被拦腰截断；过长时整词换行，完整文案见 title */}
                        <span className="break-words text-left">{text}</span>
                      </Tag>
                    );
                  }}
                  options={GROUPED_MARKET_INSIGHT_SOURCE_OPTIONS}
                  onChange={(ids) => {
                    const next = normalizeSourceConfigIds(ids);
                    const prev = form.getFieldValue('builtin_urls') as Record<string, string> | undefined;
                    form.setFieldsValue({ builtin_urls: syncBuiltinUrlsForSelection(prev, next) });
                  }}
                  filterOption={(input, option) => {
                    const q = (input || '').trim().toLowerCase();
                    if (!q) return true;
                    const title = String((option as { title?: string })?.title ?? '').toLowerCase();
                    const label = String((option as { label?: string })?.label ?? '').toLowerCase();
                    return title.includes(q) || label.includes(q);
                  }}
                />
              </Form.Item>
            </div>

            <div
              className="market-insight-source-scroll mt-3 flex flex-1 min-h-[180px] flex-col gap-3 overflow-y-auto pr-1"
            >
              {sourceIdsWatch.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#e5e6eb] bg-[#fafafa] px-3 py-6 text-center text-xs text-[#86909c] dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-500">
                  尚未选择内置源。可在上方下拉中多选；留空则执行时使用系统默认完整内置列表，并合并下方自定义 RSS。
                </div>
              ) : (
                sourceIdsWatch.map((id: string) => {
                  const meta = marketInsightBuiltinSourceMap.get(id);
                  if (!meta) return null;
                  const domain =
                    meta.domainL1 && meta.domainL2
                      ? `${meta.domainL1} · ${meta.domainL2}`
                      : meta.categoryHint || '—';
                  const typeUpper = meta.type.toUpperCase();
                  return (
                    <div
                      key={id}
                      className="flex flex-col gap-2 border-b border-dashed border-[#eee] pb-3 last:border-0 dark:border-gray-700"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={
                            meta.type === 'rss'
                              ? 'rounded bg-[#e8f3ff] px-1.5 py-0.5 text-[11px] font-medium text-[#1677ff] dark:bg-blue-950/60 dark:text-[#69b1ff]'
                              : 'rounded bg-[#f2f3f5] px-1.5 py-0.5 text-[11px] font-medium text-[#4e5969] dark:bg-gray-800 dark:text-gray-300'
                          }
                        >
                          {typeUpper}
                        </span>
                        <span className="font-medium text-[#1d2129] dark:text-gray-100">{meta.name}</span>
                        <span className="text-[#86909c] dark:text-gray-500">{domain}</span>
                        <button
                          type="button"
                          onClick={() => removeBuiltinSource(id)}
                          className="ml-auto shrink-0 rounded border border-[#ffd2d2] bg-[#fff0f0] px-1.5 py-0.5 text-[11px] text-[#f53f3f] transition-colors hover:bg-[#fdd] dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                        >
                          删除
                        </button>
                      </div>
                      <Form.Item
                        name={['builtin_urls', id]}
                        className="mb-0"
                        rules={[
                          {
                            validator: async (_, v) => {
                              const s = typeof v === 'string' ? v.trim() : '';
                              if (!s) return;
                              let ok = false;
                              try {
                                ok = !!new URL(s).href;
                              } catch {
                                ok = false;
                              }
                              if (!ok) throw new Error('请输入合法 URL');
                            },
                          },
                        ]}
                      >
                        <Input placeholder={meta.url} className="rounded-md font-mono text-sm" />
                      </Form.Item>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-2 shrink-0 border-t border-[#e5e6eb] pt-2 dark:border-gray-700">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-[#1d2129] dark:text-gray-200">自定义数据源</span>
                <span className="text-xs text-[#86909c] dark:text-gray-500">每行一个 RSS/Atom 链接</span>
              </div>
              <Form.Item name="data_sources" className="mb-0">
                <TextArea
                  rows={3}
                  placeholder={'https://example.com/feed\nhttps://tech-blog.com/rss'}
                  className="min-h-[80px] resize-y rounded-md font-mono text-sm"
                />
              </Form.Item>
              <p className="mt-2 text-xs text-[#86909c] dark:text-gray-500">自定义链接会与内置源合并，自动去重后抓取。</p>
            </div>
          </div>
        </div>
      </Form>

      <style>{`
        /* 内置多选：通过变量统一控制选项框高度 */
        .market-insight-builtin-select {
          --mi-select-min-height: 40px;
          --mi-select-max-height: 4rem;
        }
        /* 内置多选：允许换行，超出上限后在框内滚动 */
        .market-insight-builtin-select.ant-select-multiple .ant-select-selector {
          height: auto !important;
          min-height: var(--mi-select-min-height);
          /* 不设 maxTagCount，避免第 6 项/+N 被裁切看不见 */
          max-height: var(--mi-select-max-height);
          padding-top: 4px !important;
          padding-bottom: 4px !important;
          align-items: flex-start !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
        }
        .market-insight-builtin-select.ant-select-multiple .ant-select-selection-overflow {
          display: flex !important;
          flex-wrap: wrap !important;
          align-content: flex-start !important;
          gap: 4px 6px !important;
          width: 100%;
          max-width: 100%;
        }
        .market-insight-builtin-select.ant-select-multiple .ant-select-selection-overflow-item {
          min-width: 0;
          max-width: 100%;
        }
        .market-insight-builtin-select.ant-select-multiple .ant-select-selection-search {
          flex: 1 0 4rem;
          min-width: 2rem;
        }
        .market-insight-source-scroll::-webkit-scrollbar { width: 4px; }
        .market-insight-source-scroll::-webkit-scrollbar-thumb { background: #dcdfe6; border-radius: 4px; }
        .market-insight-source-scroll::-webkit-scrollbar-track { background: #f5f7fa; }
        .dark .market-insight-source-scroll::-webkit-scrollbar-thumb { background: #4b5563; }
        .dark .market-insight-source-scroll::-webkit-scrollbar-track { background: #1f2937; }
      `}</style>
    </div>
  );
}

// ======================== 报告详情视图 ========================

function ReportDetailView({
  report: initialReport,
  onBack,
}: {
  report: MarketInsightReport;
  onBack: () => void;
}) {
  const [report, setReport] = useState<MarketInsightReport>(initialReport);
  const [loading, setLoading] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [deepReadOpen, setDeepReadOpen] = useState(false);
  const [deepReadLoading, setDeepReadLoading] = useState(false);
  const [deepReadContent, setDeepReadContent] = useState<DeepReadDetail | null>(null);
  const [deepReadConvertOpen, setDeepReadConvertOpen] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [generateState, setGenerateState] = useState<'idle' | 'generating' | 'success' | 'failed'>('idle');
  const [generateMessage, setGenerateMessage] = useState('');
  const [previewMode, setPreviewMode] = useState<'markdown' | 'raw' | 'html_sanitized' | 'html_iframe'>('markdown');
  const [isDeepReadFullscreen, setIsDeepReadFullscreen] = useState(false);
  const PREVIEW_MODE_KEY = 'marketInsightsDeepReadPreviewMode';
  const PREVIEW_MODES = new Set(['markdown', 'raw', 'html_sanitized', 'html_iframe']);
  const PREVIEW_MODE_OPTIONS: Array<{ label: string; value: 'markdown' | 'raw' | 'html_sanitized' | 'html_iframe' }> = [
    { label: '原文（纯文本）', value: 'raw' },
    { label: 'HTML（原貌）', value: 'html_iframe' },
    { label: 'HTML（清洗）', value: 'html_sanitized' },
    { label: 'Markdown 预览', value: 'markdown' },
  ];

  useEffect(() => {
    const loadFull = async () => {
      setLoading(true);
      try {
        const full = await marketInsightService.getReportById(initialReport.id);
        setReport(full);
      } catch (err: any) {
        message.error(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadFull();
  }, [initialReport.id]);

  const stats = report.stats_json ? (() => {
    try { return JSON.parse(report.stats_json); } catch { return null; }
  })() : null;

  const statusMap: Record<string, { color: string; text: string }> = {
    success: { color: 'green', text: '执行成功' },
    failed: { color: 'red', text: '执行失败' },
    running: { color: 'blue', text: '执行中' },
  };

  const statusInfo = statusMap[report.status] || { color: 'default', text: report.status };
  /** 与导入落库 stats 解析规则一致：Markdown 链接、<a href>、正文中的 http(s) URL */
  const articleItems = extractReportArticleLinks(report.content || '');
  /** 与「文章明细」列表同源，避免落库 stats 与当前解析规则不一致导致数量对不上 */
  const articleCountDisplay =
    articleItems.length > 0
      ? articleItems.length
      : typeof stats?.totalArticles === 'number' && stats.totalArticles > 0
        ? stats.totalArticles
        : '-';

  const handleDeepRead = async (url: string, title: string) => {
    setDeepReadOpen(true);
    setIsDeepReadFullscreen(false);
    setDeepReadLoading(true);
    setGenerateState('idle');
    setGenerateMessage('');
    try {
      const detail = await insightsService.deepReadByUrl(url, title);
      const { matchedArticleId, ...content } = detail;
      setSelectedArticleId(
        typeof matchedArticleId === 'number' ? matchedArticleId : null
      );
      setDeepReadContent(content);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setDeepReadLoading(false);
    }
  };

  const handleGenerateFromArticle = async (params: { title: string; projectId?: number; projectVersionId?: number }) => {
    if (!deepReadContent || generateState === 'generating') return;
    try {
      setGenerateState('generating');
      let articleId = selectedArticleId;
      if (!articleId) {
        setGenerateMessage('未命中文章库，正在自动入库后生成需求文档...');
        const created = await insightsService.createArticle({
          title: deepReadContent.title,
          url: deepReadContent.sourceUrl,
          content: deepReadContent.contentText || deepReadContent.contentMarkdown || deepReadContent.contentHtml || deepReadContent.summary,
          summary: deepReadContent.summary,
          category: '其他',
          source: 'market_insight',
          published_at: new Date().toISOString(),
        });
        articleId = created.id;
        setSelectedArticleId(articleId);
      }
      setGenerateMessage('正在调用需求分析 AI 生成需求文档...');
      await insightsService.generateRequirementFromArticle(articleId, {
        title: params.title,
        projectId: params.projectId,
        projectVersionId: params.projectVersionId,
      });
      setGenerateState('success');
      setGenerateMessage('需求文档已生成成功，可前往需求文档管理查看。');
      message.success('已一键生成需求文档');
    } catch (err: any) {
      setGenerateState('failed');
      setGenerateMessage(err.message || '生成失败，请稍后重试');
      message.error(err.message);
    }
  };

  const sanitizeHtmlForPreview = (raw?: string) => {
    if (!raw) return '';
    let html = raw;
    const looksHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
    if (!looksHtml) {
      const normalized = normalizeReportMarkdownBody(raw);
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
  };

  /** 原貌模式：整页 HTML 需注入 &lt;base&gt;，否则相对路径的 CSS 会指向当前站点域名 */
  const buildIframeSrcDoc = (raw?: string, sourceUrl?: string) => {
    const content = raw || '';
    const looksHtml = /<\/?[a-z][\s\S]*>/i.test(content);
    if (looksHtml) {
      return sourceUrl ? prepareIframeSrcDocHtml(content, sourceUrl) : content;
    }
    const body = marked(normalizeReportMarkdownBody(content), { breaks: true }) as string;
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;color:#1f2937;line-height:1.9;padding:16px 20px;background:#fff}img{max-width:100%;border-radius:8px}pre{background:#0b1020;color:#fff;padding:12px;border-radius:8px;overflow:auto}blockquote{border-left:4px solid #8fa1d0;background:#faf7fb;padding:10px 14px}</style></head><body>${body}</body></html>`;
  };

  useEffect(() => {
    if (!deepReadOpen) return;
    try {
      const saved = localStorage.getItem(PREVIEW_MODE_KEY);
      if (saved && PREVIEW_MODES.has(saved)) {
        setPreviewMode(saved as 'markdown' | 'raw' | 'html_sanitized' | 'html_iframe');
      } else {
        setPreviewMode('markdown');
      }
    } catch {
      setPreviewMode('markdown');
    }
  }, [deepReadOpen]);

  const deepReadLayoutHeight = isDeepReadFullscreen ? 'calc(100vh - 150px)' : 'calc(100vh - 200px)';
  const deepReadIframeMinHeight = isDeepReadFullscreen ? 'calc(100vh - 310px)' : 'calc(100vh - 360px)';

  return (
    <Spin spinning={loading}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{report.title}</h1>
          <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
        </div>
        <Button
          type="primary"
          icon={<FileTextOutlined />}
          onClick={() => setConvertModalOpen(true)}
        >
          转化为需求文档
        </Button>
      </div>

      <Card className="mb-4">
        <Descriptions column={4} size="small">
          <Descriptions.Item label="执行时间">
            {dayjs(report.executed_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label="关联任务">
            {report.task?.title || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="分类">
            {report.category}
          </Descriptions.Item>
          <Descriptions.Item label="文章数">
            {articleCountDisplay}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {stats?.categories && stats.categories.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {stats.categories.map((cat: any, idx: number) => (
            <Card key={idx} size="small" className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {articleItems.length > 0 && cat.name === '正文外链' ? articleItems.length : cat.count}
              </div>
              <div className="text-sm text-gray-500">{cat.name}</div>
            </Card>
          ))}
        </div>
      )}

      <Card
        title="报告正文"
        extra={articleItems.length > 0 ? <a href="#article-detail-section">跳转到文章明细</a> : null}
      >
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{
            __html: marked(normalizeReportMarkdownBody(report.content || ''), { breaks: true }) as string,
          }}
        />
      </Card>

      {articleItems.length > 0 && (
        <Card id="article-detail-section" className="mt-4" title="文章明细（可深读）">
          <div className="space-y-2">
            {articleItems.map((item) => (
              <div key={item.url} className="flex items-center justify-between gap-2">
                <a href={item.url} target="_blank" rel="noreferrer" className="truncate flex-1 min-w-0">
                  {item.title}
                </a>
                <Space>
                  <Button size="small" href={item.url} target="_blank" rel="noreferrer">
                    打开原文
                  </Button>
                  <Button size="small" type="primary" ghost onClick={() => handleDeepRead(item.url, item.title)}>
                    深读
                  </Button>
                </Space>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ConvertToRequirementModal
        open={convertModalOpen}
        reportTitle={report.title}
        onClose={() => setConvertModalOpen(false)}
        onConvert={async (values) => {
          await marketInsightService.convertToRequirement(report.id, values);
          message.success('已成功转化为需求文档');
        }}
      />
      <Modal
        open={deepReadOpen}
        title="文章深读"
        onCancel={() => {
          setDeepReadOpen(false);
          setIsDeepReadFullscreen(false);
          setGenerateState('idle');
          setGenerateMessage('');
        }}
        footer={
          <div className="flex items-center w-full gap-4 text-left">
            <div className="flex-1 min-w-0 text-left">
              {generateState === 'generating' && (
                <div className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm text-blue-700">
                  需求生成中：AI正在进行需求分析，生成规范化需求文档...
                </div>
              )}
              {generateState === 'success' && (
                <div className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-700">
                  需求生成完成：需求文档已生成成功，可前往需求文档管理查看
                </div>
              )}
              {generateState === 'failed' && (
                <div className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700">
                  需求生成失败：{generateMessage || '生成失败，请稍后重试'}
                </div>
              )}
              {generateState === 'success' && (
                <Button
                  className="ml-3"
                  size="middle"
                  type="default"
                  onClick={() => {
                    window.open('/requirement-docs', '_blank', 'noopener,noreferrer');
                  }}
                >
                  点击前往需求文档管理
                </Button>
              )}
            </div>
            <Space className="ml-auto pl-3" size="middle">
              
              <Button
                key="close"
                onClick={() => {
                  setDeepReadOpen(false);
                  setIsDeepReadFullscreen(false);
                  setGenerateState('idle');
                  setGenerateMessage('');
                }}
              >
                关闭
              </Button>
              <Button
                key="gen"
                type="primary"
                loading={generateState === 'generating'}
                onClick={() => setDeepReadConvertOpen(true)}
                disabled={!deepReadContent || deepReadLoading || generateState === 'generating'}
              >
                一键转需求文档
              </Button>
            </Space>
          </div>
        }
        centered
        width={isDeepReadFullscreen ? '96vw' : 'min(96vw, 960px)'}
        style={{ paddingBottom: 0 }}
        styles={{
          body: {
            maxHeight: isDeepReadFullscreen ? 'calc(100vh - 120px)' : 'calc(100vh - 150px)',
            overflow: 'hidden',
          },
        }}
      >
        <Spin spinning={deepReadLoading}>
          {!deepReadContent ? (
            <Empty description="暂无深读内容" />
          ) : (
            <div className="space-y-3 flex flex-col" style={{ height: deepReadLayoutHeight }}>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-lg font-semibold text-gray-900">{deepReadContent.title}</div>
                <div className="text-sm text-gray-600 mt-1">{deepReadContent.summary}</div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button
                  icon={isDeepReadFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={() => setIsDeepReadFullscreen((prev) => !prev)}
                >
                  {isDeepReadFullscreen ? '退出全屏' : '全屏阅读'}
                </Button>
                <Segmented
                  value={previewMode}
                  onChange={(value) => {
                    const mode = value as 'markdown' | 'raw' | 'html_sanitized' | 'html_iframe';
                    setPreviewMode(mode);
                    try {
                      localStorage.setItem(PREVIEW_MODE_KEY, mode);
                    } catch { /* ignore */ }
                  }}
                  options={PREVIEW_MODE_OPTIONS}
                />
              </div>
              <div
                className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm overflow-y-auto"
                style={{ flex: 1, minHeight: 0 }}
              >
                {!normalizeReportMarkdownBody(deepReadContent.contentMarkdown || deepReadContent.contentText) ? (
                  <Empty description="暂无正文内容" />
                ) : previewMode === 'raw' ? (
                  <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-700 m-0">
                    {deepReadContent.contentText}
                  </pre>
                ) : previewMode === 'html_sanitized' ? (
                  <div
                    className="prose prose-slate max-w-none prose-sm
                      prose-img:max-w-full prose-img:rounded-lg prose-img:my-4"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtmlForPreview(deepReadContent.contentHtml || deepReadContent.contentText),
                    }}
                  />
                ) : previewMode === 'html_iframe' ? (
                  /* HTML 原貌：allow-scripts 允许原站脚本（动态样式/分包 CSS）；勿与 allow-same-origin 同开以免削弱沙箱 */
                  <iframe
                    title="html-preview"
                    className="w-full rounded-lg border border-gray-200"
                    style={{ minHeight: deepReadIframeMinHeight, background: '#fff' }}
                    sandbox="allow-scripts allow-popups"
                    referrerPolicy="unsafe-url"
                    srcDoc={buildIframeSrcDoc(
                      deepReadContent.contentRawHtml || deepReadContent.contentHtml || deepReadContent.contentText,
                      deepReadContent.sourceUrl
                    )}
                  />
                ) : (
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
                      __html: marked(
                        normalizeReportMarkdownBody(deepReadContent.contentMarkdown || deepReadContent.contentText),
                        { breaks: true }
                      ) as string,
                    }}
                  />
                )}
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                抓取策略：{deepReadContent.extractionMeta?.strategy || '-'}
                {' · '}
                耗时：{deepReadContent.extractionMeta?.durationMs ?? '-'}ms
                {' · '}
                来源：{deepReadContent.sourceUrl || '-'}
                {deepReadContent.extractionMeta?.errorMessage ? ` · 错误：${deepReadContent.extractionMeta.errorMessage}` : ''}
              </div>
            </div>
          )}
        </Spin>
      </Modal>
      <ConvertToRequirementModal
        open={deepReadConvertOpen}
        reportTitle={deepReadContent?.title || report.title}
        onClose={() => setDeepReadConvertOpen(false)}
        onConvert={async (values) => {
          await handleGenerateFromArticle(values);
          setDeepReadConvertOpen(false);
        }}
      />
      <Modal
        open={generateState === 'generating'}
        footer={null}
        closable={false}
        maskClosable={false}
        keyboard={false}
        centered
        width={720}
        onCancel={() => undefined}
      >
        <AIThinking
          title="AI 正在分析并生成需求文档"
          subtitle="预计需要 30-90 秒，请耐心等待..."
          progressItems={[
            { label: '读取原始文本内容', status: 'processing' },
            { label: 'AI分析结构和元素', status: 'pending' },
            { label: '生成结构化的文档', status: 'pending' },
          ]}
        />
      </Modal>
    </Spin>
  );
}

// ======================== 需求转化弹窗 ========================

function ConvertToRequirementModal({
  open,
  reportTitle,
  onClose,
  onConvert,
}: {
  open: boolean;
  reportTitle: string;
  onClose: () => void;
  onConvert: (values: { title: string; projectId?: number; projectVersionId?: number }) => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectVersionsMap, setProjectVersionsMap] = useState<Record<number, Array<any>>>({});
  const [versionLoading, setVersionLoading] = useState(false);
  const selectedProjectId = Form.useWatch('projectId', form) as number | undefined;
  const projectVersions: Array<any> = selectedProjectId
    ? (projectVersionsMap[selectedProjectId]
      ?? ((projects.find((p: any) => p.id === selectedProjectId) as any)?.project_versions ?? []))
    : [];

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ title: `需求文档 - ${reportTitle}` });
      loadProjects();
    } else {
      form.resetFields(['projectId', 'projectVersionId']);
    }
  }, [open, reportTitle, form]);

  const loadProjects = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${getApiBaseUrl('/api')}/v1/systems`, { headers });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.data || []);
      }
    } catch { /* ignore */ }
  };

  const handleConvert = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await onConvert({
        title: values.title,
        projectId: values.projectId,
        projectVersionId: values.projectVersionId,
      });
      onClose();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectChange = (projectId?: number) => {
    if (!projectId) {
      form.setFieldsValue({ projectId: undefined, projectVersionId: undefined });
      return;
    }
    form.setFieldsValue({ projectId, projectVersionId: undefined });
    void loadProjectVersions(projectId);
  };

  const loadProjectVersions = async (projectId: number) => {
    try {
      setVersionLoading(true);
      const versions = await getProjectVersions(projectId);
      setProjectVersionsMap((prev) => ({ ...prev, [projectId]: versions || [] }));
      const mainVersion = (versions || []).find((v: any) => v.is_main) ?? (versions || [])[0];
      form.setFieldValue('projectVersionId', mainVersion?.id);
    } catch (err: any) {
      setProjectVersionsMap((prev) => ({ ...prev, [projectId]: [] }));
      form.setFieldValue('projectVersionId', undefined);
      message.warning(err?.message || '加载项目版本失败');
    } finally {
      setVersionLoading(false);
    }
  };

  return (
    <Modal
      title="转化为需求文档"
      open={open}
      onCancel={onClose}
      onOk={handleConvert}
      confirmLoading={loading}
      okText="确认转化"
      cancelText="取消"
    >
      <Form form={form} layout="vertical">
        <Form.Item label="需求文档标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
          <Input />
        </Form.Item>
        <Form.Item label="关联项目" name="projectId">
          <Select
            placeholder="选择项目（可选）"
            allowClear
            options={projects.map((p: any) => ({ label: p.name, value: p.id }))}
            onChange={(value) => handleProjectChange(value as number | undefined)}
          />
        </Form.Item>
        <Form.Item label="关联版本" name="projectVersionId">
          <Select
            placeholder={selectedProjectId ? '选择版本（默认主线）' : '请先选择项目'}
            allowClear
            disabled={!selectedProjectId}
            loading={versionLoading}
            notFoundContent={selectedProjectId ? '暂无版本数据' : '请先选择项目'}
            options={projectVersions.map((v: any) => ({
              label: `${v.version_name}${v.is_main ? '（主线）' : ''}`,
              value: v.id,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
