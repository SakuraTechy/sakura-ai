# 修复服务器URL占位符替换问题

## 📋 问题描述

用户反馈：测试用例中的服务器URL占位符 `{{CONFIG.SERVER.URL}}` 没有被替换为实际的URL值。

**示例**：
```
步骤: "1. 访问登录页面：{{CONFIG.SERVER.URL}}"
期望: "1. 访问登录页面：https://172.19.5.47:443/login"
实际: "1. 访问登录页面：{{CONFIG.SERVER.URL}}"  ❌ 占位符未被替换
```

## 🔍 根本原因

`server_configs` 表的数据结构与代码实现不匹配：

### 数据库实际结构
```json
{
  "id": 1,
  "host_name": "172.19.5.47",
  "host_port": 443,
  "parameters": {
    "url": "https://172.19.5.47:443/login",
    "eth": "eth1"
  }
}
```

### 原代码实现
```typescript
// ❌ 错误：只从 host_name 和 host_port 构建URL
private buildServerUrl(server: any): string {
  if (!server || !server.host_name) return '';
  
  const protocol = server.host_port === 443 ? 'https' : 'http';
  const port = (server.host_port === 80 || server.host_port === 443) 
    ? '' 
    : `:${server.host_port}`;
  
  return `${protocol}://${server.host_name}${port}`;
  // 返回: "https://172.19.5.47"
  // 缺少路径: "/login"
}
```

**问题**：
1. `parameters.url` 字段包含完整的URL（包括路径 `/login`）
2. 原代码忽略了 `parameters.url`，只从 `host_name` 和 `host_port` 构建
3. 构建的URL缺少路径部分，导致URL不完整

## ✅ 解决方案

修改 `buildServerUrl()` 方法，优先使用 `parameters.url`：

### 修复后的代码

```typescript
/**
 * 构建服务器URL
 * 优先使用 parameters.url，如果没有则从 host_name 和 host_port 构建
 */
private buildServerUrl(server: any): string {
  if (!server) return '';
  
  // 🔥 优先使用 parameters.url（如果存在）
  if (server.parameters && typeof server.parameters === 'object') {
    const params = server.parameters as Record<string, any>;
    if (params.url && typeof params.url === 'string') {
      console.log(`  🌐 使用 parameters.url: ${params.url}`);
      return params.url;
    }
  }
  
  // 如果没有 parameters.url，从 host_name 和 host_port 构建
  if (!server.host_name) return '';
  
  const protocol = server.host_port === 443 ? 'https' : 'http';
  const port = (server.host_port === 80 || server.host_port === 443) 
    ? '' 
    : `:${server.host_port}`;
  
  const constructedUrl = `${protocol}://${server.host_name}${port}`;
  console.log(`  🌐 从 host_name 和 host_port 构建 URL: ${constructedUrl}`);
  return constructedUrl;
}
```

### 修复逻辑

1. **优先级1**：检查 `server.parameters.url` 是否存在
   - 如果存在，直接使用（包含完整路径）
   - 返回：`https://172.19.5.47:443/login` ✅

2. **优先级2**：如果没有 `parameters.url`，从 `host_name` 和 `host_port` 构建
   - 向后兼容旧数据
   - 返回：`https://172.19.5.47`

## 📝 修改的文件

### 1. `server/services/configVariableService.ts`
- 修改 `buildServerUrl()` 方法
- 添加调试日志到 `replacePlaceholdersInString()`
- 添加配置信息日志到 `batchReplacePlaceholders()`

### 2. `server/services/testConfigService.ts`
- 修改 `buildTestUrl()` 方法（保持一致性）

## 🧪 测试验证

### 测试场景1：使用 parameters.url
```typescript
const server = {
  host_name: "172.19.5.47",
  host_port: 443,
  parameters: {
    url: "https://172.19.5.47:443/login"
  }
};

buildServerUrl(server);
// 返回: "https://172.19.5.47:443/login" ✅
```

### 测试场景2：没有 parameters.url（向后兼容）
```typescript
const server = {
  host_name: "example.com",
  host_port: 8080,
  parameters: null
};

buildServerUrl(server);
// 返回: "http://example.com:8080" ✅
```

### 测试场景3：占位符替换
```typescript
const testCase = {
  steps: "1. 访问登录页面：{{CONFIG.SERVER.URL}}"
};

// 替换后
{
  steps: "1. 访问登录页面：https://172.19.5.47:443/login"
}
```

## 🔄 工作流程

### 保存时（硬编码 → 占位符）
```
原始数据:
"访问登录页面：https://172.19.5.47:443/login"

↓ replaceHardcodedWithPlaceholders()

保存到数据库:
"访问登录页面：{{CONFIG.SERVER.URL}}"
```

### 读取时（占位符 → 实际值）
```
数据库数据:
"访问登录页面：{{CONFIG.SERVER.URL}}"

↓ batchReplacePlaceholders()
↓ buildServerUrl() 从 parameters.url 获取

前端显示:
"访问登录页面：https://172.19.5.47:443/login" ✅
```

## 📊 调试日志

修复后，控制台会输出详细的调试信息：

```
🔄 [ConfigVariable] 批量替换 10 个测试用例的配置变量...
📋 [ConfigVariable] 项目 1 配置信息: {
  hasAccount: true,
  hasServer: true,
  hasDatabase: true,
  serverParameters: { url: 'https://172.19.5.47:443/login', eth: 'eth1' },
  serverHostName: '172.19.5.47',
  serverHostPort: 443
}
  🌐 使用 parameters.url: https://172.19.5.47:443/login
  🔄 [Placeholder] 替换 {{CONFIG.SERVER.URL}} -> https://172.19.5.47:443/login
✅ [ConfigVariable] 批量替换完成
```

## ✅ 验证清单

- [x] 修复 `buildServerUrl()` 方法，优先使用 `parameters.url`
- [x] 修复 `buildTestUrl()` 方法（保持一致性）
- [x] 添加调试日志，便于追踪问题
- [x] 向后兼容：没有 `parameters.url` 时仍能工作
- [x] 测试场景覆盖：有/无 `parameters.url`

## 🎯 预期效果

修复后，用户在查看测试用例时：

**之前**：
```
步骤: "1. 访问登录页面：{{CONFIG.SERVER.URL}}"  ❌
```

**之后**：
```
步骤: "1. 访问登录页面：https://172.19.5.47:443/login"  ✅
```

## 📚 相关文档

- [配置变量动态替换功能说明](./CONFIG_VARIABLE_REPLACEMENT.md)
- [字段特定替换策略](./FIELD_SPECIFIC_REPLACEMENT.md)
- [占位符保护机制](./CRITICAL_FIX_PLACEHOLDER_PROTECTION.md)

---

**修复时间**：2026-01-12  
**修复版本**：v1.1  
**状态**：✅ 已完成
