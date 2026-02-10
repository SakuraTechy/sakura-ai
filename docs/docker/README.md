# Sakura AI Docker 部署方案

本目录提供完整的 Docker 部署解决方案，使用统一的 `sakura.sh` 脚本管理整个生命周期。

## 快速开始

```bash
# 首次安装
sh sakura.sh install

# 服务管理
sh sakura.sh start           # 启动服务
sh sakura.sh stop            # 停止服务
sh sakura.sh restart         # 重启服务
sh sakura.sh status          # 查看状态
sh sakura.sh logs            # 查看日志

# 数据管理
sh sakura.sh backup          # 备份数据库
sh sakura.sh restore backup.sql  # 恢复数据库
sh sakura.sh clean           # 清理所有数据（危险）

# 构建镜像（不推送）
sh sakura.sh build           # 构建 latest 版本
sh sakura.sh build v1.0.0    # 构建指定版本

# 推送镜像到阿里云
sh sakura.sh push            # 推送 latest 版本
sh sakura.sh push v1.0.0     # 推送指定版本

# 查看所有命令
sh sakura.sh help
```

---

## sakura.sh 统一管理脚本

### 功能特性

- ✓ 完整的生命周期管理（安装、构建、部署、运维）
- ✓ 环境检查和自动修复
- ✓ 前端构建验证
- ✓ Docker 镜像构建和推送
- ✓ 服务启停和状态监控
- ✓ 数据库备份和恢复

### 命令列表

**📦 安装部署**
```bash
./sakura.sh install         # 首次安装 Sakura AI
./sakura.sh build [版本]    # 构建镜像到本地（使用缓存，默认: latest）
./sakura.sh push [版本]     # 推送镜像到阿里云（默认: latest）
./sakura.sh rebuild         # 无缓存完全重建镜像
./sakura.sh upgrade         # 升级到最新版本
```

**🚀 服务管理**
```bash
./sakura.sh start           # 启动服务
./sakura.sh stop            # 停止服务
./sakura.sh restart         # 重启服务
./sakura.sh status          # 查看服务状态
./sakura.sh logs [服务]     # 查看日志（默认: sakura-ai）
```

**💾 数据管理**
```bash
./sakura.sh backup          # 备份数据库
./sakura.sh restore <文件>  # 恢复数据库
./sakura.sh clean           # 清理所有数据（危险）
```

**📖 其他**
```bash
./sakura.sh help            # 显示帮助信息
```

### 使用示例

```bash
# 首次安装
./sakura.sh install

# 构建镜像（本地测试）
./sakura.sh build v1.0.0

# 测试通过后推送到阿里云
./sakura.sh push v1.0.0

# 无缓存重建（解决缓存问题）
./sakura.sh rebuild

# 查看 MySQL 日志
./sakura.sh logs mysql

# 备份和恢复
./sakura.sh backup
./sakura.sh restore backups/sakura_ai_20260205_120000.sql
```

---

## 部署方案

### 方案一：本地构建并运行

**适用场景**：开发环境、首次部署、本地测试

**配置文件**：`docker-compose.yml`

#### 使用 sakura.sh（推荐）

```bash
# 首次安装（构建镜像 + 启动服务 + 数据库迁移）
./sakura.sh install

# 后续启动
./sakura.sh start

# 查看状态
./sakura.sh status
```

**说明**：
- `install` 会在本地构建镜像并启动所有服务
- 不会推送镜像到阿里云
- 适合快速本地部署

#### 手动操作（可选）

```bash
# 构建并启动
docker compose -f docker-compose.yml build    # 构建镜像
docker compose -f docker-compose.yml up -d    # 启动服务

# 执行数据库迁移
docker compose -f docker-compose.yml exec sakura-ai npx prisma migrate deploy

# 查看日志
docker compose -f docker-compose.yml logs -f

# 停止服务
docker compose -f docker-compose.yml down
```

---

### 方案二：构建镜像并推送到阿里云

