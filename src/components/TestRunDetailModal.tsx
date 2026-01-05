import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { Modal, Spin } from 'antd';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Terminal,
  Image as ImageIcon,
  Loader2,
  Play,
  Square,
  AlertTriangle,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { testService } from '../services/testService';
import { showToast } from '../utils/toast';
import { LiveView } from './LiveView';
import { EvidenceViewerNew } from './EvidenceViewerNew';

import type { TestRun as TestRunType, TestCase } from '../types/test';

// 🔥 可折叠的日志消息组件 - 用于处理过长的MCP返回内容
const CollapsibleLogMessage: React.FC<{ message: string; maxLength?: number }> = ({ 
  message, 
  maxLength = 300 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // 判断是否需要折叠（内容过长或包含特定关键词）
  const needsCollapse = message.length > maxLength || 
    (message.includes('🔍') && message.length > 200) ||
    message.includes('MCP返回');
  
  if (!needsCollapse) {
    return <span className="text-gray-300 break-all whitespace-pre-wrap">{message}</span>;
  }
  
  // 截取摘要部分（取前面的描述性文字）
  const getSummary = () => {
    // 尝试提取关键操作描述
    const colonIndex = message.indexOf(':');
    if (colonIndex > 0 && colonIndex < 50) {
      return message.substring(0, Math.min(colonIndex + 20, maxLength)) + '...';
    }
    return message.substring(0, maxLength) + '...';
  };
  
  return (
    <span className="text-gray-300 break-all whitespace-pre-wrap">
      {isExpanded ? (
        <>
          {message}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(false);
            }}
            className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-blue-400 rounded transition-colors"
          >
            <ChevronUp className="w-3 h-3" />
            收起
          </button>
        </>
      ) : (
        <>
          {getSummary()}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
            className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-blue-400 rounded transition-colors"
          >
            <ChevronDown className="w-3 h-3" />
            展开 ({message.length}字符)
          </button>
        </>
      )}
    </span>
  );
};

interface TestRunDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  runId: string;
}

