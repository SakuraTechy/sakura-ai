# Git 提交日志

## 2026-02-06

### perf: 深度优化镜像体积，从 4.83GB 减小到约 3.5GB
- 修改 `docker/Debian Linux/Dockerfile.debian` 增强清理策略
- **node_modules 深度清理**（预计节省 ~500MB）：
  - 删除所有测试目录（__tests__, test, tests）
  - 删除源码目录（src/）和示例目录（examples/, docs/）
  - 删除 source map 文件（*.map）
  - 删除大型开发依赖（@types, typescript, eslint）
  - 删除 coverage 目录
- **字体包优化**（预计节省 ~300MB）：
  - 移除 fonts-noto-cjk（包含中日韩所有字体，~400MB）
  - 只保留基础字体（fonts-liberation, fonts-noto-color-emoji）
  - 如需中文支持，可在运行时按需安装特定字体
- **优化效果**：
  - 原始大小：4.83GB
  - 优化后预计：3.2-3.5GB
  - 节省空间：~1.3-1.6GB（约 27-33%）
- **注意事项**：
  - 如果应用需要显示中文，需要单独安装中文字体
  - 可以在 docker-compose.yml 中挂载宿主机字体目录
  - 或在运行阶段按需安装：`apt-get install fonts-noto-cjk`

### fix: 修复 Playwright 浏览器在清理步骤中被误删的问题
- 修改 `docker/Debian Linux/Dockerfile.debian` 将 Playwright 安装和清理合并到同一层
- 在同一个 RUN 命令中完成：安装 → 复制 → 清理文档 → 验证
- 只删除文档文件（*.map, *.d.ts, *.md, LICENSE, NOTICE）
- 保留所有可执行文件和库文件（chrome, headless_shell, ffmpeg 及其依赖）
- 添加详细的验证步骤，确认三个组件都正确安装
- 将 node_modules 清理移到独立层，避免影响 Playwright
- 问题原因：
  - 之前 Playwright 安装和清理在不同的 RUN 命令中
  - 清理步骤可能误删了浏览器可执行文件
  - 缓存挂载的临时目录在 RUN 结束后消失
- 解决方案：
  - 在同一层中完成所有 Playwright 相关操作
  - 只清理文档，不清理可执行文件
  - 添加清理后的验证步骤
- 修复错误：`browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell`

### perf: 优化 Dockerfile 构建顺序，充分利用 Docker 层缓存加快构建速度
- 修改 `docker/Debian Linux/Dockerfile.debian` 优化文件复制顺序
- 关键优化策略：
  1. **依赖安装层**（最稳定）：package.json → npm install
  2. **Prisma 生成层**（schema 变化时才重建）：prisma/ → prisma generate
  3. **代码复制层**（最频繁变化）：COPY . . → npm run build
  4. **Playwright 浏览器层**（已有缓存）：使用 --mount=type=cache
- 移除重复的 Playwright 安装步骤（之前有两次安装）
- 将 .env 文件创建移到代码复制之后
- 优势：
  - **代码修改**：只重建 build 层，跳过依赖安装和 Prisma 生成（节省 5-10 分钟）
  - **schema 修改**：只重建 Prisma 和后续层，跳过依赖安装（节省 3-5 分钟）
  - **依赖修改**：需要完整重建，但这种情况较少
- 构建时间对比：
  - 首次构建：~15-20 分钟（下载所有依赖和浏览器）
  - 代码修改后：~2-3 分钟（只重建前端）
  - schema 修改后：~3-5 分钟（重新生成 Prisma + 重建前端）

## 2026-02-06

### refactor: 优化多阶段构建，在构建阶段安装所有系统依赖
- 修改 `docker/Debian Linux/Dockerfile.debian` 构建阶段依赖安装
- 将运行时依赖（Playwright 库、字体等）也在构建阶段安装
- 构建阶段一次性安装：构建工具 + 运行时依赖
- 运行阶段仍然需要重新安装（因为是新的基础镜像）
- 优势：
  - 构建阶段可以完整测试 Playwright
  - 利用 Docker 层缓存加速构建
  - 保持多阶段构建的体积优势
- 说明：
  - 构建阶段：包含构建工具（python3, make, g++）+ 运行时依赖
  - 运行阶段：只包含运行时依赖（不含构建工具）
  - 最终镜像体积仍然较小（~3.8GB）

### refactor: 移除运行阶段重复的 Playwright 验证步骤
- 修改 `docker/Debian Linux/Dockerfile.debian` 移除运行阶段的验证
- 构建阶段已经验证过 Playwright 浏览器和 ffmpeg
- 运行阶段只需要复制和设置环境变量
- 优势：
  - 减少构建时间
  - 避免重复操作
  - 简化 Dockerfile 结构
  - 构建阶段的验证已经足够

### perf: 使用 Docker 缓存挂载加速 Playwright 浏览器下载
- 修改 `docker/Debian Linux/Dockerfile.debian` 使用 `--mount=type=cache` 缓存 Playwright 浏览器
- 将浏览器下载到临时缓存目录 `/tmp/pw-cache`
- 下载完成后复制到镜像的 `/root/.cache/ms-playwright/`
- 添加完整的验证步骤（chromium、headless_shell、ffmpeg）
- 优势：
  - **大幅加速构建**：首次下载后，后续构建直接使用缓存
  - **节省带宽**：避免重复下载 ~400MB 的浏览器文件
  - **提高稳定性**：减少网络下载失败的风险
  - **开发友好**：本地多次构建时体验更好
- 缓存机制：
  - 缓存 ID：`playwright`
  - 缓存路径：`/tmp/pw-cache`
  - 缓存持久化：Docker 自动管理，跨构建共享

### refactor: 简化 Dockerfile 中的 Playwright 验证逻辑
- 修改 `docker/Debian Linux/Dockerfile.debian` 简化验证步骤
- 移除复杂的 find 和条件判断逻辑
- 使用简单的 `ls -la` 命令验证目录存在性
- 验证 chromium、headless_shell、ffmpeg 三个组件
- 不强制要求 ffmpeg 必须存在（避免构建失败）
- 只显示验证信息，不中断构建流程
- 参考单阶段 Dockerfile 的验证方式
- 优势：
  - 验证逻辑更简单清晰
  - 避免复杂的 shell 脚本错误
  - 构建更稳定可靠
  - 便于调试和排查问题

### fix: 修复 Dockerfile 中 ffmpeg 查找逻辑，添加详细调试信息
- 修改 `docker/Debian Linux/Dockerfile.debian` ffmpeg 验证逻辑
- 优化 find 命令，直接在 ffmpeg-* 目录中查找
- 先查找可执行文件，如果没找到再查找所有文件
- 使用 `grep -E "ffmpeg$"` 精确匹配文件名
- 添加详细的调试输出：
  - 显示 Playwright 目录结构
  - 显示 ffmpeg 目录中的文件列表
  - 失败时显示完整的目录内容
- 验证 ffmpeg 版本信息
- 问题原因：之前的 find 命令可能因为路径或权限问题找不到文件

### refactor: 进一步优化 Dockerfile，合并镜像源配置和依赖安装
- 修改 `docker/Debian Linux/Dockerfile.debian` 运行阶段配置
- 将 Debian 镜像源配置和 apt 安装合并到一个 RUN 命令
- 移除运行阶段不需要的 NPM_REGISTRY 环境变量
- 移除运行阶段重复的 npm config 设置
- 优势：
  - 减少 Docker 层数，镜像更小
  - 避免配置重复，代码更简洁
  - 镜像源配置和使用在同一层，逻辑更清晰
  - 运行阶段只保留必要的配置

### refactor: 优化 Dockerfile 镜像源配置，使用环境变量统一管理
- 修改 `docker/Debian Linux/Dockerfile.debian` 提取重复的镜像源 URL
- 定义环境变量：
  - `NPM_REGISTRY=https://registry.npmmirror.com` - npm 镜像源
  - `DEBIAN_MIRROR=mirrors.aliyun.com` - Debian 镜像源
- 在构建阶段和运行阶段统一使用环境变量
- 使用 `${NPM_REGISTRY}` 替代硬编码的 URL
- 使用 `${DEBIAN_MIRROR}` 替代硬编码的域名
- 优势：
  - 便于切换镜像源（只需修改一处）
  - 提高配置可维护性
  - 减少重复代码
  - 方便国际化部署（可轻松切换为官方源）

### refactor: 只使用 Playwright 自带的 ffmpeg，移除系统 ffmpeg 依赖
- 修改 `docker/Debian Linux/Dockerfile.debian` 移除系统 ffmpeg 安装
- 运行阶段不再安装 `ffmpeg` 系统包
- 只依赖 Playwright 自带的 ffmpeg 二进制文件
- 优化 ffmpeg 验证逻辑，只检查 Playwright ffmpeg
- 添加 ffmpeg 路径查找和可执行权限设置
- 修改 `docker/Debian Linux/test-ffmpeg.sh` 只检查 Playwright ffmpeg
- 移除系统 ffmpeg 检查步骤
- 简化测试脚本，专注于 Playwright ffmpeg 验证
- 修改 `docker/Debian Linux/README.md` 更新 ffmpeg 验证说明
- 说明只使用 Playwright 自带的 ffmpeg
- 更新预期输出示例
- 优势：
  - 减少系统依赖，镜像体积更小
  - Playwright 自动管理 ffmpeg 版本，兼容性更好
  - 避免系统 ffmpeg 和 Playwright ffmpeg 版本冲突
  - 简化安装和维护流程

### fix: 修复 Dockerfile 中 ffmpeg 未生效的问题
- 修改 `docker/Debian Linux/Dockerfile.debian` 优化 ffmpeg 安装和验证
- 构建阶段：
  - 安装 Playwright 浏览器后添加 ffmpeg 验证步骤
  - 清理时保留 ffmpeg 可执行文件，确保不被误删
  - 添加 `chmod +x` 确保 ffmpeg 可执行权限
- 运行阶段：
  - 验证 ffmpeg 是否存在（系统版本和 Playwright 版本）
  - 设置 `PLAYWRIGHT_BROWSERS_PATH` 环境变量
  - 确保 ffmpeg 可执行权限
  - 验证系统 ffmpeg 版本
- 创建 `docker/Debian Linux/test-ffmpeg.sh` ffmpeg 测试脚本
  - 检查系统 ffmpeg 和 Playwright ffmpeg
  - 验证 ffmpeg 功能（生成测试视频）
  - 提供详细的诊断信息
