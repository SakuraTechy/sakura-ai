# 📦 Docker Alpine 部署指南

本文档提供基于 Alpine Linux 的 Docker 容器化部署方案，**专为 CentOS 7 宿主机设计**，解决 CentOS 7 不支持 Node.js 18+ 的问题。

---

## 🎯 为什么选择 Alpine Linux？

### CentOS 7 的限制

| 问题 | 说明 |
|------|------|
| **glibc 版本过低** | CentOS 7 的 glibc 为 2.17，Node.js 18+ 需要 glibc 2.28+ |
| **官方仓库过旧** | 官方仓库最高支持 Node.js 10 |
| **编译安装复杂** | 从源码编译 Node.js 18+ 需要升级 gcc、glibc 等，风险高 |

### Alpine Linux 的优势

| 优势 | 说明 |
|------|------|
| **轻量级** | 基础镜像仅 5MB，完整应用镜像约 200MB |
| **现代化** | 原生支持 Node.js 20+，无需额外配置 |
| **安全性** | 使用 musl libc，减少攻击面 |
| **容器化** | 完美适配 Docker，隔离环境，易于管理 |

---

## 📋 前置要求

### 宿主机要求（CentOS 7）

| 组件 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 4 核 | 8 核+ |
| 内存 | 8GB | 16GB+ |
| 磁盘 | 50GB | 100GB+ SSD |
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
```

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
```

### 第二步：配置环境变量

```bash
# 进入 docker 目录
cd docker

# 复制环境变量模板
cp .env.alpine.example .env

# 编辑配置文件
vim .env
```

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
```

**可选配置项**（RAG 功能）：

```bash
# Qdrant 向量数据库
QDRANT_URL=http://qdrant:6333

# 阿里云 Embedding API
EMBEDDING_PROVIDER=aliyun
EMBEDDING_API_KEY=your_aliyun_api_key
```

### 第三步：构建并启动服务

```bash
# 构建镜像并启动所有服务
docker compose -f docker-compose.alpine.yml up -d

# 查看服务状态
docker compose -f docker-compose.alpine.yml ps

# 查看日志
docker compose -f docker-compose.alpine.yml logs -f sakura-ai
```

### 第四步：初始化数据库

```bash
# 等待 MySQL 启动完成（约 30 秒）
docker compose -f docker-compose.alpine.yml logs mysql | grep "ready for connections"

# 进入应用容器
docker compose -f docker-compose.alpine.yml exec sakura-ai sh

# 应用数据库迁移
npx prisma migrate deploy

# 退出容器
exit
```

### 第五步：访问应用

```bash
# 应用地址
http://your-server-ip:3001

# 健康检查
curl http://your-server-ip:3001/api/health
```

---

## 🔧 服务管理

### 启动服务

```bash
# 启动所有服务
docker compose -f docker-compose.alpine.yml up -d

# 启动指定服务
docker compose -f docker-compose.alpine.yml up -d sakura-ai

# 启动并包含 RAG 服务
docker compose -f docker-compose.alpine.yml --profile rag up -d

# 启动并包含 Nginx
docker compose -f docker-compose.alpine.yml --profile nginx up -d
```

### 停止服务

```bash
# 停止所有服务
docker compose -f docker-compose.alpine.yml down

# 停止并删除数据卷（危险！）
docker compose -f docker-compose.alpine.yml down -v
```

### 重启服务

```bash
# 重启所有服务
docker compose -f docker-compose.alpine.yml restart

# 重启指定服务
docker compose -f docker-compose.alpine.yml restart sakura-ai
```

### 查看日志

```bash
# 查看所有服务日志
docker compose -f docker-compose.alpine.yml logs -f

# 查看指定服务日志
docker compose -f docker-compose.alpine.yml logs -f sakura-ai

# 查看最近 100 行日志
docker compose -f docker-compose.alpine.yml logs --tail=100 sakura-ai
```

### 进入容器

```bash
# 进入应用容器
docker compose -f docker-compose.alpine.yml exec sakura-ai sh

# 进入 MySQL 容器
docker compose -f docker-compose.alpine.yml exec mysql bash
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
# 备份 MySQL 数据库
docker compose -f docker-compose.alpine.yml exec mysql \
  mysqldump -u root -p${MYSQL_ROOT_PASSWORD} sakura_ai > backup_$(date +%Y%m%d).sql

# 备份上传文件
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz ../uploads

