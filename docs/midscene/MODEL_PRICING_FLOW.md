# 模型价格获取和计算流程详解

## 📋 完整流程图

```
┌─────────────────────────────────────────────────────────────┐
│                    系统启动                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  MidsceneTestRunner 构造函数                                 │
│  └─ 创建 MidsceneLogParser 实例                             │
│     └─ 调用 initializePricingService()                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  ModelPricingService.initialize(autoSync)                   │
│  ├─ 从 config/model-pricing.json 加载价格                  │
│  ├─ 价格缓存到内存（pricingCache）                         │
│  └─ [可选] 如果 autoSync=true，检查并更新价格              │
│     └─ 如果配置过期（>24小时），从 OpenRouter 同步         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  用户触发测试执行                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Midscene 执行测试步骤                                       │
│  ├─ AI 调用产生 Token 消耗                                  │
│  └─ 写入日志到 midscene_run/log/                           │
│     ├─ ai-profile-detail.log (Token 数据)                  │
│     └─ ai-profile-stats.log (模型名称、耗时)               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  测试执行完成                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  调用 printStatistics(runId)                                │
│  └─ MidsceneLogParser.parseLogForRun()                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  解析日志文件                                                │
│  ├─ parseDetailLog()                                        │
│  │  ├─ 提取 Token 数据（输入/输出）                        │
│  │  └─ 调用 pricingService.calculateCost()                │
│  │     └─ 从内存缓存获取价格                               │
│  │        └─ 计算初步成本                                  │
│  │                                                          │
│  └─ parseStatsLog()                                        │
│     ├─ 提取模型名称                                         │
│     └─ mergeStats()                                        │
│        └─ 使用实际模型名称重新计算成本                      │
│           └─ pricingService.calculateCost(model, ...)      │
│              └─ 精确匹配或模糊匹配价格                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  formatSummary()                                            │
│  └─ 生成统计报告（简洁/详细）                               │
│     └─ 显示总成本、Token 使用、缓存命中率等                │
└─────────────────────────────────────────────────────────────┘
```

## 🔍 价格获取时机

### 当前实现

| 时机 | 是否获取价格 | 说明 |
|------|------------|------|
| **服务器启动** | ✅ 是 | 从配置文件加载到内存 |
| **测试执行前** | ❌ 否 | 使用内存中的缓存价格 |
| **测试执行中** | ❌ 否 | 不涉及价格计算 |
| **测试执行后** | ❌ 否 | 使用内存中的缓存价格计算 |
| **手动更新** | ✅ 是 | 通过 API/命令行更新 |
| **手动同步** | ✅ 是 | 从 OpenRouter 同步 |

### 价格缓存策略

```typescript
// 价格存储在内存中
private pricingCache: Record<string, ModelPricing> = {};

// 缓存过期时间：24 小时
private cacheExpiry: number = 24 * 60 * 60 * 1000;

// 价格更新时机：
// 1. 服务器启动时加载
// 2. 手动更新时刷新
// 3. 手动同步时刷新
// 4. [新增] autoSync=true 时自动检查并更新
```

## ⚙️ 配置选项

### config/model-pricing.json

```json
{
  "settings": {
    "autoSync": false,        // 是否自动同步价格
    "syncInterval": 86400000, // 同步间隔（毫秒，24小时）
    "cacheExpiry": 86400000   // 缓存过期时间（毫秒，24小时）
  }
}
```

### 启用自动同步

**方式 1：修改配置文件**
```json
{
  "settings": {
    "autoSync": true
  }
}
```

**方式 2：代码中启用**
```typescript
// midsceneTestRunner.ts
await this.logParser.initialize(true); // 传入 true 启用自动同步
```

## 🔄 价格更新方式

### 1. 自动更新（推荐）

启用 `autoSync` 后，系统会在以下情况自动检查并更新价格：

```
服务器启动
    ↓
检查配置文件的 lastUpdated
    ↓
如果超过 24 小时（cacheExpiry）
    ↓
自动从 OpenRouter 同步最新价格
    ↓
更新配置文件和内存缓存
```

**优点**：
- ✅ 无需手动干预
- ✅ 价格始终保持最新
- ✅ 自动处理过期检查

**缺点**：
- ⚠️ 需要网络连接
- ⚠️ 启动时可能稍慢
- ⚠️ 依赖 OpenRouter API

### 2. 手动更新

**通过命令行**：
```bash
# 更新单个模型
node scripts/update-model-pricing.js --model glm-4.6v --input 0.001 --output 0.001

# 从 OpenRouter 同步
node scripts/update-model-pricing.js --sync-openrouter
```