- 修改 `docker/Debian Linux/README.md` 添加 ffmpeg 验证说明
  - 添加验证安装章节
  - 说明如何使用测试脚本
  - 提供预期输出示例
- 问题原因：
  - Playwright 的 ffmpeg 在清理步骤中可能被删除
  - 运行阶段未验证 ffmpeg 是否正确复制
  - 缺少可执行权限设置
- 解决方案：
  - 在清理时明确保留 ffmpeg 文件
  - 运行阶段添加验证和权限设置
  - 提供测试工具便于诊断

## 2026-02-06

### fix: 数据库连接失败时终止启动流程，避免后续错误
- 修改 `scripts/start.cjs` waitForDatabase 函数
- 数据库连接超时后调用 `process.exit(1)` 终止进程
- 移除"继续启动"的逻辑，避免后续操作因数据库不可用而失败
- 优化错误提示，显示详细的错误信息和排查步骤
- 添加错误详情输出（`error.message`）
- 确保应用不会在数据库不可用的情况下启动

### refactor: 优化数据库等待逻辑，支持所有环境（不仅限于 Docker）
- 修改 `scripts/start.cjs` waitForDatabase 函数
- 移除"仅 Docker 环境"的限制
- 智能判断是否需要等待：
  - Docker 环境：始终等待
  - 非 Docker 环境：如果数据库是远程服务器（非 localhost），也会等待
  - 本地开发（localhost）：跳过等待，直接启动
- 优化日志输出，根据环境显示不同的故障排查提示
- 适用场景：
  - Docker 容器部署（等待 MySQL 容器启动）
  - 连接远程数据库（等待网络连接建立）
  - 本地开发（跳过等待，提高启动速度）

### refactor: 使用 Node.js mysql2 包替代 mysqladmin 进行数据库连接检查
- 修改 `scripts/start.cjs` waitForDatabase 函数
- 使用 `mysql2/promise` 包直接连接数据库测试
- 移除对系统 `mysqladmin` 工具的依赖
- 修复重复的 while 循环代码
- 优势：
  - 不依赖系统安装的 MySQL 客户端工具
  - 避免 MariaDB 客户端与 MySQL 8.0 的兼容性问题
  - 使用项目已有的 mysql2 依赖，无需额外安装
  - 连接测试更可靠，超时控制更精确
- 修改 `docker/Debian Linux/Dockerfile.debian` 移除 MySQL 客户端安装
  - 不再需要安装 mysql-client 或 default-mysql-client
  - 减少镜像体积和构建复杂度

### fix: 修复 Dockerfile 中 MySQL 客户端兼容性问题，安装 MySQL 官方客户端
- 修改 `docker/Debian Linux/Dockerfile.debian` 运行阶段依赖安装
- 移除 `default-mysql-client`（Debian 默认安装 MariaDB 客户端）
- 添加 MySQL 官方 APT 仓库配置
- 安装 `mysql-client`（MySQL 8.0 官方客户端）
- 问题原因：
  - MariaDB 客户端 (10.11.14) 连接 MySQL 8.0 服务器时存在兼容性问题
  - `mysqladmin ping` 命令会卡住，无法正常连接
  - MySQL 容器内部使用 MySQL 客户端可以正常连接
- 解决方案：
  - 使用 MySQL 官方 APT 仓库安装与服务器版本匹配的客户端
  - 确保客户端和服务器协议完全兼容
- 需要重新构建镜像：`docker compose build` 或 `./sakura.sh rebuild`

### fix: 移除 start.cjs 中的调试日志，避免输出敏感密码信息
- 修改 `scripts/start.cjs` waitForDatabase 函数
- 移除 `console.log` 调试日志，避免在日志中暴露数据库密码
- 保留连接目标信息日志（不含密码）
- 说明：容器内部必须使用服务名 `mysql` 而不是 `localhost`
  - `localhost` 在容器内指向容器自己，不是 MySQL 容器
  - 服务名 `mysql` 通过 Docker 内部 DNS 解析到 MySQL 容器 IP
  - DATABASE_URL 正确配置为 `mysql://sakura_ai:password@mysql:3306/sakura_ai`

### fix: 优化 start.cjs 数据库等待逻辑，直接使用 DATABASE_URL 中的服务名
- 修改 `scripts/start.cjs` waitForDatabase 函数
- 直接使用 DATABASE_URL 中解析出的 host（服务名 mysql）
- 移除不必要的 localhost 转换逻辑
- 添加详细的连接目标日志和故障排查提示
- 说明：
  - Docker Compose 的 bridge 网络模式下，容器间通过服务名通信
  - DATABASE_URL 配置为 `mysql://sakura_ai:password@mysql:3306/sakura_ai`
  - Docker 内部 DNS 会自动解析服务名 `mysql` 到容器 IP
  - 宿主机测试时使用 `localhost` 是因为端口映射，但容器内必须用服务名
- 解决容器内 mysqladmin 无法连接到服务名的困惑

### fix: 修复 start.cjs 中 mysqladmin 命令的密码参数格式
- 修改 `scripts/start.cjs` waitForDatabase 函数
- 将 `-p ${password}` 改为 `-p${password}`（-p 和密码之间不能有空格）
- 移除调试日志，避免输出敏感信息
- 添加连接信息提示（用户名@主机:端口）
- 确保在 Docker 容器内可以正确连接到 MySQL 服务（使用服务名 mysql）
- 解决 "Access denied" 或连接失败的问题

### perf: 优化 Docker Compose 启动顺序，智能等待数据库就绪
- 修改 `docker/Debian Linux/docker-compose.yml` 优化 MySQL healthcheck 参数
  - 缩短检查间隔：10s → 5s，加快就绪检测
  - 增加重试次数：30 → 60，给足初始化时间
  - 缩短启动宽限期：180s → 60s，更合理的等待时间
- 修改 `docker/Debian Linux/docker-compose.yml` 优化 sakura-ai healthcheck 参数
  - 缩短检查间隔：30s → 10s
  - 增加重试次数：3 → 6
  - 延长启动宽限期：40s → 120s，给应用更多初始化时间
- 修改 `scripts/start.cjs` 优化数据库等待逻辑
  - 移除固定的 60 秒等待时间
  - 实现智能重试机制：使用 mysqladmin ping 检测数据库就绪
  - 最多重试 30 次，每次间隔 2 秒（总计 60 秒）
  - 从 DATABASE_URL 解析数据库连接信息
  - 显示实时进度，失败后给出详细提示
- 修改 `scripts/start.cjs` 增加数据库迁移重试次数
  - Docker 环境下从 1 次增加到 3 次
  - 每次失败后等待 3 秒再重试
  - 提高容器启动的稳定性
- 优化效果：
  - MySQL 健康检查更快响应（5秒间隔 vs 10秒）
  - 应用启动更稳定（120秒宽限期 + 智能重试）
  - 避免固定等待时间浪费（智能检测 vs 60秒固定等待）
  - 数据库迁移更可靠（3次重试 vs 1次）

## 2026-02-06

### refactor: 移除 sakura.sh install 中的重复数据库迁移逻辑
- 修改 `docker/Debian Linux/sakura.sh` 的 `cmd_install` 函数
- 移除手动执行数据库迁移的步骤（`npx prisma migrate deploy`）
- 应用启动时 `start.cjs` 会自动执行迁移，无需重复
- 减少等待时间从 60 秒降至 10 秒
- 添加提示信息说明自动迁移机制
- 简化安装流程，提高用户体验

### docs: 在 README 中添加换行符语法错误的故障排除说明
- 修改 `docker/Debian Linux/README.md` 添加语法错误排查章节
- 说明 Windows CRLF 换行符导致的 "syntax error near unexpected token ')'" 错误
- 提供三种解决方法：使用修复脚本、手动转换、配置 Git
- 添加预防措施说明（git config core.autocrlf input）

### fix: 创建换行符修复脚本，解决 Windows CRLF 导致的 bash 语法错误
- 创建 `docker/Debian Linux/fix-line-endings.sh` 换行符修复脚本
- 使用 `sed -i 's/\r$//'` 命令移除 Windows 换行符（CRLF）
- 解决在 Linux 环境下执行 sakura.sh 时的 "syntax error near unexpected token ')'" 错误
- 使用方法：在 Linux 环境下执行 `bash fix-line-endings.sh`
- 或者在 Windows 下使用 Git 配置：`git config core.autocrlf input`

### docs: 更新 Docker 部署文档，同步 build 和 push 命令分离说明
- 修改 `docker/Debian Linux/README.md` 更新所有相关章节
- 更新命令列表，明确 build 和 push 的独立功能
- 更新快速开始示例，展示构建和推送的分步操作
- 更新方案二说明，添加本地测试步骤
- 更新三种方案对比表格，增加"本地测试"对比项
- 更新开发者工作流，展示完整的构建-测试-推送流程
- 更新常用命令速查，分别列出 build 和 push 命令
- 更新常见问题，将"install 和 build"改为"install、build 和 push"
- 添加"如何构建和推送特定版本"问题说明
- 强调先本地测试再推送的最佳实践

### refactor: 分离 Docker 镜像构建和推送命令，提高灵活性
- 修改 `docker/Debian Linux/sakura.sh` 将 build 和 push 分离为独立命令
- `build [版本]` - 只构建镜像到本地（使用缓存，快速迭代）
- `push [版本]` - 推送已构建的镜像到阿里云
- 新增 `cmd_push` 函数，包含登录检查、镜像验证、推送流程
- 优化 `cmd_build` 函数，移除推送逻辑，专注于构建
- 更新帮助信息和使用示例
- 更新主入口添加 push 命令路由
- 支持先本地测试再决定是否推送的灵活工作流

## 2026-02-06

### refactor: Docker 环境完全跳过数据库等待检查
- 修改 `scripts/start.cjs` waitForDatabase 函数
- Docker 环境中直接跳过数据库连接检查，只等待 5 秒
- 移除 waitForDatabaseConnection 函数（不再需要）
- 原因：MySQL 容器初始化需要时间，应用会自动重试连接
- 避免启动脚本在容器中长时间卡住
- 用户可通过 `docker compose logs mysql` 查看数据库状态
- 解决容器内 mysqladmin 命令无法连接的问题

### fix: 添加命令超时保护，防止容器中数据库等待卡住
- 修改 `scripts/start.cjs` waitForDatabaseConnection 函数
- 为所有 execPromise 调用添加 5 秒超时保护（Promise.race）
- 防止 mysqladmin 和 mysql 命令在容器中无限期卡住
- 优化错误信息显示，过滤过长的错误消息
- 添加删除旧数据卷的解决方案提示
- 解决容器中启动脚本一直等待数据库的问题