export const TestRunDetailModal: React.FC<TestRunDetailModalProps> = ({
  isOpen,
  onClose,
  runId,
}) => {
  const [testRun, setTestRun] = useState<TestRunType | null>(null);
  const [testCase, setTestCase] = useState<TestCase | null>(null); // 🔥 新增：测试用例详情
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'logs' | 'live' | 'evidence'>('logs');
  const [stopping, setStopping] = useState(false);
  const [duration, setDuration] = useState<string>('0s');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // 日志滚动容器引用
  const logsScrollRef = useRef<HTMLDivElement>(null);
  const lastLogRef = useRef<HTMLDivElement>(null);
  const prevLogsLengthRef = useRef<number>(0);
  // 测试证据滚动容器引用
  const evidenceScrollRef = useRef<HTMLDivElement>(null);

  // 安全的日期格式化函数
  const safeFormatDate = (date: Date | string | undefined, formatStr: string): string => {
    try {
      if (!date) return '未知';
      const dateObj = date instanceof Date ? date : new Date(date);
      if (isNaN(dateObj.getTime())) return '无效日期';
      return format(dateObj, formatStr);
    } catch (error) {
      console.error('日期格式化错误:', error, date);
      return '格式化错误';
    }
  };

  // 格式化时长（毫秒转字符串）
  const formatDuration = useCallback((ms: number): string => {
    if (ms < 0) return '0s';
    const totalSeconds = ms / 1000;
    const seconds = Math.floor(totalSeconds);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${totalSeconds.toFixed(3)}s`;
    }
  }, []);

  // 从日志中提取开始时间和结束时间
  const extractTimesFromLogs = useCallback((logs: TestRunType['logs']) => {
    if (!logs || logs.length === 0) {
      return { startTime: null, endTime: null };
    }
    
    const sortedLogs = [...logs].sort((a, b) => {
      const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
      const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
      return timeA - timeB;
    });
    
    const firstLog = sortedLogs[0];
    const lastLog = sortedLogs[sortedLogs.length - 1];
    
    const start = firstLog.timestamp instanceof Date ? firstLog.timestamp : new Date(firstLog.timestamp);
    const end = lastLog.timestamp instanceof Date ? lastLog.timestamp : new Date(lastLog.timestamp);
    
    return { startTime: start, endTime: end };
  }, []);

  const durationSyncedRef = useRef<boolean>(false);
  const prevStatusRef = useRef<string | null>(null);

  // 加载测试运行数据
  const loadTestRun = useCallback(async (silent = false) => {
    if (!runId) return;

    try {
      if (!silent) setLoading(true);

      const run = await testService.getTestRunById(runId);

      if (run) {
        // 🔥 修复：优先使用 actualStartedAt（用例实际开始执行时间），其次是 startedAt
        const actualStartTime = (run as any).actualStartedAt || run.startedAt || (run as any).startTime;
        const defaultStartTime = actualStartTime ? new Date(actualStartTime) : new Date();
        
        const processedRun = {
          ...run,
          startedAt: run.startedAt ? new Date(run.startedAt) : defaultStartTime,
          actualStartedAt: (run as any).actualStartedAt ? new Date((run as any).actualStartedAt) : defaultStartTime,
          progress: run.progress ?? 0,
          totalSteps: run.totalSteps ?? 0,
          completedSteps: run.completedSteps ?? 0,
          passedSteps: run.passedSteps ?? 0,
          failedSteps: run.failedSteps ?? 0,
          logs: (run.logs || []).map(log => ({
            ...log,
            timestamp: log.timestamp ? new Date(log.timestamp) : new Date()
          }))
        } as TestRunType;
        
        setTestRun(processedRun);
        prevLogsLengthRef.current = processedRun.logs?.length || 0;
        
        // 🔥 获取测试用例详情，用于计算步骤和断言的准确数量
        if (processedRun.testCaseId) {
          try {
            const caseDetail = await testService.getTestCaseById(processedRun.testCaseId);
            setTestCase(caseDetail);
            console.log('✅ Modal: 获取测试用例详情成功:', caseDetail.name);
          } catch (error) {
            console.warn('⚠️ Modal: 获取测试用例详情失败:', error);
          }
        }
        
        // 🔥 修复：优先使用 actualStartedAt，其次是从日志中提取的时间
        const { startTime: logStartTime, endTime: logEndTime } = extractTimesFromLogs(processedRun.logs);
        
        // 优先使用 actualStartedAt，其次是从日志中提取的时间
        const effectiveStartTime = (processedRun as any).actualStartedAt || logStartTime || processedRun.startedAt;
        if (effectiveStartTime) {
          setStartTime(effectiveStartTime instanceof Date ? effectiveStartTime : new Date(effectiveStartTime));
        }
        
        if (logEndTime) {
          setEndTime(logEndTime);
        }
        
        if (processedRun.status !== 'running' && processedRun.status !== 'queued') {
          if (logStartTime && logEndTime) {
            const durationMs = logEndTime.getTime() - logStartTime.getTime();
            const durationStr = formatDuration(durationMs);
            setDuration(durationStr);
          } else if (run.duration && run.duration !== '0s') {
            setDuration(run.duration);
          }
        }
      } else {
        showToast.error('找不到该测试运行记录');
      }
    } catch (error) {
      console.error('加载测试运行记录失败:', error);
      if (!silent) {
        showToast.error('加载测试运行记录失败');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [runId, extractTimesFromLogs, formatDuration]);

  // 弹窗打开时加载数据
  useEffect(() => {
    if (isOpen && runId) {
      durationSyncedRef.current = false;
      prevStatusRef.current = null;
      loadTestRun();
    }
  }, [isOpen, runId, loadTestRun]);

  // WebSocket 监听器
  useEffect(() => {
    if (!isOpen || !runId) return;

    interface WebSocketLog {
      id?: string;
      timestamp?: string | Date;
      level?: 'info' | 'success' | 'warning' | 'error';
      message?: string;
      stepId?: string;
    }
    
    interface TestCompleteData {
      status?: string;
      startedAt?: string;
      endedAt?: string;
      actualStartedAt?: string;
      actualEndedAt?: string;
      duration?: string;
      progress?: number;
      completedSteps?: number;
      totalSteps?: number;
      passedSteps?: number;
      failedSteps?: number;
    }
    
    const handleWebSocketMessage = (message: { 
      type: string; 
      runId?: string; 
      data?: { 
        status?: string;
        progress?: number;
        completedSteps?: number;
        totalSteps?: number;
        passedSteps?: number;
        failedSteps?: number;
        endedAt?: string;
        duration?: string;
        id?: string;
        logs?: WebSocketLog[];
      }; 
      id?: string;
      logs?: WebSocketLog[];
    }) => {
      // 处理日志消息
      if ((message.type === 'log' || message.type === 'logs_batch') && message.runId === runId) {
        const logs = (message as { logs?: WebSocketLog[]; data?: { logs?: WebSocketLog[] } }).logs || 
                     (message as { logs?: WebSocketLog[]; data?: { logs?: WebSocketLog[] } }).data?.logs || [];
        if (logs.length > 0) {
          setTestRun(prev => {
            if (!prev) return prev;
            const formattedLogs = logs.map((log: WebSocketLog) => ({
              id: log.id || `log-${Date.now()}-${Math.random()}`,
              timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
              level: (log.level || 'info') as 'info' | 'success' | 'warning' | 'error',
              message: log.message || '',
              stepId: log.stepId
            }));
            const existingLogIds = new Set(prev.logs.map(l => l.id));
            const newLogs = formattedLogs.filter((log) => !existingLogIds.has(log.id));
            return {
              ...prev,
              logs: [...prev.logs, ...newLogs]
            };
          });
          
          if (activeTab === 'logs') {
            requestAnimationFrame(() => {
              const container = logsScrollRef.current;
              if (container) {
                container.scrollTop = container.scrollHeight;
                if (lastLogRef.current) {
                  lastLogRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
                }
              }
            });
          }
        }
      }
      // 处理测试运行状态更新
      else if (message.type === 'test_update' && message.runId === runId) {
        setTestRun(prev => {
          if (!prev) return prev;
          const newStatus = message.data?.status;
          
          return {
            ...prev,
            status: (newStatus || prev.status) as TestRunType['status'],
            progress: message.data?.progress ?? prev.progress,
            completedSteps: message.data?.completedSteps ?? prev.completedSteps,
            totalSteps: message.data?.totalSteps ?? prev.totalSteps,
            passedSteps: message.data?.passedSteps ?? prev.passedSteps,
            failedSteps: message.data?.failedSteps ?? prev.failedSteps,
          };
        });
      }
      // 处理测试完成消息
      else if (message.type === 'test_complete' && message.runId === runId) {
        if (message.data) {
          const data = message.data as TestCompleteData;
          
          const messageStartTime = data.actualStartedAt || data.startedAt;
          const messageEndTime = data.actualEndedAt || data.endedAt;
          
          if (messageStartTime && messageEndTime) {
            const start = new Date(messageStartTime);
            const end = new Date(messageEndTime);
            const calcDuration = end.getTime() - start.getTime();
            const calcDurationStr = formatDuration(calcDuration);
            
            setStartTime(start);
            setEndTime(end);
            setDuration(calcDurationStr);
            durationSyncedRef.current = true;
          }
          
          setTestRun(prev => {
            if (!prev) return prev;
            
            return {
              ...prev,
              status: (data.status || prev.status) as TestRunType['status'],
              progress: data.progress ?? prev.progress ?? 100,
              completedSteps: data.completedSteps ?? prev.completedSteps,
              totalSteps: data.totalSteps ?? prev.totalSteps,
              passedSteps: data.passedSteps ?? prev.passedSteps,
              failedSteps: data.failedSteps ?? prev.failedSteps,
              endTime: messageEndTime ? new Date(messageEndTime) : (prev as TestRunType & { endTime?: Date }).endTime,
            };
          });
        }
      }
      // 处理测试套件更新
      else if (message.type === 'suiteUpdate' && message.data?.id === runId) {
        loadTestRun(true);
      }
    };

    testService.addMessageListener(`test-run-modal-${runId}`, handleWebSocketMessage);

    return () => {
      testService.removeMessageListener(`test-run-modal-${runId}`);
    };
  }, [isOpen, runId, loadTestRun, formatDuration, activeTab]);

  // 🔥 修复：确保 duration 始终与显示的 startTime 和 endTime 一致
  useEffect(() => {
    if (!testRun) return;
    
    // 如果测试已完成，且 startTime 和 endTime 都存在，则根据它们计算 duration
    if (testRun.status !== 'running' && testRun.status !== 'queued') {
      if (startTime && endTime) {
        const durationMs = endTime.getTime() - startTime.getTime();
        if (durationMs >= 0) {
          const durationStr = formatDuration(durationMs);
          setDuration(durationStr);
          console.log(`✅ [Modal时长修复] 根据显示的开始和结束时间重新计算 duration: ${durationStr} (${durationMs}ms)`);
        }
      }
      return;
    }
    
    // 如果测试正在运行，且 startTime 存在，则实时更新 duration
    if (testRun.status === 'running' && startTime) {
      const durationInterval = setInterval(() => {
        const now = new Date();
        const durationMs = now.getTime() - startTime.getTime();
        if (durationMs >= 0) {
          const durationStr = formatDuration(durationMs);
          setDuration(durationStr);
          setEndTime(now);
        }
      }, 100);

      return () => clearInterval(durationInterval);
    }
  }, [testRun?.status, startTime, endTime, formatDuration]);

  // 实时更新执行时长（从日志中提取时间 - 仅作为备用方案）
  useEffect(() => {
    if (!testRun || !testRun.logs || testRun.logs.length === 0) return;
    
    if (durationSyncedRef.current) {
      prevStatusRef.current = testRun.status;
      return;
    }
    
    const { startTime: logStartTime, endTime: logEndTime } = extractTimesFromLogs(testRun.logs);
    
    if (logStartTime) {
      setStartTime(logStartTime);
    }
    
    if (testRun.status !== 'running' && testRun.status !== 'queued') {
      if (logEndTime) {
        setEndTime(logEndTime);
      }
      
      // 🔥 注意：duration 的计算已在上面的 useEffect 中处理（基于 startTime 和 endTime）
      // 这里不再直接计算 duration，而是依赖上面的 useEffect 来处理
      
      const wasRunning = prevStatusRef.current === 'running';
      const justCompleted = wasRunning && (testRun.status === 'completed' || testRun.status === 'failed' || testRun.status === 'cancelled' || testRun.status === 'error');
      
      if (justCompleted && !durationSyncedRef.current && runId) {
        durationSyncedRef.current = true;
      }
      
      prevStatusRef.current = testRun.status;
      return;
    }
    
    prevStatusRef.current = testRun.status;
  }, [testRun?.status, testRun?.logs, runId, extractTimesFromLogs]);

  // 当有新日志时自动滚动到底部
  useLayoutEffect(() => {
    if (!testRun?.logs) {
      prevLogsLengthRef.current = 0;
      return;
    }
    
    const currentLogsLength = testRun.logs.length;
    const prevLogsLength = prevLogsLengthRef.current;
    
    if (activeTab === 'logs' && currentLogsLength > prevLogsLength && currentLogsLength > 0) {
      const scrollToBottom = () => {
        const container = logsScrollRef.current;
        if (container) {
          if (lastLogRef.current) {
            lastLogRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
          }
          container.scrollTop = container.scrollHeight;
        }
      };
      
      scrollToBottom();
      requestAnimationFrame(() => {
        scrollToBottom();
        setTimeout(() => scrollToBottom(), 100);
      });
    }
    
    prevLogsLengthRef.current = currentLogsLength;
  }, [testRun?.logs, activeTab]);

  const handleStopTest = async () => {
    if (!runId || !testRun || stopping) return;

    try {
      setStopping(true);
      await testService.cancelTest(runId);
      showToast.success('停止测试请求已发送');
      await loadTestRun(true);
    } catch (error) {
      console.error('停止测试失败:', error);
      showToast.error('停止测试失败');
    } finally {
      setStopping(false);
    }
  };

  const getStatusIcon = (status: TestRunType['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'queued':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'cancelled':
        return <AlertCircle className="h-5 w-5 text-gray-600" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: TestRunType['status']) => {
    const statusMap: Record<string, string> = {
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      queued: '排队中',
      cancelled: '已取消',
      error: '错误'
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: TestRunType['status']) => {
    const colorMap: Record<string, string> = {
      running: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      queued: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-gray-100 text-gray-800',
      error: 'bg-red-100 text-red-800'
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800';
  };

  const getLevelIcon = (level: TestRunType['logs'][0]['level']) => {
    switch (level) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Terminal className="h-4 w-4 text-blue-600" />;
    }
  };

  // 🔥 解析测试用例定义中的步骤数量
  const parseStepsFromTestCase = (stepsText: string): number => {
    if (!stepsText || typeof stepsText !== 'string') return 0;
    // 按换行符分隔，过滤空行，统计有效步骤数
    const lines = stepsText.split('\n').filter(line => line.trim());
    // 匹配格式如 "1. xxx" 或 "1、xxx" 或纯文本行
    return lines.filter(line => line.trim().length > 0).length;
  };

  // 🔥 解析测试用例定义中的断言数量
  const parseAssertionsFromTestCase = (assertionsText: string): number => {
    if (!assertionsText || typeof assertionsText !== 'string') return 0;
    // 按换行符分隔，过滤空行，统计有效断言数
    const lines = assertionsText.split('\n').filter(line => line.trim());
    return Math.max(lines.length, 0);
  };

  // 计算步骤和断言统计数据（分开统计）
  // 🔥 修复：优先从测试用例原始定义中获取总数，从日志中获取执行结果
  const calculateStepAndAssertionStats = () => {
    if (!testRun) {
      return {
        totalOperationSteps: 0,
        completedOperationSteps: 0,
        passedOperationSteps: 0,
        failedOperationSteps: 0,
        totalAssertions: 0,
        completedAssertions: 0,
        passedAssertions: 0,
        failedAssertions: 0
      };
    }

    // 🔥 步骤1：从测试用例原始定义中计算总步骤数和总断言数
    let totalOperationSteps = 0;
    let totalAssertions = 0;

    if (testCase) {
      // 优先从测试用例原始定义中解析
      totalOperationSteps = parseStepsFromTestCase(testCase.steps);
      totalAssertions = parseAssertionsFromTestCase(testCase.assertions || '');
      console.log('📊 Modal: 从测试用例解析:', { 
        steps: testCase.steps, 
        assertions: testCase.assertions,
        totalOperationSteps, 
        totalAssertions 
      });
    }

    // 🔥 步骤2：如果测试用例没有数据，回退到从日志和运行时数据中提取
    if (totalOperationSteps === 0) {
      // 从日志中识别操作步骤执行记录
      const operationStepLogs = testRun.logs?.filter(log => 
        log.message?.match(/执行步骤\s*\d+/) && 
        !log.message?.match(/执行断言/) &&
        !log.message?.match(/截图/) &&
        !log.message?.includes('📸')
      ) || [];
      
      const operationStepNumbers = new Set<number>();
      operationStepLogs.forEach(log => {
        const match = log.message?.match(/执行步骤\s*(\d+)/);
        if (match) {
          operationStepNumbers.add(parseInt(match[1], 10));
        }
      });
      const totalOperationStepsFromLogs = operationStepNumbers.size > 0 ? Math.max(...Array.from(operationStepNumbers)) : 0;
      
      // 从 testRun.steps 中识别操作步骤
      const operationSteps = testRun.steps?.filter(step => 
        step.stepType !== 'assertion' && 
        step.action !== 'expect' &&
        (!step.id || !step.id.startsWith('assertion-'))
      ) || [];
      
      totalOperationSteps = operationSteps.length > 0 
        ? operationSteps.length 
        : (totalOperationStepsFromLogs > 0 
            ? totalOperationStepsFromLogs 
            : (testRun.totalSteps ?? 0));
    }

    if (totalAssertions === 0) {
      // 从日志中识别断言执行记录
      const assertionExecutionLogs = testRun.logs?.filter(log => 
        log.message?.match(/执行断言\s*\d+/)
      ) || [];

      const assertionNumbers = new Set<number>();
      assertionExecutionLogs.forEach(log => {
        const match = log.message?.match(/执行断言\s*(\d+)/);
        if (match) {
          assertionNumbers.add(parseInt(match[1], 10));
        }
      });
      const totalAssertionsFromLogs = assertionNumbers.size > 0 ? Math.max(...Array.from(assertionNumbers)) : 0;
      
      // 从 testRun.steps 中识别断言步骤
      const assertionSteps = testRun.steps?.filter(step => 
        step.stepType === 'assertion' || 
        step.action === 'expect' ||
        (step.id && step.id.startsWith('assertion-'))
      ) || [];
      
      totalAssertions = totalAssertionsFromLogs > 0 ? totalAssertionsFromLogs : assertionSteps.length;
    }

    // 🔥 步骤3：从日志中统计执行结果（通过/失败/完成）
    // 操作步骤通过数 - 匹配各种成功格式:
    // - "✅ 步骤 1 执行成功"
    // - "✅ [步骤 1] 执行成功"  
    // - "步骤 1 执行成功"
    const passedOperationStepLogs = testRun.logs?.filter(log => {
      const msg = log.message || '';
      // 排除截图相关日志
      if (msg.includes('截图') || msg.includes('📸')) return false;
      // 匹配步骤执行成功的各种格式
      return msg.match(/✅.*步骤\s*\d+.*执行成功/) || 
             msg.match(/✅.*\[步骤\s*\d+\].*执行成功/) ||
             msg.match(/步骤\s*\d+\s*执行成功/);
    }) || [];
    
    // 操作步骤失败数 - 匹配各种失败格式:
    // - "❌ 步骤 1 执行失败"
    // - "❌ [步骤 1] 执行失败"
    // - "步骤 1 失败"
    const failedOperationStepLogs = testRun.logs?.filter(log => {
      const msg = log.message || '';
      // 排除截图和断言相关日志
      if (msg.includes('截图') || msg.includes('📸') || msg.includes('断言')) return false;
      // 匹配步骤执行失败的各种格式
      return msg.match(/❌.*步骤\s*\d+.*失败/) ||
             msg.match(/❌.*\[步骤\s*\d+\].*失败/) ||
             msg.match(/步骤\s*\d+\s*失败/) ||
             msg.match(/步骤执行最终失败/);
    }) || [];

    // 断言通过数 - 匹配各种通过格式:
    // - "✅ 断言验证通过: xxx"
    // - "✅ 默认断言验证通过: xxx"
    // - "✅ 等待文本断言通过: xxx"
    // - "断言 1 通过"
    const passedAssertionLogs = testRun.logs?.filter(log => {
      const msg = log.message || '';
      // 排除截图和解析相关日志
      if (msg.includes('截图') || msg.includes('解析成功') || msg.includes('匹配成功')) return false;
      // 匹配断言通过的各种格式
      return msg.match(/断言验证通过/) ||
             msg.match(/默认断言验证通过/) ||
             msg.match(/等待文本断言通过/) ||
             msg.match(/断言\s*\d+\s*通过/);
    }) || [];
    
    // 断言失败数 - 匹配各种失败格式:
    // - "❌ 断言验证失败: xxx"
    // - "❌ 断言 1 失败: xxx"
    // - "❌ 等待文本断言失败: xxx"
    const failedAssertionLogs = testRun.logs?.filter(log => {
      const msg = log.message || '';
      // 匹配断言失败的各种格式
      return msg.match(/断言验证失败/) ||
             msg.match(/等待文本断言失败/) ||
             msg.match(/❌.*断言\s*\d+\s*失败/) ||
             msg.match(/断言\s*\d+\s*失败/);
    }) || [];

    const passedOperationSteps = passedOperationStepLogs.length;
    const failedOperationSteps = failedOperationStepLogs.length;
    const completedOperationSteps = passedOperationSteps + failedOperationSteps;

    const passedAssertions = passedAssertionLogs.length;
    const failedAssertions = failedAssertionLogs.length;
    const completedAssertions = passedAssertions + failedAssertions;

    return {
      // 操作步骤统计
      totalOperationSteps: Math.max(totalOperationSteps, 0),
      completedOperationSteps: Math.max(completedOperationSteps, 0),
      passedOperationSteps: Math.max(passedOperationSteps, 0),
      failedOperationSteps: Math.max(failedOperationSteps, 0),
      // 断言统计
      totalAssertions: Math.max(totalAssertions, 0),
      completedAssertions: Math.max(completedAssertions, 0),
      passedAssertions: Math.max(passedAssertions, 0),
      failedAssertions: Math.max(failedAssertions, 0)
    };
  };

  const stats = calculateStepAndAssertionStats();

  // 切换全屏模式
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // 处理键盘滚动快捷键
  const handleScrollKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, scrollRef: React.RefObject<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;

    switch (e.key) {
      case 'Home':
        e.preventDefault();
        container.scrollTop = 0;
        break;
      case 'End':
        e.preventDefault();
        container.scrollTop = container.scrollHeight;
        break;
      case 'PageDown':
        e.preventDefault();
        container.scrollTop += container.clientHeight * 0.9;
        break;
      case 'PageUp':
        e.preventDefault();
        container.scrollTop -= container.clientHeight * 0.9;
        break;
      default:
        // 其他按键不做处理
        break;
    }
  };

  return (
    <Modal
      title={
        <div className="flex items-center justify-between pr-8">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-blue-500" />
            <span className="font-bold">测试执行详情</span>
          </div>
          <button
            onClick={toggleFullscreen}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100 transition-colors mt-[-8px]"
            title={isFullscreen ? '退出全屏' : '全屏显示'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-gray-600" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-600" />
            )}
          </button>
        </div>
      }
      open={isOpen}
      onCancel={onClose}
      footer={null}
      width={isFullscreen ? '100vw' : 1400}
      centered={!isFullscreen}
      style={isFullscreen ? { top: 0, margin: 0, maxWidth: '100vw', paddingBottom: 0 } : undefined}
      styles={{
        body: {
          height: isFullscreen ? 'calc(100vh - 55px)' : '80vh',
          padding: '0px 10px 10px 10px',
          overflow: 'hidden',
        },
        content: isFullscreen ? {
          maxWidth: '100vw',
          margin: 0,
          top: 0,
          paddingBottom: 0,
          borderRadius: 0,
        } : undefined,
        wrapper: isFullscreen ? {
          overflow: 'hidden',
        } : undefined,
      }}
      wrapClassName={isFullscreen ? 'fullscreen-modal-wrap' : ''}
      destroyOnClose
    >
      {loading ? (
        <div className="h-full flex items-center justify-center">
          <Spin size="large" />
          <p className="text-gray-500 ml-4">加载中...</p>
        </div>
      ) : !testRun ? (
        <div className="h-full flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-600 mr-4" />
          <p className="text-gray-600">找不到该测试运行记录</p>
        </div>
      ) : (
        <div className="flex flex-col h-full overflow-hidden">
          {/* 顶部信息栏 */}
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <div>
              <p className="text-sm text-gray-500">ID: {testRun.id}</p>
              <h2 className="text-xl font-bold text-gray-900 max-w-[800px] truncate" title={testRun.name || `测试运行 ${testRun.id}`}>
                {testRun.name || `测试运行 ${testRun.id}`}
              </h2>
            </div>
            {testRun && (
              <div className={clsx('px-4 py-2 rounded-lg flex items-center gap-2 text-md', getStatusColor(testRun.status))}>
                {getStatusIcon(testRun.status)}
                <span className="font-medium">{getStatusText(testRun.status)}</span>
              </div>
            )}
            {testRun.status === 'running' && (
              <button
                onClick={handleStopTest}
                disabled={stopping}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <Square className="h-4 w-4" />
                {stopping ? '停止中...' : '停止测试'}
              </button>
            )}
          </div>

          {/* 统计信息 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 flex-shrink-0">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">执行进度</div>
              <div className="text-xl font-bold text-gray-900">{testRun.progress ?? 0}%</div>
              <div className="flex flex-col gap-1 mt-2">
                <div className="text-xs text-gray-600">
                  步骤：{stats.completedOperationSteps} / {stats.totalOperationSteps}
                </div>
                <div className="text-xs text-gray-600">
                  断言：{stats.completedAssertions} / {stats.totalAssertions}
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">执行结果</div>
              <div className="flex items-center gap-3">
                {(stats.passedOperationSteps === stats.totalOperationSteps && stats.passedAssertions === stats.totalAssertions) ? (
                  <span className="text-xl font-bold text-green-600">全部通过</span>
                ) : (
                  <span className="text-xl font-bold text-red-600">失败</span>
                )}
              </div>
              <div className="flex flex-col gap-1 mt-2">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="text-green-600 font-medium">{stats.passedOperationSteps}</span>通过
                  <span className="text-red-600 font-medium">{stats.failedOperationSteps}</span>失败
                  <span className="text-orange-600 font-medium">{Math.max(0, stats.totalOperationSteps - stats.passedOperationSteps - stats.failedOperationSteps)}</span>阻塞
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="text-green-600 font-medium">{stats.passedAssertions}</span>通过
                  <span className="text-red-600 font-medium">{stats.failedAssertions}</span>失败
                  <span className="text-orange-600 font-medium">{Math.max(0, stats.totalAssertions - stats.passedAssertions - stats.failedAssertions)}</span>阻塞
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">执行时长</div>
              <div className="text-xl font-bold text-gray-900">{duration}</div>
              <div className="flex flex-col gap-1 mt-2 text-xs text-gray-600">
                {startTime && (
                  <div>开始：{format(new Date(startTime), 'HH:mm:ss.SSS')}</div>
                )}
                {endTime && (
                  <div>结束：{format(new Date(endTime), 'HH:mm:ss.SSS')}</div>
                )}
              </div>
            </div>
          </div>

          {/* 标签页 */}
          <div className="bg-white rounded-lg border border-gray-200 flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="border-b border-gray-200 flex-shrink-0">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('logs')}
                  className={clsx(
                    'px-6 py-3 text-sm font-medium border-b-2',
                    activeTab === 'logs'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}
                >
                  <Terminal className="h-4 w-4 inline mr-2" />
                  执行日志
                </button>
                <button
                  onClick={() => setActiveTab('live')}
                  className={clsx(
                    'px-6 py-3 text-sm font-medium border-b-2',
                    activeTab === 'live'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}
                >
                  <Play className="h-4 w-4 inline mr-2" />
                  实时视图
                </button>
                <button
                  onClick={() => setActiveTab('evidence')}
                  className={clsx(
                    'px-6 py-3 text-sm font-medium border-b-2',
                    activeTab === 'evidence'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}
                >
                  <ImageIcon className="h-4 w-4 inline mr-2" />
                  测试证据
                </button>
              </nav>
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {activeTab === 'logs' && (
                <div className="flex-1 flex flex-col p-4 min-h-0 overflow-hidden">
                  <div 
                    ref={logsScrollRef}
                    tabIndex={0}
                    onKeyDown={(e) => handleScrollKeyDown(e, logsScrollRef)}
                    className="bg-gray-900 rounded-lg p-4 flex-1 min-h-0 overflow-y-auto font-mono text-sm focus:outline-none"
                  >
                    {testRun.logs.length === 0 ? (
                      <div className="text-gray-600 text-center py-8">暂无日志</div>
                    ) : (
                      testRun.logs.map((log, index) => (
                        <div 
                          key={log.id} 
                          ref={index === testRun.logs.length - 1 ? lastLogRef : null}
                          className="flex items-start gap-3 py-1 hover:bg-gray-800 px-2 rounded"
                        >
                          <span className="text-gray-500 flex-shrink-0">
                            {safeFormatDate(log.timestamp, 'yyyy-MM-dd HH:mm:ss.SSS')}
                          </span>
                          <span className="flex-shrink-0">{getLevelIcon(log.level)}</span>
                          <CollapsibleLogMessage message={log.message} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'live' && (
                <div className="flex-1 flex flex-col p-4 min-h-0 overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-hidden">
                    {testRun.status === 'running' ? (
                      <LiveView runId={testRun.id} />
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-8 text-center h-full flex flex-col items-center justify-center">
                        <AlertCircle className="h-12 w-12 text-gray-600 mb-4" />
                        <p className="text-gray-600">测试未在运行中，无法查看实时画面</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'evidence' && (
                <div className="flex-1 flex flex-col p-4 min-h-0 overflow-hidden">
                  <div 
                    ref={evidenceScrollRef}
                    tabIndex={0}
                    onKeyDown={(e) => handleScrollKeyDown(e, evidenceScrollRef)}
                    className="flex-1 min-h-0 overflow-auto focus:outline-none"
                  >
                    <EvidenceViewerNew runId={testRun.id} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

