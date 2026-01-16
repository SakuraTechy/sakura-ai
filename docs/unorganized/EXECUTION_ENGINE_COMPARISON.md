# UI自动化执行引擎对比与使用方案

## 📋 目录

- [执行引擎概述](#执行引擎概述)
- [架构对比](#架构对比)
- [性能对比](#性能对比)
- [使用指南](#使用指南)
- [最佳实践](#最佳实践)
- [故障排查](#故障排查)

---

## 执行引擎概述

Sakura AI 测试平台支持两种UI自动化执行引擎：

### 1. MCP客户端执行（AI驱动的闭环执行）

**核心特点：**
- 🤖 AI实时解析每个测试步骤
- 🔄 动态适应页面变化
- 📸 基于页面快照的智能决策
- 🎯 自然语言驱动

**工作流程：**
```
测试步骤 → 获取页面快照 → AI解析 → 生成MCP命令 → 执行 → 下一步
   ↑                                                        ↓
   └────────────────── 循环直到所有步骤完成 ──────────────────┘
```

### 2. Playwright Test Runner执行（原生API直接执行）

**核心特点：**
- ⚡ 原生Playwright API直接控制
- 🎬 支持trace和video录制
- 🚀 高性能确定性执行
- 🔧 多种元素定位策略

**工作流程：**
```
测试步骤 → 一次性解析 → 顺序执行 → 完成
                ↓
         （失败时才调用AI辅助）
```

---

## 架构对比

### 技术架构差异

| 维度 | MCP客户端 | Playwright Test Runner |
|------|-----------|----------------------|
| **通信协议** | Model Context Protocol | 原生Playwright API |
| **浏览器控制** | 通过MCP服务器间接控制 | 直接控制浏览器实例 |
| **AI调用** | 每步都调用（高频） | 按需调用（低频） |
| **步骤解析** | 运行时动态解析 | 启动时一次性解析 |
| **元素定位** | AI智能匹配 | 多策略定位+AI辅助 |

### 代码实现对比

#### MCP客户端执行流程

```typescript
// server/services/testExecution.ts - executeWithMcpClient()

while (remainingSteps?.trim()) {
  // 1. 获取页面快照（1-2秒）
  const snapshot = await this.mcpClient.getSnapshot();
  
  // 2. AI实时解析下一步（2-3秒）
  const aiResult = await this.aiParser.parseNextStep(
    remainingSteps, 
    snapshot, 
    runId
  );
  
  // 3. 执行MCP命令（0.5-1秒）
  await this.executeStepWithRetryAndFallback(
    aiResult.step, 
    runId, 
    stepIndex
  );
  
  // 4. 更新剩余步骤
  remainingSteps = aiResult.remaining;
}

// 总计每步：3.5-6秒
```

#### Playwright Test Runner执行流程

```typescript
// server/services/testExecution.ts - executeWithPlaywrightRunner()

// 1. 一次性解析所有步骤（<0.1秒）
const steps = this.parseTestSteps(testCase.steps);

// 2. 顺序执行
for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  
  // 3. 直接执行（0.3-0.8秒）
  const result = await this.playwrightRunner.executeStep(
    step, 
    runId, 
    i
  );
  
  // 4. 失败时才调用AI辅助（2-3秒）
  if (!result.success && needsAiParsing) {
    const aiSelector = await this.aiParser.matchElement(...);
    // 重试执行
  }
}

// 总计每步：0.3-0.8秒（正常）/ 2-3秒（失败重试）
```

---

## 性能对比

### 执行速度对比

| 测试场景 | MCP客户端 | Playwright Runner | 性能提升 |
|---------|-----------|------------------|---------|
| **10步简单测试** | 35-60秒 | 3-8秒 | **5-10倍** |
| **20步复杂测试** | 70-120秒 | 6-16秒 | **8-12倍** |
| **50步回归测试** | 175-300秒 | 15-40秒 | **10-15倍** |

### 资源消耗对比

| 资源类型 | MCP客户端 | Playwright Runner |
|---------|-----------|------------------|
| **AI API调用** | 每步1次（高频） | 失败时才调用（低频） |
| **内存占用** | 中等（MCP协议层） | 低（直接控制） |
| **CPU占用** | 中等 | 低 |
| **成本** | 高（大量API调用） | 低（按需调用） |

### 实际测试数据

```
测试用例：登录 → 搜索 → 筛选 → 导出（10步）

MCP客户端执行：
├─ 步骤1（导航）: 5.2秒
├─ 步骤2（输入）: 4.8秒
├─ 步骤3（点击）: 4.5秒
├─ 步骤4（等待）: 3.2秒
├─ 步骤5（输入）: 4.6秒
├─ 步骤6（点击）: 4.3秒
├─ 步骤7（选择）: 5.1秒
├─ 步骤8（点击）: 4.4秒
├─ 步骤9（验证）: 3.8秒
└─ 步骤10（点击）: 4.2秒
总计: 44.1秒

Playwright Runner执行：
├─ 步骤1（导航）: 1.2秒
├─ 步骤2（输入）: 0.4秒
├─ 步骤3（点击）: 0.3秒
├─ 步骤4（等待）: 1.0秒
├─ 步骤5（输入）: 0.4秒
├─ 步骤6（点击）: 0.3秒
├─ 步骤7（选择）: 0.5秒
├─ 步骤8（点击）: 0.3秒
├─ 步骤9（验证）: 0.6秒
└─ 步骤10（点击）: 0.3秒
总计: 5.3秒

性能提升: 8.3倍
```

---

## 使用指南

### 方式1：通过API指定执行引擎

```typescript
// 前端调用示例
import { testService } from '@/services/testService';

// 使用Playwright Test Runner执行
const runId = await testService.runTest(testCaseId, {
  environment: 'test',
  executionEngine: 'playwright',  // 指定执行引擎
  enableTrace: true,              // 启用trace录制
  enableVideo: true,              // 启用video录制
  userId: currentUser.id
});

// 使用MCP客户端执行
const runId = await testService.runTest(testCaseId, {
  environment: 'test',
  executionEngine: 'mcp',         // 指定执行引擎
  userId: currentUser.id
});
```

### 方式2：通过环境变量配置默认引擎

```bash
# .env 文件配置
DEFAULT_EXECUTION_ENGINE=playwright  # 或 mcp
ENABLE_TRACE=true                    # Playwright专用
ENABLE_VIDEO=true                    # Playwright专用
```

### 方式3：在测试用例中指定

```typescript
// 在测试用例元数据中指定
{
  "id": 123,
  "name": "登录测试",
  "executionEngine": "playwright",  // 优先级最高
  "steps": "...",
  "assertions": "..."
}
```

### 执行引擎选择优先级

```
测试用例配置 > API参数 > 环境变量 > 默认值(mcp)
```

---

## 最佳实践

### 场景1：新项目/探索性测试

**推荐：MCP客户端**

```typescript
// 适用场景
- 页面结构未知或频繁变化
- 使用自然语言描述测试步骤
- 快速验证测试思路
- 不关注执行速度

// 配置示例
{
  executionEngine: 'mcp',
  executionMode: 'exploratory'
}
```

**优势：**
- ✅ AI自动适应页面变化
- ✅ 无需编写选择器
- ✅ 自然语言驱动

**劣势：**
- ⚠️ 执行速度慢
- ⚠️ AI调用成本高

### 场景2：稳定项目/回归测试

**推荐：Playwright Test Runner**

```typescript
// 适用场景
- 页面结构稳定
- 需要快速执行
- CI/CD集成
- 大规模测试套件

// 配置示例
{
  executionEngine: 'playwright',
  enableTrace: true,
  enableVideo: true,
  executionMode: 'regression'
}
```

**优势：**
- ✅ 执行速度快5-10倍
- ✅ AI调用成本低90%+
- ✅ 原生trace/video支持
- ✅ 确定性高

**劣势：**
- ⚠️ 需要预定义选择器
- ⚠️ 页面变化需要更新用例

### 场景3：混合策略（推荐）

**最佳实践：智能切换**

```typescript
// 实现自动降级机制
async function executeTestWithFallback(testCaseId, options) {
  try {
    // 1. 首选Playwright Runner（快速）
    return await executeWithPlaywright(testCaseId, {
      ...options,
      executionEngine: 'playwright'
    });
  } catch (error) {
    if (isElementNotFoundError(error)) {
      // 2. 元素定位失败，降级到MCP（智能）
      console.log('降级到MCP客户端执行');
      return await executeWithMcp(testCaseId, {
        ...options,
        executionEngine: 'mcp'
      });
    }
    throw error;
  }
}
```

**策略说明：**
1. **首次执行** - 使用MCP客户端，让AI学习页面结构
2. **稳定后** - 切换到Playwright Runner，提升性能
3. **失败重试** - Playwright失败时自动降级到MCP
4. **关键步骤** - 用Playwright，复杂交互用MCP

### 场景4：CI/CD集成

**推荐配置：**

```yaml
# .github/workflows/test.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests with Playwright Runner
        env:
          DEFAULT_EXECUTION_ENGINE: playwright
          ENABLE_TRACE: true
          ENABLE_VIDEO: false  # CI环境可关闭video节省空间
        run: npm run test:e2e
      
      - name: Upload test artifacts
        if: failure()
        uses: actions/upload-artifact@v2
        with:
          name: test-results
          path: artifacts/
```

---

## 元素定位策略对比

### MCP客户端：AI智能匹配

```typescript
// AI动态生成selector
步骤描述: "点击登录按钮"
    ↓
AI分析页面快照
    ↓
生成selector: "button:登录"
    ↓
MCP执行: browser_click({ selector: "button:登录" })
```

### Playwright Runner：多策略定位

```typescript
// 支持多种预定义格式

// 1. Label定位（推荐用于表单）
selector: "label:用户名"
→ page.getByLabel("用户名").fill("admin")

// 2. Role定位（推荐用于按钮）
selector: "button:登录"
→ page.getByRole("button", { name: "登录" }).click()

// 3. 索引定位（推荐用于列表）
selector: "button:nth(2)"
→ page.getByRole("button").nth(2).click()

// 4. Text定位（推荐用于复选框）
selector: "text:同意协议"
→ page.getByText("同意协议").click()

// 5. CSS选择器（传统方式）
selector: "#login-btn"
→ page.locator("#login-btn").click()

// 6. AI辅助（失败时自动触发）
失败 → AI分析 → 生成新selector → 重试
```

---

## 证据收集能力对比

### MCP客户端

```typescript
// 支持的证据类型
✅ 截图（每步自动）
⚠️ 视频（需额外配置）
❌ Trace（不支持）
✅ 日志（完整）

// 截图示例
artifacts/
└── {runId}/
    ├── step-1-success.png
    ├── step-2-success.png
    ├── step-3-failed.png
    └── final-completed.png
```

### Playwright Test Runner

```typescript
// 支持的证据类型
✅ 截图（每步自动）
✅ 视频（原生支持）
✅ Trace（原生支持）
✅ 日志（完整）

// 证据示例
artifacts/
└── {runId}/
    ├── trace.zip          // 完整trace文件
    ├── video.webm         // 完整视频录制
    ├── step-1-success.png
    ├── step-2-success.png
    └── final-completed.png

// Trace查看
npx playwright show-trace artifacts/{runId}/trace.zip
```

**Trace的优势：**
- 🔍 时间轴回放
- 📸 每个操作的快照
- 🌐 网络请求详情
- 📝 控制台日志
- 🎯 元素定位过程

---

## 成本分析

### AI API调用成本对比

假设使用OpenRouter GPT-4o模型：
- 输入：$2.5 / 1M tokens
- 输出：$10 / 1M tokens

#### MCP客户端成本

```
10步测试用例：
- 每步AI调用：1次
- 每次输入tokens：~2000（页面快照）
- 每次输出tokens：~200（步骤解析）
- 总计：10次调用

成本计算：
输入：10 × 2000 × $2.5 / 1M = $0.05
输出：10 × 200 × $10 / 1M = $0.02
总计：$0.07 / 次执行

月度成本（1000次执行）：$70
```

#### Playwright Runner成本

```
10步测试用例：
- 正常执行：0次AI调用
- 失败重试：平均0.5次AI调用（假设10%失败率）
- 每次输入tokens：~2000
- 每次输出tokens：~200

成本计算：
输入：0.5 × 2000 × $2.5 / 1M = $0.0025
输出：0.5 × 200 × $10 / 1M = $0.001
总计：$0.0035 / 次执行

月度成本（1000次执行）：$3.5

节省成本：95%
```

---

## 故障排查

### 常见问题1：Playwright Runner元素定位失败

**症状：**
```
❌ 点击步骤缺少选择器
❌ 无法找到元素: button:登录
```

**解决方案：**

```typescript
// 方案1：使用更精确的选择器格式
// 错误写法
selector: "登录按钮"

// 正确写法
selector: "button:登录"        // role:name格式
selector: "label:用户名"       // label格式
selector: "button:nth(0)"     // 索引格式

// 方案2：启用AI辅助
{
  executionEngine: 'playwright',
  enableAiFallback: true  // 失败时自动调用AI
}

// 方案3：降级到MCP
{
  executionEngine: 'mcp'  // 完全依赖AI
}
```

### 常见问题2：MCP客户端执行慢

**症状：**
```
⏱️ 每步执行时间：4-6秒
⏱️ 10步测试用例：40-60秒
```

**解决方案：**

```typescript
// 方案1：切换到Playwright Runner
{
  executionEngine: 'playwright'
}

// 方案2：优化AI模型配置
// .env
AI_MODEL=gpt-4o-mini  // 使用更快的模型
AI_TEMPERATURE=0      // 降低随机性
AI_MAX_TOKENS=500     // 减少输出长度

// 方案3：启用缓存
{
  enableElementCache: true  // 缓存元素定位结果
}
```

### 常见问题3：Trace文件过大

**症状：**
```
📦 trace.zip: 500MB+
💾 磁盘空间不足
```

**解决方案：**

```typescript
// 方案1：关闭trace（CI环境）
{
  executionEngine: 'playwright',
  enableTrace: false,
  enableVideo: false
}

// 方案2：仅失败时保留trace
{
  executionEngine: 'playwright',
  enableTrace: true,
  traceOnFailureOnly: true  // 仅失败时保存
}

// 方案3：定期清理
// scripts/cleanup-artifacts.js
const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天
cleanupOldArtifacts(maxAge);
```

### 常见问题4：浏览器启动失败

**症状：**
```
❌ 浏览器未初始化
❌ Playwright浏览器未安装
```

**解决方案：**

```bash
# 方案1：安装Playwright浏览器
npx playwright install chromium

# 方案2：检查环境变量
echo $PLAYWRIGHT_BROWSERS_PATH

# 方案3：手动指定浏览器路径
# .env
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers

# 方案4：使用系统浏览器（不推荐）
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
```

---

## 迁移指南

### 从MCP迁移到Playwright Runner

**步骤1：评估测试用例**

```typescript
// 检查测试用例是否适合迁移
function canMigrateToPlaywright(testCase) {
  // ✅ 适合迁移
  if (testCase.steps.includes('点击') && 
      testCase.steps.includes('输入') &&
      !testCase.steps.includes('复杂交互')) {
    return true;
  }
  
  // ⚠️ 需要调整
  if (testCase.steps.includes('动态元素')) {
    return 'needs_adjustment';
  }
  
  // ❌ 不适合迁移
  return false;
}
```

**步骤2：调整选择器格式**

```typescript
// MCP格式 → Playwright格式转换

// MCP: AI自动识别
"点击登录按钮"
↓
// Playwright: 明确指定
"button:登录"

// MCP: 自然语言
"在用户名输入框输入admin"
↓
// Playwright: 结构化
selector: "label:用户名"
value: "admin"
action: "fill"
```

**步骤3：批量迁移脚本**

```typescript
// scripts/migrate-to-playwright.ts
async function migrateTestCases() {
  const testCases = await getAllTestCases();
  
  for (const testCase of testCases) {
    // 1. 解析步骤
    const steps = parseSteps(testCase.steps);
    
    // 2. 转换选择器
    const convertedSteps = steps.map(step => ({
      ...step,
      selector: convertToPlaywrightSelector(step.description)
    }));
    
    // 3. 更新测试用例
    await updateTestCase(testCase.id, {
      steps: convertedSteps,
      executionEngine: 'playwright'
    });
    
    // 4. 验证执行
    const result = await runTest(testCase.id, {
      executionEngine: 'playwright'
    });
    
    if (!result.success) {
      console.log(`迁移失败: ${testCase.id}, 保持MCP模式`);
      await updateTestCase(testCase.id, {
        executionEngine: 'mcp'
      });
    }
  }
}
```

**步骤4：灰度发布**

```typescript
// 逐步切换执行引擎
const migrationPhases = [
  { phase: 1, percentage: 10, duration: '1周' },
  { phase: 2, percentage: 30, duration: '1周' },
  { phase: 3, percentage: 50, duration: '1周' },
  { phase: 4, percentage: 100, duration: '持续' }
];

function getExecutionEngine(testCaseId) {
  const currentPhase = getCurrentPhase();
  const random = Math.random() * 100;
  
  if (random < currentPhase.percentage) {
    return 'playwright';
  }
  return 'mcp';
}
```

---

## 监控与优化

### 性能监控

```typescript
// server/services/testExecution.ts
// 已内置性能监控系统

// 查看性能报告
GET /api/test-execution/performance-report

// 响应示例
{
  "totalRuns": 1000,
  "successRate": 95.5,
  "avgExecutionTime": 8.2,
  "playwrightRuns": 850,
  "mcpRuns": 150,
  "costSavings": "$66.5"
}
```

### 成本监控

```typescript
// 监控AI API调用成本
GET /api/test-execution/cost-report

// 响应示例
{
  "period": "2024-01",
  "totalCost": "$125.50",
  "breakdown": {
    "mcp": "$105.00",
    "playwright": "$20.50"
  },
  "projectedMonthlyCost": "$150.00",
  "costPerTest": {
    "mcp": "$0.07",
    "playwright": "$0.0024"
  }
}
```

### 优化建议

```typescript
// 自动优化建议系统
GET /api/test-execution/optimization-suggestions

// 响应示例
{
  "suggestions": [
    {
      "type": "engine_switch",
      "testCaseId": 123,
      "currentEngine": "mcp",
      "suggestedEngine": "playwright",
      "reason": "稳定执行100次，成功率100%",
      "estimatedSavings": "$6.65/月"
    },
    {
      "type": "selector_optimization",
      "testCaseId": 456,
      "step": 3,
      "currentSelector": "点击按钮",
      "suggestedSelector": "button:提交",
      "reason": "减少AI调用"
    }
  ]
}
```

---

## 总结

### 快速决策表

| 你的需求 | 推荐引擎 | 理由 |
|---------|---------|------|
| 快速执行回归测试 | Playwright | 速度快5-10倍 |
| 探索新页面功能 | MCP | AI自动适应 |
| CI/CD集成 | Playwright | 稳定可靠 |
| 成本敏感 | Playwright | 节省95%成本 |
| 需要详细调试 | Playwright | Trace支持 |
| 页面频繁变化 | MCP | 动态适应 |
| 自然语言测试 | MCP | 无需技术细节 |
| 大规模测试套件 | Playwright | 高性能 |

### 核心建议

1. **默认使用Playwright Runner** - 获得最佳性能和成本效益
2. **保留MCP作为fallback** - 处理复杂场景
3. **启用混合策略** - 自动降级机制
4. **定期评估迁移** - 将稳定用例迁移到Playwright
5. **监控成本和性能** - 持续优化

### 下一步行动

- [ ] 评估现有测试用例适合哪种引擎
- [ ] 配置默认执行引擎
- [ ] 实施混合策略
- [ ] 设置性能监控
- [ ] 制定迁移计划

---

## 附录

### 相关文档

- [Playwright官方文档](https://playwright.dev/)
- [Model Context Protocol规范](https://modelcontextprotocol.io/)
- [Sakura AI测试平台文档](../README.md)

### 技术支持

如有问题，请联系：
- 技术支持：support@sakura-ai.com
- GitHub Issues：https://github.com/your-org/sakura-ai/issues

---

**文档版本：** v1.0.0  
**最后更新：** 2025-01-15  
**维护者：** Sakura AI团队
