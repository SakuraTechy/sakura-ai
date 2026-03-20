import { useState, useEffect } from 'react';
import { Card, Button, Tabs, Space, Tag, Descriptions, Alert, Spin, message, Input, Select, Switch, Form, Popconfirm } from 'antd';
import { 
  PlayCircle, 
  StopCircle, 
  RefreshCw, 
  Settings, 
  Activity,
  Server,
  Shield,
  FileText,
  ExternalLink,
  Layout as LayoutIcon,
  Bot,
  Save,
  Edit3,
  X,
  Download
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTabs } from '../contexts/TabContext';
import { useAuth } from '../contexts/AuthContext';

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
  meta?: {
    lastTouchedVersion?: string;
    lastTouchedAt?: string;
  };
  wizard?: {
    lastRunAt?: string;
    lastRunVersion?: string;
    lastRunCommand?: string;
    lastRunMode?: string;
  };
  gateway: {
    mode: string;
    bind: string;
    controlUi: {
      dangerouslyAllowHostHeaderOriginFallback: boolean;
      allowedOrigins: string[];
      allowInsecureAuth?: boolean;
      dangerouslyDisableDeviceAuth?: boolean;
    };
    auth?: {
      mode?: string;
      token?: string;
    };
  };
  agents: {
    defaults: {
      workspace: string;
    };
  };
  commands?: {
    native?: string;
    nativeSkills?: string;
    restart?: boolean;
    ownerDisplay?: string;
  };
}

