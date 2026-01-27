# Git 提交日志

## 2026-01-19

### fix: 修复复选框操作提示词，强调文本匹配而非选择第一个

**修改文件：**
- `server/services/aiParser.ts`

**问题根源：**
虽然已经实现了文本关联机制（e15关联"记住密码"，e22关联"我已阅读并同意..."），但AI仍然选择错误的复选框（e15而不是e22）。

**修复内容：**
1. 系统提示词：从"忽略文本匹配" → "选择文本匹配的"
2. 用户提示词：从"选择第一个" → "选择文本最匹配的"
3. 示例更新：使用真实的多复选框场景，明确展示文本匹配的重要性

**提交命令：**
```bash
git add server/services/aiParser.ts
git commit -m "fix: 修复复选框提示词，系统和用户提示词统一强调文本匹配优先级"
```

---

### fix: 支持多复选框场景的文本关联识别

**修改文件：**
- `server/services/aiParser.ts`

**问题描述：**
页面存在多个复选框，checkbox容器自身没有文本，文本在兄弟节点，AI需要根据指令中的文本选择正确的复选框。

**解决方案：**
1. 为包含checkbox但无文本的元素查找兄弟节点
2. 将兄弟节点中的文本关联到checkbox容器
3. 使AI能够通过文本匹配选择正确的复选框

**提交命令：**
```bash
git add server/services/aiParser.ts
git commit -m "fix: 支持多复选框场景，通过文本关联实现精确匹配"
```

---

### fix: 修复复合操作拆分后菜单元素找不到的问题

**修改文件：**
- `server/services/aiParser.ts`

**问题描述：**
步骤"点击系统管理，选择许可证模块"被拆分后，第二个子步骤"选择许可证模块"立即执行，此时菜单元素还不可见。

**解决方案：**
1. 在子步骤描述中明确添加"等待菜单展开后"
2. AI提示词新增菜单和下拉选择的等待策略
3. AI会先生成等待命令，确保菜单元素可见后再执行选择

**提交命令：**
```bash
git add server/services/aiParser.ts
git commit -m "fix: 修复复合操作拆分后菜单元素找不到的问题，增加等待菜单展开的上下文"
```

---

### fix: 修复复合操作拆分包含预期结果和AI未生成等待命令的问题

**修改文件：**
- `server/services/aiParser.ts`

**问题描述：**
1. 拆分时把"-> 正常操作"这个预期结果也包含在了子步骤中
2. AI没有生成`browser_wait_for`命令
3. 等待指令"等待菜单展开后"太模糊

**解决方案：**
1. 先分离操作部分和预期结果部分，只拆分操作部分
2. 等待指令明确为"等待3秒"
3. AI提示词新增等待指令检测为最高优先级

**提交命令：**
```bash
git add server/services/aiParser.ts
git commit -m "fix: 修复复合操作拆分包含预期结果和AI未生成等待命令的问题"
```

---

### fix: 修复isAssertionStep错误判定包含预期结果的操作步骤为断言

**修改文件：**
- `server/services/aiParser.ts`

**问题描述：**
步骤"点击登录按钮 -> 正常登录成功，未上传许可证会有弹窗提示"被错误判定为断言步骤。

**解决方案：**
1. 使用正则分离操作和预期结果
2. 只对操作部分进行断言检测
3. 新增onlyWithoutArrow标记，某些模式只在没有箭头分隔符时才检查

**提交命令：**
```bash
git add server/services/aiParser.ts
git commit -m "fix: 修复isAssertionStep错误判定包含预期结果的操作步骤为断言"
```

---

### fix: 修复AI重新识别时ref无法转换为Playwright定位器的问题

**修改文件：**
- `server/services/testExecution.ts`

**问题描述：**
AI重新识别找到了正确的元素ref，但执行时失败：`无法找到元素: element_1_menuitem___`