**适用场景**：发布新版本、团队协作、多服务器部署

#### 使用 sakura.sh 构建和推送

```bash
# 1. 构建镜像到本地
./sakura.sh build           # 构建 latest 标签
./sakura.sh build v1.0.0    # 构建自定义版本标签

# 2. 本地测试镜像（可选）
docker run --rm -p 5173:5173 -p 3001:3001 sakura-ai:latest

# 3. 测试通过后推送到阿里云
./sakura.sh push            # 推送 latest 标签
./sakura.sh push v1.0.0     # 推送自定义版本标签

# 或者无缓存重建（解决缓存问题）
./sakura.sh rebuild
```

**说明**：
- `build` 只构建镜像到本地，不推送
- `push` 推送已构建的镜像到阿里云
- 可以先本地测试，确认无误后再推送
- 需要先登录阿里云镜像仓库（首次推送时会提示）
- 其他服务器可以直接拉取使用

#### 手动构建（可选）

```bash
# 1. 登录阿里云镜像仓库
docker login --username=你的用户名 crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com

# 2. 构建镜像
docker build -f Dockerfile.debian -t sakura-ai:latest .

# 3. 标记镜像
docker tag sakura-ai:latest crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com/sakura-ai/sakura-ai:latest

# 4. 推送到阿里云
docker push crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com/sakura-ai/sakura-ai:latest
```

---

### 方案三：使用阿里云在线镜像部署

**适用场景**：生产环境、快速部署、无需本地构建

**配置文件**：`docker-compose.yml`（需修改镜像配置）

**前提条件**：镜像已通过方案二推送到阿里云

#### 镜像访问说明

当前镜像仓库为**私有仓库**，需要登录才能拉取。有两种方式：

**方式 1：设置为公开仓库（推荐）**
在阿里云控制台将镜像仓库设置为公开，用户无需登录即可拉取。

**方式 2：使用访问凭证**
保持私有仓库，用户需要先登录才能拉取镜像。

#### 配置修改

修改 `docker-compose.yml` 中的镜像配置：

```yaml
sakura-ai:
  # 使用阿里云镜像（注释掉本地镜像）
  image: crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com/sakura-ai/sakura-ai:latest
  # image: sakura-ai:latest  # 本地镜像
```

#### 部署步骤

**步骤 1：登录阿里云镜像仓库（私有仓库时必需）**
```bash
docker login --username=你的用户名 crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com
# 输入密码或访问令牌
```

> 💡 如果镜像仓库已设置为公开，可跳过此步骤

**步骤 2：拉取最新镜像**
```bash
# 拉取镜像（从阿里云下载）
docker compose -f docker-compose.yml pull
```

**说明**：
- 从阿里云镜像仓库下载最新镜像
- 不会在本地构建镜像
- 确保使用的是已发布的稳定版本

**步骤 3：启动服务**
```bash
# 启动所有服务
docker compose -f docker-compose.yml up -d
```

**说明**：
- `-d` 表示后台运行
- 会启动 MySQL、Sakura AI 等所有服务

**步骤 4：查看服务状态**
```bash
# 查看运行状态
docker compose -f docker-compose.yml ps

# 查看实时日志
docker compose -f docker-compose.yml logs -f

# 查看特定服务日志
docker compose -f docker-compose.yml logs -f sakura-ai
docker compose -f docker-compose.yml logs -f mysql
```

**步骤 5：更新镜像**
```bash
# 拉取最新镜像
docker compose -f docker-compose.yml pull

# 重启服务应用更新
docker compose -f docker-compose.yml up -d
```

**说明**：
- `pull` 下载最新镜像
- `up -d` 会自动重启使用新镜像的容器

**步骤 6：停止服务**
```bash
# 停止所有服务
docker compose -f docker-compose.yml down

# 停止并删除数据卷（危险，会删除数据）
docker compose -f docker-compose.yml down -v
```

---

## 三种方案对比

