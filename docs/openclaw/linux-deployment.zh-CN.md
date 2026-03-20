---
summary: "Linux 系统 OpenClaw Docker 部署指南"
title: "Linux Docker 部署"
---

# OpenClaw Linux Docker 部署指南

本指南提供在 Linux 系统上使用 Docker 部署 OpenClaw 的详细说明。

## 前置要求

- **Linux 发行版**: Ubuntu 20.04+、Debian 11+、CentOS 8+ 或类似系统
- **Docker Engine** 20.10+ 或 **Docker Desktop for Linux**
- **Docker Compose** v2.0+
- 至少 **2GB RAM** 可用于 Docker
- **curl** 和 **git**（通常已预装）

## 快速开始

### 方式一：自动化部署（推荐）

```bash
# 克隆仓库
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# 运行自动化设置脚本
./docker-setup.sh
```

此脚本会自动：
1. 构建本地 Docker 镜像（或拉取远程镜像，如果设置了 `OPENCLAW_IMAGE`）
2. 运行引导向导
3. 生成网关令牌并写入 `.env` 文件
4. 启动网关服务

### 方式二：使用预构建镜像

```bash
# 使用官方预构建镜像
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./docker-setup.sh
```

可用的镜像标签：
- `main` - 最新主分支构建
- `latest` - 最新稳定版本
- `<version>` - 特定版本（如 `2026.2.26`）

### 方式三：手动部署

```bash
# 构建镜像
docker build -t openclaw:local -f Dockerfile .

# 运行引导配置
docker compose run --rm openclaw-cli onboard

# 启动网关
docker compose up -d openclaw-gateway
```

## 环境配置

### 基础配置

创建或修改 `.env` 文件：

```bash
# OpenClaw .env configuration for Linux
OPENCLAW_CONFIG_DIR=/home/$USER/.openclaw
OPENCLAW_WORKSPACE_DIR=/home/$USER/.openclaw/workspace
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_TOKEN=
OPENCLAW_IMAGE=openclaw:local
OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=true
```

### 高级配置

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

# 安装额外的系统包
export OPENCLAW_DOCKER_APT_PACKAGES="ffmpeg build-essential git curl"

# 预安装扩展依赖
export OPENCLAW_EXTENSIONS="diagnostics-otel matrix"

# 添加额外的挂载目录
export OPENCLAW_EXTRA_MOUNTS="$HOME/.codex:/home/node/.codex:ro,$HOME/projects:/home/node/projects:rw"

# 启用沙箱隔离
export OPENCLAW_SANDBOX=1
```

## 服务管理

### 基础命令

```bash
# 检查服务状态
docker compose ps

# 查看日志
docker compose logs -f openclaw-gateway

# 重启服务
docker compose restart openclaw-gateway

# 停止服务
docker compose down

# 启动服务
docker compose up -d
```

### 健康检查

```bash
# 快速健康检查
curl -fsS http://127.0.0.1:18789/healthz

# 详细健康检查
curl -fsS http://127.0.0.1:18789/readyz

# 完整健康报告（需要令牌）
docker compose exec openclaw-gateway node dist/index.js health
```

### 配置管理

```bash
# 查看当前配置
docker compose run --rm openclaw-cli config get

# 设置配置值
docker compose run --rm openclaw-cli config set gateway.bind lan
docker compose run --rm openclaw-cli config set gateway.mode local

# 获取控制面板 URL
docker compose run --rm openclaw-cli dashboard --no-open
```

## 通道配置

### WhatsApp（二维码登录）

```bash
docker compose run --rm openclaw-cli channels login
```

### Telegram（机器人令牌）

```bash
docker compose run --rm openclaw-cli channels add --channel telegram --token "<your-bot-token>"
```

### Discord（机器人令牌）

```bash
docker compose run --rm openclaw-cli channels add --channel discord --token "<your-bot-token>"
```

## 数据持久化

### 默认目录

- **配置**: `~/.openclaw/`
- **工作空间**: `~/.openclaw/workspace/`

### 自定义挂载点

```bash
# 设置自定义目录
export OPENCLAW_CONFIG_DIR="/opt/openclaw/config"
export OPENCLAW_WORKSPACE_DIR="/opt/openclaw/workspace"

# 创建目录并设置正确权限
sudo mkdir -p /opt/openclaw/{config,workspace}
sudo chown -R $USER:$USER /opt/openclaw
```

### 持久化 Home 目录

```bash
# 为整个容器 home 使用命名卷
export OPENCLAW_HOME_VOLUME="openclaw_home"
./docker-setup.sh
```

## 安全配置

### 文件权限

```bash
# 为 Docker 用户修复所有权（uid 1000）
sudo chown -R 1000:1000 ~/.openclaw

# 或使用当前用户
sudo chown -R $USER:$USER ~/.openclaw
```

### 防火墙配置（UFW）

```bash
# 允许网关端口
sudo ufw allow 18789/tcp

# 仅允许特定网络
sudo ufw allow from 192.168.1.0/24 to any port 18789

# 检查状态
sudo ufw status
```

### 防火墙配置（iptables）

```bash
# 允许网关端口
sudo iptables -A INPUT -p tcp --dport 18789 -j ACCEPT

# 仅允许特定网络
sudo iptables -A INPUT -s 192.168.1.0/24 -p tcp --dport 18789 -j ACCEPT

