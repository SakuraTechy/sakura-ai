---
summary: "OpenClaw Docker 部署完整指南"
title: "Docker 部署指南"
---

# OpenClaw Docker 部署指南

本文档提供 OpenClaw 项目的完整 Docker 部署步骤和配置说明。

## 前置要求

在开始部署之前，请确保您的系统满足以下要求:

- **Docker Desktop** 或 **Docker Engine** + **Docker Compose v2**
- 至少 **2GB RAM**（构建镜像时需要，1GB 可能会导致 OOM 错误，退出代码 137）
- 足够的磁盘空间用于存储镜像和日志
- 如果在 VPS 或公网主机上运行，请查看[网络暴露安全加固指南](/gateway/security#04-network-exposure-bind--port--firewall)

## 部署方式

### 方式一：快速部署（推荐）

使用项目提供的自动化脚本进行一键部署：

```bash
# 1. 进入项目根目录
cd /path/to/openclaw

# 2. 运行自动化部署脚本
./docker-setup.sh
```

这个脚本会自动完成以下操作：

1. 构建本地 Docker 镜像（或拉取远程镜像）
2. 运行引导向导配置
3. 生成网关令牌并写入 `.env` 文件
4. 启动网关服务

部署完成后，您可以：

- 在浏览器中打开 `http://127.0.0.1:18789/`
- 在设置中粘贴生成的令牌
- 如需再次获取访问链接：`docker compose run --rm openclaw-cli dashboard --no-open`

### 方式二：使用预构建镜像

如果不想本地构建，可以使用官方预构建镜像：

```bash
# 使用 GitHub Container Registry 的镜像
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./docker-setup.sh
```

可用的镜像标签：

- `main` - 最新的主分支构建
- `latest` - 最新稳定版本
- `<version>` - 特定版本（如 `2026.2.26`）

### 方式三：手动部署

如果您需要更多控制，可以手动执行部署步骤：

```bash
# 1. 构建镜像
docker build -t openclaw:local -f Dockerfile .

# 2. 运行引导配置
docker compose run --rm openclaw-cli onboard

# 3. 启动网关服务
docker compose up -d openclaw-gateway
```

## 环境变量配置

在运行 `docker-setup.sh` 之前，您可以设置以下环境变量来自定义部署：

### 基础配置

```bash
# 配置目录（默认: ~/.openclaw）
export OPENCLAW_CONFIG_DIR=/home/$USER/.openclaw

# 工作空间目录（默认: ~/.openclaw/workspace）
export OPENCLAW_WORKSPACE_DIR=/home/$USER/.openclaw/workspace

# 网关端口（默认: 18789）
export OPENCLAW_GATEWAY_PORT=18789

# 桥接端口（默认: 18790）
export OPENCLAW_BRIDGE_PORT=18790

# 网关绑定模式（lan 或 loopback，默认: lan）
export OPENCLAW_GATEWAY_BIND=lan
```

### 镜像配置

```bash
# 使用远程镜像而非本地构建
{
	"registry-mirrors": [
		"https://jk3gezql.mirror.aliyuncs.com",
		"https://docker.1ms.run",
		"https://docker.m.daocloud.io",
		"https://docker.1panel.live",
		"https://hub.rat.dev",
		"https://docker.chenby.cn",
		"https://dockerpull.org",
		"https://dockerhub.icu"
	]
}
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"

# 安装额外的 apt 包
export OPENCLAW_DOCKER_APT_PACKAGES="ffmpeg build-essential git"

# 预安装扩展依赖（空格分隔的扩展名）
export OPENCLAW_EXTENSIONS="diagnostics-otel matrix"
```

### 高级配置

```bash
# 添加额外的挂载目录（逗号分隔）
export OPENCLAW_EXTRA_MOUNTS="$HOME/.codex:/home/node/.codex:ro,$HOME/github:/home/node/github:rw"

# 持久化容器 home 目录（使用命名卷）
export OPENCLAW_HOME_VOLUME="openclaw_home"

# 启用沙箱隔离（需要 Docker CLI）
export OPENCLAW_SANDBOX=1

# 自定义 Docker socket 路径
export OPENCLAW_DOCKER_SOCKET=/var/run/docker.sock

# 允许不安全的私有 WebSocket 连接
export OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=true
```

## 访问控制面板

部署完成后，您可以通过以下方式访问控制面板：

1. 在浏览器中打开 `http://127.0.0.1:18789/`
2. 在设置页面中粘贴生成的令牌（令牌保存在 `.env` 文件中的 `OPENCLAW_GATEWAY_TOKEN` 变量）

如需再次获取访问链接和令牌：

```bash
docker compose run --rm openclaw-cli dashboard --no-open
```

## 配置消息通道

### WhatsApp（二维码登录）

```bash
docker compose run --rm openclaw-cli channels login
```

### Telegram（机器人令牌）

```bash
docker compose run --rm openclaw-cli channels add --channel telegram --token "<your-token>"
```

### Discord（机器人令牌）

```bash
docker compose run --rm openclaw-cli channels add --channel discord --token "<your-token>"
```

更多通道配置详情，请参考：
- [WhatsApp 配置](/channels/whatsapp)
- [Telegram 配置](/channels/telegram)
- [Discord 配置](/channels/discord)

## 常用管理命令

### Windows PowerShell 命令

在 Windows PowerShell 中，某些命令的语法不同：

```powershell
# 健康检查（替代 curl）
Invoke-WebRequest -Uri "http://127.0.0.1:18789/healthz" -UseBasicParsing

# 查看环境变量
$env:OPENCLAW_GATEWAY_TOKEN

# 创建目录
mkdir -p "path/to/directory"

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f openclaw-gateway
```

### 查看日志

```bash
# 查看网关实时日志
docker compose logs -f openclaw-gateway

# 查看最近 100 行日志
docker compose logs --tail=100 openclaw-gateway
```

### 健康检查

```bash
# 存活检查（无需认证）
curl -fsS http://127.0.0.1:18789/healthz

# 就绪检查（无需认证）
curl -fsS http://127.0.0.1:18789/readyz

# 完整健康检查（需要令牌）
docker compose exec openclaw-gateway node dist/index.js health --token "$OPENCLAW_GATEWAY_TOKEN"
```

### 设备管理

```bash
# 查看设备列表
docker compose run --rm openclaw-cli devices list

# 批准设备
docker compose run --rm openclaw-cli devices approve <requestId>
```

### 服务管理

```bash
# 停止服务
docker compose down

# 重启服务
docker compose restart openclaw-gateway

# 重新构建并启动
docker compose up -d --build openclaw-gateway
```

## 数据持久化

默认情况下，配置和工作空间会挂载到主机目录：

- **配置目录**: `~/.openclaw/` 或 `$OPENCLAW_CONFIG_DIR`
- **工作空间**: `~/.openclaw/workspace` 或 `$OPENCLAW_WORKSPACE_DIR`

这些目录中的数据会在容器重启或重建后保留。

### 持久化整个容器 home 目录

如果您希望持久化整个 `/home/node` 目录（包括浏览器缓存、工具缓存等），可以使用命名卷：

```bash
export OPENCLAW_HOME_VOLUME="openclaw_home"
./docker-setup.sh
```

### 添加额外的挂载目录

如果需要挂载其他主机目录到容器中：

```bash
export OPENCLAW_EXTRA_MOUNTS="$HOME/.codex:/home/node/.codex:ro,$HOME/projects:/home/node/projects:rw"
./docker-setup.sh
```

注意事项：
- 路径必须在 Docker Desktop（macOS/Windows）中共享
- 每个条目格式为 `source:target[:options]`，不能包含空格、制表符或换行符
- 修改后需要重新运行 `docker-setup.sh` 以重新生成配置

## 沙箱隔离（可选）

OpenClaw 支持在 Docker 容器中运行工具以提供额外的安全隔离。

### 启用沙箱

```bash
export OPENCLAW_SANDBOX=1
./docker-setup.sh
```

### 自定义 Docker socket 路径

对于 rootless Docker 或自定义安装：

```bash
export OPENCLAW_SANDBOX=1
export OPENCLAW_DOCKER_SOCKET=/run/user/1000/docker.sock
./docker-setup.sh
```

### 构建沙箱镜像

```bash
# 构建基础沙箱镜像
scripts/sandbox-setup.sh

# 构建包含常用工具的沙箱镜像（Node、Go、Rust 等）
scripts/sandbox-common-setup.sh

# 构建浏览器沙箱镜像
scripts/sandbox-browser-setup.sh
```

更多沙箱配置详情，请参考[沙箱文档](/gateway/sandboxing)。

## 安全注意事项

### 容器安全

- 容器以非 root 用户（`node`，uid 1000）运行
- 默认绑定到 `lan` 模式以支持主机访问
- 如果在公网 VPS 上运行，请配置防火墙规则限制访问
- 网关令牌存储在 `.env` 文件中，请妥善保管

### 网络安全

如果您在公网服务器上部署：

1. 使用防火墙限制端口访问
2. 考虑使用反向代理（如 Nginx）并启用 HTTPS
3. 定期更新令牌
4. 查看[网络暴露安全指南](/gateway/security#04-network-exposure-bind--port--firewall)

### 文件权限

镜像以 `node` 用户（uid 1000）运行。如果遇到权限错误：

```bash
# Linux 主机
sudo chown -R 1000:1000 /path/to/openclaw-config /path/to/openclaw-workspace

# 或者在部署脚本中自动修复（已包含在 docker-setup.sh 中）
```

## 故障排查

### 权限错误（EACCES）

如果看到 `/home/node/.openclaw` 的权限错误：

```bash
# 修复配置目录权限（Linux）
sudo chown -R 1000:1000 $OPENCLAW_CONFIG_DIR $OPENCLAW_WORKSPACE_DIR

# 或使用 docker-setup.sh 自动修复
./docker-setup.sh
```

### 连接问题

如果看到 "unauthorized" 或 "disconnected (1008): pairing required" 错误：

```bash
# 获取新的控制面板链接
docker compose run --rm openclaw-cli dashboard --no-open

# 查看设备列表
docker compose run --rm openclaw-cli devices list

# 批准设备
docker compose run --rm openclaw-cli devices approve <requestId>
```

### 内存不足

如果构建时遇到 OOM 错误（退出代码 137）：

- 增加 Docker 可用内存（至少 2GB）
- 使用预构建镜像而非本地构建：
  ```bash
  export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
  ./docker-setup.sh
  ```

### 网关配置问题

#### Control UI 需要 allowedOrigins 配置

如果看到以下错误：
```
Gateway failed to start: Error: non-loopback Control UI requires gateway.controlUi.allowedOrigins
```

这是因为网关绑定到 `lan` 模式时需要配置允许的来源。通常网关会自动配置，但如果没有，可以手动设置：

```bash
docker compose run --rm openclaw-cli config set gateway.controlUi.allowedOrigins '["http://localhost:18789","http://127.0.0.1:18789"]' --strict-json
```

#### 配置缺失错误

如果看到 "Missing config" 错误，说明配置文件不存在或路径不正确：

1. 确认 `.env` 文件中的路径格式正确
2. 确认配置目录已创建
3. 重新运行 onboard 命令

### 网关无法访问

如果主机无法访问网关端口：

```bash
# 检查绑定模式
docker compose run --rm openclaw-cli config get gateway.bind

# 设置为 lan 模式
docker compose run --rm openclaw-cli config set gateway.bind lan

# 重启网关
docker compose restart openclaw-gateway
```

### 查看详细日志

```bash
# 查看网关日志
docker compose logs -f openclaw-gateway

# 查看容器状态
docker compose ps

# 检查容器健康状态
docker inspect openclaw-gateway | grep -A 10 Health
```

## 自动化和 CI/CD

对于脚本和 CI 环境，禁用 TTY 分配以避免交互式提示：

```bash
# 使用 -T 标志
docker compose run -T --rm openclaw-cli gateway probe
docker compose run -T --rm openclaw-cli devices list --json
```

## 更新和维护

### 更新到最新版本

```bash
# 拉取最新镜像
docker pull ghcr.io/openclaw/openclaw:latest

# 或重新构建本地镜像
docker build -t openclaw:local -f Dockerfile .

# 重启服务
docker compose up -d --force-recreate openclaw-gateway
```

### 备份配置

```bash
# 备份配置目录
tar -czf openclaw-config-backup-$(date +%Y%m%d).tar.gz $OPENCLAW_CONFIG_DIR

# 备份工作空间
tar -czf openclaw-workspace-backup-$(date +%Y%m%d).tar.gz $OPENCLAW_WORKSPACE_DIR
```

### 清理旧数据

```bash
# 清理未使用的镜像
docker image prune -a

# 清理未使用的卷
docker volume prune

# 清理未使用的容器
docker container prune
```

## 性能优化

### 加速镜像构建

使用 BuildKit 缓存加速构建：

```bash
# 启用 BuildKit
export DOCKER_BUILDKIT=1

# 使用缓存构建
docker build --cache-from openclaw:local -t openclaw:local -f Dockerfile .
```

### 资源限制

在 `docker-compose.yml` 中添加资源限制：

```yaml
services:
  openclaw-gateway:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## 生产环境部署建议

1. **使用反向代理**: 在网关前部署 Nginx 或 Traefik
2. **启用 HTTPS**: 使用 Let's Encrypt 证书
3. **配置日志轮转**: 防止日志文件无限增长
4. **设置监控**: 使用 Prometheus + Grafana 监控容器状态
5. **定期备份**: 自动备份配置和工作空间
6. **使用编排工具**: 考虑使用 Docker Swarm 或 Kubernetes 进行生产部署

## 相关文档

- [Docker 安装指南](/install/docker)
- [沙箱隔离](/gateway/sandboxing)
- [网关安全](/gateway/security)
- [通道配置](/channels)
- [设备管理](/cli/devices)
- [控制面板](/web/dashboard)

## 获取帮助

如果遇到问题：

1. 查看[故障排查](#故障排查)部分
2. 检查 [GitHub Issues](https://github.com/openclaw/openclaw/issues)
3. 加入 Discord 社区寻求帮助
4. 查看完整文档：https://docs.openclaw.ai