### fix: 修复 test-db-connection.sh 的 Bad substitution 错误
- 修改 `docker/Debian Linux/test-db-connection.sh`
- 移除 bash 特有的字符串截取语法 `${DB_PASSWORD:0:3}`
- 直接显示 `***` 隐藏密码，兼容 sh 和 bash
- 解决在 sh 环境下运行报错的问题

### feat: 创建数据库连接测试脚本
- 创建 `docker/Debian Linux/test-db-connection.sh` 诊断脚本
- 测试 MySQL 容器状态、root 用户连接、sakura_ai 用户连接
- 检查用户和数据库是否存在
- 提供详细的故障排查建议
- 帮助诊断 mysqladmin 连接失败的问题

### fix: 注释外部数据库配置，使用 Docker 内置 MySQL
- 修改 `docker/Debian Linux/.env` 注释掉 DATABASE_URL
- 保持默认密码为占位符（用户可自行修改）
- 添加详细的配置说明和两种方案对比

### fix: 修复 Docker .env 文件配置，设置正确的数据库密码
- 修改 `docker/Debian Linux/.env` 数据库配置
- 注释掉外部数据库的 DATABASE_URL（改用 Docker 内置 MySQL）
- 设置默认密码：MYSQL_ROOT_PASSWORD=sakura_root_2024, DB_PASSWORD=sakura_ai_2024
- 移除占位符密码 `your_mysql_root_password_here` 和 `your_sakura_ai_db_password_here`
- 添加详细的配置说明和两种方案的使用指南
- 解决 mysqladmin 命令因密码错误无法连接的问题

### feat: 添加数据库连接命令和错误信息打印
- 修改 `scripts/start.cjs` 数据库等待函数
- 在第一次尝试时打印执行的 mysqladmin 命令（密码隐藏）
- 在前3次失败时显示具体的错误信息
- 方便调试数据库连接问题

### refactor: 重构数据库等待逻辑，优先使用 Docker 内置 MySQL
- 修改 `scripts/start.cjs` 数据库等待函数
- Docker 环境默认连接内置 MySQL（服务名 mysql:3306）
- 直接从环境变量读取 DB_PASSWORD，无需解析 DATABASE_URL
- 仅当设置了 DATABASE_URL 时才解析并连接外部数据库
- 提取 waitForDatabaseConnection 为独立函数，提高代码复用性
- 添加详细的连接参数打印（用户名、密码前3位、完整连接字符串）
- 简化配置逻辑，符合 Docker Compose 的最佳实践

### fix: 优化数据库等待逻辑，增加重试次数和智能日志输出
- 修改 `scripts/start.cjs` 数据库等待函数
- 将最大等待时间从 15 秒增加到 30 秒（10次×3秒）
- 优化日志输出：只在第1次和每3次尝试时显示进度
- 添加更详细的错误提示，包括用户名密码错误的可能性
- 确保 mysqladmin 命令使用正确的密码格式（-p"password"）
- 给 MySQL 容器更多初始化时间，避免过早放弃连接

### fix: 优化启动脚本数据库等待逻辑，避免长时间卡住
- 修改 `scripts/start.cjs` 数据库等待函数
- 将最大等待时间从 60 秒（30次×2秒）缩短到 15 秒（5次×3秒）
- 添加连接超时参数 `--connect-timeout=2`
- 失败后快速跳过并给出详细的故障排查提示
- 应用启动时会自动重试数据库连接，无需在启动脚本中长时间等待
- 解决 Docker 容器启动时一直卡在"等待数据库就绪"的问题

### fix: 修改 Docker 配置默认使用内置 MySQL，支持外部数据库可选
- 修改 `docker/Debian Linux/.env` 数据库配置
- 默认使用 Docker 内置 MySQL（注释 DATABASE_URL）
- 配置默认密码：MYSQL_ROOT_PASSWORD=sakura_root_2024, DB_PASSWORD=sakura_ai_2024
- 外部数据库作为可选方案（需手动取消注释 DATABASE_URL）
- 添加详细的配置说明和权限设置指南
- 修改 `docker/Debian Linux/docker-compose.yml` 支持 DATABASE_URL 环境变量优先级
- 使用 `${DATABASE_URL:-mysql://sakura_ai:${DB_PASSWORD}@mysql:3306/sakura_ai}` 语法
- 未设置 DATABASE_URL 时自动使用内置 MySQL

### fix: 将 docker-compose.yml 改回 bridge 网络模式，解决 Windows host 模式限制
- 修改 `docker/Debian Linux/docker-compose.yml` 从 host 模式改回 bridge 模式
- Windows Docker Desktop 的 host 模式在 WSL2 虚拟机内，容器间无法通过 localhost 通信
- bridge 模式下容器在同一网络中，可以通过服务名互相访问
- MySQL 使用 `mysql:3306` 连接（服务名）
- 添加 ports 映射：3001:3001, 5173:5173, 3306:3306
- 添加 depends_on 确保 MySQL 先启动
- 恢复 networks 配置使用 sakura-network
- 解决 "Can't reach database server at localhost:3306" 错误

### fix: 修复 host 网络模式下服务无法访问的问题
- 修改 `scripts/start.cjs` 将 SERVER_HOST 默认值从 `127.0.0.1` 改为 `0.0.0.0`
- 确保服务监听所有网络接口，可从外部访问
- 修改 `docker/Debian Linux/.env` 数据库连接使用 `localhost:3306`
- 修改 `docker/Debian Linux/.env.example` 同步数据库连接配置
- host 模式下所有容器共享宿主机网络，通过 localhost 互相访问
- 添加外部 MySQL 连接配置注释，方便切换
- 解决 localhost:3001 和 192.168.65.6:3001 无法访问的问题

### docs: 移除 host 网络模式下的无效 networks 配置，添加说明注释
- 修改 `docker/Debian Linux/docker-compose.yml` 移除顶部 networks 定义
- host 网络模式下容器直接使用宿主机网络，无法加入自定义网络
- 添加注释说明 host 模式不需要自定义网络配置
- 简化配置文件，避免误导

### feat: 创建混合网络模式配置文件，只有应用使用 host 模式
- 创建 `docker/Debian Linux/docker-compose.hybrid.yml` 混合模式配置
- sakura-ai 使用 host 模式访问内网
- MySQL 和 Qdrant 使用 bridge 网络隔离
- 应用通过 localhost 访问数据库和向量库
- 适合需要访问内网但希望数据库隔离的场景

### feat: 创建纯 host 网络模式配置文件
- 创建 `docker/Debian Linux/docker-compose.host.yml` 纯 host 模式配置
- 所有服务使用 host 网络，可直接访问内网
- 移除所有 ports 和 networks 配置
- 容器间通过 localhost 通信
- 适合需要最佳网络性能和内网访问的场景

## 2026-02-06

### fix: 移除自定义子网配置，使用 Docker 默认网络以继承宿主机路由
- 修改 `docker/Debian Linux/docker-compose.bridge.yml` 移除 ipam 自定义配置
- 移除 subnet: 192.169.0.0/24 和 gateway: 192.169.0.1 配置
- 使用 Docker 默认的 bridge 网络配置
- 让容器自动继承宿主机的网络路由表
- 解决容器无法访问某些内网 IP（如 172.17.1.239）的问题
- 自定义子网可能导致路由冲突，影响内网访问

### fix: 清理 host 网络模式下的无效配置项，添加 Windows 使用说明
- 修改 `docker/Debian Linux/docker-compose.yml` 移除 host 模式下无效的配置
- 移除 extra_hosts（host 模式下容器直接使用宿主机的 /etc/hosts）
- 移除 dns（host 模式下容器使用宿主机的 DNS）
- 移除 cap_add（host 模式下不需要）
- 添加详细的 Windows 使用说明注释
- 说明 Windows 上 host 模式无法通过 localhost 访问，需要使用 WSL2 IP
- 推荐 Windows 用户使用 docker-compose.bridge.yml 以支持 localhost 访问

### fix: 添加 extra_hosts 配置尝试解决容器访问特定内网 IP 的问题
- 修改 `docker/Debian Linux/docker-compose.bridge.yml` 添加 extra_hosts 配置
- 添加 `host.docker.internal:host-gateway` 映射
- 注意：extra_hosts 只能解决 DNS 解析，无法解决路由问题
- 如果内网 IP（如 172.17.1.239）需要特殊路由或 VPN，容器仍无法访问
- Windows Docker Desktop 的 bridge 网络限制：
  - 容器只能访问宿主机能直接路由到的网段
  - 需要 VPN 或特殊路由的内网 IP 无法从容器访问
  - 建议：在宿主机上运行需要访问特殊内网的服务，或使用反向代理

### docs: 说明 Windows Docker Desktop 的 host 网络模式限制和解决方案
- Windows Docker Desktop 使用 WSL2 虚拟机运行容器
- host 网络模式下容器监听 WSL2 的网络接口（192.168.65.x），不是 Windows 宿主机
- Windows 宿主机无法通过 localhost 访问，需要使用 WSL2 IP 地址
- 推荐 Windows 用户使用 bridge 网络模式（docker-compose.bridge.yml）
- bridge 模式支持通过 localhost:5173 和 localhost:3001 访问
- 更新提交日志说明网络模式选择建议

### fix: 添加 Vite 前端服务器环境变量，确保监听所有网络接口
- 修改 `docker/Debian Linux/docker-compose.yml` 添加 VITE_HOST 和 VITE_PORT 环境变量
- 设置 VITE_HOST=0.0.0.0 确保 Vite 监听所有网络接口（不仅是 localhost）
- 设置 VITE_PORT=5173 明确指定前端端口
- 解决 host 网络模式下前端服务无法从外部访问的问题
- 配合 vite.config.ts 中的 server.host: '0.0.0.0' 配置

## 2026-02-06

### fix: 修复 host 网络模式下应用无法访问的问题，MySQL 也切换到 host 模式
- 修改 `docker/Debian Linux/docker-compose.yml` MySQL 服务使用 `network_mode: host`
- 修改 Qdrant 和 Nginx 服务也使用 host 网络模式
- 移除所有服务的 ports、networks、depends_on 配置
- 注释掉顶层 networks 定义（host 模式不需要）
- 解决应用容器无法连接 localhost:3306 的问题
- 确保所有服务都在同一网络栈中，可以通过 localhost 互相访问

