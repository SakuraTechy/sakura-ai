# Git 提交日志

## 2026-04-10

refactor(openclaw): 全面精简 workspace MD 文件，消除 prompt 膨胀与规则重复
- 全局 `workspace/`：SOUL.md 从 36 行精简到 10 行，AGENTS.md 从 235 行精简到 15 行，删除已迁移的 MASTER_WORKFLOW.md 和 TASK_TEMPLATE.md
- `workspace-main/`：SOUL.md 精简到 8 行；AGENTS.md 合并 workflow/ 中的交付物规则、输出模板、消息发送规则为唯一定义（~80 行）；workflow/ 从 6 个文件合并为 1 个 TASK_CONTRACT.md（~25 行）；TOOLS.md 合并预览链接规则；BOOTSTRAP.md 简化引用
- 删除 workflow/ 中 5 个冗余文件（01-MASTER_WORKFLOW/02-TASK_TEMPLATE/03-PREVIEW_LINK_RULE/README/00-DELIVERABLE_JSON_CONTRACT）
- 归档历史文档：04-SUBAGENT_MESSAGE_CONFIG_SUMMARY 和 05-WORKFLOW_UPDATE 移到 memory/archive/
- 删除 memory/format-standards/deliverable-format.md（与 AGENTS.md 完全重复）
- 10 个子角色 workspace：SOUL.md 精简为 3-5 行身份声明；AGENTS.md 重写为任务规则+输出格式+边界（~25 行）；删除各 4 个冗余文件（BOOTSTRAP/IDENTITY/TOOLS/USER）共 40 个
- 文件总数从 95 个降至约 43 个，子 agent prompt 从 ~8000 token 降至 ~1500 token
- 同一规则重复次数从 5-7 次降至 1 次（唯一定义在 AGENTS.md）
- 新增统一的企业微信最终输出格式模板，确保交付物明细、关键指标、下一步行动、待确认问题的结构化输出

fix(openclaw): 移除 `agents.list` 中 design 的非法 `subagents.runTimeoutSeconds`
- OpenClaw 校验器仅接受 `agents.defaults.subagents` 下的 `runTimeoutSeconds`；per-agent `subagents` 不支持该键，会导致 “Unrecognized key”
- 子 agent 运行超时继续由 `agents.defaults.subagents.runTimeoutSeconds`（7200）统一生效

## 2026-04-08

feat: 需求分析页新增百分比进度/取消生成/模型名与耗时预估展示
- `RequirementAnalysis` 新增流式生成百分比进度条（0-100）与「取消生成」按钮，支持中断长时间生成任务
- subtitle 改为动态展示已耗时与预计剩余时间（在已知分片进度时自动估算）
- 当前模型展示优先使用实际生效模型 ID（如 `qwen3.5-122b-a10b`），不再只显示聚合名称
- `analysisService.generateRequirementStream` 增加 `AbortSignal` 透传，前端可主动取消请求
- 优化生成中 UI：分片进度未拿到 `current/total` 时显示“等待分片”并置为进行中；进度条上移并与内容区边框融合；底部主操作在生成中切换为「取消生成」（位于「下一步」前）
- 修复分片合并后文档被截断：服务端记录并处理 `finish_reason=length`，自动续写补全；合并阶段改为多轮批次合并，避免单轮合并输入超出窗口导致内容丢失
- 进一步修复“分片后内容不完整”：分片大小引入保守上限（默认约 90000 字/片，可用 `REQUIREMENT_DOC_CHUNK_PREFERRED_MAX_CHARS` 调整），减少单片过粗造成的信息压缩损失；合并与分片提示词强化“覆盖完整性优先”
- 生成中进度条改为“贴底细线”样式，与中间区域边缘融合显示，减少悬浮块割裂感
- 新增“最小分片数量保护”：超长输入（默认净化后 >=300000 字）若分片数不足 6，会自动对最长分片二次拆分至目标下限（受最小分片长度保护），并打印生效日志

feat: 需求文档生成新增“自动分片生成并合并”，超长输入不再单次硬截断
- `analysisService.generateRequirementDoc` 超出单次窗口时自动按 `maxInput` 分片，多轮生成分片草稿后再二次合并为最终文档
- 保持原接口返回结构不变（`{ content, inputTruncated }`），其中分片模式下 `inputTruncated=true`
- 新增分片与合并阶段日志（含分片进度、分片数），便于定位超长输入场景

feat: 通用 inputLimits 接入设置页实时估算与前后端统一迁移
- `Settings` 改为配置 `inputLimits`，新增实时估算提示：`contextWindow / maxTokens / maxInput`
- `analysisService` 读取优先级统一为 `inputLimits > requirementDoc(兼容旧字段) > .env`
- 前后端 `settingsService` 增加旧字段迁移逻辑（`requirementDoc -> inputLimits`），默认值补齐
- `llmConfigManager.saveCurrentConfig` 持久化 `inputLimits`，避免回写丢失

## 2026-03-31

fix: 统一「需求来源」支持格式文案（HTML/HTM/JS/PDF/DOC/DOCX/Markdown/TXT/ZIP）
- `FunctionalTestCaseGenerator`：校验、预览、Modal 与步骤说明与 `MultiFileUpload` / `readFileContent` 一致
- `RequirementAnalysis` 预览失败提示已含 ZIP/DOC/JS（若本地未保存则与本次一致）

