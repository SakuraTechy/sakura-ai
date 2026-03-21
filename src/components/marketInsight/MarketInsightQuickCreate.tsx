import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Modal, Form, Input, InputNumber, Select, message } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { marketInsightService } from '../../services/marketInsightService';
import { AIThinking } from '../ai-generator/AIThinking';

const REPORT_POLL_INTERVAL_MS = 2000;
const REPORT_POLL_MAX_MS = 5 * 60 * 1000;

export type MarketInsightQuickCreateCopy = {
  buttonLabel: string;
  modalTitle: string;
  displayNamePlaceholder: string;
  progressTitle: string;
  progressSubtitle: string;
  stepCreate: string;
  stepAnalyze: string;
  stepGenerate: string;
  msgCreatedAndRunning: string;
  msgCreatedNoReport: string;
  msgPollSuccess: string;
  msgPollTimeout: string;
};

export const MARKET_INSIGHT_QUICK_CREATE_COPY: MarketInsightQuickCreateCopy = {
  buttonLabel: 'AI 一键获取市场洞察',
  modalTitle: 'AI 一键获取市场洞察',
  displayNamePlaceholder: '例如：AI一键市场洞察-安全行业',
  progressTitle: 'AI 正在分析并生成市场洞察报告',
  progressSubtitle: '预计需要 30-90 秒，请耐心等待...',
  stepCreate: '创建市场洞察任务',
  stepAnalyze: 'AI整理资讯并分类',
  stepGenerate: 'AI生成结构化报告',
  msgCreatedAndRunning: '市场洞察任务已创建并开始执行',
  msgCreatedNoReport: '市场洞察任务已创建',
  msgPollSuccess: '报告已生成',
  msgPollTimeout: '报告生成时间较长，请稍后刷新报告列表查看',
};

export const INDUSTRY_NEWS_QUICK_CREATE_COPY: MarketInsightQuickCreateCopy = {
  buttonLabel: 'AI 一键获取行业资讯',
  modalTitle: 'AI 一键获取行业资讯',
  displayNamePlaceholder: '例如：AI一键行业资讯-安全行业',
  progressTitle: 'AI 正在分析并生成行业资讯',
  progressSubtitle: '完成后将同步到本列表与市场洞察报告，预计 30–90 秒…',
  stepCreate: '创建行业资讯任务',
  stepAnalyze: 'AI整理资讯并分类',
  stepGenerate: 'AI生成结构化报告',
  msgCreatedAndRunning: '行业资讯任务已创建并开始执行',
  msgCreatedNoReport: '行业资讯任务已创建',
  msgPollSuccess: '行业资讯已同步到列表',
  msgPollTimeout: '生成时间较长，请稍后刷新本页或到市场洞察查看',
};

type Props = {
  copy: MarketInsightQuickCreateCopy;
  onSettled?: () => void | Promise<void>;
  /** 轮询中每次拉取报告状态后触发（市场洞察页用于刷新报告列表） */
  onPollTick?: () => void | Promise<void>;
  /** 创建完成后切到「洞察报告」Tab（市场洞察列表页用） */
  switchToReportsTab?: () => void;
};

