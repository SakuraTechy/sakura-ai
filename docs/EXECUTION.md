# 🗣️ 自然语言执行 UI 自动化详解

无需编写代码，用自然语言描述即可执行浏览器自动化。

---

## 📖 功能概述

Sakura AI 的核心创新之一：**自然语言驱动的 UI 自动化执行**。

用户只需用自然语言描述测试步骤（如 "点击登录按钮"、"在用户名输入框输入 admin"），系统即可自动执行浏览器操作，无需编写任何代码。

---

## 🆚 与传统方式对比

### 传统 Selenium/Playwright 代码

```python
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

driver = webdriver.Chrome()
driver.get("https://example.com/login")

# 需要手动查找元素选择器
username = driver.find_element(By.XPATH, "//input[@id='username']")
username.send_keys("admin@test.com")

password = driver.find_element(By.XPATH, "//input[@id='password']")
password.send_keys("password123")

login_btn = driver.find_element(By.XPATH, "//button[@class='login-btn']")
login_btn.click()

# 等待页面加载
WebDriverWait(driver, 10).until(
    lambda d: d.find_element(By.CLASS_NAME, "welcome-message")
)
```

**痛点**：
- ❌ 需要编写大量代码
- ❌ 需要手动查找元素选择器
- ❌ 需要处理等待、超时、异常
- ❌ 维护成本高（选择器变化需修改代码）

### 录制回放工具（Selenium IDE / Katalon）

**操作**：
1. 启动录制模式
2. 手动点击浏览器操作
3. 停止录制
4. 回放录制的脚本

**痛点**：
- ❌ 录制的选择器极度脆弱（UI 变化即失效）
- ❌ 无法修改录制逻辑
- ❌ 无法处理动态数据
- ❌ 维护成本极高（每次 UI 改变都需重新录制）

### Sakura AI 自然语言执行

```
1. 导航到登录页面 https://example.com/login
2. 在用户名输入框输入 admin@test.com
3. 在密码输入框输入 password123
4. 点击登录按钮
5. 验证页面显示"欢迎回来"
```

**优势**：
- ✅ 无需编写代码，只需自然语言描述
- ✅ AI 自动识别元素（无需手动查找选择器）
- ✅ 自动处理等待、加载、超时
- ✅ 维护成本低（UI 变化 AI 自动适配）
- ✅ 非技术人员也能编写自动化测试

---

## 🔧 技术架构

### 三层转换机制

```
自然语言步骤
   ↓
AI 解析器（AITestParser）
   ↓
MCP 命令生成（MCPCommand）
   ↓
MCP 客户端（PlaywrightMcpClient）
   ↓
Playwright 浏览器自动化
   ↓
页面截图 & 状态更新
   ↓
WebSocket 实时推送
```

### 核心组件

| 组件 | 文件路径 | 功能 |
|------|---------|------|
| **AI 解析器** | `server/services/aiParser.ts` | 自然语言 → MCP 命令 |
| **MCP 客户端** | `server/services/mcpClient.ts` | MCP 命令 → Playwright 操作 |
| **测试执行器** | `server/services/testExecution.ts` | 编排整个执行流程 |
| **WebSocket** | `server/services/websocket.ts` | 实时状态推送 |

---

## 🔍 工作原理详解

### 示例：用户输入 "点击登录按钮"

#### 第 1 步：步骤拆分

**输入**：
```
1. 在账号输入框输入用户名 user123
2. 点击登录按钮
```

**AI 解析器处理**：
- 移除步骤编号（数字、中文符号）
- 拆分为独立步骤

**输出**：
```
步骤 1: "在账号输入框输入用户名 user123"
步骤 2: "点击登录按钮"
```

#### 第 2 步：AI 生成 MCP 命令

**输入**：自然语言步骤 + 页面快照（YAML 格式）

**页面快照示例**：
```yaml
elements:
  - ref: input-username-8a9f
    type: input
    label: "账号"
    placeholder: "请输入账号"
  - ref: btn-login-5c3d
    type: button
    text: "登录"
```

**AI 分析**：
- 识别动词："点击"
- 识别元素："登录按钮"
- 从快照中匹配对应的 ref：`btn-login-5c3d`

**输出 MCP 命令**：
```json
{
  "name": "browser_click",
  "arguments": {
    "element": "登录按钮",
    "ref": "btn-login-5c3d",
    "description": "点击登录按钮"
  }
}
```

#### 第 3 步：执行 MCP 命令

**MCP 客户端处理**：
```typescript
case 'browser_click':
  // 调用 MCP 工具
  await this.client.callTool({
    name: 'browser_click',
    arguments: { ref: 'btn-login-5c3d' }
  });

  // 刷新页面快照
  await this.refreshSnapshot();

  // 截图
  await this.takeScreenshot('step-2-click-login.png');
```