feat: Axure 导出 ZIP/文件夹自动识别主文件优先级（index、files/*/data.js、document.js 等）
- 新增 `src/utils/axureExportPrioritize.ts`：路径评分、跳过 chrome.html/大型第三方 JS、合并顺序优先主内容
- `readZipArchiveCombined` 对 ZIP 内 HTML/JS 先筛选再按优先级排序，再合并 md/txt/pdf/doc
- 需求分析多文件合并改用 `sortFilesByAxurePriority` 替代纯路径排序

fix: 需求分析生成接口输入超长时按模型上限截断并返回 inputTruncated
- 服务端 `generateRequirementDoc` 在请求 LLM 前截断用户正文（`REQUIREMENT_DOC_MAX_INPUT_TOKENS` 默认 119000），返回 `{ content, inputTruncated }`
- `POST /api/analysis/generate` 响应 `data.inputTruncated`；前端 `analysisService.generateRequirement` 同步；需求分析页截断时 Toast 提示
- `marketInsightService` 两处调用改为解构 `content`
- `MultiFileUpload` 文案补充：虚线区选文件、合并过长时 AI 可能截断

fix: 需求文档输入截断上限改为按模型上下文动态计算（支持显式映射覆盖）
- 新增 `REQUIREMENT_DOC_MODEL_CONTEXT_WINDOWS_JSON`：按模型名配置 context window（token）
- 默认使用「context window - max_tokens - safety margin」估算 max input，避免换模型后无谓截断或超限
- 保留 `REQUIREMENT_DOC_MAX_INPUT_TOKENS` 作为最高优先级手动覆盖

feat: 系统设置页支持配置需求文档输入上限（按模型 context 映射 / safety margin / 强制覆盖）
- `Settings` 新增「需求文档输入长度（高级）」配置，持久化到 settings（前后端通用）
- 服务端生成需求文档时优先读取 settings 中的 requirementDoc 配置，不再只能依赖 `.env`

fix: 选择文件夹优先使用 showDirectoryPicker（系统文件夹对话框），并说明虚线区为「选文件」
- `MultiFileUpload`：Chrome/Edge 用 File System Access API 递归收集文件并设置 webkitRelativePath；失败或不支持时回退 webkitdirectory input
- 文案区分：点击虚线区域为系统「选择文件」；整夹请点「选择文件夹」或拖拽

fix: ZIP 解压乱码与 GBK/HTML charset 兼容；需求分析多文件/文件夹合并；上传区支持选择文件夹
- `fileReader`：ZIP 内路径用字节还原 UTF-8/GB18030 显示；正文按 HTML meta charset、UTF-8/GB18030 启发式解码，替换原 `strFromU8` 单一 UTF-8
- `RequirementAnalysis`：多个主文件（含文件夹内多文件）按 `webkitRelativePath` 排序后合并为输入，与 ZIP 合并策略一致
- `MultiFileUpload`：增加「选择整个文件夹」隐藏 input（webkitdirectory）及说明文案

fix: 需求分析等页面支持上传 ZIP 并解压合并为输入正文
- `readFileContent` 增加 ZIP 分支：使用 `fflate` 解压并合并 HTML/HTM/JS/Markdown/TXT/PDF/Word 等文本（HTML+HTM+JS 数量受 `MAX_FILES` 限制）
- 导出 `countZipHtmlJsFiles` 供上传组件展示 ZIP 内 HTML/JS 数量
- `RequirementAnalysis` / `FunctionalTestCaseGenerator` 将 `.zip` 识别为主文件并触发读取
- `MultiFileUpload` 异步统计 ZIP 内 HTML/JS 并计入顶部汇总，支持 ZIP 预览，主文件提示含 ZIP

style: 多文件上传区补充 ZIP 解压与解析数量说明
- `MultiFileUpload` 在拖拽区下方增加说明：ZIP 由服务端解压、仅提取 HTML/HTM/JS，解压后 HTML+JS 总数不超过配置上限

feat: Axure 多文件上传支持 ZIP 自动解压并参与解析
- 后端 `server/routes/axure.ts` 新增 ZIP 解压逻辑，自动提取压缩包中的 HTML/HTM/JS 文件参与 `parse-multi` 解析
- 增加 ZIP 条目路径安全校验，跳过可疑路径（如 `..`、绝对路径、盘符路径）防止目录穿越
- 解析前按“解压后 HTML+JS 总数”执行 `MAX_FILES` 校验，超限返回明确错误信息
- `parse-multi` 临时文件清理改为 `finally` 统一处理，确保成功/失败都删除上传文件及解压目录
- 无 HTML 文件时提示升级为“可直接上传或包含在 ZIP 中”

fix: 上传配置支持 ZIP 并统一最大文件数为 50
- 前端上传配置 `src/config/upload.ts` 新增 `.zip` 支持，`MAX_FILES` 调整为 50
- 上传组件 `src/components/ai-generator/MultiFileUpload.tsx` 增加 ZIP 类型校验、accept 配置及展示文案
- 后端上传配置 `server/config/upload.ts` 新增 `.zip` 支持，`MAX_FILES` 调整为 50
- 后端上传中间件错误提示补充 ZIP 类型
- Axure 多文件路由由写死 `20` 改为读取 `MAX_FILES` 配置，前后端限制保持一致

style: 市场洞察报告列表改为行业资讯风格自定义表格，中间区域固定高度可滚动，底部独立分页
- 替换 Ant Design Table 为自定义 table，与行业资讯页面风格一致
- 表格区域 maxHeight calc(100vh - 420px) 固定高度，内容溢出时滚动
- 分页移至表格外底部，使用 Ant Design Pagination 组件
- 删除废弃的 reportColumns 定义
- 文件：src/pages/MarketInsights.tsx

fix: 修复市场洞察模块分页重复请求问题
- loadReports 的 useCallback 依赖移除 pagination.pageSize，改为参数传入
- 分页 onChange 不再同时调用 setPagination + loadReports，避免 pageSize 变化触发 useEffect 二次请求
- 文件：src/pages/MarketInsights.tsx

fix: 修复 Docker 构建失败 - 替换 fonts-noto-cjk-extra 为 fonts-noto-cjk
- Dockerfile.debian 运行阶段将 fonts-noto-cjk-extra 替换为 fonts-noto-cjk
- fonts-noto-cjk-extra 体积约 140MB，从阿里云镜像源下载超时导致构建失败
- fonts-noto-cjk 基础版体积更小，中文截图显示效果足够

fix: 修复 push 时提示本地镜像不存在的问题
- sakura.sh 和 docker/Debian Linux/sakura.sh 的 docker build 命令新增 --load 参数
- Docker BuildKit 默认只缓存不导出，--load 强制将镜像导出到本地 Docker 镜像列表

fix: 修复构建失败仍显示成功的问题
- sakura.sh 和 docker/Debian Linux/sakura.sh 的 docker build 管道前加 set -o pipefail
- tee 管道会吞掉 docker build 的退出码，pipefail 确保管道中任意命令失败都能被捕获

fix: 修复 Docker 缓存导致旧 apt 层被复用的问题
- Dockerfile.debian 运行阶段新增 ARG CACHE_BUST=20260331，强制使 apt 安装层缓存失效

## 2026-03-30

fix: 修复 sakura-ai 容器读取 openclaw.json 报 ENOENT 的问题
- docker-compose.yml sakura-ai 服务新增挂载 OPENCLAW_CONFIG_DIR -> /app/.openclaw
- docker-compose.yml sakura-ai 服务新增环境变量 OPENCLAW_CONFIG_DIR=/app/.openclaw
- server/routes/openclaw.ts configPath 改为优先读取 OPENCLAW_CONFIG_DIR 环境变量
- sakura-ai 和 openclaw-gateway 共享同一份宿主机配置目录，路径不同但文件一致

fix: 修复 sed -i 在 bind mount 文件上报 Device or resource busy 的问题
- 改用 tr + sed 输出到 /tmp 临时文件再执行，避免原地修改挂载文件

fix: 修复 init-openclaw.sh CRLF/BOM 问题，docker-compose.yml 启动命令中用 tr+sed 动态清除
- 新增 .gitattributes，强制 *.sh 文件提交时保持 LF

fix: 修复 Linux 容器部署时代理请求 ECONNREFUSED 127.0.0.1:18789 的问题
- server/routes/openclaw.ts 代理路由改用 OPENCLAW_INTERNAL_HOST 环境变量指定目标地址
- docker-compose.yml sakura-ai 服务新增 OPENCLAW_INTERNAL_HOST=openclaw-gateway（Docker 服务名）
- .env.example 新增 OPENCLAW_INTERNAL_HOST 配置说明
- 宿主机直接运行时不设置该变量，默认 fallback 到 localhost

fix: 修复点击启动时报 No such container 错误
- /start 接口改为先检查容器是否存在（GET /containers/{name}/json）
- 容器不存在时返回 needInit: true 和初始化命令提示，而非直接报错
- 前端 handleStart 处理 needInit 场景，弹出 Modal 显示宿主机初始化命令

fix: 改用 Docker socket HTTP API 替代 docker CLI，无需重建镜像即可在 Linux 容器内管理 OpenClaw 容器
- server/routes/openclaw.ts 新增 dockerSocketRequest() / isSocketAvailable()
- /status /start /stop /restart /logs /update 全部改用 socket API，保留 CLI fallback
- docker-compose.yml 挂载 /var/run/docker.sock
- 前端新增 dockerAvailable 字段，Docker 不可用时显示警告并禁用操作按钮

## 2026-03-24

fix: 修复 Canvas 画布打开后显示与 OpenClaw Gateway 控制面板相同页面的问题
- 后端新增 GET /api/openclaw/canvas 路由，直接返回本地 .openclaw/canvas/index.html
- 前端 Canvas 画布按钮改为指向本地静态路由，不再通过 OpenClaw Gateway 代理
- Canvas 画布按钮移除对服务运行状态的依赖（本地文件无需服务运行）

fix: 修复文件预览编辑后 AI 生成未使用编辑内容的问题
- 文件预览编辑区域 onChange 同步更新 inputText
- 确保 AI 生成时使用用户编辑后的文件内容

style: 文件预览按钮根据预览状态切换睁眼/闭眼图标
- MultiFileUpload 接口新增 previewingFileName 可选字段
- 导入 EyeOff 图标
- 预览按钮根据 previewingFileName === item.file.name 切换 Eye/EyeOff 图标
- title 提示文字同步切换"预览文件内容"/"关闭预览"
- RequirementAnalysis 传入 previewingFileName={showFilePreview ? filePreviewResult?.fileName : undefined}

feat: 需求分析页面文件预览支持点击切换开关
- handlePreviewFile 函数增加状态检测逻辑
- 如果已经在预览状态且点击同一个文件，则关闭预览
- 通过比对 filePreviewResult.fileName 判断是否为同一文件
- 提升用户体验，支持快速切换预览状态

fix: 修复需求分析页面 Step 1 无法滚动到文件预览区域的问题
- Step 1 外层容器从 overflow-hidden 改为 overflow-y-auto，允许整体滚动
- 文件预览区域从 flex-1 min-h-0 改为 flex-shrink-0，作为固定高度区域
- 文件预览内层容器移除 overflow-hidden 和 height: 100%
- 文件内容白色卡片移除 flex-1 min-h-0，恢复为普通 flex flex-col
- 文件内容滚动区域恢复 maxHeight: 400px 限制
- 确保可以滚动到底部查看完整的文件预览内容

fix: 修复需求分析页面 Step 1 文件预览区域内容无法滚动的问题
- 文件预览外层容器改为 flex flex-col overflow-hidden + height: 100%
- 文件预览内层容器改为 flex flex-col overflow-hidden h-full
- 标题、文件信息、警告提示等区域添加 flex-shrink-0 防止被压缩
- 文件内容白色卡片改为 flex flex-col flex-1 min-h-0
- 文件内容滚动区域移除 maxHeight 限制，改为 flex-1 min-h-0
- 确保文件内容区域可以正常滚动查看

fix: 修复需求分析页面 Step 1 文件预览区域布局异常问题
- 文件预览区域从 grid 内部移到外部，作为独立区域显示
- 未预览时 grid 使用 flex-1 撑满高度，预览时 grid 改为 flex-shrink-0
- 文件预览区域使用 flex-1 min-h-0 overflow-y-auto 自适应剩余空间
- 修复文件预览内容与右侧输入文本区域重叠的问题
- 预览区域高度自适应，内容可独立滚动

fix: 修复需求分析页面 Step 1 和 Step 3 布局问题
- Step 1: 移除外层滚动容器，grid 改为 flex-1 min-h-0 自适应撑满高度
- Step 1: 标题添加 flex-shrink-0 防止被压缩，文件上传区域添加滚动容器
- Step 1: 文件预览区域改为 flex-shrink-0 + max-h-[50vh]，避免撑开页面
- Step 3: 关联项目和关联版本宽度比例调整为 25% + 25%（原 30% + 20%）
- Step 3: 关联项目移除 allowClear 属性，设为必填项
- Step 3: 关联版本移除 allowClear 属性，保持必填
- 修复未上传文件时中间区域自适应撑满高度问题（包括全屏模式）
- 修复已上传文件时底部显示不完整问题

fix: 修复需求分析页面底部按钮显示问题，使用 JS 动态计算容器高度，监听全屏和窗口变化实时调整
- 添加 containerRef 和 containerHeight state
- useEffect 监听 resize、fullscreenchange、app-fullscreen 类变化
- 普通模式：vh - 168px，全屏模式：vh - 40px
- Step 内容区 overflow-y-auto，底部按钮 flex-shrink-0
- 所有 Step 容器添加 h-full flex flex-col 撑满高度
- Step 1: grid 和文件预览包在滚动容器里，添加 flex-1 min-h-0 overflow-y-auto
- Step 2: 生成结果容器和预览/编辑区域添加 flex-1 min-h-0，TextArea 改 autoSize=false
- Step 3: 文档预览容器和内容区域添加 flex-1 min-h-0，移除 max-h 限制
- 不修改 Layout.tsx，避免影响其他页面

fix: 修复需求分析模块AI生成需求文档超时未使用系统设置配置的问题
- LLMConfig 接口新增 timeout 字段（default/short 毫秒配置）
- llmConfigManager.updateConfig() 构建 newConfig 时将 settings.timeout 写入
- 修复后 analysisService 和 marketInsightService 中 config.timeout 可正确读取用户自定义超时
- 之前始终回退到环境变量硬编码值（AI_REQUEST_TIMEOUT=180000ms）

## 2026-03-23
style: 摘要超出省略时 hover 显示完整内容（Tooltip）
- ContentViewerModal 和 MarketInsights 深读弹窗摘要区域加 Tooltip 包裹
- 鼠标悬停时展示完整摘要，最大宽度 600px，cursor 改为 help 提示可交互
- 两个文件同步补充 Tooltip 导入

style: 加强加载动画视觉效果，增大图标/字号/点大小，骨架屏改为蓝色调，底部提示文字加深
- ContentViewerModal 和 MarketInsights 深读弹窗统一更新
- 🤖 图标 + 加粗标题 + 更大跳动点（2.5px）+ 蓝色骨架屏 + 蓝色提示文字

fix: 修复深读/行业资讯加载动画不显示的问题
- handleDeepRead 开始时增加 setDeepReadContent(null)，确保每次打开都重置内容
- ContentViewerModal 和 MarketInsights 深读弹窗将加载判断提到最外层
- loading=true 且 content=null 时优先显示加载动画，不再走 Empty 空状态
- 骨架屏下方增加"AI 正在智能提炼文章摘要，请稍候..."提示文字

style: 摘要加载动画骨架屏下方增加提示文字"AI 正在智能提炼文章摘要，请稍候..."
- ContentViewerModal 和 MarketInsights 深读弹窗同步更新
- 两处加载动画效果保持一致

feat: 深读/行业资讯查看时摘要区域加入 AI 分析加载动画
- ContentViewerModal 新增 summaryLoading prop，加载时显示跳动点 + 骨架屏
- RequirementInsights 传入 summaryLoading={detailLoading}，内容加载期间显示动画
- MarketInsights 深读弹窗摘要区域同步加入相同加载动画效果
- 加载完成后自动切换为正式摘要文本展示

fix: 优化深读摘要 AI 失败时的降级方案
- 新增 extractFallbackSummary 方法，按中英文句末标点断句取前 3-5 句
- 最多保留 500 字符，避免硬截断导致语义不完整
- 英文文章降级到最近空格处截断，保证词语完整
- 替换原来粗暴的 text.slice(0, 240) 截取方式

style: 优化 generateArticleSummary 提示词，提升摘要完整性
- system prompt 改为要求 3-5 句高质量摘要（原 2-3 句）
- 新增摘要要求：保留关键数据/政策/公司名称、说明影响意义
- 正文截取从 3000 字符扩展到 5000 字符，提供更多上下文
- max_tokens 从 200 提升到 400，支持更完整的摘要输出

feat: 深读摘要改为 AI 提炼，提升摘要质量
- marketInsightService.ts 新增 generateArticleSummary 私有方法
- 调用 AI（短超时）用 2-3 句中文提炼文章核心内容
- 失败时自动降级到截取正文前 240 字符，保证可用性
- deepReadArticleByUrl 已调用该方法，摘要质量显著提升

## 2026-03-23
style: 市场洞察深读生成成功/失败改为弹窗提示
- 移除 footer 内联的生成状态提示（generating/success/failed div）
- 新增生成成功弹窗（含"前往需求管理"按钮）和生成失败弹窗
- 与行业资讯页面保持一致的交互体验

## 2026-03-23
feat: 行业资讯一键转需求文档添加 AI 进度弹窗
- 点击"一键转需求文档"先弹出选项弹窗（标题、关联项目、关联版本）
- 确认后显示 AIThinking 进度弹窗，与市场洞察深读体验一致
- 生成成功弹窗提示并支持跳转需求管理页面
- 生成失败弹窗提示错误信息
- 复用 ConvertToRequirementModal 逻辑，支持选择项目和版本

style: 优化 ContentViewerModal 布局，将元信息移至顶部
- 将 extraFooter 内容从底部移到标题下方，紧跟摘要区域
- 优化视觉层次：标题/摘要 → 元信息（分类/来源/时间/链接）→ 工具栏 → 内容 → 抓取信息
- 底部 footer 只保留操作按钮（关闭、转换），更简洁
- 提升用户体验，重要信息更容易看到

feat: 行业资讯添加一键转需求文档功能
- 启用 ContentViewerModal 的转换按钮，支持将文章转换为需求文档
- 调用 generateRequirementFromArticle API 生成需求文档
- 转换成功后自动打开需求管理页面
- 显示转换加载状态和友好的错误提示
- 与市场洞察保持一致的用户体验

feat: 行业资讯查看时通过深度阅读 API 实时抓取文章内容
- 点击查看文章时调用 deepReadByUrl API，从原始 URL 抓取完整内容
- 支持多种内容格式（Markdown、HTML、纯文本）的智能提取
- 抓取失败时自动降级到数据库缓存内容，确保用户体验
- 显示抓取策略和耗时等元信息
- 提供更准确、更完整的文章内容展示

feat: 行业资讯页面集成统一的 ContentViewerModal 组件
- 替换原有的简单 Modal 弹窗为功能完整的 ContentViewerModal
- 支持多种预览模式（Markdown、纯文本、HTML清洗、HTML原貌）
- 支持全屏阅读和预览模式切换
- 在底部显示文章分类、来源、发布时间和原文链接
- 移除 marked 依赖，统一使用 ContentViewerModal 的渲染逻辑
- 优化用户体验，提供更专业的内容查看界面

feat: 创建统一的内容查看弹窗组件 ContentViewerModal
- 新增 src/components/common/ContentViewerModal.tsx 组件，支持多种预览模式（Markdown、纯文本、HTML清洗、HTML原貌）
- 支持全屏阅读、预览模式切换、内容转换等功能
- 提供统一的接口和样式，可复用于行业资讯、市场洞察等场景
- 新增使用示例文件 ContentViewerModal.example.tsx，展示在不同场景下的使用方法
- 组件特性：自动保存预览模式偏好、HTML 安全清洗、iframe 沙箱隔离、响应式布局

## 2026-03-23
refactor: 优化 LLM 配置管理器日志输出
- 移除重复的初始化日志，只在关键节点打印
- 合并配置更新日志到一次输出，提高可读性
- 超时配置显示具体的秒数值（如"默认=180秒, 快速=30秒"）
- 移除后端设置服务和数据库加载的冗余日志
- 简化配置保存成功的日志输出

fix: 修复系统设置页面超时配置无法保存的问题
- Settings.tsx 的 handleFieldChange 函数新增对 timeout. 开头字段的处理逻辑
- 支持正确处理 timeout.default 和 timeout.short 嵌套字段的更新
- 确保超时配置能正确保存到 formData 状态中

feat: 系统设置页面添加 AI 超时配置界面
- Settings.tsx 添加超时配置表单，支持配置默认超时（长时间任务）和快速超时（快速分析）
- LLMSettings 接口新增 timeout 字段 { default?: number; short?: number }
- 用户可在系统设置中自定义 AI 请求超时时间（秒为单位，自动转换为毫秒）
- 支持分别配置长时间任务（默认 180 秒）和快速分析任务（默认 30 秒）的超时

feat: 统一 AI 服务超时配置管理
- 创建 server/utils/aiTimeout.ts 工具模块，统一管理所有 AI 调用的超时时间
- 新增环境变量 AI_REQUEST_TIMEOUT（默认 180 秒）和 AI_SHORT_TIMEOUT（默认 30 秒）
- 提供 createAIAbortController 和 formatTimeoutError 工具函数
- 支持优先级：用户设置 > 环境变量 > 默认值
- analysisService.ts 和 marketInsightService.ts 改用统一的超时配置

fix: 修复深度阅读文章转需求文档超时问题
- 将 AI 服务超时时间从 60 秒增加到 180 秒（3 分钟），适应深度阅读文章转需求的场景
- max_tokens 改为从系统设置中的模型配置读取，支持不同模型的最大 token 限制
- 优化超时错误提示，建议用户缩短文章内容或稍后重试
- 根本原因：深度阅读的文章内容较长，AI 分析和生成需求文档需要更多时间

feat: llmConfigManager 打印超时配置信息
- updateConfig 方法新增超时配置日志输出
- 显示默认超时和快速超时的具体秒数
- 未配置时提示"使用环境变量或默认值"

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
- fix: 修复 Login.tsx JSX 结构错误，清理重复代码块，恢复正确的 JSX 嵌套层级
- fix: 修复 Prisma 迁移外键重复错误，添加数据库重置和迁移管理脚本
- chore: package.json 新增数据库管理命令（db:reset、db:migrate、db:generate）
- chore: 创建 scripts/fix-migration.sh 脚本，提供开发和生产环境的迁移修复方案

## 2026-03-19
- fix: scripts/init-openclaw.sh 全面加强错误处理和健壮性：所有 patch 操作增加文件存在性检查、错误捕获和友好提示；gateway-cli/Prober/provenance/runtime 四大 patch 全部增加 try-catch 和退出码检查；wecom 插件安装增加每步错误处理和依赖链接计数；所有 Node.js 脚本失败时通过 || { echo "错误"; exit 1; } 阻止容器启动，确保问题及时暴露

## 2026-03-19
- fix: scripts/init-openclaw.sh 彻底修复 "Plugin runtime module missing createPluginRuntime export"：根因是 setup-wizard-helpers 打包时遗漏了 createPluginRuntime 的导出；方案：patch 该文件末尾 export 语句追加 createPluginRuntime，再用 ESM re-export 创建 runtime 桥接文件；验证：企业微信消息处理成功，finish=true，无任何错误
- fix: scripts/init-openclaw.sh runtime 桥接文件改为动态导入整个模块并查找 createPluginRuntime（支持混淆后的导出名），修复打包混淆后命名导出无法直接 re-export 的问题
- fix: scripts/init-openclaw.sh runtime 桥接文件改为 ESM 格式（export），修复 CommonJS require() 无法加载 ESM 模块导致的 "Plugin runtime module missing createPluginRuntime export" 错误
- fix: scripts/init-openclaw.sh 移除有问题的 resolveCreatePluginRuntime patch（方案2），该 patch 会破坏 ESM 模块结构导致 ParseError: 'import' and 'export' may only appear at the top level；只保留 runtime 桥接文件创建逻辑（方案1）已足够解决问题

## 2026-03-19
- fix: scripts/init-openclaw.sh patch @homebridge/ciao Prober.cancel()，将 promiseReject 改为 promiseResolve（静默取消），从根源消除 "CIAO PROBING CANCELLED" unhandled rejection，彻底解决容器崩溃重启问题
- fix: scripts/init-openclaw.sh 移除 gateway-cli patch 的 break，确保所有 gateway-cli-*.js 文件都被 patch，防止重启后轮换使用未 patch 的文件
- fix: docker-compose.yml 添加 OPENCLAW_GATEWAY_DISABLE_BONJOUR=true 环境变量，尝试禁用 Docker 容器内的 Bonjour (mDNS) 服务
- fix: scripts/init-openclaw.sh 清理无效的 gateway.bonjour 和 gateway.services 配置键，OpenClaw 不支持这些配置项
- fix: .openclaw/openclaw.json 移除无效的 gateway.services.bonjour 配置，改为通过环境变量控制
- fix: init-openclaw.sh 自动禁用 gateway.bonjour，消除 Docker 环境下 "CIAO PROBING CANCELLED" 警告（mDNS 服务发现在容器内无法正常工作）
- fix: init-openclaw.sh 采用双重修复策略：1) 创建 CommonJS 格式的 runtime 桥接文件；2) patch resolveCreatePluginRuntime 函数，在 runtime 加载失败时直接 fallback 到当前文件的 createPluginRuntime，彻底解决 "Plugin runtime module missing createPluginRuntime export" 和 "Unable to resolve plugin runtime module" 错误
- fix: init-openclaw.sh patch 逻辑改为递归搜索所有 dist 文件（包括 plugin-sdk/ 子目录），使用正则替换兼容不同缩进格式（空格/tab），彻底覆盖所有 warnAboutUntrackedLoadedPlugins 函数，消除 provenance 警告刷屏问题
- docs: 更新 init-openclaw.sh 注释，说明各修复问题在 Windows/Linux 平台的差异和触发条件
- fix: init-openclaw.sh 新增 patch 逻辑，在所有相关 dist 文件的 warnAboutUntrackedLoadedPlugins 函数里加 globalThis Set 去重，彻底消除 "loaded without install/load-path provenance" 每条消息都刷屏的问题；根因是该函数无任何去重机制，每次消息处理触发 loadOpenClawPlugins 时都重复打印
- fix: init-openclaw.sh runtime 桥接文件改为每次启动检查内容是否过期（setup-wizard-helpers hash 变化时重建），解决消息处理时 "Unable to resolve plugin runtime module" 反复报错的问题
- fix: init-openclaw.sh 彻底修复 "Unable to resolve plugin runtime module" 错误，根因为 openclaw resolvePluginRuntimeModulePath() 期望 /app/dist/plugins/runtime/index.js 存在，改为在该路径创建 re-export 文件指向 setup-wizard-helpers-*.js，替代旧的错误修复方案（patch helpers + 写插件目录 runtime）
- fix: init-openclaw.sh 新增 wecom 插件自动安装逻辑，容器重建后 named volume 为空时自动补装，解决 "Unable to resolve plugin runtime module" 错误
- fix: init-openclaw.sh 每次启动将 wecom 插件 node_modules 软链接到 /app/node_modules，解决 openclaw 工作目录 /app 下 Node.js 模块解析找不到 @wecom/aibot-node-sdk 的问题
- fix: .openclaw/openclaw.json 及 init-openclaw.sh 默认配置/更新逻辑中加入 plugins.allow，消除 wecom 插件 "loaded without install/load-path provenance" 警告
- fix: init-openclaw.sh 新增 /app/node_modules/openclaw 自引用软链接，解决插件 ESM 入口 import 'openclaw/plugin-sdk' 无法解析导致 "Unable to resolve plugin runtime module" 的根本原因

## 2026-03-18
- fix: docker-compose.yml 新增 openclaw-extensions named volume，解决 Windows Docker Desktop bind mount 下 openclaw 安装插件时跨文件系统 rename() 报 EACCES 权限错误的问题
- fix: init-openclaw.sh 启动前补装 google-auth-library，解决 openclaw channels add 报 ERR_MODULE_NOT_FOUND 问题；docker-compose 新增 openclaw-node-modules named volume 持久化 node_modules 避免重启重装

## 2026-03-18
- fix: 注册接口 department 字段存储修复，auth 路由和 authService.createUser 改为写入独立的 department 字段，不再错误映射到 project
- feat: 小龙虾导航权限分流，管理员点击跳转 /openclaw 管理页，普通用户直接跳转 OpenClaw Web UI（/external?url=...），自动携带 gateway token 和用户会话
- fix: 修复普通用户点击小龙虾仍跳转 /openclaw 的问题，将小龙虾菜单项从 NavLink 改为普通 div，彻底阻断 React Router 自动路由跳转
- feat: 普通用户点击小龙虾改为通过 addTab 新建 tab 标签打开 OpenClaw Web UI
- feat: 用户管理新增部门字段，数据库 users 表添加 department 列，后端路由支持部门字段的增删改查，前端表格、创建/编辑表单同步展示部门字段
- fix: 用户管理页面错误提示优化，前端错误处理改为读取 error.response?.data?.error，正确显示后端返回的具体错误信息（如"该用户名已被使用"）
- fix: 后端用户路由 department 字段统一改为 project，创建/更新用户时字段名与前端保持一致
- style: 修复忘记密码页面"获取验证码"按钮 hover 时出现白色背景的问题，使用内联 style + CSS 变量覆盖 Ant Design 默认 hover 样式
- style: 优化倒计时状态按钮样式，去掉边框颜色，文字改为半透明紫色，视觉更协调
- fix: SMTP 认证失败（535）时不再静默忽略，改为抛出友好错误信息返回前端；sendEmailViaTLS 返回值改为 { success, error } 携带具体错误原因
- feat: 用户忘记密码功能，后端添加验证码发送和密码重置接口，前端添加忘记密码页面（三步流程：输入邮箱→验证验证码→设置新密码）
- feat: 用户注册功能，前端添加注册页面和入口，后端已有注册 API，前端添加 register 方法调用

## 2026-03-18
- fix: Playwright Test Runner 全屏失效问题，移除与固定 viewport 冲突的 --start-maximized 参数，改用 --window-size=1920,1080
- fix: 非 headless 模式下通过 CDP Browser.setWindowBounds 设置窗口最大化，确保浏览器真正全屏显示

## 2026-03-17
- fix: ExternalFrame 全屏时 iframe 位置偏移问题，从硬编码 left-[250px] top-[120px] 改为动态计算，监听全屏状态和侧边栏收缩状态自适应定位
- fix: init-openclaw.sh 路径从硬编码 /root/.openclaw 改为使用 $HOME 环境变量，修复官方版容器以 node 用户运行时 Permission denied 的问题
- fix: init-openclaw.sh 默认配置中 agents.defaults.workspace 也改为 $HOME 动态路径，兼容官方版和汉化版
- fix: docker-compose openclaw-gateway 改为 user:"0:0" 以 root 运行，HOME 和 volumes 统一改为 /root/.openclaw，解决挂载卷写入权限问题

## 2026-03-16
- fix: OpenClaw healthcheck 从 wget /health 改为 node fetch /healthz，与官方版一致，修复容器 unhealthy 问题
- refactor: OpenClaw 汉化版 docker-compose command 从字符串格式改为数组格式，通过 init-openclaw.sh 脚本启动，与官方版保持一致
- fix: OpenClaw 更新功能增加版本检测，pull 后判断是否有新镜像，已是最新则提示"无需更新"不重建容器，有新版本才 force-recreate 并提示更新成功
- feat: 新增 OpenClaw 更新功能，后端 /api/openclaw/update 路由支持拉取最新镜像并重新创建容器
- feat: 概览页操作按钮区域新增"更新"按钮，带 Popconfirm 二次确认
- fix: 编辑配置按钮改为仅在切换到"配置"Tab 时显示，其他 Tab 不再显示
- fix: Tabs 组件添加 activeKey/onChange 受控状态，修复 tab 切换追踪问题
- feat: OpenClaw 控制面板在 Tab 中打开时根据当前登录用户自动创建专属会话，URL 格式为 /chat?session=agent:main:{username}
- feat: Tab 标题显示当前用户名，便于多用户区分
- fix: 修复 init-openclaw.sh 中版本信息写死的问题，改为容器启动时动态获取 OpenClaw 实际版本号
- fix: 修复版本号提取带 "OpenClaw" 前缀的问题，使用 grep -oE 只提取纯数字版本号（如 2026.3.13）
- fix: 已有配置更新时同步更新 wizard.lastRunVersion 和 wizard.lastRunAt，避免版本不一致
- feat: 每次容器启动都检测当前版本，已有配置文件时自动比对并更新 meta 和 wizard 版本信息
- refactor: 版本获取逻辑提取到配置生成之前，首次生成和后续更新共用同一份版本检测结果
- refactor: 时间戳改为使用 `date -u` 动态生成当前 UTC 时间，不再写死固定日期

## 2026-03-12
- feat: 配置页面支持深层递归检测未知字段，嵌套在已知区块内的新增字段也能自动展示
- feat: 未知字段根据类型自适应渲染（布尔→Switch，对象→JSON编辑器，其他→Input）
- refactor: 使用 KNOWN_PATHS 白名单 + collectUnknownFields 递归函数替代顶层 key 过滤

- feat: 安全设置卡片新增 gateway.auth 认证模式和令牌展示（只读模式令牌脱敏显示）
- feat: 编辑模式支持认证模式选择和令牌密码输入框编辑
- fix: 修复嵌套在 gateway 内的新增字段（如 auth）无法被动态渲染捕获的问题

- feat: 元信息卡片合并展示 meta 和 wizard 信息（向导版本/命令/模式/运行时间）
- feat: 配置页面支持动态渲染未知配置区块，openclaw.json 新增字段自动展示
- feat: 编辑模式下未知配置区块使用 JSON 文本编辑器，支持直接修改

- style: 配置卡片按 openclaw.json 字段顺序排列（元信息→Agent→命令→网关→安全）
- style: 编辑配置按钮移至 Tabs 标签栏右侧（tabBarExtraContent）

- feat: OpenClaw 配置页面改为分区卡片布局（网关设置、安全设置、Agent 设置、命令设置、元信息）
- feat: 新增命令设置区块编辑（native/nativeSkills/ownerDisplay/restart）
- feat: 只读模式新增元信息展示（版本号、最后更新时间）
- style: 编辑模式使用 grid 双列/三列布局，提升空间利用率

- feat: 重构 OpenClaw 配置标签页为可编辑表单，支持查看/编辑模式切换
- feat: 配置编辑支持网关模式、绑定地址、允许来源、工作空间路径等字段
- feat: 配置编辑支持安全开关（Header Origin 回退、不安全认证、禁用设备认证）
- feat: 保存配置调用 PUT /api/openclaw/config 接口，保存后提示重启容器生效
- feat: 只读模式新增展示允许不安全认证和禁用设备认证字段

- fix: 重建 OpenClawManagement.tsx 完整页面（文件被清空后恢复）
- feat: OpenClaw 配置标签页完整编辑功能，支持查看/编辑模式切换、网关/安全/Agent/命令四区分组编辑
- feat: 保存配置后自动弹窗提示重启容器使配置生效
- feat: 配置只读模式展示安全开关、命令设置等完整字段信息
- feat: OpenClaw 配置标签页添加编辑功能，支持查看/编辑模式切换
- feat: 配置编辑支持网关模式、绑定地址、允许来源等字段修改
- feat: 配置编辑支持安全开关设置（Header Origin 回退、不安全认证、设备认证）
- feat: 配置编辑支持 Agent 工作空间路径和命令设置修改
- feat: 保存配置后自动提示是否重启容器使配置生效
- refactor: 清理未使用的导入（Form、Tooltip、Plus、Trash2、RotateCcw），优化代码
- style: 编辑模式使用分区布局（网关设置、安全设置、Agent 设置、命令设置），提升可读性

- style: 优化 Alert 组件整体布局，使按钮组与标题描述文本垂直居中对齐
- style: 为 Alert 组件添加 flex items-center 类名，实现内容垂直居中
- style: 优化按钮布局，实现垂直居中对齐和更大的按钮间距，提升视觉效果
- style: 使用 flex 容器和 Space large 间距，改善按钮组的视觉效果
- style: 优化 OpenClaw 管理页面按钮样式，调整按钮大小为 middle，增加内边距和图标间距
- style: 为不同功能的按钮添加主题色彩（蓝色用于控制面板，绿色用于 Canvas）
- style: 改进按钮 hover 效果，增强用户交互体验
- feat: 修改 OpenClawIcon 组件支持动态颜色，使用内联 SVG 替代图片引用
- fix: 解决自定义 SVG 图标在激活状态下颜色不变的问题，支持 currentColor 属性
- feat: 创建 OpenClawIcon 组件，使用 public/icon/openclaw.svg 自定义图标
- refactor: 修改 Layout.tsx 和 TabContext.tsx，使用 OpenClawIcon 替代 Bot 图标
- feat: 支持自定义 SVG 图标组件，扩展 NavigationItem 接口类型定义
- style: 统一"小龙虾"菜单项和 Tab 标签的图标显示，使用专属的 OpenClaw 图标
- fix: 添加 /openclaw 路由配置到 TabContext，确保点击左侧菜单"小龙虾"能正确创建 Tab
- feat: 导入 Workflow 图标，为 OpenClaw 管理页面提供合适的图标显示
- fix: 移除前端硬编码的 OpenClaw Gateway 令牌，改为从后端 API 动态获取
- feat: 添加 /api/openclaw/token 接口，从环境变量中读取 OPENCLAW_GATEWAY_TOKEN
- feat: 在前端添加 fetchGatewayToken 函数，页面加载时自动获取令牌
- refactor: 优化令牌获取逻辑，支持环境变量配置，提高安全性和灵活性

## 2026-03-12
- fix: 修复 Tab 路径比较问题，支持包含查询参数的路径匹配
- fix: 路由监听器现在正确比较完整路径（pathname + search），而不仅仅是 pathname
- refactor: 分离路径处理逻辑，getRouteConfig 只接收路径部分，tab.path 存储完整路径
- fix: 修复外部页面（/external?url=...）无法正确创建和激活 Tab 的问题
- feat: 使用 OpenClaw URL hash 参数传递令牌（#token=xxx），实现令牌自动保留
- refactor: 简化令牌持久化机制，移除复杂的 postMessage 通信，改用 URL hash 方式
- feat: 添加 getOpenClawUrlWithToken 函数，自动在 URL 中附加令牌参数
- fix: 解决刷新页面后令牌丢失问题，OpenClaw 会自动从 URL hash 中读取并保存令牌
- refactor: 简化后端代理脚本，只保留 WebSocket 重定向功能，移除令牌同步逻辑
- refactor: 简化 ExternalFrame 组件，移除令牌消息监听器，使用更简单的 URL 方案

## 2026-03-12
- fix: 修复 OpenClaw Gateway 控制面板无法在 Tab 中打开的问题
- fix: 规范化路径处理，空字符串路径转换为 '/'，确保后端代理正确处理根路径
- refactor: 优化 openInTab 函数，添加路径规范化逻辑（空字符串 → '/'，自动添加前导斜杠）
- fix: 修改 OpenClaw 控制面板按钮，传递 '/' 而不是空字符串 ''，避免路由解析问题

## 2026-03-12
- fix: 移除 iframe sandbox 属性限制，允许完整的跨域通信和 localStorage 访问
- refactor: 优化令牌持久化脚本，支持多个可能的令牌键名（openclaw_gateway_token, gatewayToken, token, auth_token）
- feat: 添加定期同步机制，每5秒自动同步令牌到父窗口（备用方案）
- fix: 延迟令牌恢复和页面刷新，确保令牌正确保存
- feat: 实现 OpenClaw 网关令牌持久化功能，刷新后自动恢复令牌
- feat: 在后端代理注入脚本，监听 localStorage 变化并通过 postMessage 同步令牌到父窗口
- feat: 在 ExternalFrame 组件添加消息监听器，保存和恢复 OpenClaw 令牌
- feat: 使用 postMessage API 实现 iframe 和父窗口之间的令牌同步
- refactor: 改回使用后端代理方式访问 OpenClaw（/api/openclaw-proxy）
- fix: 通过后端代理移除 CSP 响应头，解决 frame-ancestors 'none' 问题
- refactor: 改回使用 HTTP 方式访问 OpenClaw（http://172.19.1.111:18789）
- refactor: 修改前端代码使用 HTTP 端口 18789 直接访问 OpenClaw Gateway
- fix: 修复 Nginx 配置冲突，移除重复的 443 端口监听配置
- fix: 重启 Nginx 容器以应用 proxy_hide_header 配置，移除 CSP 和 X-Frame-Options 响应头
- refactor: 移除 OpenClawManagement.tsx 中未使用的 getServerUrl 函数
- fix: 移除无效的 allowIframeEmbedding 配置项（OpenClaw 不支持）
- fix: 只依赖 Nginx proxy_hide_header 解决 CSP frame-ancestors 问题
- fix: 在 Nginx 配置中添加 proxy_hide_header 移除 CSP 和 X-Frame-Options 响应头
- refactor: 改用 Nginx HTTPS 代理访问 OpenClaw，解决设备标识认证问题
- fix: 修改前端代码直接使用 https://172.19.1.111 访问 OpenClaw（通过 Nginx 443 端口）
- fix: 在 OpenClaw 配置中添加 allowInsecureAuth: true，允许通过 HTTP 代理访问
- fix: 解决"control ui requires device identity"错误，支持非 HTTPS 环境
- feat: 添加 WebSocket URL 重定向支持，注入脚本将 WebSocket 连接重定向到 OpenClaw 端口 18789
- fix: 解决 WebSocket 无法通过代理连接的问题，直接连接到 OpenClaw 服务器
- feat: 在 HTML 中注入 WebSocket 拦截脚本，自动修改 ws:// URL
- fix: 修复 iframe 覆盖左侧菜单的问题，添加 left-[250px] 避开侧边栏
- fix: 优化 ExternalFrame 布局，使用 fixed 定位和正确的边界值
- fix: 优化 ExternalFrame 布局，使用 absolute 定位和负边距抵消父容器 padding
- style: 使用 -mx-6 -mt-6 抵消 Layout 的 pl-6 pr-6 pt-6，让 iframe 完全填充
- fix: 修复 ExternalFrame 组件高度显示不完整问题
- style: 使用 fixed 定位和 top-[120px] 确保 iframe 占满可用空间
- fix: 恢复 iframe 的 allow-same-origin 属性，允许 OpenClaw 访问 localStorage
- fix: 解决 SecurityError: Failed to read 'localStorage' 错误
- note: allow-same-origin 对于信任的内部服务（OpenClaw）是安全的
- fix: 修复静态资源路径解析问题，在 HTML 中注入 base 标签
- feat: 代理路由自动为 HTML 响应添加 <base href="/api/openclaw-proxy/"> 标签
- fix: 确保 OpenClaw 的相对路径资源（CSS/JS）正确解析到代理路径
- fix: 修复管理 API 被代理的问题，使用独立的代理路径 /api/openclaw-proxy
- refactor: 分离管理 API 和代理功能到不同的路径，避免路由冲突
- fix: 管理 API 使用 /api/openclaw（需要认证），代理使用 /api/openclaw-proxy（不需要认证）
- fix: 修复静态资源 401 错误，调整路由注册策略
- refactor: 将管理 API 路由单独注册（需要认证），代理路由作为兜底（不需要认证）
- fix: 修改前端代理路径，从 /api/openclaw/proxy 改为 /api/openclaw
- refactor: 优化路由匹配逻辑，确保管理 API 优先匹配，其他请求（包括静态资源）被代理
- refactor: 重构 OpenClaw 路由，分离代理路由和管理路由为两个独立的函数
- feat: 创建 createOpenClawProxyRoute 函数，专门处理不需要认证的代理请求
- fix: 修复路由注册顺序问题，确保代理路由在认证中间件之前注册
- fix: 使用类型断言 (as any) 解决 req.params[0] 的 TypeScript 类型错误
- fix: 删除重复的旧代理路由代码，避免冲突
- fix: 修复代理路由 401 认证错误，将 /api/openclaw/proxy 路由设为公开访问（不需要认证）
- refactor: 调整路由注册顺序，代理路由在认证中间件之前注册，避免 iframe 请求被拦截
- fix: 修复 iframe sandbox 安全警告，移除 allow-same-origin 属性，只保留必要的权限
- fix: 修复 OpenClaw 代理路由的 TypeScript 类型错误，正确访问 Express params[0] 通配符参数
- fix: 简化代理实现，移除不必要的 headers 复制逻辑，只保留必要的 Content-Type 和移除 CSP 限制
- fix: 修复 Spin 组件警告，为所有 Spin 组件添加 tip 属性和嵌套的 div 容器（min-h-[200px]）
- fix: 移除未使用的导入和变量（__dirname, __filename, NGINX_CONTAINER）
- refactor: 优化代理路由实现，添加查询字符串支持和更好的日志记录

## 2026-03-11
- fix: 修复 TypeScript 类型错误，正确访问 Express params 和处理响应头
- fix: 修复 Spin 组件警告，使用嵌套模式显示加载提示
- feat: 添加后端代理路由 /api/openclaw/proxy/*，绕过 OpenClaw 的 CSP 限制
- fix: 在代理中移除 CSP 和 X-Frame-Options 响应头，允许 iframe 嵌入
- feat: 在 ExternalFrame 错误提示中添加"在新窗口打开"按钮
- fix: 修改 OpenClaw 控制面板 URL 使用当前服务器地址（自动获取）而不是 localhost
- feat: 添加 getServerUrl 函数自动获取当前访问的服务器地址和协议
- fix: 在 TabContext 中添加 /external 路由的特殊处理，防止自动创建 Tab
- fix: 修复 addTab 函数未导航到新 Tab 的问题，添加 navigate 调用
- feat: 添加在当前页面 Tab 中打开 OpenClaw 控制面板的功能
- feat: 创建 ExternalFrame 组件，支持在 iframe 中显示外部 URL
- feat: 为快速访问按钮添加两种打开方式：Tab 内打开和新窗口打开
- feat: 添加 /external 路由，支持通过 URL 参数加载外部页面
- fix: 修复 OpenClaw 管理页面 401 认证错误，添加 Authorization header 到所有 API 请求
- feat: 创建 authFetch 辅助函数，统一处理带认证的请求
- feat: 重构 OpenClaw 管理功能以支持 Docker 容器部署方式
- feat: 添加 Docker Compose 命令支持（启动、停止、重启容器）
- feat: 添加容器状态监控和日志查看功能
- feat: 显示容器运行状态、部署方式和详细信息
- fix: 改进错误处理和用户提示，提供更友好的交互体验
- fix: 修复 OpenClaw 配置读取错误，添加可选链操作符和默认值处理
- fix: 改进错误处理，当配置文件不存在时返回默认配置而不是错误
- fix: 前端添加更完善的错误处理和默认状态，避免页面崩溃
- feat: 集成 OpenClaw Gateway 管理功能，在左侧菜单添加"小龙虾"入口
- feat: 创建 OpenClawManagement 页面，提供服务状态监控、启停控制和配置管理
- feat: 添加 OpenClaw 后端 API 路由 (server/routes/openclaw.ts)，支持状态查询、服务控制和配置更新
- feat: 在前端路由中注册 OpenClaw 管理页面 (/openclaw)
- feat: 在 Layout 组件中添加 Workflow 图标和"小龙虾"菜单项
- fix: 移除 certs 目录的只读挂载限制，允许初始化脚本在容器内自动生成 SSL 证书
- refactor: 简化 OpenClaw 部署架构，移除独立的证书初始化服务，将证书生成集成到主初始化脚本
- refactor: 将 SSL 证书生成功能集成到 scripts/init-openclaw.sh，实现配置和证书的统一初始化
- feat: 添加 OpenClaw SSL 证书自动初始化功能，通过独立的 Alpine 容器生成自签名证书
- feat: 创建证书初始化脚本 (scripts/init-openclaw-certs.sh)，支持自动生成 SSL 证书和私钥
- refactor: 简化 OpenClaw 初始化脚本，移除证书生成逻辑，专注于配置文件管理
- refactor: 添加服务依赖关系，确保证书初始化完成后再启动 OpenClaw Gateway
- fix: 解决端口冲突问题，将 Nginx 代理端口从 18789 改为 18790，避免与 OpenClaw Gateway 端口冲突
- fix: 修正 Nginx 代理配置，将监听端口从 443 改为 18789 以正确代理 OpenClaw Gateway
- refactor: 调整 Docker Compose 中 Nginx 服务配置，使用完整的 nginx.conf 并正确挂载 SSL 证书
- refactor: 优化 OpenClaw 配置方式，采用混合方案（条件挂载+初始化脚本），支持自定义配置和开箱即用
- feat: 创建 OpenClaw 配置文件模板 (.openclaw/openclaw.json.example) 供用户参考
- refactor: 改进初始化脚本，仅在配置文件不存在时生成默认配置，避免覆盖用户自定义配置
- fix: 清理 .env 文件中无效的 OpenClaw 配置项，移除硬编码的 Windows 路径，统一使用相对路径
- fix: 修复 Docker Compose OpenClaw 服务依赖问题，添加正确的 profile 使用说明
- fix: 修复需求文档分片合并在 length 截断后丢失尾部章节（8.交付计划与优先级/9.测试范围与回归建议）的问题
- feat: 增加尾部章节完整性兜底，合并完成后自动检测并仅补齐缺失章节，避免重复改写前文
- refactor: 增强截断续写提示词，在 merge/single 场景强制保持章节连续性并优先补全 8/9 章节
- refactor: 需求分析步骤二布局：空状态与生成中 AIThinking 在中间区域垂直居中；生成进度条移至卡片底部并与底栏样式融合
- fix: 需求分析单次直通（不分片）时服务端补充 generating/done 进度事件，前端区分分片与单次文案及三步骤状态，避免误显示「等待合并」与进度条长期停在预处理阶段
- refactor: 优化 MultiFileUpload 底部提示文案，合并上传规则/ZIP 解析/Axure 合并与超长分片说明，减少重复并提升可读性
- refactor: 将 MultiFileUpload 底部提示压缩为 4 句简洁文案，保留上传限制、ZIP 解析、Axure 合并与分片建议
- feat: MultiFileUpload 文件列表支持文件名悬停显示完整名称，解决超长名称被截断后不可读问题
- fix: 修复需求分析流式读取在 keep-alive 场景下等待连接关闭导致卡在 52% 的问题，收到 result 终态后立即返回并补充尾缓冲解析
- fix: 前端流式解析在收到 result 时兜底派发 done 进度，避免阶段停留在 generating 导致第 3 步不完成
- fix: 需求分析单次直通新增 finalizing 阶段映射（第3步处理中）并在成功回调统一切换 done，避免第2步直接跳完成
- fix: 流式 progress 的 done 阶段前端映射为 finalizing，并在成功回调延迟切换 done，确保第3阶段有可见过渡
- feat: 需求分析第3阶段最短展示时长改为可配置（VITE_REQUIREMENT_FINALIZING_MIN_MS，自动夹紧 400~800ms，默认 500ms）
- feat(openclaw): 子角色交付物引入大文件混合模式，HTML原型/长代码直接write落盘避免Gateway超时截断，JSON标记WRITTEN_TO_DISK由Main验证
- fix(openclaw): 大文件模式write路径改为绝对路径(/root/.openclaw/workspace-main/deliverables/)，解决子角色独立workspace导致文件写入错误位置、Main无法访问和预览链接失效的问题
- chore(openclaw): 删除workspace-main/memory/archive/下2个已归档历史文档（规则已合并至AGENTS.md和TASK_CONTRACT.md），清理空目录