# 备份测试产物
tar -czf artifacts_backup_$(date +%Y%m%d).tar.gz ../artifacts
```

### 恢复数据

```bash
# 恢复 MySQL 数据库
docker compose -f docker-compose.alpine.yml exec -T mysql \
  mysql -u root -p${MYSQL_ROOT_PASSWORD} sakura_ai < backup_20260128.sql

# 恢复上传文件
tar -xzf uploads_backup_20260128.tar.gz -C ../
```

---

## 🔄 更新应用

### 方式一：重新构建镜像

```bash
# 拉取最新代码
cd /path/to/sakura-ai
git pull origin main

# 重新构建并启动
cd docker
docker compose -f docker-compose.alpine.yml up -d --build

# 应用数据库迁移
docker compose -f docker-compose.alpine.yml exec sakura-ai npx prisma migrate deploy
```

### 方式二：使用预构建镜像（如果有）

```bash
# 拉取最新镜像
docker compose -f docker-compose.alpine.yml pull

# 重启服务
docker compose -f docker-compose.alpine.yml up -d
```

---

## 🛠️ 常见问题

### 1. 容器启动失败

**问题**：`docker compose up` 失败

**解决方案**：

```bash
# 查看详细错误日志
docker compose -f docker-compose.alpine.yml logs

# 检查端口占用
sudo netstat -tulpn | grep -E '3001|3306|6333'

# 检查 .env 文件是否存在
ls -la .env

# 检查 Docker 磁盘空间
docker system df
```

### 2. 数据库连接失败

**问题**：`Error: Can't connect to MySQL server`

**解决方案**：

```bash
# 检查 MySQL 容器状态
docker compose -f docker-compose.alpine.yml ps mysql

# 查看 MySQL 日志
docker compose -f docker-compose.alpine.yml logs mysql

# 测试数据库连接
docker compose -f docker-compose.alpine.yml exec mysql \
  mysql -u sakura_ai -p${DB_PASSWORD} -e "SELECT 1"
```

### 3. Playwright 浏览器启动失败

**问题**：`Error: browserType.launch: Failed to launch chromium`

**解决方案**：

```bash
# 检查环境变量
docker compose -f docker-compose.alpine.yml exec sakura-ai env | grep PLAYWRIGHT

# 测试 Chromium 启动
docker compose -f docker-compose.alpine.yml exec sakura-ai \
  node -e "require('playwright').chromium.launch({executablePath: '/usr/bin/chromium-browser'}).then(b => b.close())"

# 检查 Chromium 是否存在
docker compose -f docker-compose.alpine.yml exec sakura-ai \
  ls -lh /usr/bin/chromium-browser
```

### 4. 内存不足

**问题**：容器频繁重启或 OOM

**解决方案**：

```bash
# 限制容器内存（修改 docker-compose.alpine.yml）
services:
  sakura-ai:
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G

# 重启服务
docker compose -f docker-compose.alpine.yml up -d
```

### 5. 权限问题

**问题**：`EACCES: permission denied`

**解决方案**：

```bash
# 修改宿主机目录权限
sudo chown -R 1000:1000 ../uploads ../artifacts ../screenshots ../logs

# 或在容器内修改
docker compose -f docker-compose.alpine.yml exec sakura-ai \
  chown -R node:node /app/uploads /app/artifacts /app/screenshots /app/logs
```

---

## 🔒 安全加固

### 1. 使用 Docker Secrets

```bash
# 创建 secrets
echo "your_db_password" | docker secret create db_password -
echo "your_jwt_secret" | docker secret create jwt_secret -

# 修改 docker-compose.alpine.yml 使用 secrets
```

### 2. 限制容器权限

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
# 只允许必要端口
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload
```

---

## 📈 性能优化

### 1. 使用多阶段构建

Dockerfile.alpine 已使用多阶段构建，减小镜像体积。

### 2. 配置资源限制

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
docker compose -f docker-compose.alpine.yml build --no-cache
```

---

## 📞 技术支持

如遇到部署问题，请：

1. 查看日志：`docker compose logs`
2. 检查容器状态：`docker compose ps`
3. 查看资源使用：`docker stats`
4. 提交 Issue：[GitHub Issues](https://github.com/SakuraTechy/sakura-ai/issues)

---

**返回**: [README](../README.md) | [CentOS 7 部署](CENTOS7_DEPLOYMENT.md)