**Playwright 执行**：
- 定位到 `ref="btn-login-5c3d"` 的元素
- 执行点击操作
- 等待页面状态更新

#### 第 4 步：返回结果

```json
{
  "success": true,
  "message": "成功点击登录按钮",
  "screenshot": "step-2-click-login.png",
  "duration": 1234  // ms
}
```

**WebSocket 推送**：
```json
{
  "type": "test_update",
  "runId": "run-123",
  "data": {
    "status": "running",
    "currentStep": 2,
    "totalSteps": 5,
    "progress": 40,
    "lastMessage": "已完成点击登录按钮"
  }
}
```

---

## 📋 支持的操作类型

### 导航操作

**自然语言**：
```
导航到登录页面 https://example.com/login
```

**MCP 命令**：
```json
{
  "name": "browser_navigate",
  "arguments": {
    "url": "https://example.com/login"
  }
}
```

### 点击操作

**自然语言**：
```
点击登录按钮
点击"提交"按钮
点击页面上的"保存"链接
```

**MCP 命令**：
```json
{
  "name": "browser_click",
  "arguments": {
    "element": "登录按钮",
    "ref": "btn-login-xxx"
  }
}
```

### 输入操作

**自然语言**：
```
在用户名输入框输入 admin@test.com
在密码框输入 password123
```

**MCP 命令**：
```json
{
  "name": "browser_type",
  "arguments": {
    "element": "用户名输入框",
    "ref": "input-username-xxx",
    "text": "admin@test.com"
  }
}
```

### 验证操作

**自然语言**：
```
验证页面显示"欢迎回来"
验证登录按钮可见
```

**MCP 命令**：
```json
{
  "name": "browser_expect",
  "arguments": {
    "condition": "visible",
    "element": "欢迎回来",
    "ref": "text-welcome-xxx"
  }
}
```

### 等待操作

**自然语言**：
```
等待 2 秒
等待页面加载完成
```

**MCP 命令**：
```json
{
  "name": "browser_wait",
  "arguments": {
    "timeout": 2000
  }
}
```

### 截图操作

**自然语言**：
```
截图保存
对登录页面进行截图
```

**MCP 命令**：
```json
{
  "name": "browser_screenshot",
  "arguments": {
    "filename": "login-page.png"
  }
}
```

---

## 🎯 核心优势

### 1. 无需编写代码

| 传统方式 | Sakura AI |
|---------|---------|
| 需要学习 Selenium/Playwright API | 只需会写中文 |
| 需要查找元素选择器（XPath/CSS） | AI 自动识别元素 |
| 需要处理等待、异常、超时 | 自动处理 |
| 需要编写数百行代码 | 几句自然语言 |

### 2. AI 智能元素定位

**传统方式**：
```python
# 需要精确的选择器，UI 变化即失效
driver.find_element(By.XPATH, "//button[@id='submit-btn']")
```

**Sakura AI**：
```
点击提交按钮  # AI 自动匹配最相关的按钮
```

**AI 匹配策略**：
- ✅ 语义匹配（"提交"、"submit"、"确定"）
- ✅ 元素类型匹配（button、link）
- ✅ 位置匹配（页面底部的主操作按钮）
- ✅ 容错能力强（文案变化仍能识别）

### 3. 自动处理复杂逻辑

**Sakura AI 自动处理**：
- ✅ 页面加载等待
- ✅ 元素可见性等待
- ✅ 动态元素加载
- ✅ 页面跳转
- ✅ 异常重试
- ✅ 超时控制

### 4. 实时进度监控

**WebSocket 实时推送**：
- ✅ 当前执行步骤
- ✅ 执行进度百分比
- ✅ 步骤执行结果
- ✅ 实时截图
- ✅ 错误信息

---

## 🚀 使用指南

### 在 UI 中创建测试用例

```
测试用例管理 → 创建测试用例 → 添加步骤
```

**步骤编辑器**：
- 支持文本模式（自然语言）
- 支持表格模式（结构化）

**示例步骤**：
```
步骤 1: 导航到登录页面 https://example.com/login
步骤 2: 在用户名输入框输入 admin@test.com
步骤 3: 在密码输入框输入 password123
步骤 4: 点击登录按钮
步骤 5: 验证页面显示"欢迎回来"
```

### 执行测试用例

```
测试用例详情 → 点击"执行测试"按钮
```

**实时监控**：
- 查看当前执行步骤
- 查看实时截图
- 查看执行日志

### 查看执行结果

```
测试运行历史 → 选择运行记录 → 查看详情
```

**结果包含**：
- ✅ 通过/失败步骤统计
- ✅ 每个步骤的截图
- ✅ 详细执行日志
- ✅ 执行时长
- ✅ 错误信息（如果失败）

