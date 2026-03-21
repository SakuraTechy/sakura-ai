# Git 提交总结

## 2026-03-21
feat: 更新依赖和增强文件处理功能
- 在 package.json 和 package-lock.json 中添加 fflate 和 unzipper 依赖，支持更广泛的文件格式处理
- 更新 model-pricing.json 中的 lastUpdated 时间戳
- 新增市场洞察相关路由，支持按 URL 抓取正文和批量删除文章功能
- 添加市场洞察任务的快速创建和执行功能，支持行业、显示名称等参数配置
- 优化分析服务，增强对多种文件格式的解析能力，包括 HTML、JSON 和 CSV
- 添加深度读取功能，支持从 URL 抓取文章内容并生成需求文档
- 改进文件上传逻辑，支持多种文件格式的上传和处理
- 新增文档以支持行业资讯报告生成

## 2026-03-20
- feat: 添加图片识别通用方案文档，涵盖 OCR/视觉/混合路由策略和成本控制机制
- feat: 添加市场洞察模块（MarketInsights 页面、服务和定时任务）
- feat: 添加需求分析模块（RequirementAnalysis、RequirementInsights 页面和服务）
- feat: 新增后端路由（analysis.ts、insights.ts、marketInsight.ts）处理分析和洞察请求
- feat: 增强 fileReader.ts 支持多文件上传和图片资产提取
- feat: 添加 PDF 处理支持（pdf.worker.min.mjs）用于前端 PDF 解析
- feat: 更新 Prisma schema 支持新的分析和洞察数据模型
- feat: 升级 @prisma/client 从 6.11.1 到 6.19.2，版本号升级至 v2.0.0
- fix: 修复 Prisma 迁移外键重复错误，添加数据库重置和迁移管理脚本
- feat: 新增数据库管理命令（db:reset、db:migrate、db:generate）

## 2026-03-19
- fix: init-openclaw.sh 全面加强错误处理和健壮性，所有 patch 操作增加文件检查、错误捕获和友好提示
- fix: 彻底修复 "Plugin runtime module missing createPluginRuntime export"，通过 patch setup-wizard-helpers 导出和创建 ESM 桥接文件
- fix: patch @homebridge/ciao Prober.cancel() 将 promiseReject 改为 promiseResolve，消除 "CIAO PROBING CANCELLED" 导致的容器崩溃
- fix: 自动禁用 gateway.bonjour，消除 Docker 环境下 mDNS 服务发现警告
- fix: patch warnAboutUntrackedLoadedPlugins 函数加 globalThis Set 去重，消除 provenance 警告刷屏
- fix: 新增 wecom 插件自动安装逻辑，容器重建后自动补装并创建必要的软链接

## 2026-03-18
- fix: 新增 openclaw-extensions 和 openclaw-node-modules named volumes，解决 Windows Docker Desktop bind mount 权限问题
- feat: 小龙虾导航权限分流，管理员跳转管理页，普通用户直接打开 Web UI 并自动携带令牌
- feat: 用户管理新增部门字段，支持前后端完整的增删改查
- fix: 注册接口 department 字段存储修复，不再错误映射到 project
- feat: 用户忘记密码功能，支持邮箱验证码和密码重置
- feat: 用户注册功能，添加注册页面和入口
- fix: SMTP 认证失败时抛出友好错误信息，不再静默忽略
- fix: 用户管理页面错误提示优化，正确显示后端返回的具体错误信息

## 2026-03-18
- fix: Playwright Test Runner 全屏失效问题，移除冲突参数改用 --window-size=1920,1080
- fix: 非 headless 模式通过 CDP Browser.setWindowBounds 设置窗口最大化

## 2026-03-17
- fix: ExternalFrame 全屏时 iframe 位置偏移，改为动态计算定位
- fix: init-openclaw.sh 路径改为 $HOME 环境变量，兼容官方版和汉化版
- fix: docker-compose openclaw-gateway 改为 root 运行，统一路径为 /root/.openclaw

## 2026-03-16
- fix: OpenClaw healthcheck 改为 node fetch /healthz，与官方版一致
- feat: 新增 OpenClaw 更新功能，支持拉取最新镜像并重新创建容器
- feat: OpenClaw 控制面板支持按用户创建专属会话，URL 格式为 /chat?session=agent:main:{username}
- fix: 修复版本号提取和配置更新逻辑，容器启动时动态获取实际版本号

## 2026-03-12
- feat: 配置页面支持深层递归检测未知字段，根据类型自适应渲染
- feat: 配置页面改为分区卡片布局（网关、安全、Agent、命令、元信息）
- feat: 重构配置标签页为可编辑表单，支持查看/编辑模式切换
- feat: 创建 OpenClawIcon 组件，使用专属 SVG 图标替代 Bot 图标
- fix: 添加 /openclaw 路由配置，确保左侧菜单点击能正确创建 Tab
- feat: 使用 OpenClaw URL hash 参数传递令牌（#token=xxx），实现令牌自动保留
- fix: 修复 Tab 路径比较问题，支持包含查询参数的路径匹配

## 2026-03-12
- fix: 修复 OpenClaw Gateway 控制面板无法在 Tab 中打开的问题
- feat: 实现 OpenClaw 网关令牌持久化功能，刷新后自动恢复令牌
- fix: 通过后端代理移除 CSP 响应头，解决 frame-ancestors 'none' 问题
- feat: 添加 WebSocket URL 重定向支持，注入脚本将 WebSocket 连接重定向到 OpenClaw 端口
- feat: 添加在当前页面 Tab 中打开 OpenClaw 控制面板的功能
- feat: 创建 ExternalFrame 组件，支持在 iframe 中显示外部 URL

## 2026-03-11
- feat: 集成 OpenClaw Gateway 管理功能，在左侧菜单添加"小龙虾"入口
- feat: 创建 OpenClawManagement 页面，提供服务状态监控、启停控制和配置管理
- feat: 添加 OpenClaw 后端 API 路由，支持状态查询、服务控制和配置更新
- feat: 重构 OpenClaw 管理功能以支持 Docker 容器部署方式
- feat: 添加 Docker Compose 命令支持（启动、停止、重启容器）
- feat: 添加容器状态监控和日志查看功能
- feat: 添加 OpenClaw SSL 证书自动初始化功能
- refactor: 简化 OpenClaw 部署架构，将证书生成集成到主初始化脚本
- refactor: 优化 OpenClaw 配置方式，采用混合方案（条件挂载+初始化脚本）
- fix: 解决端口冲突问题，调整 Nginx 代理端口配置