| 特性 | 方案一：本地构建运行 | 方案二：构建推送 | 方案三：在线镜像部署 |
|------|---------------------|-----------------|---------------------|
| **命令** | `./sakura.sh install` | `./sakura.sh build` + `./sakura.sh push` | 修改镜像配置 + `docker compose up -d` |
| **构建位置** | 本地 | 本地 | 无需构建 |
| **是否推送** | ❌ 否 | ✅ 是 | - |
| **是否启动** | ✅ 是 | ❌ 否 | ✅ 是 |
| **适用场景** | 开发测试 | 发布版本 | 生产部署 |
| **需要源码** | ✅ 需要 | ✅ 需要 | ❌ 不需要 |
| **部署速度** | 慢（需构建） | 慢（需构建） | 快（直接拉取） |
| **配置修改** | 无需修改 | 无需修改 | 需修改镜像地址 |
| **本地测试** | ✅ 自动启动 | ✅ 可先测试再推送 | ❌ 直接使用线上镜像 |

### 方案选择建议

**开发环境（本地）**
- 使用方案一：`./sakura.sh install`
- 快速本地部署，代码修改后重新构建

**测试环境（服务器）**
- 使用方案三：修改 `docker-compose.yml` 使用阿里云镜像
- 使用统一的镜像版本，确保环境一致

**生产环境（服务器）**
- 使用方案三：修改 `docker-compose.yml` 使用阿里云镜像
- 版本管理规范，部署速度快，稳定可靠

**发布新版本**
- 使用方案二：`./sakura.sh build v1.0.0` 构建镜像
- 本地测试确认无误
- 使用 `./sakura.sh push v1.0.0` 推送到阿里云
- 供其他环境使用

---

## 典型使用流程

### 开发者工作流

```bash
# 1. 本地开发和测试
./sakura.sh install              # 本地构建并运行

# 2. 开发完成后，构建镜像
./sakura.sh build v1.0.0         # 构建到本地

# 3. 本地测试镜像（可选）
docker run --rm -p 5173:5173 -p 3001:3001 sakura-ai:v1.0.0

# 4. 测试通过后推送到阿里云
./sakura.sh push v1.0.0          # 推送到阿里云

# 5. 在生产服务器上部署
docker login --username=xxx crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com
# 修改 docker-compose.yml 使用阿里云镜像
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d
```

### 生产环境部署

```bash
# 1. 登录阿里云（私有仓库时）
docker login --username=xxx crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com

# 2. 修改 docker-compose.yml 镜像配置
# 将 image 改为：crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com/sakura-ai/sakura-ai:latest

# 3. 拉取镜像
docker compose -f docker-compose.yml pull

# 4. 启动服务
docker compose -f docker-compose.yml up -d

# 5. 查看状态
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs -f
```

### 更新版本

```bash
# 方式 1：使用 sakura.sh（如果有源码）
./sakura.sh upgrade

# 方式 2：手动更新（生产环境）
docker compose -f docker-compose.yml pull    # 拉取最新镜像
docker compose -f docker-compose.yml up -d   # 重启服务
```

---

## 环境配置

### 配置文件说明

Sakura AI 使用两个独立的配置文件：

**1. `.env` - 应用运行时配置**
- 位置：项目根目录 `.env`
- 用途：数据库连接、JWT密钥、AI服务等运行时配置
- 使用：应用启动时自动加载
- 创建：复制 `.env.example` 为 `.env` 并修改

**2. `config.sh` - Docker 构建配置**
- 位置：`config.sh`
- 用途：镜像仓库地址、镜像名称等构建时配置
- 使用：构建和推送镜像时使用（`./sakura.sh build`）
- 修改：直接编辑 `config.sh` 文件

### 基本配置

