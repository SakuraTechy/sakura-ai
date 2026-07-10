# Git 提交总结

## 2026-06-23
- feat(upload): 文件大小按类型分层上限，容器/二进制格式（docx/doc/pdf/zip）放宽至 100MB，纯文本类（html/js/md/txt）保持 10MB
- fix(fileReader): DOCX 解析不再将图片内联为 base64，改为占位符仅提取文字，避免图多文档 token 超限/分片异常/浏览器卡死
- fix(fileReader): 检测旧版 .doc 二进制（OLE 文件头 D0CF11E0），命中时提示「请另存为 .docx 再上传」
- fix(RequirementAnalysis): 修复 handleFileUpload/handleMergedFileUpload 仍写死 10MB 校验导致大 Word 被拦截，改用 getMaxFileSizeForName 按类型取上限
- refactor(MultiFileUpload): 大小校验按文件类型采用不同上限，更新超限弹窗与上传区提示文案，明确文本类与 Word/PDF/ZIP 不同限制及「图片不会被识别」说明
- chore: 配置 shrimp-task-manager MCP 服务器路径和参数
- chore: DEFAULT_MAX_TOKENS 从 4000 提升至 32768，添加需求文档大纲分块相关配置项
- feat: functionalTestCaseAIService 的 analyzeTestScenarios/analyzeTestModules 接受 systemName 和 moduleName 参数
- feat: FunctionalTestCaseGenerator 在测试场景分析和测试点生成期间传递项目信息
- feat: 知识管理组件新增模型配置模式，支持知识项保存/测试/删除，增强元数据输入校验与 Tooltip 布局
- feat: 知识服务新增获取/保存知识配置方法，settingsService 添加 KnowledgeSettings 和 EmbeddedProvider 类型定义

## 2026-06-15
- docs: 新增 AGENTS.md 文件，为 Codex 提供项目级指导
- docs: 同步更新 CLAUDE.md，统一 AI 协作原则和项目说明
- docs: 添加 Agent 入口约定，确保 Codex/Claude Code 等不同 AI 工具执行标准一致
- docs: 包含完整项目概述、核心命令、架构概览和开发注意事项
- docs: 集成 Karpathy Guidelines / AI 协作原则，规范 AI 开发行为

## 2026-06-02
- feat: 新增 requirementDocNavigation.ts，提供 scrollToRequirementSectionInContainer（HTML 内匹配标题滚动）和 inferModuleFromRequirementDoc（向上查找含「模块」的标题）
- feat: TestCaseDetailModal 点击「关联需求」传入章节标签并滚动定位；编辑模式支持 module 输入，onSave 传递完整 editedCase，进入编辑/取消时合并 docModule
- feat: FunctionalTestCaseGenerator 关联需求标签点击传入 section 滚动；生成用例时优先 AI/推断/项目模块填充 module，写入 requirementSource 便于详情展示
- fix: generateTestCaseForTestPoint 移除写死「生成 1 个用例」，改为按 estimatedTestCases 动态推荐 1-3 条（默认 2 条）
- fix: FunctionalTestCaseGenerator 放宽去重策略，名称一致后继续比较 caseType + testData + assertions，避免误删有效用例
- fix: 新增 normalizeModuleName/pickBestModuleName 过滤 AI 占位模块（模块名/待补充/unknown 等）
- fix: inferModuleFromRequirementDoc 兼容非 Markdown 标题（如 1.2 标题），找不到「模块」父标题时回退到命中章节标题
- fix: TestCaseDetailModal normalizedTestCase.module 改为用例非空 module 优先，否则回退 docModule，避免 docModule 始终盖住已保存值
- fix: FunctionalTestCases UI 自动化执行回调新增 saveExecutionResult 落库，收到 test_complete/test_error 后同步 pass/fail/block 及步骤统计、时长、引擎与 runId
- fix: 执行开始时缓存 executingCase 避免异步回调状态丢失，增加终态事件幂等保护防止重复写库

## 2026-04-14
- feat: 新增 requirementDocNavigation 工具，关联需求文档滚动定位章节，生成用例时按章节推断所属模块
- feat: 测试用例详情弹窗「所属模块」可编辑并保存，编辑/取消时合并需求文档模块
- fix: 测试点生成用例数量与去重策略优化，模块识别过滤占位值并兼容多种标题格式
- fix: 功能测试页 UI 自动化执行完成后同步落库执行结果（pass/fail/block），增加终态幂等保护

## 2026-04-10
- refactor(openclaw): 全面精简 workspace MD 文件，文件总数 95→43，子 agent prompt 从 ~8000 token 降至 ~1500 token，规则唯一定义在 AGENTS.md
- fix(openclaw): 移除 design agent 中非法的 subagents.runTimeoutSeconds 配置键

## 2026-04-08
- feat: 需求分析页新增百分比进度条、取消生成按钮、动态耗时预估与实际模型 ID 展示
- feat: 需求文档生成新增自动分片生成并合并，超长输入不再单次硬截断；修复 finish_reason=length 截断与分片内容不完整问题
- feat: 通用 inputLimits 接入系统设置页，前后端统一迁移 requirementDoc 旧字段，支持按模型 context 动态计算输入上限

## 2026-03-31
- feat: 上传支持 ZIP 自动解压合并（前后端 MAX_FILES 统一为 50），Axure parse-multi 支持 ZIP 解压与安全路径校验
- feat: 多文件/文件夹上传合并，Axure 导出主文件优先级识别（index、data.js 等），GBK/HTML charset 兼容
- feat: 需求文档输入上限按模型 context 动态计算，系统设置页支持配置 inputLimits
- fix: 需求分析生成接口超长截断并返回 inputTruncated，统一需求来源支持格式文案
- style: 市场洞察报告列表改为行业资讯风格自定义表格，固定高度可滚动，底部独立分页
- fix: 市场洞察分页重复请求；Docker 构建 fonts-noto-cjk 替换、build --load、pipefail 与 CACHE_BUST 缓存失效

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
- fix: 需求文档分片合并 length 截断后丢失尾部章节，增加尾部章节完整性兜底
- fix: 需求分析流式进度三步骤状态（generating/finalizing/done），修复 keep-alive 卡在 52% 与第 3 步不完成问题
- feat: 需求分析第 3 阶段最短展示时长可配置（VITE_REQUIREMENT_FINALIZING_MIN_MS）
- feat(openclaw): 子角色交付物大文件混合模式，HTML/长代码 write 落盘避免 Gateway 超时截断
- feat(upload): 文件大小按类型分层（容器格式 100MB / 纯文本 10MB），DOCX 图片占位符与旧版 .doc 检测