**解决方案：**
1. AI重新识别时也构建`refToElementMap`映射表
2. 检查AI返回的ref是否在映射表中
3. 如果存在，转换为`role:name`格式（如`menuitem:系统管理`）

**提交命令：**
```bash
git add server/services/testExecution.ts
git commit -m "fix: 修复AI重新识别时ref无法转换为Playwright定位器的问题"
```

---

### fix: 修复第一次AI解析时未提取menuitem等元素类型导致快照为空的问题

**修改文件：**
- `server/services/testExecution.ts`

**问题描述：**
第一次AI解析时页面快照为空（0个元素），但AI重新识别时快照有3个menuitem元素。

**解决方案：**
新增9种可交互元素类型：menuitem、menu、menubar、listitem、option、tab、radio、searchbox、spinbutton

**提交命令：**
```bash
git add server/services/testExecution.ts
git commit -m "fix: 修复第一次AI解析时未提取menuitem等元素类型导致快照为空的问题"
```

---

### fix: 修复AI重新识别时转换的选择器格式包含多余空格的问题

**修改文件：**
- `server/services/testExecution.ts`

**问题描述：**
AI重新识别后转换ref为role:name格式时，name包含前后空格，导致选择器格式错误。

**解决方案：**
使用`trim()`去除name的前后空格，确保生成的选择器格式正确。

**提交命令：**
```bash
git add server/services/testExecution.ts
git commit -m "fix: 修复AI重新识别时转换的选择器格式包含多余空格的问题"
```

---

### fix: 修复AI重新识别时elementCounter作用域错误

**修改文件：**
- `server/services/testExecution.ts`

**问题描述：**
`formatWithMapping`函数内部定义了`elementCounter`，导致每次递归调用都重置为0，无法生成唯一的ref。

**解决方案：**
elementCounter必须在formatWithMapping函数外部定义，确保AI重新识别时生成的ref唯一且递增。

**提交命令：**
```bash
git add server/services/testExecution.ts
git commit -m "fix: 修复AI重新识别时elementCounter作用域错误"
```

---

### fix: 扩展正则表达式去除私有使用区Unicode字符（0xE000-0xF8FF）

**修改文件：**
- `server/services/testExecution.ts`

**问题描述：**
name包含私有使用区Unicode字符（0xE6EF），`trim()`方法无法去除，导致选择器格式错误。

**解决方案：**
扩展正则表达式，包含私有使用区字符（\uE000-\uF8FF）、C0/C1控制字符、BOM、零宽字符等。

**提交命令：**
```bash
git add server/services/testExecution.ts
git commit -m "fix: 扩展正则表达式去除私有使用区Unicode字符（0xE000-0xF8FF）"
```

---

### fix: 修复Playwright执行器不支持menuitem等role类型的选择器格式

**修改文件：**
- `server/services/playwrightTestRunner.ts`

**问题描述：**
AI解析生成的`menuitem:系统管理`格式选择器无法被Playwright执行器识别。

**解决方案：**
在click、fill、type三个操作中新增8种role类型支持：menuitem、menu、menubar、listitem、option、tab、searchbox、spinbutton

**提交命令：**
```bash
git add server/services/playwrightTestRunner.ts
git commit -m "fix: 修复Playwright执行器不支持menuitem等8种role类型的选择器格式"
```

---

### fix: 修复MCP客户端和Playwright Runner浏览器无法下载文件的问题

**修改文件：**
- `server/services/playwrightTestRunner.ts`
- `server/services/mcpClient.ts`

**问题描述：**
使用MCP客户端和Playwright Runner执行器启动的浏览器无法使用文件下载功能。

**解决方案：**
1. Playwright Test Runner：配置`acceptDownloads: true`和`downloadsPath: runDir`
2. MCP客户端：添加`PLAYWRIGHT_ACCEPT_DOWNLOADS`和`PLAYWRIGHT_DOWNLOADS_PATH`环境变量

