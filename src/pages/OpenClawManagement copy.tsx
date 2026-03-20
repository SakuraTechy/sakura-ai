import { useState, useEffect } from 'react';
import { Card, Button, Tabs, Space, Tag, Descriptions, Alert, Spin, message } from 'antd';
import { 
  PlayCircle, 
  StopCircle, 
  RefreshCw, 
  Settings, 
  Activity,
  Server,
  Globe,
  Shield,
  FileText,
  ExternalLink,
  Layout as LayoutIcon,
  Bot
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTabs } from '../contexts/TabContext';

interface OpenClawStatus {
  running: boolean;
  containerStatus?: string;
  mode: string;
  bind: string;
  version: string;
  workspace: string;
  uptime?: number;
  deploymentType?: string;
}

interface OpenClawConfig {
  gateway: {
    mode: string;
    bind: string;
    controlUi: {
      dangerouslyAllowHostHeaderOriginFallback: boolean;
      allowedOrigins: string[];
    };
  };
  agents: {
    defaults: {
      workspace: string;
    };
  };
}

export default function OpenClawManagement() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<OpenClawStatus | null>(null);
  const [config, setConfig] = useState<OpenClawConfig | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [gatewayToken, setGatewayToken] = useState<string>('');
  const { addTab } = useTabs();

  // 获取当前服务器地址
  const getServerUrl = () => {
    // 使用当前访问的主机名和协议
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}`;
  };

  // 获取 OpenClaw 的代理地址（通过后端代理访问，移除 CSP 限制）
  const getOpenClawUrl = () => {
    // 使用后端代理路由访问 OpenClaw，后端会移除 CSP 响应头
    return '/api/openclaw-proxy';
  };

  // 获取带令牌的 OpenClaw URL
  const getOpenClawUrlWithToken = (path: string = '') => {
    // 使用从后端获取的令牌，如果没有则使用默认值
    const token = gatewayToken || 'cd7c696a75f6966c3e79334ff709952ae576f5b2633435eef4092c38bb801da7';
    // 使用 hash 参数传递令牌，OpenClaw 会自动识别并保存
    const normalizedPath = path === '' ? '/' : (path.startsWith('/') ? path : `/${path}`);
    return `${getOpenClawUrl()}${normalizedPath}#token=${token}`;
  };

  // 在 Tab 中打开 OpenClaw 控制面板
  const openInTab = (path: string, title: string) => {
    // 使用带令牌的 URL，刷新后令牌会自动保留
    const openclawUrl = getOpenClawUrlWithToken(path);
    const externalPath = `/external?url=${encodeURIComponent(openclawUrl)}`;
    
    addTab({
      path: externalPath,
      title: title,
      icon: <Bot className="h-4 w-4" />
    });
  };

  // 获取认证 token
  const getAuthToken = () => {
    return localStorage.getItem('authToken') || '';
  };

  // 创建带认证的 fetch 请求
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = getAuthToken();
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  };

  // 获取 OpenClaw Gateway 令牌
  const fetchGatewayToken = async () => {
    try {
      const response = await authFetch('/api/openclaw/token');
      if (response.ok) {
        const data = await response.json();
        setGatewayToken(data.token);
      } else {
        console.warn('无法获取 OpenClaw Gateway 令牌，使用默认值');
      }
    } catch (error) {
      console.error('获取 OpenClaw Gateway 令牌失败:', error);
    }
  };

  // 获取 OpenClaw 状态
  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await authFetch('/api/openclaw/status');
      if (!response.ok) {
        throw new Error('获取状态失败');
      }
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch OpenClaw status:', error);
      // 设置默认状态，避免页面崩溃
      setStatus({
        running: false,
        mode: 'local',
        bind: 'lan',
        version: 'unknown',
        workspace: '/home/node/.openclaw/workspace',
        uptime: 0,
        deploymentType: 'docker'
      });
      message.warning('无法获取 OpenClaw 状态，请检查服务是否正常运行');
    } finally {
      setLoading(false);
    }
  };

  // 获取 OpenClaw 配置
  const fetchConfig = async () => {
    try {
      const response = await authFetch('/api/openclaw/config');
      if (!response.ok) {
        throw new Error('获取配置失败');
      }
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('Failed to fetch OpenClaw config:', error);
      // 设置默认配置
      setConfig({
        gateway: {
          mode: 'local',
          bind: 'lan',
          controlUi: {
            dangerouslyAllowHostHeaderOriginFallback: true,
            allowedOrigins: ['*']
          }
        },
        agents: {
          defaults: {
            workspace: '/home/node/.openclaw/workspace'
          }
        }
      });
    }
  };

  // 启动 OpenClaw
  const handleStart = async () => {
    setLoading(true);
    try {
      const response = await authFetch('/api/openclaw/start', { method: 'POST' });
      if (response.ok) {
        message.success('OpenClaw 启动命令已执行，请稍等片刻');
        setTimeout(() => fetchStatus(), 3000);
      } else {
        const data = await response.json();
        message.error(`启动失败: ${data.message || '未知错误'}`);
      }
    } catch (error) {
      message.error('启动失败');
      console.error('Failed to start OpenClaw:', error);
    } finally {
      setLoading(false);
    }
  };

  // 停止 OpenClaw
  const handleStop = async () => {
    setLoading(true);
    try {
      const response = await authFetch('/api/openclaw/stop', { method: 'POST' });
      if (response.ok) {
        message.success('OpenClaw 停止命令已执行');
        setTimeout(() => fetchStatus(), 2000);
      } else {
        const data = await response.json();
        message.error(`停止失败: ${data.message || '未知错误'}`);
      }
    } catch (error) {
      message.error('停止失败');
      console.error('Failed to stop OpenClaw:', error);
    } finally {
      setLoading(false);
    }
  };

  // 重启 OpenClaw
  const handleRestart = async () => {
    setLoading(true);
    try {
      const response = await authFetch('/api/openclaw/restart', { method: 'POST' });
      if (response.ok) {
        message.success('OpenClaw 重启命令已执行，请稍等片刻');
        setTimeout(() => fetchStatus(), 3000);
      } else {
        const data = await response.json();
        message.error(`重启失败: ${data.message || '未知错误'}`);
      }
    } catch (error) {
      message.error('重启失败');
      console.error('Failed to restart OpenClaw:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取日志
  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const response = await authFetch('/api/openclaw/logs?lines=100');
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || '暂无日志');
      } else {
        setLogs('获取日志失败');
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      setLogs('获取日志失败');
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchGatewayToken();
    fetchStatus();
    fetchConfig();
    
    // 每30秒刷新一次状态
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const tabItems = [
    {
      key: 'overview',
      label: (
        <span className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          概览
        </span>
      ),
      children: (
        <div className="space-y-6">
          {/* 状态卡片 */}
          <Card title="服务状态" className="shadow-sm">
            <Spin spinning={loading} tip="加载中...">
              <div className="min-h-[200px]">
                <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`h-3 w-3 rounded-full ${status?.running ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  <span className="text-lg font-medium">
                    {status?.running ? '运行中' : '已停止'}
                  </span>
                  {status?.running && status?.uptime && status.uptime > 0 && (
                    <Tag color="blue">运行时长: {Math.floor(status.uptime / 60)} 分钟</Tag>
                  )}
                </div>
                <Space>
                  <Button
                    type="primary"
                    icon={<PlayCircle className="h-4 w-4" />}
                    onClick={handleStart}
                    disabled={status?.running || loading}
                  >
                    启动
                  </Button>
                  <Button
                    danger
                    icon={<StopCircle className="h-4 w-4" />}
                    onClick={handleStop}
                    disabled={!status?.running || loading}
                  >
                    停止
                  </Button>
                  <Button
                    icon={<RefreshCw className="h-4 w-4" />}
                    onClick={handleRestart}
                    disabled={loading}
                  >
                    重启
                  </Button>
                  <Button
                    icon={<RefreshCw className="h-4 w-4" />}
                    onClick={fetchStatus}
                    disabled={loading}
                  >
                    刷新
                  </Button>
                </Space>
              </div>

              {status && (
                <Descriptions bordered column={2}>
                  <Descriptions.Item label="版本">{status.version || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="运行模式">
                    <Tag color={status.mode === 'local' ? 'green' : 'blue'}>
                      {status.mode}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="绑定地址">{status.bind || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="工作空间" span={1}>{status.workspace || 'N/A'}</Descriptions.Item>
                  {status.deploymentType && (
                    <Descriptions.Item label="部署方式" span={2}>
                      <Tag color="purple">{status.deploymentType === 'docker' ? 'Docker 容器' : '本地进程'}</Tag>
                    </Descriptions.Item>
                  )}
                  {status.containerStatus && (
                    <Descriptions.Item label="容器状态" span={2}>
                      <Tag color={status.running ? 'success' : 'default'}>
                        {status.containerStatus}
                      </Tag>
                    </Descriptions.Item>
                  )}
                </Descriptions>
              )}
              </div>
            </Spin>
          </Card>

          {/* 快速访问 */}
          <Card title="快速访问" className="shadow-sm">
            <Space direction="vertical" className="w-full" size="middle">
              <Alert
                message="OpenClaw Gateway 控制面板"
                description="通过后端代理访问 OpenClaw Gateway 的 Web 控制界面（已移除 CSP 限制）"
                type="info"
                showIcon
                className="flex items-center"
                action={
                  <div className="flex items-center">
                    <Space size="large">
                      <Button
                        type="default"
                        size="middle"
                        icon={<LayoutIcon className="h-4 w-4" />}
                        onClick={() => openInTab('/', 'OpenClaw UI')}
                        disabled={!status?.running}
                        className="flex items-center gap-2 px-4 py-2 hover:border-blue-400 hover:text-blue-600"
                      >
                        在 Tab 中打开
                      </Button>
                      <Button
                        type="primary"
                        size="middle"
                        icon={<ExternalLink className="h-4 w-4" />}
                        onClick={() => window.open(getOpenClawUrlWithToken(), '_blank')}
                        disabled={!status?.running}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 border-blue-500 hover:border-blue-600"
                      >
                        新窗口打开
                      </Button>
                    </Space>
                  </div>
                }
              />
              <Alert
                message="Canvas 画布"
                description="访问 OpenClaw 的可视化画布界面"
                type="success"
                showIcon
                className="flex items-center"
                action={
                  <div className="flex items-center">
                    <Space size="large">
                      <Button
                        type="default"
                        size="middle"
                        icon={<LayoutIcon className="h-4 w-4" />}
                        onClick={() => openInTab('/canvas', 'OpenClaw Canvas')}
                        disabled={!status?.running}
                        className="flex items-center gap-2 px-4 py-2 hover:border-green-400 hover:text-green-600"
                      >
                        在 Tab 中打开
                      </Button>
                      <Button
                        type="primary"
                        size="middle"
                        icon={<ExternalLink className="h-4 w-4" />}
                        onClick={() => window.open(getOpenClawUrlWithToken('/canvas'), '_blank')}
                        disabled={!status?.running}
                        className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 border-green-500 hover:border-green-600"
                      >
                        新窗口打开
                      </Button>
                    </Space>
                  </div>
                }
              />
            </Space>
          </Card>
        </div>
      ),
    },
    {
      key: 'config',
      label: (
        <span className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          配置
        </span>
      ),
      children: (
        <Card title="配置信息" className="shadow-sm">
          {config && (
            <Descriptions bordered column={1}>
              <Descriptions.Item label={
                <span className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  网关模式
                </span>
              }>
                <Tag color={config.gateway?.mode === 'local' ? 'green' : 'blue'}>
                  {config.gateway?.mode || 'local'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={
                <span className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  绑定地址
                </span>
              }>
                {config.gateway?.bind || 'lan'}
              </Descriptions.Item>
              <Descriptions.Item label={
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  允许的来源
                </span>
              }>
                {config.gateway?.controlUi?.allowedOrigins?.join(', ') || '*'}
              </Descriptions.Item>
              <Descriptions.Item label="工作空间">
                {config.agents?.defaults?.workspace || '/home/node/.openclaw/workspace'}
              </Descriptions.Item>
              <Descriptions.Item label="Header Origin 回退">
                <Tag color={config.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback ? 'warning' : 'default'}>
                  {config.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback ? '启用' : '禁用'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          )}
        </Card>
      ),
    },
    {
      key: 'logs',
      label: (
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          日志
        </span>
      ),
      children: (
        <Card 
          title="容器日志" 
          className="shadow-sm"
          extra={
            <Button
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={fetchLogs}
              loading={logsLoading}
            >
              刷新日志
            </Button>
          }
        >
          <Spin spinning={logsLoading} tip="加载日志...">
            <div className="min-h-[200px]">
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-96 text-sm font-mono whitespace-pre-wrap">
                {logs || '点击"刷新日志"按钮查看容器日志'}
              </pre>
            </div>
          </Spin>
        </Card>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6"
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">OpenClaw Gateway 管理</h1>
        <p className="text-gray-600">管理和监控 OpenClaw Gateway 服务（Docker 容器部署）</p>
      </div>

      <Tabs items={tabItems} />
    </motion.div>
  );
}
