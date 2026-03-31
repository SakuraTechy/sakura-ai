# Git 提交总结

## 2026-03-31
- fix: Dockerfile.debian 运行阶段 fonts-noto-cjk-extra 替换为 fonts-noto-cjk，修复阿里云镜像源下载超时导致构建失败
- fix: sakura.sh docker build 新增 --load 参数，修复 BuildKit 构建后本地镜像不存在导致 push 失败

## 2026-03-30
- fix: sakura-ai 容器新增挂载+环境变量 OPENCLAW_CONFIG_DIR=/app/.openclaw，configPath 支持环境变量覆盖，修复读取 openclaw.json 报 ENOENT
- fix: 改用 tr+sed 输出到 /tmp 临时文件执行，解决 bind mount 文件 sed -i 报 Device or resource busy 问题；新增 .gitattributes 强制 sh 文件 LF
- fix: 修复 Linux 容器内代理 OpenClaw 请求 ECONNREFUSED，改用 OPENCLAW_INTERNAL_HOST 环境变量
- fix: /start 接口检测容器不存在时返回 needInit 提示，前端弹窗显示宿主机初始化命令
- fix: 改用 Docker socket HTTP API 替代 docker CLI，无需重建镜像；挂载 /var/run/docker.sock，前端新增 dockerAvailable 字段

## 2026-03-24
- fix: 修复 Canvas 画布打开后显示与 OpenClaw Gateway 控制面板相同页面，后端新增 GET /api/openclaw/canvas 路由直接返回本地 index.html
- fix: 修复文件预览编辑后 AI 生成未使用编辑内容，onChange 同步更新 inputText
- style: 文件预览按钮根据预览状态切换睁眼/闭眼图标，MultiFileUpload 新增 previewingFileName prop，RequirementAnalysis 传入当前预览文件名
- feat: 需求分析页面文件预览支持点击切换开关，已预览状态下点击同一文件可关闭预览
- fix: 修复需求分析页面 Step 1 无法滚动到文件预览区域，外层容器改为 overflow-y-auto，预览区域改为 flex-shrink-0
- fix: 修复需求分析页面 Step 1 文件预览区域内容无法滚动，外层容器 flex + overflow-hidden，内容区域 flex-1 min-h-0，标题等区域 flex-shrink-0
- fix: 修复需求分析页面 Step 1 文件预览区域布局异常，预览区域从 grid 内移到外部独立显示，自适应剩余空间，解决与右侧输入区域重叠问题
- fix: 修复需求分析页面 Step 1 和 Step 3 布局问题，Step 1 自适应撑满高度（包括全屏），文件预览区域限高避免撑开页面，Step 3 关联项目和版本宽度调整为 25%+25%，关联项目设为必填
- fix: 修复需求分析页面底部按钮显示，JS 动态计算容器高度，监听全屏和窗口变化，所有 Step 内容区 flex-1 撑满
- fix: 修复需求分析AI生成超时未使用系统设置配置，LLMConfig 新增 timeout 字段，updateConfig 写入 timeout

## 2026-03-23
- style: 摘要超出省略时 hover 显示完整内容（Tooltip），两处同步更新并补充导入
- style: 加强加载动画视觉效果，🤖图标+加粗标题+蓝色骨架屏+蓝色提示文字，两处统一更新
- fix: 修复深读/行业资讯加载动画不显示，handleDeepRead 增加 setDeepReadContent(null)，加载判断提到最外层
- feat: 深读/行业资讯查看摘要区域加入 AI 分析加载动画（跳动点+骨架屏），ContentViewerModal 新增 summaryLoading prop
- fix: 优化深读摘要降级方案，新增 extractFallbackSummary 按句截断，最多 500 字符，替换原 slice(0,240) 硬截断
- style: 优化 generateArticleSummary 提示词，3-5 句摘要、保留关键信息、扩展输入至 5000 字符、max_tokens 提升至 400
- feat: 深读摘要改为 AI 提炼，新增 generateArticleSummary 方法，失败时降级截取文本
- style: 市场洞察深读生成成功/失败改为弹窗提示，与行业资讯保持一致
- feat: 行业资讯一键转需求文档添加 AI 进度弹窗，复用市场洞察深读体验
- style: ContentViewerModal 优化：元信息移顶部、footer 只保留操作按钮，提升视觉层次
- feat: 行业资讯页面集成 ContentViewerModal，支持深度阅读、多预览模式、一键转需求文档
- feat: 创建统一内容查看弹窗组件 ContentViewerModal，支持 Markdown/纯文本/HTML 多模式预览
- refactor: 优化 LLM 配置管理器日志输出，移除重复日志，合并配置更新输出，超时配置显示具体秒数
- fix: 修复系统设置页面超时配置无法保存，handleFieldChange 新增对 timeout. 开头字段的处理逻辑
- feat: 系统设置页面添加 AI 超时配置界面，支持分别配置默认超时（180秒）和快速超时（30秒）
- feat: 统一 AI 服务超时配置管理，创建 aiTimeout.ts 工具模块，新增 AI_REQUEST_TIMEOUT 和 AI_SHORT_TIMEOUT 环境变量
- feat: llmConfigManager 打印超时配置信息，显示默认超时和快速超时的具体秒数
- fix: 修复深度阅读文章转需求文档超时，AI 超时从 60 秒增加到 180 秒，max_tokens 改为从模型配置读取
- fix: 修复 Docker 容器中市场洞察样本报告文件找不到，Dockerfile.debian 添加 docs 目录复制，docker-compose.yml 添加 docs volume 挂载

## 2026-03-21
- feat: 更新依赖和增强文件处理功能，新增 fflate/unzipper 依赖，新增市场洞察路由（URL抓取/批量删除），添加深度读取功能，增强多格式文件解析

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