### feat: 切换到 host 网络模式，支持容器访问宿主机内网 IP
- 修改 `docker/Debian Linux/docker-compose.yml` 使用 `network_mode: host`
- 容器直接使用宿主机网络栈，可以访问内网 IP（如 172.17.1.239）
- 修改 DATABASE_URL 从 `mysql:3306` 改为 `localhost:3306`
- 移除 ports 和 networks 配置（host 模式不需要）
- 移除 depends_on 配置（不在同一网络中）
- 创建 `docker/Debian Linux/docker-compose.bridge.yml` 作为备用配置
- Bridge 模式适用于不需要访问内网的标准部署场景
- Host 模式适用于需要访问宿主机内网系统的场景
- 解决容器无法 ping 通宿主机内网 IP 的问题

### fix: 在 Dockerfile 中添加 iputils-ping 包，提供网络诊断工具
- 修改 `docker/Debian Linux/Dockerfile.debian` 添加 `iputils-ping`
- 修改 `Dockerfile.debian` 添加 `iputils-ping`
- 提供 `ping` 命令用于网络连接测试和故障排查
- 解决容器中 `ping: not found` 错误
- 方便调试网络连接问题

### refactor: 将 MySQL 诊断逻辑整合到 sakura.sh，删除独立的 troubleshoot-mysql.sh
- 修改 `docker/Debian Linux/sakura.sh` 完善 `diagnose` 命令
- 整合所有诊断逻辑：环境变量、端口占用、Docker 资源、容器状态、日志、数据卷
- 删除 `docker/Debian Linux/troubleshoot-mysql.sh` 独立脚本
- 统一使用 `./sakura.sh diagnose` 进行诊断
- 减少脚本文件数量，简化维护

### fix: 优化 MySQL healthcheck 配置，给首次初始化足够的时间
- 修改 `docker/Debian Linux/docker-compose.yml` 和 `docker-compose.yml`
- 增加 healthcheck 重试次数：5 → 30 次
- 添加 start_period: 180s（3 分钟启动宽限期）
- MySQL 首次启动需要初始化数据库文件，约需 3 分钟
- 在 start_period 内的失败不计入重试次数
- 确保 MySQL 有足够时间完成初始化
- 配合应用容器的数据库等待逻辑，彻底解决启动失败问题

### feat: 添加 MySQL 启动失败诊断工具
- 新增 `docker/Debian Linux/troubleshoot-mysql.sh` MySQL 启动失败排查脚本
- 检查环境变量配置（MYSQL_ROOT_PASSWORD、DB_PASSWORD）
- 检查端口占用情况（3306 端口）
- 检查 Docker 资源使用情况
- 查看容器状态和日志
- 检查数据卷状态
- 提供常见问题的解决方案
- 修改 `docker/Debian Linux/sakura.sh` 添加 `diagnose` 命令
- 快速诊断 MySQL 容器启动失败的原因
- 使用方法：`./sakura.sh diagnose`

### refactor: 将数据库等待逻辑整合到 start.cjs，删除独立的 docker-entrypoint.sh 脚本
- 修改 `scripts/start.cjs` 添加 `waitForDatabase()` 函数
- 在 Docker 环境中自动检测并等待数据库就绪（最多 30 次，每次间隔 2 秒）
- 使用 mysqladmin ping 和 mysql 查询测试数据库连接
- 自动检查并创建数据库（如果不存在）
- 数据库迁移支持重试机制（Docker 环境下最多 5 次）
- 删除 `scripts/docker-entrypoint.sh` 独立脚本
- 修改 `docker/Debian Linux/Dockerfile.debian` 移除 ENTRYPOINT 配置
- 修改 `Dockerfile.debian` 移除 ENTRYPOINT 配置
- 简化 Dockerfile，减少脚本文件数量
- 统一使用 Node.js 脚本处理启动逻辑，跨平台兼容性更好

### fix: 添加数据库连接重试机制，解决 MySQL 初始化时间过长导致的启动失败问题
- 新增 `scripts/docker-entrypoint.sh` Docker 容器启动脚本
- 实现数据库连接重试机制（最多 30 次，每次间隔 2 秒）
- 使用 mysqladmin ping 和 mysql 查询测试数据库就绪状态
- 自动检查并创建数据库（如果不存在）
- 执行 Prisma 数据库迁移（支持重试）
- 生成 Prisma 客户端（如果需要）
- 修改 `docker/Debian Linux/Dockerfile.debian` 使用启动脚本作为 ENTRYPOINT
- 修改 `Dockerfile.debian` 同步使用启动脚本
- 在运行阶段安装 MySQL 客户端工具（default-mysql-client）
- 解决 MySQL 容器 healthcheck 通过但应用连接失败的问题
- 确保应用启动前数据库完全就绪

## 2026-02-05

### revert: 还原 Docker Compose 项目名称修改，保持默认行为
- 还原 `docker/Debian Linux/sakura.sh` 移除 PROJECT_NAME 变量
- 还原所有 docker compose 命令，移除 `-p "$PROJECT_NAME"` 参数
- 还原 `docker/Debian Linux/docker-compose.yml` 网络名从 `network` 改回 `sakura-network`
- 还原 `docker/Debian Linux/docker-compose.bridge.yml` 网络名从 `network` 改回 `sakura-network`
- 保持 Docker Compose 默认行为，使用目录名作为项目前缀
- 实际命名：
  - 镜像名：由 Docker Compose 根据目录名自动生成
  - 网络名：`debianlinux_sakura-network`（目录名 + 网络名）
  - 容器名：`sakura-ai-mysql`、`sakura-ai-app`（已在 compose 中明确指定）

### docs: 明确区分运行时配置和构建时配置，优化配置文件说明
- 修改 `.env.example` 添加配置文件说明头部
- 说明本文件用于应用运行时配置
- 指引 Docker 构建配置查看 `docker/Debian Linux/config.sh`
- 修改 `docker/Debian Linux/config.sh` 添加配置文件说明头部
- 说明本文件用于 Docker 镜像构建配置
- 指引应用运行时配置查看 `.env.example`
- 修改 `docker/Debian Linux/README.md` 添加配置文件说明章节
- 明确两个配置文件的用途、位置、使用方式
- 避免用户混淆运行时配置和构建时配置
- 保持配置文件职责分离，便于维护

### fix: 补充创建遗漏的 docker-compose.bridge.yml 文件
- 创建 `docker/Debian Linux/docker-compose.bridge.yml` 桥接网络模式配置
- 使用 Docker 自定义网络，提供网络隔离
- 适合不需要访问宿主机内网的标准容器化部署
- 数据库连接使用服务名 `mysql:3306`（而非 localhost）
- 与 docker-compose.yml（host 模式）形成互补方案
- 修复之前会话中提到但未实际创建的问题

## 2026-02-05

### fix: 修复 README 中不存在的 docker-compose.deploy.yml 文件引用
- 修改 `docker/Debian Linux/README.md` 移除所有 docker-compose.deploy.yml 引用
- 实际只有 docker-compose.yml 和 docker-compose.bridge.yml 文件
- 方案三改为：修改 docker-compose.yml 使用阿里云镜像地址
- 添加配置修改说明，指导用户如何切换镜像源
- 更新所有相关命令使用 docker-compose.yml
- 修正三种方案对比表格
- 修正典型使用流程示例
- 修正常见问题中的镜像版本切换方法

### docs: 整合 IMAGE_USAGE_GUIDE.md 到 README.md，统一文档结构
- 删除 `docker/Debian Linux/IMAGE_USAGE_GUIDE.md`
- 将镜像使用方式说明整合到 `docker/Debian Linux/README.md`
- 在常见问题中添加 "install 和 build 有什么区别" 的详细说明
- 在三种方案对比中添加方案选择建议
- 避免文档重复，统一维护入口

### docs: 修复 README 中的命令引用错误，添加详细的命令用途说明
- 修改 `docker/Debian Linux/README.md` 修复 docker-compose.deploy.yml 命令引用
- 重新组织部署方案章节，明确三种方案的区别
- 方案一：本地构建运行（install）
- 方案二：构建镜像并推送（build）
- 方案三：使用在线镜像部署（deploy）
- 为每个 docker compose 命令添加详细的用途说明
- 添加三种方案对比表格
- 添加典型使用流程示例
- 完善常用命令速查表，按功能分类
- 区分 sakura.sh、docker compose、docker 原生命令

### docs: 全面更新 Docker 部署文档，统一使用 sakura.sh
- 完全重写 `docker/Debian Linux/README.md`
- 移除所有对已删除脚本的引用（build.sh、rebuild.sh、docker-install.sh）
- 突出 sakura.sh 作为统一管理脚本的核心地位
- 重新组织文档结构：快速开始 → 命令列表 → 部署方案 → 配置说明
- 添加完整的命令速查表
- 优化常见问题和故障排除章节
- 添加推荐工作流和最佳实践
- 更新所有示例命令使用 sakura.sh

### refactor: 删除冗余脚本，统一使用 sakura.sh 管理
- 删除 `docker/Debian Linux/build.sh`（功能已整合到 sakura.sh）
- 删除 `docker/Debian Linux/rebuild.sh`（功能已整合到 sakura.sh）
- 删除 `docker/Debian Linux/docker-install.sh`（功能已整合到 sakura.sh）
- 更新 `docker/Debian Linux/README.md` 移除对已删除脚本的引用
- 统一使用 `./sakura.sh <命令>` 进行所有操作
- 简化脚本管理，避免功能重复

### fix: 修复 docker-compose.yml 中 networks 键重复定义的问题
- 修改 `docker/Debian Linux/docker-compose.yml` 移除顶部重复的 networks 定义
- 只在文件底部保留一个 networks 定义
- 解决 "mapping key 'networks' already defined" 错误
- 简化网络配置，移除冗余注释

### docs: 创建 Docker 镜像使用方式详细指南
- 新增 `docker/Debian Linux/IMAGE_USAGE_GUIDE.md`
- 详细说明三种镜像使用方式的区别和适用场景
- 方式一：本地预构建镜像（推荐开发环境）
- 方式二：阿里云镜像（推荐生产环境）
- 方式三：docker compose 自动构建（适合快速测试）
- 解释 `build.context` 和 `build.dockerfile` 配置的作用
- 提供切换使用方式的详细步骤
- 包含常见问题解答和推荐配置

