# 模型价格动态管理系统 - 实现总结

## 概述

已成功实现灵活的模型价格管理系统，支持配置文件、API 同步和手动更新。

## 实现的功能

### ✅ 核心功能

1. **价格配置管理**
   - 配置文件存储（`config/model-pricing.json`）
   - 支持精确匹配和模糊匹配
   - 价格来源追踪（config/api/default）
   - 最后更新时间记录

2. **动态价格获取**
   - OpenRouter API 自动同步
   - 支持批量更新
   - 缓存机制（24小时过期）

3. **成本计算**
   - 自动根据模型和 Token 数量计算
   - 支持输入/输出不同价格
   - 精确到小数点后 4 位

4. **API 接口**
   - GET `/api/model-pricing` - 获取所有价格
   - GET `/api/model-pricing/:model` - 获取单个模型价格
   - PUT `/api/model-pricing/:model` - 更新模型价格
   - POST `/api/model-pricing/sync/openrouter` - 从 OpenRouter 同步
   - GET `/api/model-pricing/export/config` - 导出配置
   - POST `/api/model-pricing/import` - 导入配置

5. **命令行工具**
   - `scripts/update-model-pricing.js` - 价格管理脚本
   - 支持同步、更新、列表、导入/导出

## 文件结构

```
sakura-ai/
├── server/
│   ├── services/
│   │   ├── modelPricingService.ts      # 价格服务核心
│   │   └── midsceneLogParser.ts        # 集成价格服务
│   └── routes/
│       └── modelPricing.ts             # API 路由
├── config/
│   └── model-pricing.json              # 价格配置文件
├── scripts/
│   └── update-model-pricing.js         # 命令行工具
└── docs/
    ├── MODEL_PRICING_GUIDE.md          # 使用指南
    └── MODEL_PRICING_IMPLEMENTATION.md # 实现文档
```

## 使用示例

### 1. 手动更新价格

编辑 `config/model-pricing.json`：

```json
{
  "models": {
    "glm-4.6v": {
      "input": 0.001,
      "output": 0.001,
      "source": "config",
      "lastUpdated": "2026-01-23T10:00:00.000Z"
    }
  }
}
```

### 2. 通过命令行更新

```bash
# 更新单个模型
node scripts/update-model-pricing.js --model glm-4.6v --input 0.001 --output 0.001

# 从 OpenRouter 同步
node scripts/update-model-pricing.js --sync-openrouter

# 查看所有价格
node scripts/update-model-pricing.js --list
```

### 3. 通过 API 更新

```bash
# 更新价格
curl -X PUT http://localhost:3001/api/model-pricing/glm-4.6v \
  -H "Content-Type: application/json" \
  -d '{"input": 0.001, "output": 0.001}'

# 从 OpenRouter 同步
curl -X POST http://localhost:3001/api/model-pricing/sync/openrouter
```

## 价格匹配逻辑

系统使用三级匹配策略：

1. **精确匹配**：直接匹配模型名称
   ```
   "glm-4.6v" → 找到 "glm-4.6v" 配置
   ```

2. **模糊匹配**：部分匹配模型名称
   ```
   "glm-4.6v-20240101" → 匹配 "glm-4.6v"
   ```

3. **默认价格**：找不到时使用默认配置
   ```
   "unknown-model" → 使用 "default" 配置
   ```

## 成本计算公式

```typescript
成本 = (输入Token数 / 1000) × 输入价格 + (输出Token数 / 1000) × 输出价格
```

### 实际案例

**GLM-4.6V 模型**：
- 输入 Token: 15,036
- 输出 Token: 788
- 输入价格: $0.001 / 1K tokens
- 输出价格: $0.001 / 1K tokens

```
成本 = (15,036 / 1000) × 0.001 + (788 / 1000) × 0.001
     = 0.015036 + 0.000788
     = 0.015824
     ≈ $0.0158
```

## 优势

### 相比硬编码价格

1. **灵活性**
   - 无需修改代码即可更新价格
   - 支持动态添加新模型
   - 配置文件易于维护

2. **准确性**
   - 可从官方 API 自动同步
   - 支持手动验证和调整
   - 记录价格来源和更新时间

3. **可维护性**
   - 配置与代码分离
   - 支持版本控制
   - 易于备份和恢复

4. **扩展性**
   - 支持多种价格来源
   - 可添加自定义模型
   - 易于集成新的 API

## 注意事项

### 1. 价格准确性

- 定期检查官方价格变动
- 建议每月更新一次配置
- 对比实际账单验证

### 2. OpenRouter 同步

- 需要网络连接
- API 可能有速率限制
- 价格单位需要转换（1M → 1K tokens）

### 3. 配置文件管理

- 建议加入版本控制
- 定期备份配置
- 记录价格变更历史

### 4. 模糊匹配

- 可能匹配到错误的模型
- 建议使用精确的模型名称
- 检查日志中的匹配结果

## 后续优化建议

### 短期（1-2周）

1. **添加更多模型价格**
   - 收集常用模型的官方价格
   - 添加到默认配置

2. **价格验证**
   - 对比实际账单
   - 调整不准确的价格

3. **文档完善**
   - 添加更多使用示例
   - 补充常见问题

### 中期（1-2月）

1. **自动更新**
   - 定时任务自动同步价格
   - 价格变动通知

2. **价格历史**
   - 记录价格变更历史
   - 生成价格趋势图表

3. **多币种支持**
   - 支持人民币显示
   - 汇率自动转换

### 长期（3-6月）

1. **智能推荐**
   - 根据成本推荐模型
   - 性价比分析

2. **预算管理**
   - 设置成本预警
   - 生成成本报告

3. **API 集成**
   - 支持更多价格 API
   - 自动发现新模型

## 相关文档

- [使用指南](./MODEL_PRICING_GUIDE.md)
- [Midscene 日志解析](./MIDSCENE_GUIDE.md)
- [成本统计分析](./midscene-execution-stats.md)

## 技术栈

- **语言**: TypeScript
- **存储**: JSON 配置文件
- **API**: Express.js REST API
- **同步**: OpenRouter API
- **工具**: Node.js 命令行脚本

## 总结

已成功实现灵活的模型价格管理系统，解决了硬编码价格的问题。系统支持：

✅ 配置文件管理  
✅ API 自动同步  
✅ 手动更新  
✅ 导入/导出  
✅ 命令行工具  
✅ 精确成本计算  

用户现在可以轻松更新模型价格，无需修改代码，确保成本计算的准确性。
