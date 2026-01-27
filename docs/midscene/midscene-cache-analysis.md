# Midscene缓存和Token统计 - 使用官方机制

## 概述

根据Midscene官方文档（https://midscenejs.com/zh/caching），我们已经重新设计了缓存和token统计功能，使用Midscene内置的官方机制，而不是自己实现。

## 1. 缓存机制（使用Midscene官方缓存）

### 官方缓存特性

Midscene支持缓存Plan的步骤与匹配到的元素位置信息，减少AI模型的调用次数。

**缓存内容**：
- Plan步骤
- 元素位置信息（基于XPath）

**缓存文件位置**：
- `./midscene_run/cache/*.cache.yaml`

**缓存策略**：
- `read-write`（默认）：自动读取和写入缓存
- `read-only`：只读取缓存，需要手动调用 `agent.flushCache()` 写入
- `write-only`：只写入缓存，不读取已有缓存

### 我们的实现

在 `midsceneTestRunner.ts` 中配置：

```typescript
const aiConfig: any = {
  waitForNavigationTimeout: 5000,
  waitForNetworkIdleTimeout: 2000,
  forceSameTabNavigation: true,
  groupName: runId,
  // 🔥 启用Midscene官方缓存机制
  cache: {
    strategy: 'read-write',
    id: `test-${runId.substring(0, 8)}`
  }
};
```

**缓存ID设计**：
- 使用 `test-${runId前8位}` 作为缓存ID
- 同一测试用例的多次执行共享缓存
- 不同测试用例使用不同的缓存ID

**缓存刷新**：
- 测试完成后调用 `agent.flushCache()` 确保缓存被持久化
- 不使用 `cleanUnused: true`，保留所有缓存记录

### 查看缓存命中情况

**启用缓存调试日志**：
```bash
DEBUG=midscene:cache:* npm run dev
```

**查看缓存文件**：
```bash
ls -la ./midscene_run/cache/
cat ./midscene_run/cache/test-*.cache.yaml
```

**查看执行报告**：
- 打开 `./midscene_run/report/index.html`
- 缓存命中的步骤会显示 "cache" 提示
- 执行时间会大幅降低

### 缓存局限性

根据官方文档，以下场景无法使用缓存：
- Canvas元素（无DOM节点）
- 跨域iframe（安全策略限制）
- Shadow DOM（closed模式）
- WebGL/SVG动态内容（无稳定DOM结构）

当缓存未命中时，Midscene会自动回退到AI服务。

## 2. Token统计（使用Midscene DEBUG日志）

### 官方Token统计

Midscene的DEBUG模式会自动输出token使用情况到日志文件。

**启用DEBUG模式**：
```typescript
process.env.DEBUG = 'midscene:*,midscene:cache:*';
```

**日志文件位置**：
- `./midscene_run/log/*.log`

**日志内容包含**：
- 每次AI调用的耗时
- Token使用情况（inputTokens、outputTokens、totalTokens）
- 成本估算（cost）
- 缓存命中情况

### 我们的实现

**简化的统计输出**：
```typescript
private aiCallStats = {
  totalCalls: 0,
  successCalls: 0,
  failedCalls: 0
};
```