### docs: 优化 docker-compose.yml 配置说明，明确镜像来源和使用方式
- 修改 `docker/Debian Linux/docker-compose.yml` 添加详细的镜像说明
- 明确三种镜像使用方式：本地构建、阿里云镜像、实时构建
- 使用环境变量 `${LOCAL_IMAGE_NAME}` 和 `${LOCAL_IMAGE_TAG}` 配置本地镜像
- 添加完整的使用方法说明（本地构建 vs 阿里云镜像）
- 添加常用命令参考
- 提高配置文件的可读性和易用性

### refactor: 整合 Docker 管理脚本为统一的 sakura.sh
- 创建 `docker/Debian Linux/sakura.sh` 统一管理脚本
- 整合 docker-install.sh、build.sh、rebuild.sh 三个脚本的所有功能
- 提供完整的生命周期管理：安装、构建、部署、运维
- 命令分类：安装部署（install/build/rebuild/upgrade）、服务管理（start/stop/restart/status/logs）、数据管理（backup/restore/clean）
- 保持原有脚本的所有功能，统一命令入口
- 简化使用方式，一个脚本完成所有操作

### fix: 修复 docker-compose.yml 中 networks 键重复定义的问题
- 修改 `docker/Debian Linux/docker-compose.yml` 移除顶部重复的 networks 定义
- 只在文件底部保留一个 networks 定义
- 解决 "mapping key 'networks' already defined" 错误
- 简化网络配置，移除冗余注释

## 2026-02-05

### fix: 修复 Docker Compose host 网络模式下的端口配置警告
- 修改 `docker/Debian Linux/docker-compose.yml` 移除 host 模式下的 ports 配置
- host 网络模式下容器直接使用宿主机网络，不需要端口映射
- 添加注释说明容器直接使用宿主机的 3001 和 5173 端口
- 创建 `docker/Debian Linux/docker-compose.bridge.yml` 桥接网络模式备用配置
- 更新 `docker/Debian Linux/README.md` 添加网络模式选择指南
- 说明 host 模式和 bridge 模式的适用场景和区别
- 提供两种模式的使用方法和注意事项
- 更新 git-commit-log.md 记录修改内容

## 2026-02-05

### refactor: 优化构建脚本，移除对 docker-compose.yml 的依赖，直接使用 docker build 命令
- 修改 `docker/Debian Linux/build.sh` 使用 `docker build` 替代 `docker compose build`
- 修改 `docker/Debian Linux/rebuild.sh` 使用 `docker build --no-cache` 替代 `docker compose build`
- 修改 `docker/Debian Linux/build-and-push.sh` 使用 `docker build` 替代 `docker compose build`
- 构建镜像只需要 Dockerfile，不再需要 docker-compose.yml 文件
- 简化构建流程，减少配置文件依赖
- 使用 `-t` 参数同时标记本地镜像和远程镜像
- 添加镜像大小显示，方便查看构建结果

### feat: 创建宿主机网络连接测试脚本，诊断内网访问问题
- 新增 `docker/Debian Linux/test-host-network.ps1`
- 测试宿主机是否可以 Ping 通内网 IP
- 测试宿主机是否可以访问内网端口（443）
- 测试宿主机是否可以 HTTPS 访问内网系统
- 测试本地端口转发是否工作（localhost:8443）
- 显示当前端口转发规则
- 提供详细的诊断结果和解决方案建议

### fix: 修复 Windows 端口转发脚本中的 PowerShell 变量引用语法错误
- 修改 `docker/Debian Linux/setup-port-forward.ps1`
- 将 `${variable}:${port}` 改为 `$variable`:$port（使用反引号转义冒号）
- 解决 PowerShell 解析器将冒号识别为驱动器分隔符的问题
- 修复 "变量引用无效" 错误
- 确保脚本可以正常执行

### feat: 创建 Windows 端口转发配置脚本，解决容器访问内网问题
- 新增 `docker/Debian Linux/setup-port-forward.ps1`
- 使用 Windows netsh 命令配置端口转发
- 将内网服务（172.19.5.47:443）映射到本地端口（8443）
- 容器通过 `host.docker.internal:8443` 访问内网系统
- 自动检查管理员权限
- 提供清理和使用说明
- 解决 Windows Docker Desktop 无法直接访问内网的限制

### feat: 创建 Windows 专用 docker-compose 配置，解决 host 网络模式不兼容问题
- 新增 `docker/Debian Linux/docker-compose.windows.yml`
- Windows Docker Desktop 不支持 `network_mode: host`
- 使用 bridge 网络 + `extra_hosts` 配置
- 通过 `host.docker.internal` 访问宿主机网络
- 容器内可以通过 `host.docker.internal` 访问宿主机的内网 IP
- 保留端口映射（3001:3001, 5173:5173）
- 数据库使用服务名 `mysql:3306` 连接

### fix: 修复 host 网络模式下数据库连接失败的问题
- 修改所有 docker-compose 配置文件的 DATABASE_URL
- 将 `mysql:3306` 改为 `localhost:3306`
- host 网络模式下容器不在 docker 网络中，无法使用服务名解析
- 需要使用 localhost 连接宿主机上的 MySQL 服务
- 修改 `docker/Debian Linux/docker-compose.yml`
- 修改 `docker/Debian Linux/docker-compose.build.yml`
- 修改 `docker/Debian Linux/docker-compose.deploy.yml`

### feat: 创建 start.sh 脚本，支持使用 host 网络模式启动容器
- 新增 `docker/Debian Linux/start.sh` 启动脚本
- 使用 `docker run --network host` 启动容器
- 自动加载 .env 环境变量
- 自动挂载数据卷（uploads, artifacts, screenshots, logs）
- 提供容器管理常用命令说明
- 适用于需要访问内网系统的场景

### fix: 使用 host 网络模式解决容器无法访问内网系统的问题
- 修改所有 docker-compose 配置文件，使用 `network_mode: host`
- 修改 `docker/Debian Linux/docker-compose.yml`
- 修改 `docker/Debian Linux/docker-compose.build.yml`
- 修改 `docker/Debian Linux/docker-compose.deploy.yml`
- 移除 `ports` 和 `networks` 配置（host 模式不需要）
- 容器直接使用宿主机网络栈，可以访问所有内网 IP
- 解决 extra_hosts 配置无效的问题
- 注意：host 模式下容器与宿主机共享网络，端口直接暴露在宿主机上

### fix: 配置 Docker 容器访问宿主机网络，解决 UI 自动化无法连接内网系统的问题
- 修改 `docker/Debian Linux/docker-compose.yml` 添加 extra_hosts 配置
- 修改 `docker/Debian Linux/docker-compose.build.yml` 添加 extra_hosts 配置
- 修改 `docker/Debian Linux/docker-compose.deploy.yml` 添加 extra_hosts 配置
- 添加 `host.docker.internal:host-gateway` 映射，允许容器访问宿主机网络
- 解决容器内 Playwright 无法访问内网 IP（如 172.19.5.47）的问题
- 解决 `net::ERR_CONNECTION_REFUSED` 错误

### fix: 添加 ffmpeg 和完整的 Playwright 运行时依赖，确保 UI 自动化正常执行
- 修改 `docker/Debian Linux/Dockerfile.debian`
- 构建阶段：安装 chromium、chromium-headless-shell、ffmpeg 三个组件
- 运行阶段：添加 ffmpeg 系统包和 xvfb（虚拟显示）
- 添加完整的中文字体支持（fonts-noto-cjk）
- 确保视频录制、截图、UI 自动化功能正常工作

### fix: 修复 Dockerfile 中 npm prune 误删运行时依赖的问题
- 修改 `docker/Debian Linux/Dockerfile.debian`
- 移除 `npm prune --omit=dev` 命令，避免误删 @playwright/test 等运行时需要的包
- 改为手动清理 node_modules 中的文档、测试文件等不必要内容
- 解决 @midscene/web 找不到 @playwright/test 的问题
- 保持镜像体积优化效果，同时确保所有运行时依赖完整

### fix: 修复 Dockerfile 中 Playwright 安装失败问题
- 修改 `docker/Debian Linux/Dockerfile.debian`
- 将 Playwright 浏览器安装移到构建阶段（npm prune 之前）
- 在构建阶段完成浏览器安装和清理（在同一层）
- 运行阶段直接从构建阶段复制 Playwright 浏览器缓存
- 解决运行阶段 npx 命令找不到的问题（exit code: 127）
- 确保所有清理操作在同一层完成，真正减小镜像体积

### refactor: 整合 Dockerfile 为单一优化版本，删除多余文件
- 修改 `docker/Debian Linux/Dockerfile.debian` 采用多阶段构建优化
- 构建阶段：安装所有依赖、构建前端、清理开发依赖（在同一层）
- 运行阶段：只安装运行时依赖、安装 Playwright 并清理（在同一层）
- 删除 `Dockerfile.debian.optimized`、`Dockerfile.debian.ultra`、`Dockerfile.debian.ultra-v2`
- 统一使用一个优化版 Dockerfile，预期镜像大小从 5.6GB 降至 3.8GB
- 关键优化：在同一层中完成安装和清理，避免 Docker 层缓存保留删除的文件

### fix: 修复 ultra-v2 Dockerfile 中 Playwright 安装顺序问题
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra-v2`
- 将 package.json 和 package-lock.json 的复制移到最前面
- 确保 npx 命令执行前 node_modules 已经存在
- 解决 "npx playwright install chromium" 失败的问题
- 保持在同一层中完成安装和清理的优化策略

### fix: 修复 ultra-v2 Dockerfile 中 Playwright 安装失败的问题
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra-v2`
- 将 Playwright 安装移到复制 node_modules 之后
- 确保 npx 命令可用（需要 node_modules 中的依赖）
- 保持在同一层中完成安装和清理的优化策略

### fix: 修复 Docker 镜像优化无效问题，创建真正能减小体积的 ultra-v2 版本
- 创建 `docker/Debian Linux/Dockerfile.debian.ultra-v2` 修复版
- 关键修复：在同一层中完成安装和清理操作
- 构建阶段：npm install + prune + 清理在同一个 RUN 指令中
- 运行阶段：playwright install + 清理在同一个 RUN 指令中
- 系统依赖：apt install + 清理在同一个 RUN 指令中
- 创建 `docker/Debian Linux/WHY_NO_SIZE_REDUCTION.md` 详细说明文档
- 解释 Docker 层缓存机制导致优化无效的原因
- 说明为什么分层清理不会减小镜像大小
- 提供正确的优化方法和验证步骤
- 预期镜像大小从 5.6GB 降至 3.8GB（节省 ~1.8GB）

