# 📦 Docker Debian 部署指南

本文档提供基于 Debian Linux 的 Docker 容器化部署方案，**专为 CentOS 7 等不支持 Node.js 20+ 的宿主机设计**。

---

## 🎯 为什么选择 Debian + Docker？

### CentOS 7 的限制

| 问题 | 说明 |
|------|------|
| **glibc 版本过低** | CentOS 7 的 glibc 为 2.17，Node.js 20+ 需要 glibc 2.28+ |
| **官方仓库过旧** | 官方仓库最高支持 Node.js 10 |
| **编译安装复杂** | 从源码编译 Node.js 20+ 需要升级 gcc、glibc 等，风险高 |

### Debian + Docker 的优势

| 优势 | 说明 |
|------|------|
| **完全兼容** | Debian 是 Playwright 官方支持的系统，无兼容性问题 |
| **现代化** | 原生支持 Node.js 20+，无需额外配置 |
| **稳定可靠** | node:20-slim 官方镜像，经过充分测试 |
| **容器化** | 完美适配 Docker，隔离环境，易于管理 |
| **镜像适中** | 完整应用镜像约 1.5GB（包含 Playwright 浏览器） |

---

## 📋 前置要求

### 宿主机要求

| 组件 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 4 核 | 8 核+ |
| 内存 | 8GB | 16GB+ |
| 磁盘 | 50GB | 100GB+ SSD |
| 操作系统 | CentOS 7+ / Ubuntu 18.04+ | CentOS 7+ / Ubuntu 20.04+ |
| Docker | >= 20.10 | 最新版本 |
| Docker Compose | >= 2.0 | 最新版本 |

### 安装 Docker（CentOS 7）

```bash
# 安装依赖
sudo yum install -y yum-utils device-mapper-persistent-data lvm2

# 添加 Docker 仓库
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 安装 Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 验证安装
docker --version
docker compose version
````

### 安装 Docker（Ubuntu）

```bash
# 使用官方脚本一键安装
curl -fsSL https://get.docker.com | sh

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 验证安装
docker --version
docker compose version
````

---

## 🚀 快速部署

### 第一步：克隆项目

```bash
# 克隆项目
git clone https://github.com/SakuraTechy/sakura-ai.git
cd sakura-ai

# 或上传项目压缩包
# scp sakura-ai.tar.gz user@server:/path/to/
# tar -xzf sakura-ai.tar.gz && cd sakura-ai
````

### 第二步：配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件
vim .env
````

**必填配置项**：

```bash
# MySQL 密码（强密码）
MYSQL_ROOT_PASSWORD=YourStrongRootPassword123!
DB_PASSWORD=YourStrongDbPassword123!

# JWT 密钥（随机字符串）
JWT_SECRET=your_random_jwt_secret_key_change_this_in_production

# OpenRouter API Key（必需）
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx

# 默认 AI 模型
DEFAULT_MODEL=openai/gpt-4o
````

**可选配置项**（RAG 功能）：

```bash
# Qdrant 向量数据库
QDRANT_URL=http://qdrant:6333

# 阿里云 Embedding API
EMBEDDING_PROVIDER=aliyun
EMBEDDING_API_KEY=your_aliyun_api_key
````

### 第三步：一键部署

```bash

# 方式 1：使用安装脚本（推荐）
sh docker-install.sh install

# 方式 2：手动启动
docker compose up -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f sakura-ai

````

### 第四步：初始化数据库

```bash
# 等待 MySQL 启动完成（约 30 秒）
docker compose logs mysql | grep "ready for connections"

# 进入应用容器
docker compose exec sakura-ai bash

# 应用数据库迁移
npx prisma migrate deploy

# 生成 Prisma 客户端
npx prisma generate

# 退出容器
exit
```

---

## 🔧 服务管理

### 使用安装脚本管理（推荐）

```bash
# 启动服务
sh docker-install.sh start

# 停止服务
sh docker-install.sh stop

# 重启服务
sh docker-install.sh restart

# 查看状态
sh docker-install.sh status

# 查看日志
sh docker-install.sh logs          # 应用日志
sh docker-install.sh logs mysql    # 数据库日志
sh docker-install.sh logs qdrant   # Qdrant 日志

# 升级更新
sh docker-install.sh upgrade

# 备份数据
sh docker-install.sh backup

# 恢复数据
sh docker-install.sh restore backup_20260202.tar.gz
```

### 使用 Docker Compose 管理

```bash
# 启动所有服务
docker compose up -d

# 启动指定服务
docker compose up -d sakura-ai

# 停止所有服务
docker compose down

# 停止并删除数据卷（危险！）
docker compose down -v

# 重启服务
docker compose restart

# 查看日志
docker compose logs -f
docker compose logs -f sakura-ai

# 查看服务状态
docker compose ps

# 进入容器
docker compose exec sakura-ai bash
```

---

## 🎯 启用可选服务

### 启用 RAG 知识库（Qdrant）

```bash
# 启动 Qdrant 服务
docker compose --profile rag up -d

# 验证 Qdrant 运行
curl http://localhost:6333/health

# 访问 Qdrant 管理界面
# http://your-server-ip:6333/dashboard
```