---

## 📊 完整工作流示例

### 场景：执行登录测试用例

```
1. 用户在 UI 点击"执行测试"按钮
   ↓
2. 前端发送 POST /api/test/execute { testCaseId: 42 }
   ↓
3. 后端 TestExecutionService.runTest(42) 启动
   ↓
4. 创建 TestRun 对象，初始化 MCP 客户端
   ↓
5. 从数据库获取测试用例步骤：
   [
     { action: "navigate", url: "https://app.test/login" },
     { action: "fill", selector: "用户名框", value: "admin@test.com" },
     { action: "fill", selector: "密码框", value: "password123" },
     { action: "click", selector: "登录按钮" },
     { action: "expect", condition: "visible", selector: "欢迎提示" }
   ]
   ↓
6. 对于每个步骤：
   a. AIParser.parseNextStep() 解析自然语言
   b. AI 调用 generateMCPCommand() 生成 MCP 命令
   c. MCPClient.executeMcpStep() 执行命令
   d. 获取页面快照和截图
   e. 通过 WebSocket 推送进度
   f. 记录执行日志
   ↓
7. 执行完成
   a. 统计通过/失败步骤
   b. 保存执行记录到数据库
   c. 推送最终结果
   ↓
8. 前端显示测试结果和截图
```

---

## 🎯 最佳实践

### 1. 自然语言描述要清晰

✅ **好的描述**：
```
在用户名输入框输入 admin@test.com
点击页面底部的"登录"按钮
验证页面显示"登录成功"提示
```

❌ **差的描述**：
```
输入用户名  # 不清楚输入什么值
点击按钮    # 不清楚点击哪个按钮
验证页面    # 不清楚验证什么
```

### 2. 合理使用等待

**不推荐**：
```
点击登录按钮
等待 5 秒  # 固定等待时间，浪费时间
验证登录成功
```

**推荐**：
```
点击登录按钮
等待页面加载完成  # AI 自动检测页面加载状态
验证登录成功
```

### 3. 详细的验证步骤

**不推荐**：
```
点击登录按钮
# 缺少验证步骤
```

**推荐**：
```
点击登录按钮
验证页面 URL 变为 https://app.test/dashboard
验证页面显示"欢迎回来，Admin"
验证页面显示用户头像
```

---

## 🐛 故障排除

### 元素定位失败

**症状**：提示 "无法找到元素"

**原因**：
1. 页面未加载完成
2. 元素描述不清晰
3. 元素实际不存在

**解决**：
```
# 1. 增加等待
等待页面加载完成
点击登录按钮

# 2. 更详细的描述
点击页面底部蓝色的"登录"按钮  # 更具体

# 3. 检查页面是否真的有该元素
```

### 执行超时

**症状**：步骤执行超过 10 分钟

**原因**：
1. 页面加载过慢
2. 元素一直未出现
3. 死循环

**解决**：
```bash
# 修改超时配置 (.env)
TEST_TIMEOUT=600000  # 10 分钟
```

### 截图失败

**症状**：执行记录中没有截图

**原因**：
1. 磁盘空间不足
2. 截图目录权限问题

**解决**：
```bash
# 检查磁盘空间
df -h

# 检查目录权限
ls -la artifacts/screenshots
```

---

## 📊 技术实现细节

### 核心服务

| 文件 | 功能 | 关键方法 |
|------|------|---------|
| `server/services/mcpClient.ts` | MCP 客户端 | `executeStep`, `executeMcpStepInternal` |
| `server/services/aiParser.ts` | AI 解析器 | `parseNextStep`, `generateMCPCommand` |
| `server/services/testExecution.ts` | 测试执行编排 | `runTest` |

### 数据结构

**TestStep 接口**：
```typescript
export interface TestStep {
  id: string;                    // 唯一标识
  action: TestAction;            // 操作类型
  selector?: string;             // 元素选择器
  url?: string;                  // 目标 URL
  value?: string;                // 输入值
  text?: string;                 // 输入文本
  condition?: ExpectCondition;   // 期望条件
  timeout?: number;              // 超时时间
  description: string;           // 自然语言描述
  order: number;                 // 执行顺序
}
```

**MCP 命令格式**：
```typescript
export interface MCPCommand {
  name: string;                  // MCP 工具名称
  arguments: Record<string, any>; // 工具参数
}
```

---

## 🔗 相关文档

- [AI 生成器详解](AI_GENERATOR.md) - AI 如何生成测试步骤
- [架构说明](ARCHITECTURE.md) - 完整技术架构
- [故障排除](TROUBLESHOOTING.md) - 常见问题解决

---

**返回**: [README](../README.md)