export default function OpenClawManagement() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<OpenClawStatus | null>(null);
  const [config, setConfig] = useState<OpenClawConfig | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [gatewayToken, setGatewayToken] = useState<string>('');
  const [configEditing, setConfigEditing] = useState(false);
  const [editConfig, setEditConfig] = useState<OpenClawConfig | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const { addTab } = useTabs();
  const { user } = useAuth();

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

  // 获取带令牌的 OpenClaw URL（自动附加用户会话）
  const getOpenClawUrlWithToken = (path: string = '') => {
    // 使用从后端获取的令牌，如果没有则使用默认值
    const token = gatewayToken || 'cd7c696a75f6966c3e79334ff709952ae576f5b2633435eef4092c38bb801da7';
    // 根据当前登录用户生成会话路径
    const username = user?.username || 'default';
    // 如果 path 为空或 '/'，默认进入用户专属聊天会话
    let targetPath = path;
    if (targetPath === '' || targetPath === '/') {
      targetPath = `/chat?session=agent:main:${username}`;
    }
    // 使用 hash 参数传递令牌，OpenClaw 会自动识别并保存
    const normalizedPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
    return `${getOpenClawUrl()}${normalizedPath}${normalizedPath.includes('#') ? '&' : '#'}token=${token}`;
  };

  // 在 Tab 中打开 OpenClaw 控制面板
  const openInTab = (path: string, title: string) => {
    // 使用带令牌和用户会话的 URL
    const openclawUrl = getOpenClawUrlWithToken(path);
    const externalPath = `/external?url=${encodeURIComponent(openclawUrl)}`;
    const username = user?.username || 'default';
    
    addTab({
      path: externalPath,
      title: `${title}`,
      // title: `${title} (${username})`,
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

  // 更新 OpenClaw（拉取最新镜像并重新启动）
  const handleUpdate = async () => {
    setLoading(true);
    try {
      const response = await authFetch('/api/openclaw/update', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        if (data.updated) {
          message.success('已拉取最新镜像并重新启动容器');
          setTimeout(() => fetchStatus(), 5000);
        } else {
          message.info('当前已是最新版本，无需更新');
        }
      } else {
        const data = await response.json();
        message.error(`更新失败: ${data.message || '未知错误'}`);
      }
    } catch (error) {
      message.error('更新失败');
      console.error('Failed to update OpenClaw:', error);
    } finally {
      setLoading(false);
    }
  };

  // 进入编辑模式
  const handleEditConfig = () => {
    if (config) {
      setEditConfig(JSON.parse(JSON.stringify(config)));
      setConfigEditing(true);
    }
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setConfigEditing(false);
    setEditConfig(null);
  };

  // 保存配置
  const handleSaveConfig = async () => {
    if (!editConfig) return;
    setConfigSaving(true);
    try {
      const response = await authFetch('/api/openclaw/config', {
        method: 'PUT',
        body: JSON.stringify(editConfig),
      });
      if (response.ok) {
        message.success('配置已保存，需要重启容器才能生效');
        setConfig(editConfig);
        setConfigEditing(false);
        setEditConfig(null);
      } else {
        const data = await response.json();
        message.error(`保存失败: ${data.message || data.error || '未知错误'}`);
      }
    } catch (error) {
      message.error('保存配置失败');
      console.error('Failed to save config:', error);
    } finally {
      setConfigSaving(false);
    }
  };

  // 更新编辑中的配置字段
  const updateEditField = (path: string[], value: any) => {
    if (!editConfig) return;
    const newConfig = JSON.parse(JSON.stringify(editConfig));
    let obj: any = newConfig;
    for (let i = 0; i < path.length - 1; i++) {
      if (!obj[path[i]]) obj[path[i]] = {};
      obj = obj[path[i]];
    }
    obj[path[path.length - 1]] = value;
    setEditConfig(newConfig);
  };

  // 已知字段路径白名单（用点号分隔的路径）
  const KNOWN_PATHS = new Set([
    'meta', 'meta.lastTouchedVersion', 'meta.lastTouchedAt',
    'wizard', 'wizard.lastRunAt', 'wizard.lastRunVersion', 'wizard.lastRunCommand', 'wizard.lastRunMode',
    'agents', 'agents.defaults', 'agents.defaults.workspace',
    'commands', 'commands.native', 'commands.nativeSkills', 'commands.restart', 'commands.ownerDisplay',
    'gateway', 'gateway.mode', 'gateway.bind',
    'gateway.controlUi', 'gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback',
    'gateway.controlUi.allowedOrigins', 'gateway.controlUi.allowInsecureAuth', 'gateway.controlUi.dangerouslyDisableDeviceAuth',
    'gateway.auth', 'gateway.auth.mode', 'gateway.auth.token',
  ]);

  // 递归收集未知字段：返回 { path: string[], value: any }[]
  const collectUnknownFields = (obj: any, prefix: string = ''): { path: string[]; key: string; value: any }[] => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
    const result: { path: string[]; key: string; value: any }[] = [];
    for (const key of Object.keys(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (!KNOWN_PATHS.has(fullPath)) {
        // 这个字段不在白名单中，整个作为未知字段
        result.push({ path: fullPath.split('.'), key: fullPath, value: obj[key] });
      } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
        // 已知的对象节点，继续递归检查子字段
        result.push(...collectUnknownFields(obj[key], fullPath));
      }
    }
    return result;
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
                  <Popconfirm
                    title="确认更新 OpenClaw？"
                    description="将拉取最新镜像并重新创建容器，期间服务会短暂中断"
                    onConfirm={handleUpdate}
                    okText="确认"
                    cancelText="取消"
                  >
                    <Button
                      icon={<Download className="h-4 w-4" />}
                      disabled={loading}
                    >
                      更新
                    </Button>
                  </Popconfirm>
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
        <div className="space-y-4">
          {configEditing && editConfig ? (
            <>
              {/* Agent 设置 */}
              <Card title={<span className="flex items-center gap-2"><Bot className="h-4 w-4" />Agent 设置</span>} size="small" className="shadow-sm">
                <Form layout="vertical">
                  <Form.Item label="默认工作空间路径" className="mb-2">
                    <Input
                      value={editConfig.agents?.defaults?.workspace || ''}
                      onChange={(e) => updateEditField(['agents', 'defaults', 'workspace'], e.target.value)}
                    />
                  </Form.Item>
                </Form>
              </Card>

              {/* 命令设置 */}
              <Card title={<span className="flex items-center gap-2"><Settings className="h-4 w-4" />命令设置</span>} size="small" className="shadow-sm">
                <Form layout="vertical">
                  <div className="grid grid-cols-2 gap-4">
                    <Form.Item label="Native 命令" className="mb-2">
                      <Select
                        value={editConfig.commands?.native || 'auto'}
                        onChange={(v) => updateEditField(['commands', 'native'], v)}
                        options={[
                          { label: 'auto - 自动', value: 'auto' },
                          { label: 'enabled - 启用', value: 'enabled' },
                          { label: 'disabled - 禁用', value: 'disabled' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item label="Native Skills" className="mb-2">
                      <Select
                        value={editConfig.commands?.nativeSkills || 'auto'}
                        onChange={(v) => updateEditField(['commands', 'nativeSkills'], v)}
                        options={[
                          { label: 'auto - 自动', value: 'auto' },
                          { label: 'enabled - 启用', value: 'enabled' },
                          { label: 'disabled - 禁用', value: 'disabled' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item label="Owner 显示方式" className="mb-2">
                      <Select
                        value={editConfig.commands?.ownerDisplay || 'raw'}
                        onChange={(v) => updateEditField(['commands', 'ownerDisplay'], v)}
                        options={[
                          { label: 'raw - 原始', value: 'raw' },
                          { label: 'friendly - 友好', value: 'friendly' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item label="允许重启" className="mb-2">
                      <Switch
                        checked={editConfig.commands?.restart ?? true}
                        onChange={(v) => updateEditField(['commands', 'restart'], v)}
                        checkedChildren="启用"
                        unCheckedChildren="禁用"
                      />
                    </Form.Item>
                  </div>
                </Form>
              </Card>

              {/* 网关设置 */}
              <Card title={<span className="flex items-center gap-2"><Server className="h-4 w-4" />网关设置</span>} size="small" className="shadow-sm">
                <Form layout="vertical">
                  <div className="grid grid-cols-2 gap-4">
                    <Form.Item label="网关模式" className="mb-2">
                      <Select
                        value={editConfig.gateway?.mode || 'local'}
                        onChange={(v) => updateEditField(['gateway', 'mode'], v)}
                        options={[
                          { label: 'local - 本地模式', value: 'local' },
                          { label: 'remote - 远程模式', value: 'remote' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item label="绑定地址" className="mb-2">
                      <Select
                        value={editConfig.gateway?.bind || 'lan'}
                        onChange={(v) => updateEditField(['gateway', 'bind'], v)}
                        options={[
                          { label: 'lan - 局域网', value: 'lan' },
                          { label: 'localhost - 仅本机', value: 'localhost' },
                          { label: '0.0.0.0 - 所有接口', value: '0.0.0.0' },
                        ]}
                      />
                    </Form.Item>
                  </div>
                  <Form.Item label="允许的来源（逗号分隔）" className="mb-2">
                    <Input
                      value={editConfig.gateway?.controlUi?.allowedOrigins?.join(', ') || '*'}
                      onChange={(e) => updateEditField(
                        ['gateway', 'controlUi', 'allowedOrigins'],
                        e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)
                      )}
                      placeholder="* 表示允许所有来源"
                    />
                  </Form.Item>
                </Form>
              </Card>

              {/* 安全设置 */}
              <Card title={<span className="flex items-center gap-2"><Shield className="h-4 w-4" />安全设置</span>} size="small" className="shadow-sm">
                <Form layout="vertical">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <Form.Item label="认证模式" className="mb-2">
                      <Select
                        value={editConfig.gateway?.auth?.mode || 'token'}
                        onChange={(v) => updateEditField(['gateway', 'auth', 'mode'], v)}
                        options={[
                          { label: 'token - 令牌认证', value: 'token' },
                          { label: 'none - 无认证', value: 'none' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item label="认证令牌" className="mb-2">
                      <Input.Password
                        value={editConfig.gateway?.auth?.token || ''}
                        onChange={(e) => updateEditField(['gateway', 'auth', 'token'], e.target.value)}
                        placeholder="Gateway 认证令牌"
                      />
                    </Form.Item>
                  </div>
                  <div className="grid grid-cols-3 gap-6">
                    <Form.Item label="Header Origin 回退" className="mb-2">
                      <div>
                        <Switch
                          checked={editConfig.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback ?? true}
                          onChange={(v) => updateEditField(['gateway', 'controlUi', 'dangerouslyAllowHostHeaderOriginFallback'], v)}
                          checkedChildren="启用"
                          unCheckedChildren="禁用"
                        />
                        <div className="text-gray-400 text-xs mt-1">dangerouslyAllowHostHeaderOriginFallback</div>
                      </div>
                    </Form.Item>
                    <Form.Item label="允许不安全认证" className="mb-2">
                      <div>
                        <Switch
                          checked={editConfig.gateway?.controlUi?.allowInsecureAuth ?? false}
                          onChange={(v) => updateEditField(['gateway', 'controlUi', 'allowInsecureAuth'], v)}
                          checkedChildren="启用"
                          unCheckedChildren="禁用"
                        />
                        <div className="text-gray-400 text-xs mt-1">allowInsecureAuth</div>
                      </div>
                    </Form.Item>
                    <Form.Item label="禁用设备认证" className="mb-2">
                      <div>
                        <Switch
                          checked={editConfig.gateway?.controlUi?.dangerouslyDisableDeviceAuth ?? false}
                          onChange={(v) => updateEditField(['gateway', 'controlUi', 'dangerouslyDisableDeviceAuth'], v)}
                          checkedChildren="启用"
                          unCheckedChildren="禁用"
                        />
                        <div className="text-gray-400 text-xs mt-1">dangerouslyDisableDeviceAuth</div>
                      </div>
                    </Form.Item>
                  </div>
                </Form>
              </Card>

              {/* 动态渲染未知配置字段 - 编辑 */}
              {(() => {
                const unknowns = collectUnknownFields(editConfig);
                if (unknowns.length === 0) return null;
                return (
                  <Card title={<span className="flex items-center gap-2"><Settings className="h-4 w-4" />其他配置</span>} size="small" className="shadow-sm">
                    <Form layout="vertical">
                      {unknowns.map(({ path, key, value }) => (
                        <Form.Item key={key} label={key} className="mb-2">
                          {typeof value === 'object' ? (
                            <Input.TextArea
                              rows={3}
                              value={JSON.stringify(value, null, 2)}
                              onChange={(e) => {
                                try {
                                  updateEditField(path, JSON.parse(e.target.value));
                                } catch { /* JSON 格式不正确时暂不更新 */ }
                              }}
                              className="font-mono text-sm"
                            />
                          ) : typeof value === 'boolean' ? (
                            <Switch
                              checked={value}
                              onChange={(v) => updateEditField(path, v)}
                              checkedChildren="启用"
                              unCheckedChildren="禁用"
                            />
                          ) : (
                            <Input
                              value={String(value)}
                              onChange={(e) => {
                                const v = e.target.value;
                                // 尝试保持原始类型
                                if (v === 'true') updateEditField(path, true);
                                else if (v === 'false') updateEditField(path, false);
                                else if (!isNaN(Number(v)) && v !== '') updateEditField(path, Number(v));
                                else updateEditField(path, v);
                              }}
                            />
                          )}
                        </Form.Item>
                      ))}
                    </Form>
                  </Card>
                );
              })()}

              <Alert
                message="保存配置后需要重启容器才能生效"
                type="warning"
                showIcon
              />
            </>
          ) : config ? (
            <>
              {/* 元信息 - 只读 */}
              {(config.meta || config.wizard) && (
                <Card title={<span className="flex items-center gap-2"><FileText className="h-4 w-4" />元信息</span>} size="small" className="shadow-sm">
                  <Descriptions bordered column={2} size="small">
                    {config.meta?.lastTouchedVersion && (
                      <Descriptions.Item label="最后版本">{config.meta.lastTouchedVersion}</Descriptions.Item>
                    )}
                    {config.meta?.lastTouchedAt && (
                      <Descriptions.Item label="最后更新时间">
                        {new Date(config.meta.lastTouchedAt).toLocaleString('zh-CN')}
                      </Descriptions.Item>
                    )}
                    {config.wizard?.lastRunVersion && (
                      <Descriptions.Item label="向导版本">{config.wizard.lastRunVersion}</Descriptions.Item>
                    )}
                     {config.wizard?.lastRunAt && (
                      <Descriptions.Item label="向导运行时间">
                        {new Date(config.wizard.lastRunAt).toLocaleString('zh-CN')}
                      </Descriptions.Item>
                    )}
                    {config.wizard?.lastRunCommand && (
                      <Descriptions.Item label="向导命令">
                        <Tag>{config.wizard.lastRunCommand}</Tag>
                      </Descriptions.Item>
                    )}
                    {config.wizard?.lastRunMode && (
                      <Descriptions.Item label="向导模式">
                        <Tag color="blue">{config.wizard.lastRunMode}</Tag>
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </Card>
              )}

              {/* Agent 设置 - 只读 */}
              <Card title={<span className="flex items-center gap-2"><Bot className="h-4 w-4" />Agent 设置</span>} size="small" className="shadow-sm">
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="默认工作空间">
                    {config.agents?.defaults?.workspace || '/home/node/.openclaw/workspace'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              {/* 命令设置 - 只读 */}
              <Card title={<span className="flex items-center gap-2"><Settings className="h-4 w-4" />命令设置</span>} size="small" className="shadow-sm">
                <Descriptions bordered column={2} size="small">
                  <Descriptions.Item label="Native 命令">
                    <Tag color="blue">{config.commands?.native || 'auto'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Native Skills">
                    <Tag color="blue">{config.commands?.nativeSkills || 'auto'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Owner 显示方式">
                    <Tag>{config.commands?.ownerDisplay || 'raw'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="允许重启">
                    <Tag color={config.commands?.restart !== false ? 'success' : 'default'}>
                      {config.commands?.restart !== false ? '启用' : '禁用'}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              {/* 网关设置 - 只读 */}
              <Card title={<span className="flex items-center gap-2"><Server className="h-4 w-4" />网关设置</span>} size="small" className="shadow-sm">
                <Descriptions bordered column={2} size="small">
                  <Descriptions.Item label="网关模式">
                    <Tag color={config.gateway?.mode === 'local' ? 'green' : 'blue'}>
                      {config.gateway?.mode || 'local'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="绑定地址">{config.gateway?.bind || 'lan'}</Descriptions.Item>
                  <Descriptions.Item label="允许的来源" span={2}>
                    {config.gateway?.controlUi?.allowedOrigins?.join(', ') || '*'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              {/* 安全设置 - 只读 */}
              <Card title={<span className="flex items-center gap-2"><Shield className="h-4 w-4" />安全设置</span>} size="small" className="shadow-sm">
                <Descriptions bordered column={2} size="small">
                  <Descriptions.Item label="认证模式">
                    <Tag color="blue">{config.gateway?.auth?.mode || '未配置'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="认证令牌">
                    <span className="font-mono text-xs break-all">
                      {config.gateway?.auth?.token 
                        ? `${config.gateway.auth.token.slice(0, 8)}...${config.gateway.auth.token.slice(-8)}`
                        : '未配置'}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="Header Origin 回退">
                    <Tag color={config.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback ? 'warning' : 'default'}>
                      {config.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback ? '启用' : '禁用'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="允许不安全认证">
                    <Tag color={config.gateway?.controlUi?.allowInsecureAuth ? 'warning' : 'default'}>
                      {config.gateway?.controlUi?.allowInsecureAuth ? '启用' : '禁用'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="禁用设备认证" span={2}>
                    <Tag color={config.gateway?.controlUi?.dangerouslyDisableDeviceAuth ? 'warning' : 'default'}>
                      {config.gateway?.controlUi?.dangerouslyDisableDeviceAuth ? '启用' : '禁用'}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              {/* 动态渲染未知配置字段 - 只读 */}
              {(() => {
                const unknowns = collectUnknownFields(config);
                if (unknowns.length === 0) return null;
                return (
                  <Card title={<span className="flex items-center gap-2"><Settings className="h-4 w-4" />其他配置</span>} size="small" className="shadow-sm">
                    <Descriptions bordered column={1} size="small">
                      {unknowns.map(({ key, value }) => (
                        <Descriptions.Item key={key} label={key}>
                          {typeof value === 'object'
                            ? <pre className="bg-gray-50 p-2 rounded text-xs m-0 whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                            : <span className="font-mono text-sm">{String(value)}</span>
                          }
                        </Descriptions.Item>
                      ))}
                    </Descriptions>
                  </Card>
                );
              })()}
            </>
          ) : null}
        </div>
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

      <Tabs 
        items={tabItems}
        activeKey={activeTab}
        onChange={setActiveTab}
        tabBarExtraContent={
          activeTab === 'config' ? (
            configEditing ? (
              <Space>
                <Button
                  icon={<X className="h-4 w-4" />}
                  onClick={handleCancelEdit}
                  disabled={configSaving}
                  size="small"
                >
                  取消
                </Button>
                <Popconfirm
                  title="确认保存配置？"
                  description="保存后需要重启容器才能生效"
                  onConfirm={handleSaveConfig}
                  okText="确认"
                  cancelText="取消"
                >
                  <Button
                    type="primary"
                    icon={<Save className="h-4 w-4" />}
                    loading={configSaving}
                    size="small"
                  >
                    保存
                  </Button>
                </Popconfirm>
              </Space>
            ) : (
              <Button
                icon={<Edit3 className="h-4 w-4" />}
                onClick={handleEditConfig}
                size="small"
              >
                编辑配置
              </Button>
            )
          ) : null
        }
      />
    </motion.div>
  );
}
