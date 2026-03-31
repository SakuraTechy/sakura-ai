import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';

const execAsync = promisify(exec);

// 通过 Docker socket 发送 HTTP 请求
function dockerSocketRequest(method: string, path: string, body?: any): Promise<{ statusCode: number; data: any }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options: http.RequestOptions = {
      socketPath: '/var/run/docker.sock',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode || 0, data: data ? JSON.parse(data) : {} });
        } catch {
          resolve({ statusCode: res.statusCode || 0, data });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// 检测 Docker socket 是否可用
async function isDockerAvailable(): Promise<boolean> {
  try {
    await dockerSocketRequest('GET', '/version');
    return true;
  } catch {
    // fallback: 尝试 CLI（宿主机直接运行时）
    try {
      await execAsync('docker --version');
      return true;
    } catch {
      return false;
    }
  }
}

// 判断是否通过 socket 可用（容器内场景）
async function isSocketAvailable(): Promise<boolean> {
  try {
    await dockerSocketRequest('GET', '/version');
    return true;
  } catch {
    return false;
  }
}

// 🔥 创建代理路由（不需要认证）
export function createOpenClawProxyRoute() {
  const router = Router();

  // Canvas 画布：直接返回本地静态文件，不需要认证
  router.get('/canvas', async (req, res) => {
    try {
      const canvasPath = path.join(process.cwd(), '.openclaw', 'canvas', 'index.html');
      const html = await fs.readFile(canvasPath, 'utf-8');
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error: any) {
      res.status(404).json({ error: 'Canvas 页面不存在', message: error.message });
    }
  });

  // 代理路由用于绕过 CSP 限制，让 OpenClaw 可以在 iframe 中显示
  router.get('/*', async (req, res) => {
    try {
      // 获取通配符路径（使用类型断言）
      const targetPath = (req.params as any)[0] || '';
      const queryString = req.url.split('?')[1] || '';
      // 容器内用服务名访问，宿主机直接运行时用 localhost
      const openclawHost = process.env.OPENCLAW_INTERNAL_HOST || 'localhost';
      const openclawPort = process.env.OPENCLAW_GATEWAY_PORT || '18789';
      const openclawUrl = `http://${openclawHost}:${openclawPort}/${targetPath}${queryString ? '?' + queryString : ''}`;
      
      console.log('代理请求:', openclawUrl);
      
      // 转发请求到 OpenClaw
      const response = await fetch(openclawUrl, {
        method: req.method,
        headers: {
          'Accept': req.headers.accept || '*/*',
          'User-Agent': req.headers['user-agent'] || 'Sakura-AI-Proxy',
        },
      });

      // 设置响应头，移除 CSP 和 X-Frame-Options
      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      
      // 允许在 iframe 中显示
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');

      // 获取响应体
      let body = await response.text();
      
      // 如果是 HTML，修改 base 标签和 WebSocket URL
      if (contentType && contentType.includes('text/html')) {
        // 添加或修改 base 标签，确保相对路径正确解析
        if (body.includes('<head>')) {
          body = body.replace(
            '<head>',
            '<head>\n  <base href="/api/openclaw-proxy/">'
          );
        } else if (body.includes('<html>')) {
          body = body.replace(
            '<html>',
            '<html>\n<head>\n  <base href="/api/openclaw-proxy/">\n</head>'
          );
        }
        
        // 注入脚本修改 WebSocket URL（保留 WebSocket 重定向功能）
        // 将 ws://当前域名/api/openclaw-proxy 改为 ws://当前域名:18789
        const wsScript = `
          <script>
            (function() {
              // WebSocket URL 重定向
              const originalWebSocket = window.WebSocket;
              window.WebSocket = function(url, protocols) {
                // 如果 WebSocket URL 包含 /api/openclaw-proxy，替换为直接连接到 18789 端口
                if (typeof url === 'string' && url.includes('/api/openclaw-proxy')) {
                  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                  url = wsProtocol + '//' + window.location.hostname + ':18789' + url.replace(/.*\\/api\\/openclaw-proxy/, '');
                  console.log('[OpenClaw WebSocket] URL redirected to:', url);
                }
                return new originalWebSocket(url, protocols);
              };
              // 复制原始 WebSocket 的属性
              window.WebSocket.prototype = originalWebSocket.prototype;
              window.WebSocket.CONNECTING = originalWebSocket.CONNECTING;
              window.WebSocket.OPEN = originalWebSocket.OPEN;
              window.WebSocket.CLOSING = originalWebSocket.CLOSING;
              window.WebSocket.CLOSED = originalWebSocket.CLOSED;
            })();
          </script>
        `;
        
        // 在 </head> 之前注入脚本
        if (body.includes('</head>')) {
          body = body.replace('</head>', wsScript + '\n</head>');
        } else if (body.includes('<body>')) {
          body = body.replace('<body>', wsScript + '\n<body>');
        }
      }

      res.status(response.status).send(body);
    } catch (error: any) {
      console.error('代理 OpenClaw 请求失败:', error);
      res.status(500).json({
        error: '代理请求失败',
        message: error.message,
      });
    }
  });

  return router;
}

// 🔥 创建管理路由（需要认证）
export function createOpenClawRoutes() {
  const router = Router();

  // OpenClaw 配置文件路径（支持环境变量覆盖，默认读取挂载的 .openclaw 目录）
  const openclawConfigDir = process.env.OPENCLAW_CONFIG_DIR
    ? path.join(process.env.OPENCLAW_CONFIG_DIR, 'openclaw.json')
    : path.join(process.cwd(), '.openclaw', 'openclaw.json');
  const configPath = openclawConfigDir;
  
  // Docker 容器名称
  const OPENCLAW_CONTAINER = 'sakura-ai-openclaw';

  // 获取 OpenClaw Gateway 令牌
  router.get('/token', async (req, res) => {
    try {
      // 从环境变量中读取令牌
      const token = process.env.OPENCLAW_GATEWAY_TOKEN || 'cd7c696a75f6966c3e79334ff709952ae576f5b2633435eef4092c38bb801da7';
      
      res.json({
        success: true,
        token: token,
      });
    } catch (error: any) {
      console.error('获取 OpenClaw Gateway 令牌失败:', error);
      res.status(500).json({
        error: '获取令牌失败',
        message: error.message,
      });
    }
  });

  // 获取 OpenClaw 状态
  router.get('/status', async (req, res) => {
    try {
      let running = false;
      let uptime = 0;
      let containerStatus = 'not found';

      const dockerAvailable = await isDockerAvailable();
      if (dockerAvailable) {
        try {
          // 优先用 socket API，fallback 到 CLI
          if (await isSocketAvailable()) {
            // Docker socket API：GET /containers/{name}/json
            const result = await dockerSocketRequest('GET', `/containers/${OPENCLAW_CONTAINER}/json`);
            if (result.statusCode === 200 && result.data?.State) {
              const state = result.data.State;
              running = state.Running === true;
              containerStatus = running ? `Up` : (state.Status || 'stopped');
              if (running && state.StartedAt) {
                const startedAt = new Date(state.StartedAt).getTime();
                uptime = Math.floor((Date.now() - startedAt) / 1000);
              }
            }
          } else {
            const { stdout } = await execAsync(`docker ps -a --filter "name=${OPENCLAW_CONTAINER}" --format "{{.Status}}"`);
            const status = stdout.trim();
            if (status) {
              containerStatus = status;
              running = status.toLowerCase().includes('up');
              if (running) {
                const uptimeMatch = status.match(/Up\s+(.+?)(?:\s+\(|$)/i);
                if (uptimeMatch) {
                  const uptimeStr = uptimeMatch[1];
                  if (uptimeStr.includes('minute')) uptime = parseInt(uptimeStr) * 60;
                  else if (uptimeStr.includes('hour')) uptime = parseInt(uptimeStr) * 3600;
                  else if (uptimeStr.includes('day')) uptime = parseInt(uptimeStr) * 86400;
                }
              }
            }
          }
        } catch (error) {
          console.warn('检查 Docker 容器状态失败:', error);
        }
      } else {
        containerStatus = 'docker not available';
      }

      // 读取配置文件
      let config: any = {};
      try {
        const configData = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(configData);
      } catch (error) {
        console.warn('无法读取 OpenClaw 配置文件，使用默认值');
        config = {
          gateway: { mode: 'local', bind: 'lan' },
          meta: { lastTouchedVersion: 'unknown' },
          agents: { defaults: { workspace: '/home/node/.openclaw/workspace' } }
        };
      }

      res.json({
        running,
        containerStatus,
        mode: config.gateway?.mode || 'local',
        bind: config.gateway?.bind || 'lan',
        version: config.meta?.lastTouchedVersion || 'unknown',
        workspace: config.agents?.defaults?.workspace || '/home/node/.openclaw/workspace',
        uptime,
        deploymentType: 'docker',
        dockerAvailable,
      });
    } catch (error: any) {
      console.error('获取 OpenClaw 状态失败:', error);
      res.status(500).json({
        error: '获取状态失败',
        message: error.message,
      });
    }
  });

  // 获取 OpenClaw 配置
  router.get('/config', async (req, res) => {
    try {
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);
      res.json(config);
    } catch (error: any) {
      console.error('读取 OpenClaw 配置失败:', error);
      // 返回默认配置而不是错误
      res.json({
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
        },
        meta: {
          lastTouchedVersion: 'unknown'
        }
      });
    }
  });

  // 启动 OpenClaw（通过 Docker Compose）
  router.post('/start', async (req, res) => {
    try {
      if (!await isDockerAvailable()) {
        return res.status(400).json({ error: '启动失败', message: '当前环境未检测到 Docker，无法启动 OpenClaw 容器' });
      }
      if (await isSocketAvailable()) {
        // 先检查容器是否存在
        const inspect = await dockerSocketRequest('GET', `/containers/${OPENCLAW_CONTAINER}/json`);
        if (inspect.statusCode === 404) {
          // 容器不存在，需要通过 docker compose 创建
          return res.status(400).json({
            error: '启动失败',
            message: `OpenClaw 容器尚未创建，请在宿主机执行以下命令初始化：\ndocker compose --profile openclaw up -d`,
            needInit: true,
          });
        }
        // 容器存在，直接启动
        const result = await dockerSocketRequest('POST', `/containers/${OPENCLAW_CONTAINER}/start`);
        if (result.statusCode === 204 || result.statusCode === 304) {
          return res.json({ success: true, message: 'OpenClaw 容器已启动' });
        }
        return res.status(500).json({ error: '启动失败', message: JSON.stringify(result.data) });
      }
      // fallback CLI
      const { stdout, stderr } = await execAsync('docker compose --profile openclaw up -d', { cwd: process.cwd() });
      if (stderr) console.warn('OpenClaw 启动警告:', stderr);
      res.json({ success: true, message: 'OpenClaw 容器启动命令已执行', output: stdout });
    } catch (error: any) {
      console.error('启动 OpenClaw 失败:', error);
      res.status(500).json({ error: '启动失败', message: error.message });
    }
  });

  // 停止 OpenClaw（通过 Docker Compose）
  router.post('/stop', async (req, res) => {
    try {
      if (!await isDockerAvailable()) {
        return res.status(400).json({ error: '停止失败', message: '当前环境未检测到 Docker，无法停止 OpenClaw 容器' });
      }
      if (await isSocketAvailable()) {
        const result = await dockerSocketRequest('POST', `/containers/${OPENCLAW_CONTAINER}/stop`);
        if (result.statusCode === 204 || result.statusCode === 304) {
          return res.json({ success: true, message: 'OpenClaw 容器已停止' });
        }
        return res.status(500).json({ error: '停止失败', message: JSON.stringify(result.data) });
      }
      const { stdout, stderr } = await execAsync('docker compose --profile openclaw down', { cwd: process.cwd() });
      if (stderr) console.warn('OpenClaw 停止警告:', stderr);
      res.json({ success: true, message: 'OpenClaw 容器停止命令已执行', output: stdout });
    } catch (error: any) {
      console.error('停止 OpenClaw 失败:', error);
      res.status(500).json({ error: '停止失败', message: error.message });
    }
  });

  // 重启 OpenClaw
  router.post('/restart', async (req, res) => {
    try {
      if (!await isDockerAvailable()) {
        return res.status(400).json({ error: '重启失败', message: '当前环境未检测到 Docker，无法重启 OpenClaw 容器' });
      }
      if (await isSocketAvailable()) {
        const result = await dockerSocketRequest('POST', `/containers/${OPENCLAW_CONTAINER}/restart`);
        if (result.statusCode === 204) {
          return res.json({ success: true, message: 'OpenClaw 容器已重启' });
        }
        return res.status(500).json({ error: '重启失败', message: JSON.stringify(result.data) });
      }
      const { stdout, stderr } = await execAsync('docker compose --profile openclaw restart', { cwd: process.cwd() });
      if (stderr) console.warn('OpenClaw 重启警告:', stderr);
      res.json({ success: true, message: 'OpenClaw 容器重启命令已执行', output: stdout });
    } catch (error: any) {
      console.error('重启 OpenClaw 失败:', error);
      res.status(500).json({ error: '重启失败', message: error.message });
    }
  });

  // 获取容器日志
  router.get('/logs', async (req, res) => {
    try {
      if (!await isDockerAvailable()) {
        return res.json({ success: true, logs: '当前环境未检测到 Docker，无法获取容器日志。\n请直接查看应用日志文件。' });
      }
      const lines = parseInt(String(req.query.lines || '100'));
      if (await isSocketAvailable()) {
        // Docker socket API：GET /containers/{name}/logs
        const result = await new Promise<string>((resolve, reject) => {
          const options: http.RequestOptions = {
            socketPath: '/var/run/docker.sock',
            path: `/containers/${OPENCLAW_CONTAINER}/logs?stdout=1&stderr=1&tail=${lines}`,
            method: 'GET',
          };
          const req = http.request(options, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              // Docker log stream 每行有 8 字节 header，需要去掉
              const raw = Buffer.concat(chunks);
              let text = '';
              let i = 0;
              while (i + 8 <= raw.length) {
                const size = raw.readUInt32BE(i + 4);
                text += raw.slice(i + 8, i + 8 + size).toString('utf8');
                i += 8 + size;
              }
              resolve(text || '暂无日志');
            });
          });
          req.on('error', reject);
          req.end();
        });
        return res.json({ success: true, logs: result });
      }
      // fallback CLI
      const { stdout } = await execAsync(`docker logs --tail ${lines} ${OPENCLAW_CONTAINER}`);
      res.json({ success: true, logs: stdout });
    } catch (error: any) {
      console.error('获取日志失败:', error);
      res.status(500).json({ error: '获取日志失败', message: error.message });
    }
  });

  // 更新 OpenClaw（拉取最新镜像并重新启动）
  router.post('/update', async (req, res) => {
    try {
      if (!await isDockerAvailable()) {
        return res.status(400).json({ error: '更新失败', message: '当前环境未检测到 Docker，无法更新 OpenClaw 容器' });
      }
      if (await isSocketAvailable()) {
        // 1. 获取当前容器使用的镜像名
        let imageName = process.env.OPENCLAW_IMAGE || 'openclaw:local';
        try {
          const inspect = await dockerSocketRequest('GET', `/containers/${OPENCLAW_CONTAINER}/json`);
          if (inspect.statusCode === 200) {
            imageName = inspect.data?.Config?.Image || imageName;
          }
        } catch { /* 容器不存在时忽略 */ }

        // 2. 拉取最新镜像（POST /images/create?fromImage=...）
        console.log(`正在拉取最新镜像: ${imageName}`);
        const [imgRepo, imgTag = 'latest'] = imageName.split(':');
        await new Promise<void>((resolve, reject) => {
          const options: http.RequestOptions = {
            socketPath: '/var/run/docker.sock',
            path: `/images/create?fromImage=${encodeURIComponent(imgRepo)}&tag=${encodeURIComponent(imgTag)}`,
            method: 'POST',
          };
          const req = http.request(options, (res) => {
            res.resume(); // 消费响应体
            res.on('end', resolve);
          });
          req.on('error', reject);
          req.end();
        });

        // 3. 重启容器使其使用新镜像
        const restartResult = await dockerSocketRequest('POST', `/containers/${OPENCLAW_CONTAINER}/restart`);
        if (restartResult.statusCode === 204) {
          return res.json({ success: true, updated: true, message: '已拉取最新镜像并重启容器' });
        }
        return res.json({ success: true, updated: true, message: '镜像已拉取，容器重启请手动操作' });
      }
      // fallback CLI
      const pullCommand = 'docker compose --profile openclaw pull';
      const { stdout: pullOut, stderr: pullErr } = await execAsync(pullCommand, { cwd: process.cwd(), timeout: 300000 });
      const pullOutput = (pullOut || '') + (pullErr || '');
      const alreadyUpToDate = /already up to date|image is up to date|已是最新/i.test(pullOutput);
      if (alreadyUpToDate) {
        return res.json({ success: true, updated: false, message: '当前已是最新版本，无需更新' });
      }
      await execAsync('docker compose --profile openclaw up -d --force-recreate', { cwd: process.cwd() });
      res.json({ success: true, updated: true, message: '已拉取最新镜像并重新启动容器' });
    } catch (error: any) {
      console.error('更新 OpenClaw 失败:', error);
      res.status(500).json({ error: '更新失败', message: error.message });
    }
  });

  // 更新配置
  router.put('/config', async (req, res) => {
    try {
      const newConfig = req.body;

      // 验证配置格式
      if (!newConfig.gateway || !newConfig.agents) {
        return res.status(400).json({
          error: '配置格式不正确',
        });
      }

      // 写入配置文件
      await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');

      res.json({
        success: true,
        message: '配置已更新，需要重启容器才能生效',
      });
    } catch (error: any) {
      console.error('更新 OpenClaw 配置失败:', error);
      res.status(500).json({
        error: '更新配置失败',
        message: error.message,
      });
    }
  });

  return router;
}

export default createOpenClawRoutes;