复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
```

必需配置项：
- `MYSQL_ROOT_PASSWORD` - MySQL root 密码
- `DB_PASSWORD` - 应用数据库密码
- `JWT_SECRET` - JWT 密钥
- `OPENROUTER_API_KEY` - AI 服务密钥

### Docker 环境变量传递方式

Docker 环境中有三种方式传递配置：

#### 方式 1：通过 environment 直接配置（推荐生产环境）

在 `docker-compose.yml` 中直接配置：

```yaml
services:
  sakura-ai:
    image: sakura-ai:latest
    environment:
      DATABASE_URL: mysql://sakura_ai:your_password@mysql:3306/sakura_ai
      NODE_ENV: production
      PORT: 3001
      JWT_SECRET: your_jwt_secret_here
      OPENROUTER_API_KEY: your_api_key_here
```

**优点**：配置集中、版本控制友好、适合团队协作

#### 方式 2：通过 env_file 引用（推荐开发环境）

```yaml
services:
  sakura-ai:
    image: sakura-ai:latest
    env_file:
      - .env  # 引用外部 .env 文件
```

**优点**：敏感信息不提交 Git、每个开发者独立配置

#### 方式 3：混合使用（最佳实践）

```yaml
services:
  sakura-ai:
    image: sakura-ai:latest
    env_file:
      - .env  # 敏感信息（密码、密钥）
    environment:
      NODE_ENV: production  # 非敏感配置
      PORT: 3001
```

**优点**：兼顾安全性和便利性

### 环境变量优先级

优先级从高到低：
1. `docker-compose.yml` 中的 `environment`
2. `env_file` 指定的文件
3. 容器内的 `.env` 文件
4. Dockerfile 中的 `ENV`

---

## 网络模式选择

### Host 网络模式（默认）

**配置文件**：`docker-compose.yml`

**适用场景**：
- 需要访问宿主机内网系统（如内网数据库、API）
- 需要容器与宿主机共享网络栈
- 测试环境需要直接访问内网资源

**特点**：
- ✓ 容器直接使用宿主机网络
- ✓ 无需端口映射，性能最优
- ✓ 可访问宿主机所有网络资源
- ✗ 不能使用 Docker 网络隔离
- ✗ 端口冲突风险

**使用方法**：
```bash
./sakura.sh start
# 或
docker compose -f docker-compose.yml up -d
```

**注意事项**：
- MySQL 需要在宿主机上运行或使用独立容器
- 环境变量中数据库地址使用 `localhost:3306`
- 应用直接监听宿主机的 3001 和 5173 端口

### Bridge 网络模式（备用）

**配置文件**：`docker-compose.bridge.yml`

**适用场景**：
- 不需要访问宿主机内网系统
- 需要 Docker 网络隔离和安全性
- 标准的容器化部署

**特点**：
- ✓ Docker 网络隔离，更安全
- ✓ 支持容器间服务发现
- ✓ 端口映射灵活
- ✗ 无法直接访问宿主机内网

**使用方法**：
```bash
docker compose -f docker-compose.bridge.yml up -d
```

**注意事项**：
- MySQL 在 Docker 网络内运行
- 环境变量中数据库地址使用 `mysql:3306`（服务名）
- 通过端口映射访问应用：`宿主机IP:3001`

### 如何选择？

| 需求 | 推荐模式 |
|------|---------|
| 需要访问内网数据库/API | Host 模式 |
| 纯容器化部署 | Bridge 模式 |
| 开发测试环境 | Host 模式 |
| 生产环境（云服务器） | Bridge 模式 |
| 需要网络隔离 | Bridge 模式 |

---

## 服务端口

### Host 网络模式
- **3001** - 后端 API 服务（直接使用宿主机端口）
- **5173** - 前端开发服务（直接使用宿主机端口）
- **3306** - MySQL 数据库（需在宿主机或独立容器运行）

### Bridge 网络模式
- **3001** - 后端 API 服务（映射到宿主机 3001）
- **5173** - 前端开发服务（映射到宿主机 5173）
- **3306** - MySQL 数据库（映射到宿主机 3306）
- **6333** - Qdrant 向量数据库（可选）
- **80/443** - Nginx 反向代理（可选）

---

## 镜像信息

- **镜像仓库**：阿里云容器镜像服务（杭州）
- **镜像地址**：`crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com/sakura-ai/sakura-ai`
- **默认标签**：`latest`

### 镜像访问权限配置

#### 设置为公开仓库（推荐给开源项目）

1. 登录阿里云容器镜像服务控制台
2. 进入 `容器镜像服务` > `个人实例` > `仓库管理`
3. 找到 `sakura-ai/sakura-ai` 仓库
4. 点击 `修改仓库` > 将 `仓库类型` 改为 `公开`
5. 保存后，用户无需登录即可拉取镜像

#### 保持私有仓库

**方式 1：创建访问令牌（推荐）**
```bash
docker login --username=你的用户名 --password=访问令牌 crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com
```

**方式 2：RAM 子账号**
- 创建 RAM 子账号并授予镜像拉取权限
- 用户使用子账号登录

---

## 常见问题

### 1. 如何切换镜像版本？

**方式 1：修改 docker-compose.yml**
```yaml
sakura-ai:
  image: crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com/sakura-ai/sakura-ai:v1.0.0