**提交命令：**
```bash
git add server/services/playwrightTestRunner.ts server/services/mcpClient.ts
git commit -m "fix: 修复MCP客户端和Playwright Runner浏览器无法下载文件的问题"
```

---

## 2026-01-26

### fix: TestRunDetailModal 添加 Midscene 报告查看器支持

**修改文件：**
- `src/components/TestRunDetailModal.tsx`

**修改内容：**
1. 导入 `MidsceneReportViewer` 组件
2. 修改"实时画面"按钮点击逻辑，根据 `executionEngine` 判断切换到 `midscene` 或 `live` 标签页
3. 添加 `midscene` 标签页的渲染逻辑，与 `TestRunDetail.tsx` 保持一致

**提交命令：**
```bash
git add src/components/TestRunDetailModal.tsx
git commit -m "fix: TestRunDetailModal 添加 Midscene 报告查看器支持"
```

---

### fix: 修复执行引擎选择指南与父弹窗的事件冲突问题

**修改文件：**
- `src/components/ExecutionEngineGuide.tsx`

**问题描述：**
点击执行引擎选择指南（ExecutionEngineGuide）的关闭按钮时，父弹窗被关闭，子弹窗自己没有关闭。根本原因是父弹窗使用 Radix UI Dialog，子弹窗使用 antd Modal，两者的事件处理机制冲突。

**解决方案：**
1. 监听 `pointerdown` 事件（而非 `click`），Radix UI Dialog 使用 `pointerdown` 来检测外部点击
2. 检查多个 antd Modal 容器（`.ant-modal-wrap`、`.ant-modal-root`、`.ant-modal`）
3. 在捕获阶段拦截事件，使用 `e.stopPropagation()` 阻止事件冒泡到 Radix Dialog

**提交命令：**
```bash
git add src/components/ExecutionEngineGuide.tsx
git commit -m "fix: 修复执行引擎选择指南与父弹窗的事件冲突问题"
```

---

### fix: 修复执行引擎类型定义不一致导致的 TypeScript 错误

**修改文件：**
- `src/pages/FunctionalTestCases/index.tsx`
- `src/pages/TestPlanDetail.tsx`
- `src/pages/TestCases.tsx`
- `src/types/testPlan.ts`
- `src/pages/FunctionalTestCases/types.ts`

**问题描述：**
- 三个页面组件中的 `executionConfig` 状态定义缺少 `'midscene'` 类型
- `ExecutionConfig` 接口缺少 `assertionMatchMode` 字段
- `FunctionalTestCases/index.tsx` 导入了不存在的 `ExecutionStatus` 类型
- `FunctionalTestCases/types.ts` 中的 `ExecutionResult` 类型与全局类型不一致

**解决方案：**
1. 在三个页面组件中添加 `'midscene'` 执行引擎类型支持
2. 在 `ExecutionConfig` 接口中添加 `assertionMatchMode` 字段
3. 统一 `ExecutionResult` 类型定义，移除重复定义

**提交命令：**
```bash
git add src/pages/FunctionalTestCases/index.tsx src/pages/TestPlanDetail.tsx src/pages/TestCases.tsx src/types/testPlan.ts src/pages/FunctionalTestCases/types.ts
git commit -m "fix: 修复执行引擎类型定义不一致导致的 TypeScript 错误"
```

---

### feat: 测试计划执行详情页添加简洁/详细模式切换功能

**修改文件：**
- `src/components/TestPlanExecutionLogModal.tsx`

**功能描述：**
在测试计划执行详情弹窗（TestPlanExecutionLogModal）中添加简洁/详细模式切换，参考测试执行详情页（TestRunDetail）的实现。

**核心实现：**
1. 添加 `logFormat` 状态管理（默认简洁模式）
2. 使用 `useMemo` 根据 `logFormat` 动态生成表格列
3. 简洁模式只显示核心信息（6列），详细模式显示所有信息（13列）
4. 添加切换按钮UI，采用 Toggle 风格

