import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Spin, Alert } from 'antd';
import { RefreshCw } from 'lucide-react';

export default function ExternalFrame() {
  const [searchParams] = useSearchParams();
  const url = searchParams.get('url');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 监听侧边栏收缩状态变化
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'sidebarCollapsed') {
        setSidebarCollapsed(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorage);

    // 轮询检测（同页面 localStorage 变化不触发 storage 事件）
    const interval = setInterval(() => {
      const current = localStorage.getItem('sidebarCollapsed') === 'true';
      setSidebarCollapsed(prev => prev !== current ? current : prev);
    }, 300);

    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    // 重置状态
    setLoading(true);
    setError(false);
  }, [url]);

  const handleLoad = () => {
    setLoading(false);
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
  };

  const handleRefresh = () => {
    setLoading(true);
    setError(false);
    // 强制刷新 iframe
    const iframe = document.getElementById('external-frame') as HTMLIFrameElement;
    if (iframe && url) {
      // 通过修改 src 来强制刷新
      iframe.src = url;
    }
  };

  if (!url) {
    return (
      <div className="flex items-center justify-center h-full">
        <Alert
          message="错误"
          description="未提供 URL 参数"
          type="error"
          showIcon
        />
      </div>
    );
  }

  // 动态计算定位：全屏时占满整个视口，非全屏时根据侧边栏状态偏移
  const sidebarWidth = isFullscreen ? 0 : (sidebarCollapsed ? 80 : 250);
  const topOffset = isFullscreen ? 0 : 120; // 顶栏(80px) + TabBar(40px)

  return (
    <div
      className="fixed right-0 bottom-0"
      style={{
        left: `${sidebarWidth}px`,
        top: `${topOffset}px`,
        transition: 'left 0.3s ease-in-out, top 0.3s ease-in-out',
      }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <Spin size="large" spinning={true}>
            <div className="p-8">加载中...</div>
          </Spin>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <Alert
            message="加载失败"
            description={
              <div>
                <p>无法加载外部页面: {url}</p>
                <p className="mt-2 text-sm text-gray-500">
                  可能的原因：
                  <br />- 服务未启动
                  <br />- 网络连接问题
                  <br />- 页面设置了安全策略，不允许在 iframe 中显示（CSP: frame-ancestors）
                </p>
                <div className="mt-4 space-x-2">
                  <button
                    onClick={handleRefresh}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 inline-flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    重新加载
                  </button>
                  <button
                    onClick={() => window.open(url, '_blank')}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    在新窗口打开
                  </button>
                </div>
              </div>
            }
            type="error"
            showIcon
          />
        </div>
      )}

      <iframe
        id="external-frame"
        src={url}
        className="w-full h-full border-0"
        title="External Content"
        onLoad={handleLoad}
        onError={handleError}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