```

**方式 2：使用环境变量**
```bash
export SAKURA_IMAGE_TAG=v1.0.0
docker compose up -d
```

### 2. 如何构建和推送特定版本？

```bash
# 构建特定版本
./sakura.sh build v1.0.0

# 本地测试（可选）
docker run --rm -p 5173:5173 -p 3001:3001 sakura-ai:v1.0.0

# 推送到阿里云
./sakura.sh push v1.0.0
```

### 2. 如何查看镜像构建日志？

```bash
# 使用 sakura.sh
./sakura.sh build

# 手动查看
docker compose build --progress=plain
```

### 3. 如何清理旧镜像？

```bash
docker image prune -a
```

### 4. 无法拉取镜像怎么办？

**错误信息**：`unauthorized: authentication required`

**解决方法**：
- 检查镜像仓库是否为公开
- 如果是私有仓库，确保已登录
- 检查访问令牌或密码是否正确
- 确认账号有拉取权限

### 5. 如何备份数据？

```bash
# 使用 sakura.sh（推荐）
./sakura.sh backup

# 手动备份
docker exec sakura-ai-mysql mysqldump -u root -p sakura_ai > backup.sql
tar -czf sakura-data-backup.tar.gz uploads/ artifacts/ screenshots/ logs/
```

### 6. 如何恢复数据？

```bash
# 使用 sakura.sh（推荐）
./sakura.sh restore backup.sql

# 手动恢复
docker exec -i sakura-ai-mysql mysql -u root -p sakura_ai < backup.sql
```

### 7. install、build 和 push 有什么区别？

**`./sakura.sh install`**（方案一）
- 在本地构建镜像并启动服务
- 不推送镜像到阿里云
- 适合本地开发和测试

**`./sakura.sh build`**（方案二 - 第一步）
- 只构建镜像到本地
- 不推送到阿里云
- 不启动服务
- 适合先本地测试再决定是否推送

**`./sakura.sh push`**（方案二 - 第二步）
- 推送已构建的镜像到阿里云
- 需要先执行 build 构建镜像
- 适合发布新版本供其他服务器使用

**典型流程**：
```bash
# 开发阶段：本地构建运行
./sakura.sh install

# 发布阶段：构建、测试、推送
./sakura.sh build v1.0.0         # 构建到本地
docker run --rm -p 5173:5173 -p 3001:3001 sakura-ai:v1.0.0  # 本地测试（可选）
./sakura.sh push v1.0.0          # 推送到阿里云