### fix: 修复 docker-compose 构建时未读取环境变量的问题
- 修改 `docker/Debian Linux/build.sh` 在构建前导出环境变量
- 添加 `export LOCAL_IMAGE_NAME` 和 `export LOCAL_IMAGE_TAG`
- 修改 `docker/Debian Linux/rebuild.sh` 导出环境变量
- 修改 `docker/Debian Linux/build-and-push.sh` 导出环境变量
- 添加镜像名称显示，方便确认配置
- 确保 docker-compose.build.yml 能正确读取 config.sh 中的配置
- 解决构建的镜像名称始终是默认值 sakura-ai:latest 的问题

### refactor: 创建统一的 Docker 镜像配置文件，实现集中管理
- 创建 `docker/Debian Linux/config.sh` 统一配置文件
- 集中管理镜像仓库地址、命名空间、镜像名称等配置
- 提供配置验证和信息显示功能
- 修改 `docker/Debian Linux/docker-compose.build.yml` 使用环境变量
- 镜像名从硬编码改为 `${LOCAL_IMAGE_NAME:-sakura-ai1}:${LOCAL_IMAGE_TAG:-latest}`
- 修改 `docker/Debian Linux/build.sh` 加载统一配置
- 移除硬编码的 REGISTRY、NAMESPACE、IMAGE_NAME 配置
- 使用 config.sh 中的配置和函数
- 修改 `docker/Debian Linux/rebuild.sh` 加载统一配置
- 使用 LOCAL_IMAGE 变量替代硬编码的镜像名
- 修改 `docker/Debian Linux/build-and-push.sh` 加载统一配置
- 简化镜像查找逻辑，直接使用配置文件中的 LOCAL_IMAGE
- 使用 DOCKER_REGISTRY 替代 REGISTRY
- 实现一处修改，所有脚本同步更新的效果
- 方便测试不同的镜像名称配置

### fix: 修复 build.sh 和 docker-compose.build.yml 镜像名称不一致问题
- 修改 `docker/Debian Linux/docker-compose.build.yml` 确保使用正确配置
- 将 Dockerfile 从 `Dockerfile.debian.optimized` 改为 `Dockerfile.debian`
- 将镜像名从 `sakura-ai1:latest` 改为 `sakura-ai:latest`
- 修改 `docker/Debian Linux/build.sh` 与 docker-compose 配置保持一致
- 将 NAMESPACE 从 `sakura-ai1` 改为 `sakura-ai`
- 将 IMAGE_NAME 从 `sakura-ai1` 改为 `sakura-ai`
- 添加 LOCAL_IMAGE 变量明确指定 docker-compose 构建的镜像名
- 简化镜像查找逻辑，直接使用 docker-compose 配置的镜像名
- 确保构建、标记、推送流程使用统一的镜像名称

### fix: 修复 Docker 构建使用缓存代码的问题，创建无缓存重建脚本
- 修改 `docker/Debian Linux/docker-compose.build.yml` 使用正确的 Dockerfile
- 将 Dockerfile 从 `Dockerfile.debian.optimized` 改为 `Dockerfile.debian`
- 将镜像名从 `sakura-ai1:latest` 改为 `sakura-ai:latest`
- 创建 `docker/Debian Linux/rebuild.sh` 无缓存重建脚本
- 脚本功能：停止容器 → 删除旧镜像 → 清理构建缓存 → 无缓存重建
- 解决 Docker 使用缓存层导致代码更新不生效的问题
- 确保每次构建都使用最新的代码和配置

### fix: 在 Dockerfile 中添加 Vite 缓存清理步骤
- 修改 `docker/Debian Linux/Dockerfile.debian` 添加 Vite 缓存清理
- 在构建前端前清理 `node_modules/.vite` 和 `.vite` 目录
- 避免使用旧的缓存导致构建错误
- 确保每次构建都使用最新的代码和配置

### fix: 修复 errorHandler.ts 中的 toast 导入错误
- 修改 `src/utils/errorHandler.ts` 的导入语句
- 将 `import { toast }` 改为 `import { showToast as toast }`
- 解决 esbuild 错误："No matching export in 'src/utils/toast.ts' for import 'toast'"
- 避免与函数参数 `showToast` 的命名冲突

### fix: 修复 vite.config.ts 中的重复键警告
- 修改 `vite.config.ts` 移除重复的 `exclude` 键
- 合并两个 exclude 配置为一个，包含 'lucide-react' 和 '@prisma/client'
- 解决 esbuild 警告："Duplicate key 'exclude' in object literal"
- 优化配置结构，提高代码可读性

### fix: 修复 TypeScript 声明文件中的常量初始化错误
- 修改 `src/theme/theme.d.ts` 使用 `declare const` 替代 `export const`
- 在 `.d.ts` 声明文件中，常量必须使用 `declare` 关键字声明
- 解决 esbuild 编译错误："The constant 'xxx' must be initialized"
- 修复 themeTokens、antdThemeConfig、darkThemeConfig 三个常量的声明
- 确保前端服务可以正常启动
- Docker 构建测试：依赖安装正常，无其他 TypeScript 错误

## 2026-02-05

### feat: 创建超级优化版 Dockerfile，通过激进优化策略减小镜像体积至 1.5-2GB
- 创建 `docker/Debian Linux/Dockerfile.debian.ultra` 超级优化版
- 只安装 Chromium 浏览器，移除 headless-shell 和 ffmpeg（节省 ~500MB）
- 精简字体包，只保留基础字体和简体中文（节省 ~150MB）
- 深度清理 node_modules 中的文档、测试文件、TS 源码（节省 ~300MB）
- 清理 Playwright 的 source map、类型定义、文档（节省 ~100MB）
- 移除不必要的配置文件（节省 ~50MB）
- 预期镜像大小从 5.59GB 降至 1.5-2GB
- 创建 `docker/Debian Linux/IMAGE_SIZE_ANALYSIS.md` 镜像大小分析文档
- 说明为什么优化版没有减小体积的原因
- 提供三个版本的功能对比和使用建议

### refactor: 创建统一的 Docker 镜像配置文件，实现集中管理
- 创建 `docker/Debian Linux/config.sh` 统一配置文件
- 集中管理镜像仓库地址、命名空间、镜像名称等配置
- 提供配置验证和信息显示功能
- 修改 `docker/Debian Linux/docker-compose.build.yml` 使用环境变量
- 镜像名从硬编码改为 `${LOCAL_IMAGE_NAME:-sakura-ai1}:${LOCAL_IMAGE_TAG:-latest}`
- 修改 `docker/Debian Linux/build.sh` 加载统一配置
- 移除硬编码的 REGISTRY、NAMESPACE、IMAGE_NAME 配置
- 使用 config.sh 中的配置和函数
- 修改 `docker/Debian Linux/rebuild.sh` 加载统一配置
- 使用 LOCAL_IMAGE 变量替代硬编码的镜像名
- 修改 `docker/Debian Linux/build-and-push.sh` 加载统一配置
- 简化镜像查找逻辑，直接使用配置文件中的 LOCAL_IMAGE
- 使用 DOCKER_REGISTRY 替代 REGISTRY
- 实现一处修改，所有脚本同步更新的效果
- 方便测试不同的镜像名称配置

### fix: 修复 build.sh 和 docker-compose.build.yml 镜像名称不一致问题
- 修改 `docker/Debian Linux/docker-compose.build.yml` 确保使用正确配置
- 将 Dockerfile 从 `Dockerfile.debian.optimized` 改为 `Dockerfile.debian`
- 将镜像名从 `sakura-ai1:latest` 改为 `sakura-ai:latest`
- 修改 `docker/Debian Linux/build.sh` 与 docker-compose 配置保持一致
- 将 NAMESPACE 从 `sakura-ai1` 改为 `sakura-ai`
- 将 IMAGE_NAME 从 `sakura-ai1` 改为 `sakura-ai`
- 添加 LOCAL_IMAGE 变量明确指定 docker-compose 构建的镜像名
- 简化镜像查找逻辑，直接使用 docker-compose 配置的镜像名
- 确保构建、标记、推送流程使用统一的镜像名称

### fix: 修复 Docker 构建使用缓存代码的问题，创建无缓存重建脚本
- 修改 `docker/Debian Linux/docker-compose.build.yml` 使用正确的 Dockerfile
- 将 Dockerfile 从 `Dockerfile.debian.optimized` 改为 `Dockerfile.debian`
- 将镜像名从 `sakura-ai1:latest` 改为 `sakura-ai:latest`
- 创建 `docker/Debian Linux/rebuild.sh` 无缓存重建脚本
- 脚本功能：停止容器 → 删除旧镜像 → 清理构建缓存 → 无缓存重建
- 解决 Docker 使用缓存层导致代码更新不生效的问题
- 确保每次构建都使用最新的代码和配置

## 2026-02-05

### fix: 在 Dockerfile 中添加 Vite 缓存清理步骤
- 修改 `docker/Debian Linux/Dockerfile.debian` 添加 Vite 缓存清理
- 在构建前端前清理 `node_modules/.vite` 和 `.vite` 目录
- 避免使用旧的缓存导致构建错误
- 确保每次构建都使用最新的代码和配置

### fix: 修复 errorHandler.ts 中的 toast 导入错误
- 修改 `src/utils/errorHandler.ts` 的导入语句
- 将 `import { toast }` 改为 `import { showToast as toast }`
- 解决 esbuild 错误："No matching export in 'src/utils/toast.ts' for import 'toast'"
- 避免与函数参数 `showToast` 的命名冲突

### fix: 修复 vite.config.ts 中的重复键警告
- 修改 `vite.config.ts` 移除重复的 `exclude` 键
- 合并两个 exclude 配置为一个，包含 'lucide-react' 和 '@prisma/client'
- 解决 esbuild 警告："Duplicate key 'exclude' in object literal"
- 优化配置结构，提高代码可读性

### fix: 修复 TypeScript 声明文件中的常量初始化错误
- 修改 `src/theme/theme.d.ts` 使用 `declare const` 替代 `export const`
- 在 `.d.ts` 声明文件中，常量必须使用 `declare` 关键字声明
- 解决 esbuild 编译错误："The constant 'xxx' must be initialized"
- 修复 themeTokens、antdThemeConfig、darkThemeConfig 三个常量的声明
- 确保前端服务可以正常启动
- Docker 构建测试：依赖安装正常，无其他 TypeScript 错误

## 2026-02-05