**统计输出格式**：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 [runId] AI 调用统计:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   总调用次数: 9
   成功次数: 8
   失败次数: 1
   成功率: 88.9%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 [runId] 详细统计信息:
   📁 缓存文件: ./midscene_run/cache/*.cache.yaml
   📄 Token统计: ./midscene_run/log/*.log (搜索 "token" 或 "cost")
   📊 执行报告: ./midscene_run/report/index.html
   💡 提示: 启用 DEBUG=midscene:cache:* 可查看缓存命中详情
```

### 查看详细Token统计

**方法1：查看日志文件**
```bash
# 查看最新日志
cat ./midscene_run/log/$(ls -t ./midscene_run/log/ | head -1)

# 搜索token信息
grep -i "token" ./midscene_run/log/*.log
grep -i "cost" ./midscene_run/log/*.log
```

**方法2：查看执行报告**
- 打开 `./midscene_run/report/index.html`
- 查看每个步骤的执行时间
- 缓存命中的步骤时间会显著降低

## 3. 移除的功能

为了使用Midscene官方机制，我们移除了以下自定义实现：

### 移除的代码

1. **自定义缓存机制**：
   - `actionCache: Map<string, CachedAction>`
   - `elementCache: Map<string, CachedElement>`
   - `getPageHash()` 方法
   - `checkActionCache()` 方法
   - `saveActionCache()` 方法
   - `CachedAction` 接口
   - `CachedElement` 接口

2. **自定义Token统计**：
   - `tokenStats` 数组
   - CSV格式的token统计输出
   - 成本计算逻辑

### 移除原因

1. **重复实现**：Midscene已经提供了完整的缓存和统计功能
2. **维护成本高**：自定义实现需要持续维护和调试
3. **效果不佳**：自定义缓存命中率为0%，不如官方实现
4. **数据不准确**：无法从Midscene API获取token信息，只能依赖DEBUG日志

## 4. 优势对比

### 使用官方缓存的优势

| 特性 | 自定义实现 | 官方实现 |
|------|-----------|---------|
| 缓存内容 | 操作结果 | Plan步骤 + 元素位置 |
| 缓存键 | 基于操作描述 | 基于XPath和页面结构 |
| 过期时间 | 30秒 | 持久化到文件 |
| 命中率 | 0% | 根据页面稳定性而定 |
| 维护成本 | 高 | 低（官方维护） |
| 调试支持 | 无 | DEBUG日志 |

### 使用官方Token统计的优势

| 特性 | 自定义实现 | 官方实现 |
|------|-----------|---------|
| 数据来源 | 无法获取 | DEBUG日志 |
| 统计内容 | 只有时间 | Token + 成本 + 时间 |
| 输出格式 | CSV | 结构化日志 |
| 准确性 | 不准确 | 准确 |
| 维护成本 | 高 | 低（官方维护） |

## 5. 使用建议

### 开发环境

启用完整的DEBUG日志：
```bash
DEBUG=midscene:*,midscene:cache:* npm run dev
```

### 生产环境

只启用关键日志：
```bash
DEBUG=midscene:cache:* npm run start
```

### 性能优化

1. **首次执行**：使用 `write-only` 模式建立缓存
2. **后续执行**：使用 `read-write` 模式利用缓存
3. **调试时**：使用 `false` 禁用缓存，确保实时结果

### 缓存清理

定期清理未使用的缓存：
```typescript
await agent.flushCache({ cleanUnused: true });
```

## 6. 常见问题

### Q: 为什么缓存没有命中？

A: 可能的原因：
1. 页面DOM结构发生变化
2. 元素文本内容不同
3. 首次执行（还没有缓存）
4. 使用了Canvas、iframe等不支持缓存的元素

### Q: 如何查看缓存是否生效？

A: 三种方法：
1. 查看执行报告（`./midscene_run/report/index.html`）
2. 查看DEBUG日志（`DEBUG=midscene:cache:*`）
3. 对比执行时间（缓存命中时间会显著降低）

### Q: Token统计在哪里查看？

A: 两种方法：
1. 查看日志文件（`./midscene_run/log/*.log`）
2. 查看执行报告（`./midscene_run/report/index.html`）

### Q: 如何禁用缓存？

A: 设置 `cache: false` 或不配置 `cache` 选项：
```typescript
const aiConfig = {
  // ... 其他配置
  cache: false  // 禁用缓存
};
```

## 7. 参考资料

- [Midscene官方缓存文档](https://midscenejs.com/zh/caching)
- [Midscene调试指南](https://midscenejs.com/zh/debugging)
- [Midscene API文档](https://midscenejs.com/zh/api)

## Midscene 缓存机制详解

### 缓存工作原理

Midscene 使用基于测试用例ID的稳定缓存机制，缓存文件格式为 `test-case-{testCaseId}.cache.yaml`。

**缓存流程**：
1. **首次执行**：生成缓存文件，记录 plan 和 locate 结果
2. **重复执行**：加载缓存文件，直接使用缓存结果，跳过AI调用
3. **缓存失效**：页面DOM变化时自动更新缓存

### ✅ 可以被缓存的操作

| 操作类型 | 说明 | 示例 | 缓存内容 |
|---------|------|------|---------|
| **Plan** | 操作计划生成 | "在用户名输入框输入账号：sysadmin" | 完整的 workflow 步骤 |
| **Locate** | 元素定位 | "登录名输入框" | 元素的 XPath 路径 |

### ❌ 不能被缓存的操作

| 操作类型 | 原因 | 影响 |
|---------|------|------|
| **Assert（断言）** | 需要实时验证页面当前状态 | 每次执行都会调用AI |
| **Extract（提取）** | 提取的数据是动态的 | 每次执行都会调用AI |
| **页面内容变化** | DOM结构改变导致缓存失效 | 自动更新缓存 |

### 📊 缓存命中率说明

**示例场景**：
```yaml
# test-case-86.cache.yaml
caches:
  - type: plan    # ✅ 缓存命中
  - type: locate  # ✅ 缓存命中
```

**执行统计**：
- 总操作：3次（plan + locate + assert）
- 缓存命中：2次（plan + locate）
- AI调用：1次（assert - 不可缓存）
- **显示：缓存命中率 100% (1/1)**

**理解说明**：
- ✅ "100% (1/1)" 表示：在需要AI的1次操作中，缓存命中率100%
- ✅ 统计基于 **AI调用次数**，而不是总操作次数
- ✅ Midscene报告中的2个Cache标记是操作级别的缓存

**为什么只有1次AI调用？**
- `plan` 操作 - 缓存命中，直接使用缓存的workflow，无需AI
- `locate` 操作 - 缓存命中，直接使用缓存的xpath，无需AI
- `assert` 操作 - 无缓存，需要调用AI进行断言验证

### 💡 缓存优化建议

1. **减少断言操作**
   - 断言无法缓存，每次都会调用AI
   - 建议：合并多个断言，减少AI调用次数
   - 示例：用一个断言验证多个条件

2. **保持页面结构稳定**
   - 页面结构稳定时，locate缓存命中率更高
   - 避免频繁修改页面DOM结构
   - 使用稳定的元素描述

3. **重复执行相同用例**
   - 系统使用 `test-case-{testCaseId}` 作为缓存ID
   - 相同测试用例的重复执行可以共享缓存
   - 首次执行后，后续执行速度大幅提升

4. **监控缓存效果**
   - 查看执行日志中的缓存统计
   - 缓存命中率低时检查页面是否频繁变化
   - 优化测试用例减少不必要的断言

### 🔍 缓存文件示例

```yaml
midsceneVersion: 1.2.2
cacheId: test-case-86
caches:
  - type: plan
    prompt: 在用户名输入框输入账号：sysadmin
    yamlWorkflow: |
      tasks:
        - name: 在用户名输入框输入账号：sysadmin
          flow:
            - aiInput: ''
              value: sysadmin
              locate: 登录名输入框
              mode: replace
  - type: locate
    prompt: 登录名输入框
    cache:
      xpaths:
        - /html/body/div[1]/div[1]/div[1]/div[1]/div[3]/input[1]
```

### ⚠️ 注意事项

1. **断言操作的成本**
   - 每个断言都会调用AI，产生API费用
   - 建议在关键步骤使用断言，避免过度使用

2. **缓存失效场景**
   - 页面DOM结构变化
   - 元素位置或属性改变
   - 系统会自动检测并更新缓存

3. **缓存文件位置**
   - 路径：`midscene_run/cache/test-case-{testCaseId}.cache.yaml`
   - 可以手动删除缓存文件强制重新生成