export function MarketInsightQuickCreate({ copy, onSettled, onPollTick, switchToReportsTab }: Props) {
  const [quickFetchForm] = Form.useForm();
  const [quickFetchOpen, setQuickFetchOpen] = useState(false);
  const [quickFetchLoading, setQuickFetchLoading] = useState(false);
  const [quickProgressOpen, setQuickProgressOpen] = useState(false);
  /** create=仅创建请求；collect=服务端抓取/整理；generate=AI 写报告（与轮询启发式对齐，避免两步同时转圈） */
  const [quickProgressStep, setQuickProgressStep] = useState<
    'create' | 'collect' | 'generate' | 'done'
  >('create');

  const reportPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reportPollBusyRef = useRef(false);
  const reportPollStartedAtRef = useRef(0);
  /** 已完成轮询次数（用于在 running 时从「整理」切到「生成」） */
  const reportPollRoundRef = useRef(0);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const onPollTickRef = useRef(onPollTick);
  onPollTickRef.current = onPollTick;

  const stopReportPolling = useCallback(() => {
    if (reportPollTimerRef.current) {
      clearInterval(reportPollTimerRef.current);
      reportPollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopReportPolling(), [stopReportPolling]);

  const startPollingReport = useCallback(
    async (reportId: number, startMessage?: string) => {
      stopReportPolling();
      switchToReportsTab?.();
      if (startMessage) {
        message.success(startMessage);
      }
      setQuickProgressOpen(true);
      setQuickProgressStep('collect');
      reportPollStartedAtRef.current = Date.now();
      reportPollRoundRef.current = 0;

      const pollOnce = async () => {
        if (reportPollBusyRef.current) return;
        if (Date.now() - reportPollStartedAtRef.current > REPORT_POLL_MAX_MS) {
          stopReportPolling();
          message.warning(copy.msgPollTimeout);
          setQuickProgressOpen(false);
          return;
        }
        reportPollBusyRef.current = true;
        try {
          const report = await marketInsightService.getReportById(reportId);
          await onPollTickRef.current?.();
          reportPollRoundRef.current += 1;
          // 仍在生成中：前几轮视为「抓取/整理」，之后视为「AI 写报告」（仅一步转圈）
          if (report.status === 'running') {
            if (reportPollRoundRef.current >= 2) {
              setQuickProgressStep('generate');
            } else {
              setQuickProgressStep('collect');
            }
          }
          if (report.status === 'success' || report.status === 'failed') {
            stopReportPolling();
            setQuickProgressStep('done');
            setTimeout(() => setQuickProgressOpen(false), 800);
            if (report.status === 'success') {
              message.success(copy.msgPollSuccess);
            } else {
              message.error(report.summary?.trim() || '报告生成失败');
            }
            await onSettledRef.current?.();
          }
        } catch (err: unknown) {
          stopReportPolling();
          setQuickProgressOpen(false);
          message.error(err instanceof Error ? err.message : '轮询失败');
        } finally {
          reportPollBusyRef.current = false;
        }
      };

      await pollOnce();
      reportPollTimerRef.current = setInterval(() => {
        void pollOnce();
      }, REPORT_POLL_INTERVAL_MS);
    },
    [copy.msgPollSuccess, copy.msgPollTimeout, stopReportPolling, switchToReportsTab]
  );

  const handleQuickFetch = async () => {
    try {
      const values = await quickFetchForm.validateFields();
      setQuickFetchLoading(true);
      setQuickProgressOpen(true);
      setQuickProgressStep('create');
      const result = await marketInsightService.quickCreateAndExecuteByIndustry({
        industry: values.industry,
        displayName: values.displayName || undefined,
        maxItems: values.maxItems || undefined,
        timeWindow: values.timeWindow || undefined,
        executeNow: true,
        fetchMode: values.fetchMode || 'sources_plus_ai',
        reportOutputStyle: values.reportOutputStyle || 'default',
      });
      setQuickFetchOpen(false);
      if (result.reportId) {
        await startPollingReport(result.reportId, copy.msgCreatedAndRunning);
      } else {
        setQuickProgressOpen(false);
        message.success(copy.msgCreatedNoReport);
        await onSettledRef.current?.();
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      setQuickProgressOpen(false);
      message.error(err instanceof Error ? err.message : '请求失败');
    } finally {
      setQuickFetchLoading(false);
    }
  };

  return (
    <>
      <Button
        icon={<ThunderboltOutlined />}
        loading={quickFetchLoading}
        onClick={() => {
          quickFetchForm.setFieldsValue({
            industry: '安全行业',
            maxItems: 20,
            timeWindow: '24h',
            fetchMode: 'sources_plus_ai',
            reportOutputStyle: 'default',
          });
          setQuickFetchOpen(true);
        }}
      >
        {copy.buttonLabel}
      </Button>

      <Modal
        title={copy.modalTitle}
        open={quickFetchOpen}
        onCancel={() => setQuickFetchOpen(false)}
        onOk={handleQuickFetch}
        confirmLoading={quickFetchLoading}
        okText="创建并执行"
        cancelText="取消"
      >
        <Form form={quickFetchForm} layout="vertical">
          <Form.Item
            label="行业"
            name="industry"
            rules={[{ required: true, message: '请输入行业，例如：安全行业' }]}
          >
            <Input placeholder="例如：安全行业 / AI 行业 / 云计算行业" />
          </Form.Item>
          <Form.Item label="任务显示名称（可选）" name="displayName">
            <Input placeholder={copy.displayNamePlaceholder} />
          </Form.Item>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Form.Item label="单源最多文章数" name="maxItems">
              <InputNumber min={5} max={50} className="w-full" />
            </Form.Item>
            <Form.Item label="时间窗口" name="timeWindow">
              <Select
                options={[
                  { label: '近24小时', value: '24h' },
                  { label: '近3天', value: '3d' },
                  { label: '近7天', value: '7d' },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item label="资讯获取方式" name="fetchMode">
            <Select
              options={[
                { label: '数据源 + AI（推荐）', value: 'sources_plus_ai' },
                { label: '纯 AI 直接生成', value: 'pure_ai' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="报告输出格式"
            name="reportOutputStyle"
            extra=""
          >
            <Select
              options={[
                { label: '默认（提示词）', value: 'default' },
                { label: '昂楷团队资讯体', value: 'angkai' },
                { label: '样本示例（固定模版）', value: 'sample' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={null}
        open={quickProgressOpen}
        footer={null}
        closable={false}
        maskClosable={false}
        keyboard={false}
        centered
        width={560}
      >
        <AIThinking
          title={copy.progressTitle}
          subtitle={copy.progressSubtitle}
          progressItems={[
            {
              label: copy.stepCreate,
              status: quickProgressStep === 'create' ? 'processing' : 'completed',
            },
            {
              label: copy.stepAnalyze,
              status:
                quickProgressStep === 'create'
                  ? 'pending'
                  : quickProgressStep === 'collect'
                    ? 'processing'
                    : 'completed',
            },
            {
              label: copy.stepGenerate,
              status:
                quickProgressStep === 'done'
                  ? 'completed'
                  : quickProgressStep === 'generate'
                    ? 'processing'
                    : 'pending',
            },
          ]}
        />
      </Modal>
    </>
  );
}