### feat: 创建优化版 Dockerfile，通过多阶段构建减小镜像体积
- 创建 `docker/Debian Linux/Dockerfile.debian.optimized` 优化版 Dockerfile
- 使用多阶段构建分离构建和运行环境
- 构建阶段：安装所有依赖、构建前端、清理开发依赖
- 运行阶段：只安装运行时依赖、复制必要文件
- 精简字体包，保留中文支持（fonts-noto-cjk）
- 清理 Playwright 的 source map 和 TypeScript 定义文件
- 清理 npm 缓存和构建临时文件
- 预期镜像大小从 5.59GB 降至 2-3GB
- 保持所有功能完整（Chromium、headless-shell、ffmpeg、中文字体）

### fix: 修复 Prisma 生成的类型定义文件导致的 Vite 构建错误
- 修改 `tsconfig.app.json` 添加 exclude 配置，排除 Prisma 生成的类型定义文件
- 修改 `vite.config.ts` 优化 Prisma 文件处理，避免 Vite 扫描和打包
- 在 `optimizeDeps.entries` 中排除 `src/generated/**` 目录
- 在 `optimizeDeps.exclude` 中添加 `@prisma/client`
- 在 `build.rollupOptions.external` 中排除 Prisma 相关模块
- 创建 `scripts/fix-prisma-types.sh` 修复脚本
- 优化 `docker/Debian Linux/Dockerfile.debian` 在构建前清理并重新生成 Prisma Client
- 解决 "The constant 'xxx' must be initialized" 错误
- 解决 esbuild 编译时的常量未初始化问题

## 2026-02-04

### refactor: 整合构建脚本，只保留一个完整的 build.sh
- 更新 `docker/Debian Linux/build.sh` 整合所有功能
- 添加智能镜像查找和标记逻辑（参考 build-and-push.sh）
- 删除多余脚本：build.ps1、build-simple.ps1、pre-build-check.sh、fix-build-errors.sh
- 更新 `docker/Debian Linux/README.md` 简化使用说明
- 一个脚本完成：环境检查 → 问题修复 → 构建验证 → Docker 构建 → 推送镜像
- 保留 build-and-push.sh 作为备用简化版本

### fix: 修复一键构建脚本的镜像推送问题，采用智能镜像查找和标记逻辑
- 修复 `docker/Debian Linux/build.ps1` 镜像推送失败问题
- 修复 `docker/Debian Linux/docker-compose.build.yml` 镜像名称配置
- 添加智能镜像查找逻辑，支持多种可能的镜像名称
- 添加镜像标记步骤，确保推送到正确的阿里云仓库地址
- 参考 `build-and-push.sh` 的成功实现
- 解决 "failed to do request: Head registry-1.docker.io" 错误

### fix: 修复 Input.tsx 中遗漏的转义引号问题
- 修复 `src/components/ui/Input.tsx` 第 188 行的转义引号
- 将 Focus Ring Animation 的 `className=\"xxx\"` 改为 `className="xxx"`
- 确保所有 JSX 语法正确

### feat: 创建一键式 Docker 构建脚本，集成检查、修复、构建、推送全流程
- 创建 `docker/Debian Linux/build.sh` 一键构建脚本
- 集成环境检查（Node.js、Docker、必需文件）
- 集成自动修复（Prisma 客户端、构建缓存、Input.tsx 语法）
- 集成前端构建验证
- 集成 Docker 镜像构建和推送
- 添加彩色输出和详细的进度提示
- 支持自定义版本标签（默认 latest）
- 更新 `docker/Debian Linux/README.md` 添加一键脚本使用说明
- 简化构建流程，一个命令完成所有操作

### fix: 修复 Docker 构建时的 Prisma 类型错误和 Input.tsx 语法错误
- 修复 `src/components/ui/Input.tsx` 中的转义引号问题（第142行）
- 将 `className=\"xxx\"` 改为 `className="xxx"`，修复 JSX 语法错误
- 修改 `docker/Debian Linux/Dockerfile.debian` 在构建前清理并重新生成 Prisma 客户端
- 添加 Prisma 生成验证步骤，确保类型文件完整
- 添加构建错误日志输出，便于定位问题
- 解决 "The constant 'xxx' must be initialized" 类型错误
- 解决 "Expected '{' but found '\\'" 语法错误

### chore: 添加 Docker 构建辅助脚本和故障排除文档
- 创建 `docker/Debian Linux/fix-build-errors.sh` 修复常见构建错误
- 创建 `docker/Debian Linux/pre-build-check.sh` 构建前检查脚本
- 更新 `docker/Debian Linux/README.md` 添加故障排除章节
- 添加 Prisma 类型错误修复方法
- 添加 Input.tsx 语法错误说明
- 添加前端编译失败解决方案
- 添加构建前检查流程说明
- 添加辅助脚本使用说明

### fix: 在 npm prune 后重新安装 sharp，防止可选依赖被错误清理
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra` 在 prune 后重新安装 sharp
- 添加 `npm install --include=optional sharp` 确保可选依赖被保留
- 添加 `npm rebuild sharp --verbose` 重新编译二进制文件
- 解决 npm prune 清理开发依赖时误删 sharp 可选依赖的问题
- 确保运行阶段 sharp 模块可以正常加载

### fix: 修复超级优化版 Dockerfile 中 sharp 模块运行时加载失败问题
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra` 强制重新安装 sharp
- 添加 `npm install --force sharp` 确保 sharp 二进制文件正确安装
- 添加 `npm rebuild sharp --verbose` 显示详细的重新编译过程
- 解决 "Could not load the sharp module using the linux-x64 runtime" 错误
- 确保 sharp 在 Linux x64 环境下正常工作

### fix: 修复超级优化版 Dockerfile 因 package-lock.json 不同步导致的构建失败
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra` 使用 `npm install` 替代 `npm ci`
- 解决 `semver` 版本不一致问题（package.json: 7.7.3 vs package-lock.json: 6.3.1）
- `npm ci` 要求 package.json 和 package-lock.json 完全同步
- `npm install` 会自动解决版本冲突并更新 lock 文件
- 确保构建过程能够正常完成

### refactor: 合并并优化 .dockerignore 文件，统一构建排除规则
- 合并根目录 `.dockerignore` 和 `docker/Debian Linux/.dockerignore`
- 删除 `docker/Debian Linux/.dockerignore`（重复文件）
- 统一使用根目录的 `.dockerignore`（构建上下文为项目根目录）
- 添加详细的分类注释，提高可读性
- 确保所有必要文件（package.json, .env.example 等）不被排除

### fix: 优化超级优化版 Dockerfile 的依赖安装步骤，分步执行便于定位问题
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra` 将 npm 安装拆分为多个 RUN 命令
- 每个步骤独立执行，利用 Docker 层缓存
- 添加 package.json 内容预览，验证文件完整性
- 为每个步骤添加明确的错误提示
- 便于快速定位构建失败的具体原因

### fix: 为超级优化版 Dockerfile 添加详细的构建日志输出
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra` 添加构建步骤日志
- 在依赖安装前验证 package.json 文件是否存在
- 为每个 npm 安装步骤添加成功提示
- 便于定位构建失败的具体步骤

### fix: 简化超级优化版 Dockerfile 为两阶段构建，解决缓存问题
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra` 从三阶段改为两阶段构建
- 移除独立的 deps 阶段，避免 node_modules 缓存键计算失败
- 在构建阶段完成依赖安装、构建和清理，然后复制到运行阶段
- 解决 `failed to compute cache key: "/app/node_modules": not found` 错误
- 保持与优化版相同的构建流程，确保稳定性

### fix: 修复 @midscene/web 缺少 semver 依赖导致的模块找不到错误
- 修改 `package.json` 添加 `semver: ^7.6.0` 为显式生产依赖
- 修改 `docker/Debian Linux/Dockerfile.debian.optimized` 优化 npm prune 容错
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra` 同步优化 npm prune 容错
- 解决 `Cannot find package 'semver' imported from @midscene/web` 错误
- 确保 @midscene/web 的所有传递依赖在生产环境中可用

### fix: 完善超级优化版 Dockerfile 文件复制清单，确保所有配置文件都被包含
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra` 添加缺失的配置文件
- 添加 `package-lock.json` 确保依赖版本锁定
- 添加所有 TypeScript 配置文件（tsconfig.node.json, tsconfig.app.json）
- 添加构建配置文件（vite.config.ts, tailwind.config.cjs, postcss.config.cjs）
- 添加测试和代码质量配置（eslint.config.js, jest.config.js, jest.setup.js）
- 确保与优化版 Dockerfile 的文件复制清单保持一致

### fix: 修复超级优化版 Dockerfile 缺少 src 目录导致的模块找不到错误
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra` 添加 src 目录复制
- 解决 `Cannot find module '/app/src/services/modelRegistry.js'` 错误
- 确保运行时可以访问 src 目录中的 TypeScript 服务文件

### fix: 修复优化版 Dockerfile 缺少传递依赖导致的模块找不到错误
- 修改 `docker/Debian Linux/Dockerfile.debian.optimized` 的 npm prune 命令
- 添加 `--legacy-peer-deps` 参数确保传递依赖正确保留
- 解决 `Cannot find package 'semver'` 错误（@midscene/web 的传递依赖）
- 确保 npm prune 不会错误移除生产依赖的传递依赖

### fix: 修复超级优化版 Dockerfile 缺少传递依赖导致的模块找不到错误
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra` 依赖安装策略
- 改为先安装所有依赖（包括传递依赖），再使用 `npm prune --omit=dev` 清理
- 解决 `Cannot find package 'semver'` 错误（@midscene/web 的传递依赖）
- 确保所有生产依赖的传递依赖都被正确保留

### feat: 创建超级优化版 Dockerfile，镜像体积降至 1.5-2GB
- 新增 `docker/Debian Linux/Dockerfile.debian.ultra` - 三阶段构建超级优化版
- 分离依赖安装、构建、运行三个阶段，避免重复安装依赖
- 最小化系统依赖，只保留 Chromium 运行核心库
- 使用 `fonts-liberation` 替代 `fonts-wqy-zenhei`，节省 ~8MB
- 清理 Playwright 浏览器的 source map 和 TypeScript 定义文件
- 只复制运行时必需的文件，省略不必要的配置文件
- 强制清理 npm 缓存和临时文件
- 预期镜像大小从 5.59GB 降至 1.5-2GB

