# 断言匹配策略参数传递调试指南

## 问题现象

用户选择了断言匹配策略，但请求参数中没有 `assertionMatchMode` 字段。

## 调试步骤

### 1. 检查前端代码（已确认正确）

所有三个页面的 `executionConfig` 初始化都包含了 `assertionMatchMode`：

```typescript
const [executionConfig, setExecutionConfig] = useState({
  executionEngine: 'mcp' as 'mcp' | 'playwright',
  enableTrace: true,
  enableVideo: true,
  environment: 'staging',
  assertionMatchMode: 'auto' as 'strict' | 'auto' | 'loose' // ✅ 已添加
});
```

所有 `runTestCase` 调用都传递了参数：

```typescript
const response = await testService.runTestCase(caseId, {
  executionEngine: executionConfig.executionEngine,
  enableTrace: executionConfig.enableTrace,
  enableVideo: executionConfig.enableVideo,
  environment: executionConfig.environment,
  assertionMatchMode: executionConfig.assertionMatchMode // ✅ 已传递
});
```

### 2. 清除浏览器缓存

**问题可能原因**：浏览器缓存了旧版本的 JavaScript 文件。

**解决方法**：

#### 方法 1：硬刷新（推荐）
- **Windows/Linux**: `Ctrl + Shift + R` 或 `Ctrl + F5`
- **Mac**: `Cmd + Shift + R`

#### 方法 2：清除缓存
1. 打开浏览器开发者工具（F12）
2. 右键点击刷新按钮
3. 选择"清空缓存并硬性重新加载"

#### 方法 3：禁用缓存（开发时）
1. 打开开发者工具（F12）
2. 进入 Network 标签
3. 勾选"Disable cache"
4. 刷新页面

### 3. 验证前端是否发送参数

打开浏览器开发者工具，查看网络请求：

1. 打开开发者工具（F12）
2. 切换到 **Network** 标签
3. 点击"执行"按钮
4. 找到 `/api/test-cases/:id/run` 请求
5. 查看 **Request Payload**

**正确的请求应该包含**：
```json
{
  "caseId": 80,
  "executionEngine": "playwright",
  "enableTrace": true,
  "enableVideo": true,
  "environment": "staging",
  "assertionMatchMode": "auto"  // ✅ 应该有这个字段
}
```

### 4. 检查后端是否接收到参数

查看后端日志，应该看到：

```
⚙️ [runId] 断言匹配模式: 智能匹配（推荐）
```

如果看到这行日志，说明参数传递成功。

### 5. 常见问题排查

#### 问题 1：请求中没有 `assertionMatchMode`

**可能原因**：
- 浏览器缓存了旧版本的 JavaScript
- 前端代码没有重新编译

**解决方法**：
1. 硬刷新浏览器（Ctrl + Shift + R）
2. 重新启动前端开发服务器：
   ```bash
   npm run dev:frontend
   ```

#### 问题 2：`assertionMatchMode` 是 `undefined`

**可能原因**：
- UI 中没有选择断言匹配策略
- 状态没有正确更新

**解决方法**：
1. 在执行配置弹窗中，确保选择了断言匹配策略
2. 检查浏览器控制台是否有错误

#### 问题 3：选择了策略但没有生效

**可能原因**：
- 使用了 MCP 引擎（断言匹配策略仅在 Playwright 中完全支持）

**解决方法**：
1. 在执行配置中选择 **Playwright Test Runner**
2. 参考：[执行引擎要求说明](./assertion-match-mode-engine-requirement.md)

### 6. 完整测试流程

1. **清除缓存**：硬刷新浏览器（Ctrl + Shift + R）

2. **打开开发者工具**：按 F12

3. **切换到 Network 标签**

4. **执行测试**：
   - 点击测试用例的"执行"按钮
   - 在执行配置弹窗中：
     - 执行引擎：选择 `Playwright Test Runner`
     - 断言匹配策略：选择 `智能匹配（推荐）`
   - 点击"确认执行"

5. **查看请求**：
   - 在 Network 标签中找到 `run` 请求
   - 点击查看 Request Payload
   - 确认包含 `assertionMatchMode: "auto"`

6. **查看后端日志**：
   - 应该看到：`⚙️ [runId] 断言匹配模式: 智能匹配（推荐）`

### 7. 如果问题仍然存在

如果按照以上步骤操作后问题仍然存在，请提供以下信息：

1. **浏览器控制台截图**（Console 标签）
2. **网络请求截图**（Network 标签，Request Payload 部分）
3. **后端日志**（包含 runId 的相关日志）
4. **前端版本**：检查 `package.json` 中的版本号

## 验证清单

- [ ] 已硬刷新浏览器（Ctrl + Shift + R）
- [ ] 已打开开发者工具 Network 标签
- [ ] 执行引擎选择了 **Playwright Test Runner**
- [ ] 断言匹配策略选择了具体模式（不是默认值）
- [ ] 请求中包含 `assertionMatchMode` 字段
- [ ] 后端日志显示断言匹配模式

## 相关文档

- [断言匹配策略实施总结](./assertion-match-mode-implementation.md)
- [执行引擎要求说明](./assertion-match-mode-engine-requirement.md)
- [完整实施文档](./assertion-match-mode-ui-update.md)
