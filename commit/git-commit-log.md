# Git 提交日志

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