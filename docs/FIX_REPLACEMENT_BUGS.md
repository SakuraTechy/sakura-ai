# 修复配置变量替换Bug - 2026-01-12

## 发现的问题

从日志中发现了严重的替换错误：

### 问题1：重复替换
```
原文: 用户名
第1次替换: 用户名 -> 用户{{CONFIG.ACCOUNT.USERNAME}}
第2次替换: 用户{{CONFIG.ACCOUNT.USERNAME}} -> 用户{{CONFIG.ACCOUNT{{CONFIG.ACCOUNT.USERNAME}}
```

**结果**：占位符被嵌套，导致数据错误

### 问题2：误替换单词
```
原文: ACCOUNT
替换: ACCOUNT -> {{CONFIG.ACCOUNT.USERNAME}}
结果: ACCOUNTsysadmin -> {{CONFIG.ACCOUNT{{CONFIG.ACCOUNT.USERNAME}}sysadmin
```

**原因**：词边界匹配不够严格，把 `ACCOUNT` 这个单词也当成账号名替换了

### 问题3：IP地址被误替换
```
原文: 172.19.5.47/login
替换: 172.19.5.47/login -> {{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}}
```

**原因**：账号/密码组合模式太宽松，把IP地址路径也当成账号密码了

### 问题4：过度替换
```
日志显示：
🔄 替换带标签的账号: 用户名输入框输入' -> 占位符
🔄 替换带标签的账号: ACCOUNT.USERNAME}}/{{CONFIG -> 占位符
🔄 替换带标签的账号: ACCOUNT.PASSWORD}} -> 占位符
```

**原因**：语义模式太宽松，匹配了不该匹配的内容

## 修复方案

### 1. 添加占位符保护

**最重要的修复**：在处理字符串之前，先检查是否已包含占位符

```typescript
if (typeof obj === 'string') {
  // 如果已经包含占位符，直接返回，避免重复替换
  if (obj.includes('{{CONFIG.')) {
    return obj;
  }
  
  // ... 继续替换逻辑
}
```

### 2. 使用更严格的词边界

**旧方案**（有问题）：
```typescript
// 使用lookbehind和lookahead，但包含了太多字符
(?<=^|[\\s:：,，、。！？；;'"\"'""（）()\\[\\]【】{}])
```

**新方案**（更严格）：
```typescript
// 只匹配非字母数字字符边界
(?<![a-zA-Z0-9_])${accountName}(?![a-zA-Z0-9_])
```

这样可以避免：
- `ACCOUNTsysadmin` 中的 `ACCOUNT` 被替换
- `username` 中的 `user` 被替换

### 3. 限制账号/密码组合模式

**旧方案**（太宽松）：
```typescript
/([^\s\/]+)\/([^\s\/]+)/g  // 匹配任何 xxx/xxx
```

**新方案**（更严格）：
```typescript
/\b([a-zA-Z][a-zA-Z0-9_]{1,19})\/([a-zA-Z0-9@#$%^&*!]{2,20})\b/g
```

限制条件：
- 账号必须以字母开头
- 账号只能包含字母、数字、下划线
- 密码可以包含特殊字符
- 使用词边界 `\b`
- 排除纯数字（IP地址）

### 4. 优化语义模式

**改进带标签模式**：
```typescript
// 旧：匹配任何字符
/(?:账号|用户名)[:：\s]*['"]?([^'",，\s\n]{2,20})['"]?/gi

// 新：更精确的匹配，使用 + 而不是 *
/(?:账号|用户名)[:：\s]+([^\s:：,，'"。\n]{2,20})/g
```

改进：
- 标签后必须有空格或冒号（`+` 而不是 `*`）
- 排除更多分隔符（`:`, `：`, `。`）
- 添加数字和特殊格式检查

### 5. 添加值验证

在替换前验证值是否合理：

```typescript
result = result.replace(pattern, (match, value) => {
  // 排除纯数字
  if (/^\d+$/.test(value)) {
    return match;
  }
  
  // 排除包含特殊字符的（可能是URL或路径）
  if (value.includes('/') || value.includes('.')) {
    return match;
  }
  
  // 执行替换
  return match.replace(value, placeholder);
});
```

## 修复后的替换流程

### 1. 检查占位符
```typescript
if (obj.includes('{{CONFIG.')) {
  return obj;  // 已经替换过，直接返回
}
```

### 2. 替换服务器URL
```typescript
// 精确匹配完整的URL
http://172.19.5.47:22 -> {{CONFIG.SERVER.URL}}
```

### 3. 替换访问URL模式
```typescript
访问 http://172.19.5.47/login -> 访问 {{CONFIG.SERVER.URL}}
```

### 4. 精确替换账号密码值
```typescript
// 使用严格的词边界
sysadmin -> {{CONFIG.ACCOUNT.USERNAME}}  ✅
ACCOUNTsysadmin -> ACCOUNTsysadmin  ✅ (不替换)
```

### 5. 语义模式替换
```typescript
// 带标签
账号: testuser -> 账号: {{CONFIG.ACCOUNT.USERNAME}}

// 组合（严格限制）
testuser/Test@123 -> {{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}}  ✅
172.19.5.47/login -> 172.19.5.47/login  ✅ (不替换IP)
```

## 测试用例

### 测试1：避免重复替换
```
输入: "用户名: {{CONFIG.ACCOUNT.USERNAME}}"
输出: "用户名: {{CONFIG.ACCOUNT.USERNAME}}"  ✅ (不变)
```

### 测试2：避免误替换单词
```
输入: "ACCOUNT字段"
输出: "ACCOUNT字段"  ✅ (不替换)

输入: "account: sysadmin"
输出: "account: {{CONFIG.ACCOUNT.USERNAME}}"  ✅ (只替换值)
```

### 测试3：避免IP地址误替换
```
输入: "访问 172.19.5.47/login"
输出: "访问 {{CONFIG.SERVER.URL}}"  ✅ (替换整个URL)

输入: "使用 172.19.5.47/login"
输出: "使用 172.19.5.47/login"  ✅ (不是访问模式，不替换)
```

### 测试4：正确的账号密码组合
```
输入: "使用 testuser/Test@123 登录"
输出: "使用 {{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}} 登录"  ✅

输入: "使用 admin/admin 登录"
输出: "使用 {{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}} 登录"  ✅
```

## 关键改进点

### 1. 占位符保护（最重要）
- 在任何替换之前，先检查是否已包含占位符
- 避免重复替换导致的嵌套问题

### 2. 严格的词边界
- 使用 `(?<![a-zA-Z0-9_])` 和 `(?![a-zA-Z0-9_])`
- 避免误替换单词的一部分

### 3. 模式限制
- 账号/密码组合必须符合特定格式
- 排除IP地址、URL等特殊情况

### 4. 值验证
- 检查提取的值是否合理
- 排除纯数字、包含特殊字符的值

### 5. 简化逻辑
- 移除过于复杂的上下文判断
- 使用更直接的模式匹配

## 预期效果

修复后，替换应该：
- ✅ 不会重复替换已有的占位符
- ✅ 不会误替换单词的一部分
- ✅ 不会把IP地址当成账号密码
- ✅ 只替换真正的账号密码值
- ✅ 日志清晰，易于调试

## 相关文档

- [智能配置变量替换策略](./SMART_REPLACEMENT_STRATEGY.md)
- [配置变量动态替换功能说明](./CONFIG_VARIABLE_REPLACEMENT.md)
- [实施状态](./IMPLEMENTATION_STATUS.md)

---

**修复时间**：2026-01-12  
**状态**：✅ 已完成并通过代码检查