### 启用 Nginx 反向代理

```bash
# 启动 Nginx 服务
docker compose --profile nginx up -d

# 验证 Nginx 运行
curl http://localhost

# 配置 SSL 证书（可选）
# 将证书文件放到 docker/Debian Linux/ssl/ 目录
# 修改 config/nginx.conf 配置
```

---

## 📊 监控和维护

### 查看资源使用

```bash
# 查看容器资源使用情况
docker stats

# 查看磁盘使用
docker system df

# 清理未使用的资源
docker system prune -a
```

### 备份数据

```bash
# 使用脚本备份（推荐）
sh docker-install.sh backup

# 手动备份 MySQL 数据库（在 Linux 环境中执行）
# docker compose exec mysql mysqldump -u root -pPASSWORD sakura_ai > backup.sql

# 备份上传文件
# tar -czf uploads_backup.tar.gz uploads

# 备份测试产物
# tar -czf artifacts_backup.tar.gz artifacts
```

### 恢复数据

```bash
# 使用脚本恢复（推荐）
sh docker-install.sh restore backup_20260202.tar.gz

# 手动恢复 MySQL 数据库（在 Linux 环境中执行）
# docker compose exec -T mysql mysql -u root -pPASSWORD sakura_ai < backup.sql

# 恢复上传文件
# tar -xzf uploads_backup.tar.gz
```

---

## 🔄 更新应用

### 方式一：使用脚本更新（推荐）

```bash
sh docker-install.sh upgrade
```

### 方式二：手动更新

```bash
# 拉取最新代码
git pull origin main

# 重新构建并启动
docker compose up -d --build

# 应用数据库迁移
docker compose exec sakura-ai npx prisma migrate deploy
```

---

## 🛠️ 常见问题

### 1. 容器启动失败

**问题**：docker compose up 失败

**解决方案**：

```bash
# 查看详细错误日志
docker compose logs

# 检查端口占用
sudo netstat -tulpn | grep -E '3001|3306|6333'

# 检查 .env 文件是否存在
ls -la .env

# 检查 Docker 磁盘空间
docker system df
```

### 2. 数据库连接失败

**问题**：Error: Can't connect to MySQL server

**解决方案**：

```bash
# 检查 MySQL 容器状态
docker compose ps mysql

# 查看 MySQL 日志
docker compose logs mysql

# 测试数据库连接（需要替换密码）
# docker compose exec mysql mysql -u sakura_ai -pPASSWORD -e "SELECT 1"
```

### 3. Playwright 浏览器启动失败

**问题**：Error: browserType.launch: Failed to launch chromium

**解决方案**：

```bash
# 检查 Playwright 环境变量
docker compose exec sakura-ai env | grep PLAYWRIGHT

# 测试 Chromium 启动
docker compose exec sakura-ai node -e "require('playwright').chromium.launch().then(b => b.close())"

# 查看 Playwright 浏览器路径
docker compose exec sakura-ai ls -la /root/.cache/ms-playwright/
```

### 4. 内存不足

**问题**：容器频繁重启或 OOM

**解决方案**：

修改 docker-compose.yml 限制内存：

```yaml
services:
  sakura-ai:
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G
```

然后重启服务：

```bash
docker compose up -d
```

### 5. 权限问题

**问题**：EACCES: permission denied

**解决方案**：

```bash
# 修改宿主机目录权限
sudo chown -R 1000:1000 uploads artifacts screenshots logs

# 或在容器内修改
docker compose exec sakura-ai chown -R node:node /app/uploads /app/artifacts /app/screenshots /app/logs
```

---

## 🔒 安全加固

### 1. 使用强密码

确保 .env 文件中的密码足够复杂：

```bash
MYSQL_ROOT_PASSWORD=YourStrongRootPassword123!@#
DB_PASSWORD=YourStrongDbPassword456!@#
JWT_SECRET=your_random_jwt_secret_key_at_least_32_characters_long
```

### 2. 限制容器权限

在 docker-compose.yml 中添加安全选项：

```yaml
services:
  sakura-ai:
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

### 3. 配置防火墙

```bash
# CentOS 7
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --permanent --add-port=5173/tcp
sudo firewall-cmd --reload

# Ubuntu
sudo ufw allow 3001/tcp
sudo ufw allow 5173/tcp
sudo ufw enable
```

---

## 📈 性能优化

### 1. 使用多阶段构建

Dockerfile.debian 已使用多阶段构建，减小镜像体积。

### 2. 配置资源限制

在 docker-compose.yml 中配置：

```yaml
services:
  sakura-ai:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 4G
        reservations:
          cpus: '2'
          memory: 2G
```

### 3. 使用 Docker 缓存

```bash
# 使用 BuildKit 加速构建
export DOCKER_BUILDKIT=1
docker compose build
```

---

## 📞 技术支持

如遇到部署问题，请：

1. 查看日志：docker compose logs
2. 检查容器状态：docker compose ps
3. 查看资源使用：docker stats
4. 提交 Issue：[GitHub Issues](https://github.com/SakuraTechy/sakura-ai/issues)

---

**返回**: [README](../README.md) | [Alpine 部署](DOCKER_ALPINE_DEPLOYMENT.md)