# 生产部署：拉取镜像运行（需先修改 docker-compose.yml 镜像配置）
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d
```

---

## 推荐工作流

### 开发流程
1. 本地开发和测试
2. 使用 `./sakura.sh build` 构建镜像
3. 推送到阿里云镜像仓库
4. 在测试环境验证

### 生产部署
1. 确保镜像已推送到阿里云
2. 修改 `docker-compose.yml` 使用阿里云镜像地址
3. 在生产服务器使用 `docker compose up -d` 部署
4. 配置 Nginx 反向代理（可选）
5. 设置自动备份和监控

### 常用命令速查

#### sakura.sh 命令（推荐）

```bash
# 📦 安装部署
./sakura.sh install            # 首次安装（本地构建 + 启动服务 + 数据库迁移）
./sakura.sh build              # 构建镜像到本地（latest 版本，使用缓存）
./sakura.sh build v1.0.0       # 构建镜像到本地（指定版本）
./sakura.sh push               # 推送镜像到阿里云（latest 版本）
./sakura.sh push v1.0.0        # 推送镜像到阿里云（指定版本）
./sakura.sh rebuild            # 无缓存完全重建镜像

# 🚀 服务管理
./sakura.sh start              # 启动所有服务
./sakura.sh stop               # 停止所有服务
./sakura.sh restart            # 重启所有服务
./sakura.sh status             # 查看服务运行状态
./sakura.sh logs               # 查看 sakura-ai 服务日志
./sakura.sh logs mysql         # 查看 MySQL 服务日志

# 💾 数据管理
./sakura.sh backup             # 备份数据库到 backups/ 目录
./sakura.sh restore backup.sql # 从备份文件恢复数据库
./sakura.sh upgrade            # 升级到最新版本（拉取代码 + 重建 + 迁移）
./sakura.sh clean              # 清理所有数据（危险操作）
```

#### docker compose 命令（手动方式）

**本地构建运行（docker-compose.yml）**
```bash
# 构建和启动
docker compose -f docker-compose.yml build          # 构建镜像
docker compose -f docker-compose.yml up -d          # 启动服务（后台运行）
docker compose -f docker-compose.yml up             # 启动服务（前台运行，查看日志）

# 服务管理
docker compose -f docker-compose.yml ps             # 查看服务状态
docker compose -f docker-compose.yml logs -f        # 查看所有服务日志
docker compose -f docker-compose.yml logs -f sakura-ai  # 查看指定服务日志
docker compose -f docker-compose.yml restart        # 重启所有服务
docker compose -f docker-compose.yml restart sakura-ai  # 重启指定服务
docker compose -f docker-compose.yml down           # 停止并删除容器
docker compose -f docker-compose.yml down -v        # 停止并删除容器和数据卷

# 执行命令
docker compose -f docker-compose.yml exec sakura-ai npx prisma migrate deploy  # 执行数据库迁移
docker compose -f docker-compose.yml exec sakura-ai sh  # 进入容器 shell
```

**在线镜像部署（修改 docker-compose.yml 使用阿里云镜像）**
```bash
# 修改配置
# 将 docker-compose.yml 中的 image 改为阿里云镜像地址

# 拉取和启动
docker compose -f docker-compose.yml pull    # 从阿里云拉取最新镜像
docker compose -f docker-compose.yml up -d   # 启动服务（后台运行）

# 服务管理
docker compose -f docker-compose.yml ps      # 查看服务状态
docker compose -f docker-compose.yml logs -f # 查看所有服务日志
docker compose -f docker-compose.yml restart # 重启所有服务
docker compose -f docker-compose.yml down    # 停止并删除容器

# 更新版本
docker compose -f docker-compose.yml pull    # 拉取最新镜像
docker compose -f docker-compose.yml up -d   # 重启服务应用更新
```

**桥接网络模式（docker-compose.bridge.yml）**
```bash
# 使用桥接网络模式启动（不访问宿主机内网）
docker compose -f docker-compose.bridge.yml up -d
docker compose -f docker-compose.bridge.yml down
```

#### docker 原生命令

```bash
# 镜像管理
docker images                                        # 查看本地镜像
docker rmi sakura-ai:latest                         # 删除镜像
docker image prune -a                               # 清理所有未使用的镜像

