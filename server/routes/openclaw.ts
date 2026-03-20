import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// 🔥 创建代理路由（不需要认证）
export function createOpenClawProxyRoute() {
  const router = Router();

  // 代理路由用于绕过 CSP 限制，让 OpenClaw 可以在 iframe 中显示
  router.get('/*', async (req, res) => {
    try {
      // 获取通配符路径（使用类型断言）
      const targetPath = (req.params as any)[0] || '';
      const queryString = req.url.split('?')[1] || '';
      const openclawUrl = `http://localhost:18789/${targetPath}${queryString ? '?' + queryString : ''}`;
      
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

  // OpenClaw 配置文件路径
  const configPath = path.join(process.cwd(), '.openclaw', 'openclaw.json');
  
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

      try {
        // 检查 Docker 容器状态
        const { stdout } = await execAsync(`docker ps -a --filter "name=${OPENCLAW_CONTAINER}" --format "{{.Status}}"`);
        const status = stdout.trim();
        
        if (status) {
          containerStatus = status;
          running = status.toLowerCase().includes('up');
          
          // 尝试获取运行时长
          if (running) {
            const uptimeMatch = status.match(/Up\s+(.+?)(?:\s+\(|$)/i);
            if (uptimeMatch) {
              // 简单转换为秒数（这里只是示例，实际可能需要更复杂的解析）
              const uptimeStr = uptimeMatch[1];
              if (uptimeStr.includes('minute')) {
                uptime = parseInt(uptimeStr) * 60;
              } else if (uptimeStr.includes('hour')) {
                uptime = parseInt(uptimeStr) * 3600;
              } else if (uptimeStr.includes('day')) {
                uptime = parseInt(uptimeStr) * 86400;
              }
            }
          }
        }
      } catch (error) {
        console.warn('检查 Docker 容器状态失败:', error);
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
      // 使用 docker compose 启动 OpenClaw 服务
      const command = 'docker compose --profile openclaw up -d';
      const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });

      console.log('OpenClaw 启动输出:', stdout);
      if (stderr) console.warn('OpenClaw 启动警告:', stderr);

      res.json({
        success: true,
        message: 'OpenClaw 容器启动命令已执行',
        output: stdout,
      });
    } catch (error: any) {
      console.error('启动 OpenClaw 失败:', error);
      res.status(500).json({
        error: '启动失败',
        message: error.message,
        stderr: error.stderr,
      });
    }
  });

  // 停止 OpenClaw（通过 Docker Compose）
  router.post('/stop', async (req, res) => {
    try {
      // 使用 docker compose 停止 OpenClaw 服务
      const command = 'docker compose --profile openclaw down';
      const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });

      console.log('OpenClaw 停止输出:', stdout);
      if (stderr) console.warn('OpenClaw 停止警告:', stderr);

      res.json({
        success: true,
        message: 'OpenClaw 容器停止命令已执行',
        output: stdout,
      });
    } catch (error: any) {
      console.error('停止 OpenClaw 失败:', error);
      res.status(500).json({
        error: '停止失败',
        message: error.message,
        stderr: error.stderr,
      });
    }
  });

  // 重启 OpenClaw
  router.post('/restart', async (req, res) => {
    try {
      // 使用 docker compose 重启 OpenClaw 服务
      const command = 'docker compose --profile openclaw restart';
      const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });

      console.log('OpenClaw 重启输出:', stdout);
      if (stderr) console.warn('OpenClaw 重启警告:', stderr);

      res.json({
        success: true,
        message: 'OpenClaw 容器重启命令已执行',
        output: stdout,
      });
    } catch (error: any) {
      console.error('重启 OpenClaw 失败:', error);
      res.status(500).json({
        error: '重启失败',
        message: error.message,
        stderr: error.stderr,
      });
    }
  });

  // 获取容器日志
  router.get('/logs', async (req, res) => {
    try {
      const lines = req.query.lines || '100';
      const command = `docker logs --tail ${lines} ${OPENCLAW_CONTAINER}`;
      const { stdout } = await execAsync(command);

      res.json({
        success: true,
        logs: stdout,
      });
    } catch (error: any) {
      console.error('获取日志失败:', error);
      res.status(500).json({
        error: '获取日志失败',
        message: error.message,
      });
    }
  });

  // 更新 OpenClaw（拉取最新镜像并重新启动）
  router.post('/update', async (req, res) => {
    try {
      // 1. 获取当前镜像 digest
      let oldDigest = '';
      try {
        const { stdout } = await execAsync(`docker inspect --format='{{index .RepoDigests 0}}' $(docker compose --profile openclaw images -q openclaw-gateway 2>/dev/null) 2>/dev/null || echo ""`);
        oldDigest = stdout.trim();
      } catch {
        // 可能容器不存在，忽略
      }

      // 2. 拉取最新镜像
      const pullCommand = 'docker compose --profile openclaw pull';
      console.log('正在拉取最新 OpenClaw 镜像...');
      const { stdout: pullOut, stderr: pullErr } = await execAsync(pullCommand, { cwd: process.cwd(), timeout: 300000 });
      const pullOutput = (pullOut || '') + (pullErr || '');
      console.log('镜像拉取输出:', pullOutput);

      // 3. 判断是否有新版本（检查 pull 输出中是否包含 "Already up to date" 或 "Image is up to date"）
      const alreadyUpToDate = /already up to date|image is up to date|已是最新/i.test(pullOutput);

      if (alreadyUpToDate) {
        return res.json({
          success: true,
          updated: false,
          message: '当前已是最新版本，无需更新',
        });
      }

      // 4. 有新版本，重新创建并启动容器
      const upCommand = 'docker compose --profile openclaw up -d --force-recreate';
      const { stdout: upOut, stderr: upErr } = await execAsync(upCommand, { cwd: process.cwd() });
      console.log('容器重建输出:', upOut);
      if (upErr) console.warn('容器重建警告:', upErr);

      res.json({
        success: true,
        updated: true,
        message: '已拉取最新镜像并重新启动容器',
      });
    } catch (error: any) {
      console.error('更新 OpenClaw 失败:', error);
      res.status(500).json({
        error: '更新失败',
        message: error.message,
        stderr: error.stderr,
      });
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
