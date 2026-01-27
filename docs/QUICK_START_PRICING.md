# 模型价格管理 - 快速开始

## 🚀 快速使用

### 1. 查看当前所有价格

```bash
node scripts/update-model-pricing.js --list
```

### 2. 更新单个模型价格

```bash
# 更新 GLM-4.6V 的价格
node scripts/update-model-pricing.js --model glm-4.6v --input 0.001 --output 0.001
```

### 3. 从 OpenRouter 同步最新价格

```bash
node scripts/update-model-pricing.js --sync-openrouter
```

### 4. 导出价格配置（备份）

```bash
node scripts/update-model-pricing.js --export ./backup.json
```

### 5. 导入价格配置

```bash
node scripts/update-model-pricing.js --import ./backup.json
```

## 📝 常见场景

### 场景 1：发现成本计算不准确

**问题**：统计显示 $0.0166，但你知道实际价格不同

**解决**：
```bash
# 1. 查看当前配置
node scripts/update-model-pricing.js --list | grep glm-4.6v

# 2. 更新为正确的价格
node scripts/update-model-pricing.js --model glm-4.6v --input 0.0015 --output 0.0015

# 3. 重启服务器使价格生效
npm run start
```

### 场景 2：添加新模型

**问题**：使用了新模型，但配置中没有价格

**解决**：
```bash
# 添加新模型价格
node scripts/update-model-pricing.js --model new-model-name --input 0.002 --output 0.003
```

### 场景 3：批量更新价格

**问题**：多个模型价格都变了

**解决**：
```bash
# 方式 1：从 OpenRouter 自动同步
node scripts/update-model-pricing.js --sync-openrouter

# 方式 2：手动编辑配置文件
# 编辑 config/model-pricing.json
# 然后重启服务器
```

### 场景 4：定期自动更新

**问题**：希望每天自动更新价格

**解决**：

**Windows 任务计划程序**：
1. 打开"任务计划程序"
2. 创建基本任务
3. 触发器：每天凌晨 2:00
4. 操作：启动程序
   - 程序：`node`
   - 参数：`D:\King\Cursor\sakura-ai\scripts\update-model-pricing.js --sync-openrouter`
   - 起始于：`D:\King\Cursor\sakura-ai`

**Linux/Mac crontab**：
```bash
# 编辑 crontab
crontab -e

# 添加定时任务（每天凌晨 2 点）
0 2 * * * cd /path/to/sakura-ai && node scripts/update-model-pricing.js --sync-openrouter
```

## ⚙️ 配置自动同步

编辑 `config/model-pricing.json`：

```json
{
  "settings": {
    "autoSync": true,
    "syncInterval": 86400000,
    "cacheExpiry": 86400000
  }
}
```

重启服务器后，系统会在启动时自动检查价格是否过期（>24小时），如果过期则自动从 OpenRouter 同步。

## 🔍 验证价格是否生效

### 方法 1：查看配置文件

```bash
# Windows
type config\model-pricing.json | findstr glm-4.6v

# Linux/Mac
cat config/model-pricing.json | grep glm-4.6v
```

### 方法 2：运行测试

1. 执行一次测试
2. 查看统计报告中的成本
3. 手动计算验证：
   ```
   成本 = (输入Token / 1000) × 输入价格 + (输出Token / 1000) × 输出价格
   ```

### 方法 3：查看日志

```bash
# 查看价格加载日志
# 启动服务器时会输出：
# ✅ 模型价格配置加载成功
# 📊 已加载 18 个模型的价格配置
```

## ❓ 常见问题

### Q1: 更新价格后没有生效？

**A**: 需要重启服务器，价格在服务器启动时加载到内存。

```bash
# 停止服务器（Ctrl+C）
# 重新启动
npm run start
```

### Q2: 如何知道当前使用的是哪个模型？

**A**: 查看测试执行日志中的"模型调用详情"部分：

```
📋 模型调用详情:
   • glm-4.6v
     └─ 4次 (100%) | 15,824 tokens | 6.2s/次 | $0.0166
```

### Q3: OpenRouter 同步失败怎么办？

**A**: 
1. 检查网络连接
2. 确认 OpenRouter API 可访问
3. 使用手动更新方式

### Q4: 如何恢复默认价格？

**A**: 
```bash
# 方式 1：从备份恢复
node scripts/update-model-pricing.js --import ./backup.json

# 方式 2：重新创建配置文件
# 删除 config/model-pricing.json
# 重启服务器会自动创建默认配置
```

## 📚 更多文档

- [详细使用指南](./MODEL_PRICING_GUIDE.md)
- [实现文档](./MODEL_PRICING_IMPLEMENTATION.md)
- [价格获取流程](./MODEL_PRICING_FLOW.md)

## 💡 提示

1. **定期备份配置**
   ```bash
   node scripts/update-model-pricing.js --export ./backup-$(date +%Y%m%d).json
   ```

2. **验证价格准确性**
   - 对比实际账单
   - 查看官方价格公告
   - 定期更新配置

3. **监控成本**
   - 查看每次执行的统计报告
   - 设置成本预警
   - 分析成本趋势

4. **优化成本**
   - 使用缓存减少 AI 调用
   - 选择性价比高的模型
   - 减少不必要的断言操作
