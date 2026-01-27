import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, RefreshCw, Maximize2, X, Play, Pause } from 'lucide-react';
import clsx from 'clsx';

interface MidsceneReportViewerProps {
  runId: string;
  reportPath?: string;
  isRunning: boolean;
  autoRefresh?: boolean; // 是否自动刷新（默认true）
}

/**
 * Midscene报告查看器
 * 实时显示Midscene生成的HTML报告
 */
export const MidsceneReportViewer: React.FC<MidsceneReportViewerProps> = ({
  runId,
  reportPath,
  isRunning,
  autoRefresh = true
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(autoRefresh);
  const [isRefreshing, setIsRefreshing] = useState(false); // 🔥 新增：刷新状态
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date()); // 🔥 新增：上次刷新时间
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 构建报告URL
  const getReportUrl = () => {
    if (reportPath) {
      // 使用提供的报告路径
      return `/${reportPath}?t=${refreshKey}`;
    }
    // 🔥 从后端API获取报告路径
    return `/api/midscene-report/${runId}?t=${refreshKey}`;
  };

  // 自动刷新（测试运行时且开关开启）
  useEffect(() => {
    if (isRunning && autoRefreshEnabled) {
      // 🔥 优化：测试运行时使用更长的刷新间隔（10秒），减少闪屏
      // Midscene AI执行较慢（10-30秒/步骤），不需要频繁刷新
      refreshIntervalRef.current = setInterval(() => {
        setIsRefreshing(true);
        setRefreshKey(prev => prev + 1);
        setLastRefreshTime(new Date());
        // 🔥 刷新提示显示500ms后自动隐藏
        setTimeout(() => setIsRefreshing(false), 500);
      }, 10000); // 从3秒改为10秒
    } else {
      // 测试完成或自动刷新关闭后停止刷新
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [isRunning, autoRefreshEnabled]);

  // 手动刷新
  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey(prev => prev + 1);
    setLastRefreshTime(new Date());
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // 切换自动刷新
  const handleToggleAutoRefresh = () => {
    setAutoRefreshEnabled(!autoRefreshEnabled);
  };

  // 在新窗口打开
  const handleOpenInNewWindow = () => {
    window.open(getReportUrl(), '_blank');
  };

  // 切换全屏
  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className={clsx(
      'bg-gray-800 rounded-lg overflow-hidden flex flex-col',
      isFullscreen ? 'fixed inset-2 z-50' : 'h-full'
    )}>
      {/* 工具栏 */}
      <div className="bg-gray-900 px-4 py-2 flex items-center justify-between border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Midscene 执行报告</span>
          {isRunning && autoRefreshEnabled && (
            <span className="flex items-center gap-1 text-xs text-blue-400">
              <RefreshCw className="w-3 h-3 animate-spin" />
              每10秒自动刷新
            </span>
          )}
          {/* 🔥 新增：刷新提示 */}
          {isRefreshing && (
            <span className="flex items-center gap-1 text-xs text-green-400 animate-pulse">
              <RefreshCw className="w-3 h-3" />
              正在刷新...
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* 自动刷新开关 */}
          <button
            onClick={handleToggleAutoRefresh}
            className={clsx(
              "p-1.5 rounded transition-colors flex items-center gap-1",
              autoRefreshEnabled 
                ? "bg-blue-600 hover:bg-blue-700 text-white" 
                : "hover:bg-gray-700 text-gray-400"
            )}
            title={autoRefreshEnabled ? "关闭自动刷新" : "开启自动刷新"}
          >
            {autoRefreshEnabled ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span className="text-xs">自动刷新</span>
          </button>
          
          <button
            onClick={handleRefresh}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="手动刷新报告"
          >
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
          
          <button
            onClick={handleOpenInNewWindow}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="在新窗口打开"
          >
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </button>
          
          <button
            onClick={handleToggleFullscreen}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title={isFullscreen ? '退出全屏' : '全屏显示'}
          >
            {isFullscreen ? (
              <X className="w-4 h-4 text-gray-400" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* 报告iframe - 🔥 修复：使用flex-1自动填充剩余空间 */}
      <iframe
        ref={iframeRef}
        src={getReportUrl()}
        className="w-full flex-1 bg-white"
        title="Midscene Report"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
};
