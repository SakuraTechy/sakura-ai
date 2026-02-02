import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 🔥 加载环境变量
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.PORT || '3001';
  // 🔥 修复：如果后端在远程服务器，使用 SERVER_HOST，否则使用 localhost
  // 注意：这个值应该与后端实际运行的主机地址一致
  const backendHost = env.SERVER_HOST || 'localhost';
  
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      proxy: {
        // 将所有以 /api 开头的请求代理到后端服务器
        '/api': {
          target: `http://${backendHost}:${backendPort}`,
          changeOrigin: true,
          secure: false,
          // 🔥 转发原始请求头，让后端知道真实的客户端地址
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // 转发原始 host 信息
              const originalHost = req.headers.host;
              if (originalHost) {
                proxyReq.setHeader('X-Forwarded-Host', originalHost);
              }
              // 转发协议信息
              const protocol = req.connection.encrypted ? 'https' : 'http';
              proxyReq.setHeader('X-Forwarded-Proto', protocol);
            });
          },
        },
      },
    },
    // 🔥 将后端端口传递给前端代码（通过 VITE_API_PORT）
    define: {
      'import.meta.env.VITE_API_PORT': JSON.stringify(backendPort),
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    // 🔥 构建配置：排除 server 目录，避免 Vite 解析后端代码
    build: {
      rollupOptions: {
        external: [
          // 排除所有 server 目录的导入
          /^\.\.\/\.\.\/server\//,
          /^\.\.\/server\//,
          /^server\//,
        ],
      },
    },
  };
});