# 容器管理
docker ps                                           # 查看运行中的容器
docker ps -a                                        # 查看所有容器
docker logs -f sakura-ai-app                        # 查看容器日志
docker exec -it sakura-ai-app sh                    # 进入容器
docker stop sakura-ai-app                           # 停止容器
docker rm sakura-ai-app                             # 删除容器

# 登录阿里云
docker login --username=你的用户名 crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com

# 推送镜像
docker push crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com/sakura-ai/sakura-ai:latest
```

---

## 故障排除

### 语法错误：syntax error near unexpected token ')'

**错误原因**：文件在 Windows 下编辑后包含 CRLF 换行符，在 Linux 环境下执行时会导致语法错误。

**解决方法**：

**方式 1：使用修复脚本（推荐）**
```bash
bash fix-line-endings.sh
```

**方式 2：手动转换**
```bash
sed -i 's/\r$//' sakura.sh
```

**方式 3：配置 Git 自动转换（预防）**
```bash
# 在 Windows 下配置 Git
git config --global core.autocrlf input

# 重新检出文件
git checkout -- "sakura.sh"
```

### 构建错误

#### Prisma 类型错误

**错误信息**: `The constant "xxx" must be initialized`

**解决方法**:
```bash
# 使用 sakura.sh 自动修复
./sakura.sh rebuild

# 手动修复
rm -rf src/generated/prisma
npx prisma generate
npm run build
```

#### 前端编译失败

**解决方法**:
```bash
# 清理缓存并重新构建
rm -rf dist node_modules/.vite
npm run build

# 使用 sakura.sh 重建
./sakura.sh rebuild
```

### 运行时错误

#### 数据库连接失败

**检查项**：
- 确认 MySQL 服务是否运行
- 检查 `.env` 中的数据库配置
- 确认网络模式（host/bridge）与数据库地址匹配

#### 端口冲突

**解决方法**：
- 检查 3001、5173、3306 端口是否被占用
- 使用 `netstat -ano | findstr "3001"` 查看端口占用
- 停止占用端口的进程或修改配置使用其他端口

---

## 辅助脚本说明

### sakura.sh（主脚本）
统一管理脚本，提供完整的生命周期管理

**功能**:
- 安装部署（install/build/rebuild/upgrade）
- 服务管理（start/stop/restart/status/logs）
- 数据管理（backup/restore/clean）
- 环境检查和自动修复
- 前端构建验证
- Docker 镜像构建和推送

**使用**: `./sakura.sh <命令> [参数]`

---

## 验证安装

### 1. 验证 Playwright ffmpeg 安装

```bash
# 进入容器
docker exec -it sakura-ai-app sh

# 运行 ffmpeg 测试脚本
bash /app/test-ffmpeg.sh

# 或手动检查
find /root/.cache/ms-playwright -name "ffmpeg" -type f
```

**预期输出**：
- ✅ Playwright ffmpeg: `/root/.cache/ms-playwright/ffmpeg-*/ffmpeg`
- ✅ ffmpeg 功能正常（可生成测试视频）

**说明**：
- 只使用 Playwright 自带的 ffmpeg，不依赖系统 ffmpeg
- Playwright 会自动下载并管理 ffmpeg 二进制文件
- 视频录制和截图功能由 Playwright ffmpeg 提供

### 2. 验证服务运行

```bash
# 查看服务状态
./sakura.sh status

# 查看日志
./sakura.sh logs
```

---

## 访问地址

安装完成后，可通过以下地址访问：

- **前端界面**: http://localhost:5173
- **后端 API**: http://localhost:3001
- **健康检查**: http://localhost:3001/health

---

## 技术支持

如遇到问题，请查看：
1. 本文档的"常见问题"和"故障排除"章节
2. 项目根目录的 `docs/TROUBLESHOOTING.md`
3. GitHub Issues

---

**最后更新**: 2026-02-05