# 保存规则（Ubuntu/Debian）
sudo iptables-save > /etc/iptables/rules.v4
```

## 沙箱配置

### 启用沙箱

```bash
export OPENCLAW_SANDBOX=1
./docker-setup.sh
```

### 构建沙箱镜像

```bash
# 基础沙箱镜像
scripts/sandbox-setup.sh

# 包含常用工具的沙箱（Node、Go、Rust 等）
scripts/sandbox-common-setup.sh

# 浏览器沙箱镜像
scripts/sandbox-browser-setup.sh
```

### 自定义 Docker Socket

```bash
# 用于 rootless Docker
export OPENCLAW_DOCKER_SOCKET="/run/user/$(id -u)/docker.sock"
export OPENCLAW_SANDBOX=1
./docker-setup.sh
```

## 系统服务集成

### Systemd 服务（可选）

创建 systemd 服务以实现自动启动：

```bash
# 创建服务文件
sudo tee /etc/systemd/system/openclaw.service > /dev/null <<EOF
[Unit]
Description=OpenClaw Gateway
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/openclaw
ExecStart=/usr/local/bin/docker-compose up -d openclaw-gateway
ExecStop=/usr/local/bin/docker-compose down
User=$USER
Group=$USER

[Install]
WantedBy=multi-user.target
EOF

# 启用并启动服务
sudo systemctl enable openclaw.service
sudo systemctl start openclaw.service
```

## 性能优化

### Docker 守护进程配置

编辑 `/etc/docker/daemon.json`：

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  }
}
```

### 资源限制

添加到 `docker-compose.yml`：

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

## 故障排查

### 常见问题

#### 权限被拒绝错误

```bash
# 修复 Docker socket 权限
sudo chmod 666 /var/run/docker.sock

# 或将用户添加到 docker 组
sudo usermod -aG docker $USER
newgrp docker
```

#### 端口已被使用

```bash
# 查找使用端口 18789 的进程
sudo lsof -i :18789

# 如需要，杀死进程
sudo kill -9 <PID>
```

#### 磁盘空间不足

```bash
# 清理 Docker 资源
docker system prune -a

# 删除未使用的卷
docker volume prune

# 检查磁盘使用情况
df -h
docker system df
```

### 日志分析

```bash
# 查看网关日志
docker compose logs --tail=100 openclaw-gateway

# 实时跟踪日志
docker compose logs -f openclaw-gateway

# 查看系统日志
journalctl -u docker.service -f
```

## 备份和恢复

### 备份脚本

```bash
#!/bin/bash
# backup-openclaw.sh

BACKUP_DIR="/backup/openclaw-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 停止服务
docker compose down

# 备份配置
tar -czf "$BACKUP_DIR/config.tar.gz" -C "$HOME" .openclaw

# 备份 Docker 卷
docker run --rm -v openclaw_data:/data -v "$BACKUP_DIR":/backup alpine tar czf /backup/volumes.tar.gz -C /data .

# 备份环境文件
cp .env "$BACKUP_DIR/"

# 启动服务
docker compose up -d

echo "备份完成: $BACKUP_DIR"
```

### 恢复脚本

```bash
#!/bin/bash
# restore-openclaw.sh

BACKUP_DIR="$1"
if [ -z "$BACKUP_DIR" ]; then
    echo "用法: $0 <备份目录>"
    exit 1
fi

# 停止服务
docker compose down

# 恢复配置
tar -xzf "$BACKUP_DIR/config.tar.gz" -C "$HOME"

# 恢复 Docker 卷
docker run --rm -v openclaw_data:/data -v "$BACKUP_DIR":/backup alpine tar xzf /backup/volumes.tar.gz -C /data

# 恢复环境文件
cp "$BACKUP_DIR/.env" .

# 启动服务
docker compose up -d

echo "从以下位置恢复完成: $BACKUP_DIR"
```

## 监控

### 基础监控

```bash
# 检查容器统计信息
docker stats

# 监控日志
tail -f ~/.openclaw/logs/gateway.log

# 检查磁盘使用情况
du -sh ~/.openclaw/
```

### 使用 Prometheus 进行高级监控

创建 `docker-compose.monitoring.yml`：

```yaml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    
  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

## 卸载

### 完全删除

```bash
# 停止并删除容器
docker compose down -v

# 删除镜像
docker rmi openclaw:local
docker rmi $(docker images "ghcr.io/openclaw/openclaw" -q)

# 删除配置
rm -rf ~/.openclaw

# 删除环境文件
rm .env

# 删除 systemd 服务（如果已创建）
sudo systemctl stop openclaw.service
sudo systemctl disable openclaw.service
sudo rm /etc/systemd/system/openclaw.service
sudo systemctl daemon-reload
```

## 获取帮助

- **文档**: https://docs.openclaw.ai
- **GitHub Issues**: https://github.com/openclaw/openclaw/issues
- **Discord 社区**: 加入获取实时支持
- **Linux 特定问题**: 在 GitHub 上使用 `linux` 标签

## 下一步

1. 访问控制面板：http://127.0.0.1:18789/
2. 配置您喜欢的消息通道
3. 设置网络搜索提供商
4. 安装额外的技能和扩展
5. 为您的环境配置安全设置

更多高级配置，请参阅[主要 Docker 文档](./deployment.zh-CN.md)。