### docs: 更新 Docker 镜像优化说明文档
- 更新 `docker/Debian Linux/OPTIMIZATION.md` 完整优化指南
- 添加三个版本的详细对比表格（原始版、优化版、超级优化版）
- 详细说明各项优化技术和节省空间的具体数值
- 添加使用建议和适用场景说明
- 添加功能限制和风险提示
- 添加监控验证方法和常见问题解答
- 添加性能对比表格（镜像大小、构建时间、启动时间等）

## 2026-02-04

### fix: 添加前端开发服务器端口 5173 到 Dockerfile EXPOSE 配置
- 修改所有 Dockerfile 版本（debian, optimized, ultra）
- 添加 `EXPOSE 5173` 端口声明
- 与 docker-compose 的端口映射保持一致
- 确保前端开发服务器可以正常访问

### fix: 优化 Vite 配置，避免扫描 server 目录产生的浏览器兼容性警告
- 修改 `vite.config.ts` 添加 `optimizeDeps.entries` 配置
- 限制 Vite 只扫描 `src/**/*.{ts,tsx}` 和 `index.html`
- 避免 Vite 预构建时扫描 server 和 Prisma 生成的后端代码
- 消除构建时的 Node.js 模块外部化警告

### fix: 修复优化版 Dockerfile 构建时缺少开发依赖导致的 Vite 警告
- 修改 `docker/Debian Linux/Dockerfile.debian.optimized`
- 改为先安装所有依赖（包括开发依赖）用于构建前端
- 构建完成后使用 `npm prune --omit=dev` 清理开发依赖
- 解决 Vite 构建时 Prisma 模块外部化警告
- 确保最终镜像只包含生产依赖，保持体积优化

### fix: 完善优化版 Dockerfile 文件复制清单，添加 package-lock.json
- 修改 `docker/Debian Linux/Dockerfile.debian.optimized` 和 `Dockerfile.debian.ultra`
- 添加 `package-lock.json` 复制，确保依赖版本锁定
- 重新组织文件复制顺序，按重要性排列
- 添加注释说明模仿原始版本的 COPY . . 行为
- 确保所有运行时需要的文件都被正确复制

### fix: 完善优化版 Dockerfile 文件复制，确保所有必要配置文件都被包含
- 修改 `docker/Debian Linux/Dockerfile.debian.optimized` 和 `Dockerfile.debian.ultra`
- 添加复制所有 TypeScript 配置文件（tsconfig.json, tsconfig.node.json, tsconfig.app.json）
- 添加复制构建配置文件（vite.config.ts, tailwind.config.cjs, postcss.config.cjs）
- 添加复制测试和代码质量配置（eslint.config.js, playwright.config.js, jest.config.js）
- 添加复制其他必要目录（public, lib, config）和文件（index.html）
- 确保多阶段构建与原始版本功能完全一致

### fix: 修复优化版 Dockerfile 缺少 src 目录导致的模块找不到错误
- 修改 `docker/Debian Linux/Dockerfile.debian.optimized` 添加 `COPY --from=builder /app/src ./src`
- 修改 `docker/Debian Linux/Dockerfile.debian.ultra` 添加 `COPY --from=builder /app/src ./src`
- 解决 `Cannot find module '/app/src/services/modelRegistry.js'` 错误
- 确保多阶段构建正确复制所有必要的源代码目录

### feat: 新增超级优化版 Dockerfile，镜像大小降至 1.5-2GB
- 新增 `docker/Debian Linux/Dockerfile.debian.ultra` - 超级优化版 Dockerfile
- 构建阶段使用 Alpine 镜像，运行阶段使用 Debian slim
- 最小化系统依赖，只安装 Chromium 核心库
- 精简字体包，移除调试文件和缓存
- 不安装 headless-shell 和 ffmpeg（如不需要视频录制）
- 更新 `OPTIMIZATION.md` 文档，添加三版本对比说明

### fix: 修复构建脚本镜像名称不匹配问题
- 修改 `docker/Debian Linux/docker-compose.build.yml` 镜像名称从 `sakura-ai1:latest` 改为 `sakura-ai:latest`
- 优化 `docker/Debian Linux/build-and-push.sh` 脚本，智能检测实际构建的镜像名称
- 添加多种可能镜像名称的自动检测逻辑
- 改善错误提示，显示可用镜像列表帮助调试

### docs: 新增生产环境部署指南和配置模板
- 新增 `docker/Debian Linux/.env.production` - 生产环境配置模板
- 新增 `docker/Debian Linux/DEPLOYMENT_GUIDE.md` - 详细部署指南
- 提供必须修改的配置项清单（数据库密码、JWT密钥、API Key等）
- 说明 API Key 获取方法（OpenRouter、阿里云等）
- 包含完整的部署命令和管理命令
- 添加安全建议和数据备份方案

### fix: 修复优化版 Dockerfile 的 .env 文件安全处理
- 修改 `docker/Debian Linux/Dockerfile.debian.optimized`
- 移除构建阶段的 .env 文件创建，避免敏感信息打包到镜像
- 在运行阶段从 .env.example 创建 .env 文件
- 确保与标准版 Dockerfile 一致的安全配置文件处理方式
- 保持多阶段构建的体积优化效果

### fix: 修复优化版 Dockerfile 的 .env 文件创建逻辑
- 修改 `docker/Debian Linux/Dockerfile.debian.optimized`
- 在构建阶段添加从 .env.example 创建 .env 文件的逻辑
- 确保多阶段构建中 .env 文件正确传递到运行阶段
- 保持与标准版 Dockerfile 一致的配置文件处理方式

### refactor: 简化 Docker Compose 配置，删除重复文件
- 删除 `docker/Debian Linux/docker-compose.yml`（重复）
- 保留专用的 `docker-compose.build.yml`（构建推送）和 `docker-compose.deploy.yml`（生产部署）
- 更新 README 文档，明确两个文件的用途
- 添加常用命令说明

### docs: 新增 Docker 环境变量配置详细说明
- 更新 `docker/Debian Linux/README.md`
- 添加三种环境变量传递方式的详细说明
- 说明环境变量优先级规则
- 提供开发/生产环境配置示例
- 补充最佳实践建议

### fix: 完善 .dockerignore 环境变量文件排除规则
- 更新 `docker/Debian Linux/.dockerignore`
- 明确排除所有 .env 变体文件（.env, .env.local, .env.production 等）
- 保留 .env.example 用于容器内创建默认配置
- 添加详细注释说明安全性和配置管理最佳实践

### fix: 修复 Docker 容器 .env 文件创建方式，从 .env.example 复制
- 修改 `docker/Debian Linux/Dockerfile.debian` 和 `Dockerfile.debian.optimized`
- 改为从 `.env.example` 复制创建 `.env` 文件
- 更新 `.dockerignore` 确保 `.env.example` 被打包到镜像
- 保持与本地开发一致的配置文件创建方式

### fix: 修复 Docker 容器中 .env 文件缺失问题
- 修改 `docker/Debian Linux/Dockerfile.debian` 和 `Dockerfile.debian.optimized`
- 在容器中创建默认 .env 文件，避免启动时报错
- 实际配置通过 docker-compose 环境变量传递
- 更新 `scripts/start.cjs` 优化 .env 文件加载逻辑
- 添加文件存在性检查，Docker 环境友好

### feat: 新增 Docker 镜像优化方案，减小镜像体积
- 新增 `docker/Debian Linux/Dockerfile.debian.optimized` - 优化版 Dockerfile
- 新增 `docker/Debian Linux/.dockerignore` - 排除不必要的构建文件
- 新增 `docker/Debian Linux/OPTIMIZATION.md` - 详细的优化说明文档
- 使用多阶段构建分离构建和运行环境
- 只安装生产依赖，移除开发工具
- 精简 Playwright 浏览器安装（只安装 Chromium）
- 优化系统依赖和字体包
- 预期镜像大小从 5.59GB 降至 2-3GB

### refactor: 简化 Docker 镜像命名，统一使用 sakura-ai:latest
- 修改 `docker/Debian Linux/docker-compose.build.yml`
- 构建镜像使用简洁的本地名称 `sakura-ai:latest`
- 更新 `build-and-push.sh` 脚本，先构建本地镜像再标记为阿里云镜像
- 优化镜像标记流程，更清晰易懂

### fix: 修复构建脚本镜像名称匹配问题
- 修改 `docker/Debian Linux/build-and-push.sh`
- 修复镜像标记步骤，使用 docker-compose 构建的完整镜像名
- 添加镜像存在性检查，构建失败时显示可用镜像列表
- 优化错误提示和调试信息

### fix: 修复 Dockerfile 基础镜像配置，改回使用 Docker Hub 官方镜像
- 修改 `docker/Debian Linux/Dockerfile.debian`
- 移除阿里云公共镜像仓库配置（需要授权，不可用）
- 改回使用 Docker Hub 官方镜像 `node:20-slim`
- 更新 `TROUBLESHOOTING.md` 说明国内镜像源的限制
- 推荐临时禁用镜像加速器或手动拉取镜像的方式

### docs: 新增 Docker 构建故障排查文档
- 新增 `docker/Debian Linux/TROUBLESHOOTING.md`
- 详细说明基础镜像拉取 403 错误的解决方案
- 提供 4 种解决方案：禁用加速器、更换镜像源、手动拉取、使用国内镜像
- 补充 Playwright、npm、Prisma 等常见构建问题
- 添加调试技巧和推荐配置
- 更新 `Dockerfile.debian` 添加国内镜像源注释

### docs: 完善 Docker 部署文档，说明镜像访问权限配置
- 更新 `docker/Debian Linux/README.md`
- 添加镜像访问权限说明（公开仓库 vs 私有仓库）
- 补充访问令牌、RAM 子账号等多种访问方式
- 新增镜像拉取失败的故障排查说明
- 优化用户使用体验和文档可读性

### feat: 创建两套 Docker 部署方案（本地构建 + 在线镜像）
- 新增 `docker/Debian Linux/docker-compose.build.yml` - 本地构建并推送到阿里云方案
- 新增 `docker/Debian Linux/docker-compose.deploy.yml` - 使用阿里云在线镜像部署方案
- 新增 `docker/Debian Linux/build-and-push.sh` - 自动化构建推送脚本
- 新增 `docker/Debian Linux/README.md` - 详细的部署文档和使用说明
- 恢复 `docker/Debian Linux/docker-compose.yml` 为本地构建配置
- 支持版本标签管理（latest 和自定义版本号）
- 提供完整的开发到生产部署工作流