**提交命令：**
```bash
git add src/components/TestPlanExecutionLogModal.tsx
git commit -m "feat: 测试计划执行详情页添加简洁/详细模式切换功能"
```

---

### fix: 最终修复ExecutionEngineGuide弹窗滚动和关闭功能

**修改文件：**
- `src/components/ExecutionEngineGuide.tsx`

**问题描述：**
弹窗内容过长需要滚动，该弹窗在父弹窗（使用 Radix Dialog）内打开，需要阻止父弹窗关闭，同时支持滚动和 ESC 键。

**解决方案：**
1. pointerdown 监听器：阻止父弹窗的外部点击检测
2. keydown 监听器：在 `window` 上监听，使用捕获阶段优先执行
3. 修复清理函数：使用 `window.removeEventListener` 而不是 `document`
4. 滚动处理：Modal body 设置 `overflowY: 'scroll'`，内部 div 添加 `onWheel` 阻止滚轮事件冒泡

**提交命令：**
```bash
git add src/components/ExecutionEngineGuide.tsx
git commit -m "fix: 最终修复ExecutionEngineGuide弹窗滚动和关闭功能"
```

---

### feat: 在TestRunDetailModal组件中添加日志格式切换功能

**修改文件：**
- `src/components/TestRunDetailModal.tsx`

**功能描述：**
在测试运行详情模态框（TestRunDetailModal）中添加简洁/详细日志格式切换，与 TestRunDetail 页面保持一致的交互体验。

**核心实现：**
1. 添加 `logFormat` 状态管理（默认简洁模式）
2. 导入 `filterLogLines` 工具函数
3. 在标签页导航栏右侧添加格式切换按钮（使用 `justify-between` 布局）
4. 应用日志过滤逻辑，过滤后的空日志不渲染

**提交命令：**
```bash
git add src/components/TestRunDetailModal.tsx
git commit -m "feat: 在TestRunDetailModal组件中添加日志格式切换功能"
```

---

### fix: 修复TestRunDetailModal中CollapsibleLogMessage默认折叠的问题

**修改文件：**
- `src/components/TestRunDetailModal.tsx`

**问题描述：**
`CollapsibleLogMessage` 组件默认是折叠状态（`isExpanded = false`），用户需要手动点击"展开"按钮才能看到完整日志内容。

**解决方案：**
将 `isExpanded` 初始状态从 `false` 改为 `true`，日志消息默认完全展开显示。

**提交命令：**
```bash
git add src/components/TestRunDetailModal.tsx
git commit -m "fix: 修复TestRunDetailModal中CollapsibleLogMessage默认折叠的问题"
```


## 2026-01-27

### refactor: 登录页版本号从 package.json 动态获取

**修改文件：**
- `src/pages/Login.tsx`

**修改内容：**
1. 导入 `package.json` 文件
2. 将硬编码的版本号 `v1.8.0` 替换为 `{packageJson.version}`
3. 移除未使用的 `ArrowRight` 导入

**提交命令：**
```bash
git add src/pages/Login.tsx
git commit -m "refactor: 登录页版本号从 package.json 动态获取"
```


### fix: 添加 vanta 库的 TypeScript 类型声明文件

**修改文件：**
- `src/types/vanta.d.ts` (新建)

**问题描述：**
Login.tsx 导入 `vanta/dist/vanta.net.min` 时 TypeScript 报错：无法找到模块声明文件，隐式拥有 any 类型。

**解决方案：**
创建 `src/types/vanta.d.ts` 类型声明文件，定义：
1. `VantaNetOptions` 接口：包含所有配置选项（el, THREE, mouseControls 等）
2. `VantaEffect` 接口：包含 destroy 方法
3. `NET` 函数的类型签名

**提交命令：**
```bash
git add src/types/vanta.d.ts
git commit -m "fix: 添加 vanta 库的 TypeScript 类型声明文件"
```
