# Git 提交总结

## 2026-03-24
fix: 修复文件预览编辑后 AI 生成未使用编辑内容，onChange 同步更新 inputText

style: 文件预览按钮根据预览状态切换睁眼/闭眼图标，MultiFileUpload 新增 previewingFileName prop，RequirementAnalysis 传入当前预览文件名

feat: 需求分析页面文件预览支持点击切换开关，已预览状态下点击同一文件可关闭预览

fix: 修复需求分析页面 Step 1 无法滚动到文件预览区域，外层容器改为 overflow-y-auto，预览区域改为 flex-shrink-0，确保可以滚动查看完整内容

fix: 修复需求分析页面 Step 1 文件预览区域内容无法滚动，外层容器 flex + overflow-hidden，内容区域 flex-1 min-h-0，标题等区域 flex-shrink-0

fix: 修复需求分析页面 Step 1 文件预览区域布局异常，预览区域从 grid 内移到外部独立显示，自适应剩余空间，解决与右侧输入区域重叠问题

fix: 修复需求分析页面 Step 1 和 Step 3 布局问题，Step 1 自适应撑满高度（包括全屏），文件预览区域限高避免撑开页面，Step 3 关联项目和版本宽度调整为 25%+25%，关联项目设为必填

fix: 修复需求分析页面底部按钮显示，JS 动态计算容器高度，监听全屏和窗口变化，所有 Step 内容区 flex-1 撑满

fix: 修复需求分析AI生成超时未使用系统设置配置，LLMConfig 新增 timeout 字段，updateConfig 写入 timeout

## 2026-03-23
style: 摘要超出省略时 hover 显示完整内容（Tooltip），两处同步更新并补充导入

style: 加强加载动画视觉效果，🤖图标+加粗标题+蓝色骨架屏+蓝色提示文字，两处统一更新

fix: 修复深读/行业资讯加载动画不显示，handleDeepRead 增加 setDeepReadContent(null)，加载判断提到最外层

feat: 深读/行业资讯查看摘要区域加入 AI 分析加载动画（跳动点+骨架屏），ContentViewerModal 新增 summaryLoading prop

fix: 优化深读摘要降级方案，新增 extractFallbackSummary 按句截断，最多 500 字符，替换原 slice(0,240) 硬截断

style: 优化 generateArticleSummary 提示词，3-5 句摘要、保留关键信息、扩展输入至 5000 字符、max_tokens 提升至 400

feat: 深读摘要改为 AI 提炼，新增 generateArticleSummary 方法，失败时降级截取文本

style: 市场洞察深读生成成功/失败改为弹窗提示，与行业资讯保持一致

feat: 行业资讯一键转需求文档添加 AI 进度弹窗，复用市场洞察深读体验

style: ContentViewerModal 优化：摘要 line-clamp、元信息移顶部、footer 间距收紧、抓取信息与按钮同行

feat: 行业资讯页面集成 ContentViewerModal，支持深度阅读、多预览模式、一键转需求文档

feat: 创建统一内容查看弹窗组件 ContentViewerModal，支持 Markdown/纯文本/HTML 多模式预览


- 移除重复的初始化日志，只在关键节点打印
- 合并配置更新日志到一次输出，提高可读性
- 超时配置显示具体的秒数值（如"默认=180秒, 快速=30秒"）
- 移除后端设置服务和数据库加载的冗余日志

fix: 修复系统设置页面超时配置无法保存的问题
- Settings.tsx 的 handleFieldChange 函数新增对 timeout. 开头字段的处理逻辑
- 支持正确处理 timeout.default 和 timeout.short 嵌套字段的更新
- 确保超时配置能正确保存到 formData 状态中

feat: 系统设置页面添加 AI 超时配置界面
- Settings.tsx 添加超时配置表单（默认超时和快速超时）
- LLMSettings 接口新增 timeout 字段支持超时配置
- 用户可在系统设置中自定义 AI 请求超时时间
- 支持分别配置长时间任务和快速分析任务的超时

feat: 统一 AI 服务超时配置管理
- 创建 aiTimeout.ts 工具模块，统一管理所有 AI 调用的超时时间
- 新增环境变量 AI_REQUEST_TIMEOUT 和 AI_SHORT_TIMEOUT
- 支持通过环境变量和用户设置灵活调整超时时间
- marketInsightService.ts 改用统一的超时配置

feat: llmConfigManager 打印超时配置信息
- updateConfig 方法新增超时配置日志输出
- 显示默认超时和快速超时的具体秒数
- 未配置时提示"使用环境变量或默认值"

fix: 修复深度阅读文章转需求文档超时问题
- 将 AI 服务超时时间从 60 秒增加到 180 秒（3 分钟）
- max_tokens 改为从系统设置中的模型配置读取，支持不同模型的最大 token 限制
- 优化超时错误提示，建议用户缩短文章内容或稍后重试

fix: 修复 Docker 容器中市场洞察样本报告文件找不到的问题
- Dockerfile.debian 添加 `COPY --from=builder /app/docs ./docs`，确保镜像包含默认文档
- docker-compose.yml 添加 `./docs:/app/docs` volume 挂载，支持运行时更新文档
- 解决 "[MarketInsight] 样本报告文件均未找到，cwd= /app" 错误
- 确保 `docs/2026年数据安全领域最新资讯.md` 样本文件在容器中可用

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
