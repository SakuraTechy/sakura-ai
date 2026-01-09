# Sakura AI: AI驱动的自动化测试平台

一个开源的企业级测试平台，核心功能包括**AI测试用例生成**和**UI自动化测试执行**。

**项目地址**: https://github.com/Sakura AI/Sakura AI
**开源协议**: GPL-3.0

---

## 核心功能

### 一、AI测试用例生成

从Axure原型自动生成测试用例，10分钟完成传统2-3天的工作。

**效率对比**：

| 对比项 | 传统手写 | Sakura AI |
|--------|---------|----------|
| 100个用例耗时 | 2-3天 | 15分钟 |
| 人力成本 | 1人×2-3天 | 1人×15分钟 |
| 质量评分 | 70-85分 | 85-95分 |
| 覆盖率 | 60-75% | 85-95% |

**工作流程**：

```
上传Axure原型 → AI生成需求文档 → 人工审核(5分钟) → AI批量生成用例 → 保存到用例库
```

**功能特点**：

1. **支持Axure原型解析**
   - 自动识别页面结构和交互逻辑
   - 提取功能需求、业务规则、UI文案
   - 支持HTML格式，文件最大50MB

2. **智能批次生成**
   - 自动拆分测试批次（每批8-15个功能点）
   - 逐批次生成，实时显示进度
   - 质量评分（0-100分），自动评估用例质量

3. **RAG知识库增强**（可选）
   - 结合Qdrant向量数据库存储测试知识
   - 生成时自动检索相关业务规则、测试模式、易错点
   - 质量提升15-25%，覆盖率提升15-55%

**实际案例**：

```
输入：电商系统Axure原型（23页，156个交互）
处理时间：10分钟
输出：87个测试用例
  - 用户登录注册：12个
  - 商品浏览搜索：18个
  - 购物车管理：16个
  - 订单支付：25个
  - UI/文案验证：16个
平均质量评分：91/100
```

**生成的用例格式**（JSON）：

```json
{
  "name": "测试用户登录-正常流程",
  "priority": "high",
  "precondition": "用户已注册",
  "steps": [
    {
      "action": "navigate",
      "params": {"url": "http://test.example.com/login"},
      "description": "导航到登录页"
    },
    {
      "action": "fill",
      "params": {"selector": "#username", "value": "admin"},
      "description": "输入用户名"
    },
    {
      "action": "fill",
      "params": {"selector": "#password", "value": "admin123"},
      "description": "输入密码"
    },
    {
      "action": "click",
      "params": {"selector": "#login-btn"},
      "description": "点击登录按钮"
    },
    {
      "action": "expect",
      "params": {
        "selector": ".success-msg",
        "condition": "toBeVisible",
        "value": "登录成功"
      },
      "description": "验证登录成功"
    }
  ],
  "tags": ["登录", "认证", "核心流程"]
}
```

---

### 二、UI自动化测试执行

基于Playwright的浏览器自动化，零代码执行测试用例。

**技术架构**：

```
前端(React) → 后端(Node.js + Express) → Playwright → 被测应用
     |              |                        |
  用例管理    测试执行引擎          浏览器自动化
     |              |                        |
  实时监控    WebSocket推送            自动截图
```

**核心特性**：

1. **多浏览器支持**
   - Chromium / Firefox / WebKit
   - 可配置无头模式或可见模式（调试）

2. **并发执行**
   - 支持3-12个用例并发执行
   - 队列管理，自动调度
   - 失败重试机制（可配置0-2次）

3. **实时监控**
   - WebSocket推送执行状态
   - 实时显示进度（已完成/执行中/等待中/失败）
   - 浏览器实时视频流（执行中可见）

4. **自动化证据收集**
   - 每步自动截图
   - 失败时额外错误截图
   - 完整的执行日志
   - 支持批量下载证据

**支持的操作类型**：

| 操作 | 说明 | 参数 |
|------|------|------|
| navigate | 导航到URL | url |
| click | 点击元素 | selector |
| fill | 填充表单 | selector, value |
| select | 选择下拉选项 | selector, value |
| hover | 悬停元素 | selector |
| wait | 等待时间 | timeout |
| screenshot | 截图 | filename(可选) |
| expect | 验证断言 | selector, condition, value |

**断言条件**：

- toBeVisible: 元素可见
- toHaveText: 包含文本
- toHaveValue: 输入框值
- toBeChecked: 复选框选中
- toHaveURL: URL匹配

**执行示例**：

```
测试名称: 测试用户登录-正常流程
执行状态: 运行中
进度: 3/5 (60%)
已通过: 3步
已失败: 0步
执行时间: 00:01:23

执行日志:
[14:30:15] 开始执行测试...
[14:30:16] 步骤1: 导航到登录页 - 成功 (2.3秒)
[14:30:18] 步骤2: 输入用户名 - 成功 (0.5秒)
[14:30:19] 步骤3: 输入密码 - 成功 (0.4秒)
[14:30:21] 步骤4: 点击登录按钮 - 执行中...
```

**批量执行**：

创建测试套件，批量执行10-50个用例：

```
套件名称: 用户登录注册回归测试
总用例数: 15个
并发数: 4
失败策略: 继续执行

执行结果:
总体进度: 12/15 (80%)
已通过: 10个
已失败: 2个
执行中: 3个
总耗时: 00:08:45
```