**通过 API**：
```bash
# 更新单个模型
curl -X PUT http://localhost:3001/api/model-pricing/glm-4.6v \
  -H "Content-Type: application/json" \
  -d '{"input": 0.001, "output": 0.001}'

# 从 OpenRouter 同步
curl -X POST http://localhost:3001/api/model-pricing/sync/openrouter
```

**通过配置文件**：
直接编辑 `config/model-pricing.json`，重启服务器生效。

### 3. 定时任务（未实现）

可以设置定时任务定期更新价格：

```bash
# Linux/Mac crontab
# 每天凌晨 2 点更新价格
0 2 * * * cd /path/to/sakura-ai && node scripts/update-model-pricing.js --sync-openrouter
```

## 💰 成本计算详解

### 计算公式

```typescript
成本 = (输入Token数 / 1000) × 输入价格 + (输出Token数 / 1000) × 输出价格
```

### 价格匹配逻辑

```typescript
// 1. 精确匹配
getModelPricing("glm-4.6v")
  → 找到 "glm-4.6v" 配置
  → 返回 { input: 0.001, output: 0.001 }

// 2. 模糊匹配
getModelPricing("glm-4.6v-20240101")
  → 未找到精确匹配
  → 模糊匹配到 "glm-4.6v"
  → 返回 { input: 0.001, output: 0.001 }

// 3. 默认价格
getModelPricing("unknown-model")
  → 未找到任何匹配
  → 返回 "default" 配置
  → 返回 { input: 0.001, output: 0.002 }
```

### 实际案例

**GLM-4.6V 模型**：
```
输入 Token: 15,036
输出 Token: 788
输入价格: $0.001 / 1K tokens
输出价格: $0.001 / 1K tokens

成本 = (15,036 / 1000) × 0.001 + (788 / 1000) × 0.001
     = 15.036 × 0.001 + 0.788 × 0.001
     = 0.015036 + 0.000788
     = 0.015824
     ≈ $0.0158
```

## 📊 价格数据流

```
配置文件 (config/model-pricing.json)
    ↓ 加载
内存缓存 (pricingCache)
    ↓ 查询
价格计算 (calculateCost)
    ↓ 结果
统计报告 (formatSummary)
    ↓ 显示
前端界面
```

## ⚠️ 注意事项

### 1. 价格准确性

- **配置文件价格**：需要手动维护，可能过时
- **OpenRouter 价格**：实时同步，但可能与官方略有差异
- **建议**：定期对比实际账单验证价格准确性

### 2. 网络依赖

- 自动同步需要访问 OpenRouter API
- 如果网络不可用，会使用配置文件中的价格
- 建议在内网环境使用手动更新方式

### 3. 性能影响

- 自动同步会在启动时增加几秒延迟
- 如果对启动速度敏感，建议关闭 autoSync
- 可以使用定时任务在非高峰期更新

### 4. 价格变动

- 模型价格可能随时变动
- 建议关注官方公告
- 及时更新配置文件

## 🎯 最佳实践

### 开发环境

```json
{
  "settings": {
    "autoSync": true,  // 启用自动同步
    "cacheExpiry": 3600000  // 1小时过期
  }
}
```

### 生产环境

```json
{
  "settings": {
    "autoSync": false,  // 关闭自动同步
    "cacheExpiry": 86400000  // 24小时过期
  }
}
```

使用定时任务在非高峰期更新：
```bash
# 每天凌晨 2 点更新
0 2 * * * node scripts/update-model-pricing.js --sync-openrouter
```

### 监控和验证

1. **定期检查日志**
   ```bash
   grep "价格" logs/debug-execution.log
   ```

2. **对比实际账单**
   - 每月对比系统计算的成本与实际账单
   - 调整不准确的价格配置

3. **设置告警**
   - 当成本超过预期时发送通知
   - 监控价格配置的更新时间

## 📚 相关文档

- [价格管理指南](./MODEL_PRICING_GUIDE.md)
- [实现文档](./MODEL_PRICING_IMPLEMENTATION.md)
- [Midscene 日志解析](./midscene/MIDSCENE_GUIDE.md)

## 总结

**当前行为**：
- ❌ 不会每次执行都自动获取最新价格
- ✅ 使用内存缓存的价格进行计算
- ✅ 支持手动更新和自动同步（可选）

**推荐配置**：
- 开发环境：启用 `autoSync`，快速获取最新价格
- 生产环境：关闭 `autoSync`，使用定时任务更新

**价格更新频率**：
- 建议每天更新一次
- 或在模型价格变动时手动更新
- 定期验证价格准确性
