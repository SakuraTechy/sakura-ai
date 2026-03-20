import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Select, DatePicker, Space, Modal, Form, Switch,
  Tag, message, Popconfirm, Card, Descriptions, Upload, Spin, InputNumber, Tabs
} from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, UploadOutlined,
  DeleteOutlined, EyeOutlined, PlayCircleOutlined, FileTextOutlined,
  ArrowLeftOutlined, EditOutlined, ImportOutlined
} from '@ant-design/icons';
import { marked } from 'marked';
import dayjs from 'dayjs';
import {
  marketInsightService,
  MarketInsightTask,
  MarketInsightReport,
  CreateTaskParams,
} from '../services/marketInsightService';
import { getApiBaseUrl } from '../config/api';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

type ViewType = 'reportList' | 'taskConfig' | 'reportDetail';

export function MarketInsights() {
  const [currentView, setCurrentView] = useState<ViewType>('reportList');
  const [editingTask, setEditingTask] = useState<MarketInsightTask | null>(null);
  const [viewingReport, setViewingReport] = useState<MarketInsightReport | null>(null);

  return (
    <div className="space-y-4">
      {currentView === 'reportList' && (
        <ReportListView
          onNewTask={() => { setEditingTask(null); setCurrentView('taskConfig'); }}
          onViewReport={(report) => { setViewingReport(report); setCurrentView('reportDetail'); }}
          onEditTask={(task) => { setEditingTask(task); setCurrentView('taskConfig'); }}
        />
      )}
      {currentView === 'taskConfig' && (
        <TaskConfigView
          task={editingTask}
          onBack={() => setCurrentView('reportList')}
          onSaved={() => setCurrentView('reportList')}
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

function ReportListView({
  onNewTask,
  onViewReport,
  onEditTask,
}: {
  onNewTask: () => void;
  onViewReport: (report: MarketInsightReport) => void;
  onEditTask: (task: MarketInsightTask) => void;
}) {
  const [activeTab, setActiveTab] = useState<'reports' | 'tasks'>('reports');
  const [reports, setReports] = useState<MarketInsightReport[]>([]);
  const [tasks, setTasks] = useState<MarketInsightTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const loadReports = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await marketInsightService.getReportList({
        page,
        pageSize: pagination.pageSize,
        search: searchText || undefined,
        status: statusFilter || undefined,
        startDate: dateRange?.[0]?.format('YYYY-MM-DD') || undefined,
        endDate: dateRange?.[1]?.format('YYYY-MM-DD') || undefined,
      });
      setReports(result.data);
      setPagination(result.pagination);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, searchText, statusFilter, dateRange]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await marketInsightService.getTaskList();
      setTasks(result.data);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const handleExecuteTask = async (id: number) => {
    try {
      await marketInsightService.executeTask(id);
      message.success('任务已开始执行');
      loadTasks();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleImportReport = async (file: File) => {
    try {
      await marketInsightService.importReport(file);
      message.success('报告导入成功');
      loadReports();
    } catch (err: any) {
      message.error(err.message);
    }
    return false;
  };

  const statusMap: Record<string, { color: string; text: string }> = {
    success: { color: 'green', text: '成功' },
    failed: { color: 'red', text: '失败' },
    running: { color: 'blue', text: '执行中' },
  };

  const reportColumns = [
    {
      title: '执行时间',
      dataIndex: 'executed_at',
      key: 'executed_at',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '任务名称',
      dataIndex: 'task',
      key: 'task',
      width: 160,
      render: (task: any) => task?.title || '-',
    },
    {
      title: '报告标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const info = statusMap[status] || { color: 'default', text: status };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '摘要',
      dataIndex: 'summary',
      key: 'summary',
      ellipsis: true,
      width: 300,
      render: (v: string) => v || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
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
          <Upload
            accept=".md,.markdown"
            showUploadList={false}
            beforeUpload={(file) => { handleImportReport(file); return false; }}
          >
            <Button icon={<ImportOutlined />}>导入报告</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={onNewTask}>
            新建洞察任务
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'reports' | 'tasks')}
        items={[
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
                        style={{ width: 200 }}
                        allowClear
                      />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">状态</div>
                      <Select
                        placeholder="全部"
                        value={statusFilter || undefined}
                        onChange={(v) => setStatusFilter(v || '')}
                        style={{ width: 120 }}
                        allowClear
                        options={[
                          { label: '成功', value: 'success' },
                          { label: '失败', value: 'failed' },
                          { label: '执行中', value: 'running' },
                        ]}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">时间范围</div>
                      <RangePicker
                        value={dateRange as any}
                        onChange={(dates) => setDateRange(dates as any)}
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
                        setDateRange(null);
                        loadReports(1);
                      }}
                    >
                      重置
                    </Button>
                  </div>
                </Card>
                <Card bodyStyle={{ padding: 0 }}>
                  <Table
                    columns={reportColumns}
                    dataSource={reports}
                    rowKey="id"
                    loading={loading}
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
          {
            key: 'tasks',
            label: '洞察任务',
            children: (
              <Card bodyStyle={{ padding: 0 }}>
                <Table
                  columns={taskColumns}
                  dataSource={tasks}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                />
              </Card>
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

  useEffect(() => {
    if (task) {
      let dataSources: string[] = [];
      try {
        dataSources = task.data_sources ? JSON.parse(task.data_sources) : [];
      } catch { /* ignore */ }

      form.setFieldsValue({
        title: task.title,
        description: task.description || '',
        trigger_type: task.trigger_type,
        trigger_time: task.trigger_time,
        trigger_day: task.trigger_day,
        data_sources: dataSources.join('\n'),
        is_active: task.is_active,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ trigger_type: 'daily', trigger_time: '02:00', is_active: true });
    }
  }, [task, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const params: CreateTaskParams = {
        title: values.title,
        description: values.description,
        trigger_type: values.trigger_type,
        trigger_time: values.trigger_time,
        trigger_day: values.trigger_day,
        data_sources: values.data_sources
          ? values.data_sources.split('\n').map((s: string) => s.trim()).filter(Boolean)
          : [],
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

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          {isEdit ? '编辑洞察任务' : '新建洞察任务'}
        </h1>
      </div>

      <Card>
        <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
          <Form.Item label="任务名称" name="title" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="例如：每日数据安全洞察" />
          </Form.Item>

          <Form.Item label="任务描述" name="description">
            <TextArea rows={3} placeholder="可选：描述此洞察任务的目的" />
          </Form.Item>

          <Form.Item label="触发方式" name="trigger_type" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '每日', value: 'daily' },
                { label: '每周', value: 'weekly' },
                { label: '每月', value: 'monthly' },
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
                    <Form.Item label="执行时间" name="trigger_time" rules={[{ required: true, message: '请输入执行时间' }]}>
                      <Input placeholder="HH:mm，例如 02:00" />
                    </Form.Item>
                  )}
                  {type === 'weekly' && (
                    <Form.Item label="星期几" name="trigger_day" rules={[{ required: true, message: '请选择星期' }]}>
                      <Select
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
                    <Form.Item label="每月几号" name="trigger_day" rules={[{ required: true, message: '请输入日期' }]}>
                      <InputNumber min={1} max={31} placeholder="1-31" />
                    </Form.Item>
                  )}
                  {type === 'custom' && (
                    <Form.Item label="Cron 表达式" name="trigger_time" rules={[{ required: true, message: '请输入 Cron 表达式' }]}>
                      <Input placeholder="例如: 0 2 * * * (每天凌晨2点)" />
                    </Form.Item>
                  )}
                </>
              );
            }}
          </Form.Item>

          <Form.Item
            label="数据源 (每行一个 RSS URL)"
            name="data_sources"
            extra="填写 RSS/Atom 订阅地址，执行时会自动抓取文章并生成洞察报告，文章同步至行业资讯。留空则仅从已有行业资讯数据聚合。注意：部分网站有 WAF 防护可能导致抓取失败。"
          >
            <TextArea
              rows={5}
              placeholder={`每行填写一个 RSS 地址，以下源已验证可用：\nhttps://www.36kr.com/feed\nhttps://sspai.com/feed\nhttps://juejin.cn/rss\nhttps://xz.aliyun.com/feed\nhttps://paper.seebug.org/rss/\nhttps://hackernews.cc/feed`}
            />
          </Form.Item>

          <Form.Item label="启用任务" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" onClick={handleSubmit} loading={saving}>
                {isEdit ? '保存修改' : '创建任务'}
              </Button>
              <Button onClick={onBack}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </>
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
            {stats?.totalArticles ?? '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {stats?.categories && stats.categories.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {stats.categories.map((cat: any, idx: number) => (
            <Card key={idx} size="small" className="text-center">
              <div className="text-2xl font-bold text-purple-600">{cat.count}</div>
              <div className="text-sm text-gray-500">{cat.name}</div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{
            __html: marked(report.content || '', { breaks: true }) as string,
          }}
        />
      </Card>

      <ConvertToRequirementModal
        open={convertModalOpen}
        reportId={report.id}
        reportTitle={report.title}
        onClose={() => setConvertModalOpen(false)}
      />
    </Spin>
  );
}

// ======================== 需求转化弹窗 ========================

function ConvertToRequirementModal({
  open,
  reportId,
  reportTitle,
  onClose,
}: {
  open: boolean;
  reportId: number;
  reportTitle: string;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ title: `需求文档 - ${reportTitle}` });
      loadProjects();
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
      await marketInsightService.convertToRequirement(reportId, {
        title: values.title,
        projectId: values.projectId,
      });
      message.success('已成功转化为需求文档');
      onClose();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message);
    } finally {
      setLoading(false);
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
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