---

## 真实案例

### 案例1: 某电商公司

**项目背景**：
- 电商平台重构
- Axure原型：45页，320个交互

**传统方式**：
- 测试工程师：2人
- 编写用例：4天
- 用例数量：180个
- 质量评分：平均78分

**使用Sakura AI**：
- 测试工程师：1人
- AI生成：25分钟
- 人工审核：2小时
- 用例数量：215个
- 质量评分：平均89分

**效果**：
- 时间节省：93%（4天 → 2.5小时）
- 成本节省：87%（2人×4天 → 1人×2.5小时）
- 质量提升：+14%（78分 → 89分）
- 覆盖率提升：+19%（180个 → 215个）

---

### 案例2: 某金融科技公司

**项目背景**：
- 在线贷款系统回归测试
- 测试用例：120个

**传统方式**：
- 手动执行：3人×2天
- 人力成本：6人天
- 执行效率：约20个用例/人/天

**使用Sakura AI**：
- 自动化执行：并发6个
- 总耗时：3小时
- 人工监控：1人

**效果**：
- 时间节省：92%（2天 → 3小时）
- 成本节省：96%（6人天 → 0.25人天）
- 测试证据：自动收集720张截图
- 可重复性：100%（完全自动化）

---

## 技术栈

**前端**：
- React 18 + TypeScript
- Tailwind CSS
- WebSocket实时通信

**后端**：
- Node.js + Express
- Prisma ORM + MySQL
- WebSocket服务

**AI引擎**：
- 支持OpenRouter / DeepSeek / Claude / Gemini
- RAG: Qdrant向量数据库 + Embedding API
- MCP协议标准化集成

**测试执行**：
- Playwright浏览器自动化
- 队列管理器（并发控制）
- 截图/日志收集

---

## 快速开始

### 安装

```bash
# 1. 克隆项目
git clone https://github.com/SakuraTechy/sakura-ai.git
cd Sakura AI

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑.env，配置数据库和AI模型

# 4. 初始化数据库
npx prisma migrate dev
npx prisma db seed

# 5. 启动服务
npm run dev
```

### 访问

- 前端地址: http://localhost:5173
- 后端地址: http://localhost:3001
- 默认账号: admin / admin123

### AI模型配置

编辑 `.env` 文件：

```bash
# 选项1: OpenRouter (支持GPT-4o / DeepSeek / Claude)
AI_MODEL_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-your-key
OPENROUTER_MODEL=openai/gpt-4o

# 选项2: DeepSeek (性价比推荐)
AI_MODEL_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-deepseek-key
DEEPSEEK_MODEL=deepseek-chat

# 选项3: Claude (长上下文)
AI_MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key
ANTHROPIC_MODEL=claude-sonnet-4-5

# 选项4: 本地Gemini (免费)
AI_MODEL_PROVIDER=gemini
GEMINI_API_KEY=your-local-key
GEMINI_BASE_URL=http://localhost:3000/v1
```

### 启用RAG知识库（可选）

```bash
# 1. 启动Qdrant
docker run -d -p 6333:6333 --name qdrant qdrant/qdrant

# 2. 配置Embedding API
# 在.env中添加:
QDRANT_URL=http://localhost:6333
EMBEDDING_PROVIDER=aliyun
ALIYUN_API_KEY=sk-your-aliyun-key

# 3. 重启服务
npm run dev
```

访问"知识管理"页面导入测试知识。

**知识库导入示例**（JSON格式）：

```json
[
  {
    "title": "用户名格式验证规则",
    "category": "业务规则",
    "content": "用户名必须满足:\n1. 长度: 4-20个字符\n2. 字符: 仅支持字母、数字、下划线\n3. 首字符: 必须是字母\n\n测试建议:\n- 正常值: test, user123\n- 边界值: abcd (4位)\n- 异常值: 123 (太短), test@123 (特殊字符)",
    "keywords": ["用户名", "验证", "格式"]
  },
  {
    "title": "登录功能完整测试模式",
    "category": "测试模式",
    "content": "登录功能测试应覆盖:\n\n正常场景:\n1. 正确用户名+密码\n2. 勾选记住我\n\n异常场景:\n1. 错误密码\n2. 空用户名/密码\n3. 连续失败3次锁定\n\n边界场景:\n1. 最短/最长用户名密码\n2. 特殊字符处理",
    "keywords": ["登录", "测试模式"]
  }
]
```

---

## 文档

- [安装指南](./INSTALLATION.md)
- [操作手册](./USER_MANUAL.md)
- [RAG配置](./RAG_SETUP.md)
- [故障排查](./TROUBLESHOOTING.md)

---

## 开源协议

本项目采用 GPL-3.0 License。

- 个人和企业可免费使用
- 可自由修改和分发
- 修改后的代码必须开源
- 如需闭源商用，请联系获取商业授权

---

## 联系方式

- 邮箱: support@Sakura AI.dev
- GitHub: https://github.com/Sakura AI/Sakura AI
- 问题反馈: https://github.com/Sakura AI/Sakura AI/issues

---

**如果Sakura AI对你有帮助，欢迎给项目一个Star支持！**

Made with ❤️ by Sakura AI Team
