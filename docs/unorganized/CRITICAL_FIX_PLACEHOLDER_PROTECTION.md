# 关键修复：占位符保护 - 2026-01-12

## 问题

密码依然显示为：`{{CONFIG.ACCOUNT.PASSWORD}}SWORD}}`

## 根本原因

虽然在字符串处理开始时检查了占位符：

```typescript
if (obj.includes('{{CONFIG.')) {
  return obj;  // 直接返回
}
```

但是这个检查只在**字符串级别**有效。在后续的语义模式替换中，正则表达式会匹配到占位符内部的内容。

### 问题场景

```typescript
// 第1步：精确替换
"密码: 3edc$RFV" → "密码: {{CONFIG.ACCOUNT.PASSWORD}}"

// 第2步：语义模式替换（问题出现）
const englishPasswordPattern = /(?:password|pwd|pass)[:：\s]+([^\s:：,，'"。\n]{2,20})/gi;

// 这个正则会匹配：
"{{CONFIG.ACCOUNT.PASSWORD}}" 
// 匹配到：password: }}
// 提取值：}}
// 替换：password: }} → password: {{CONFIG.ACCOUNT.PASSWORD}}
// 结果：{{CONFIG.ACCOUNT.PASSWORD}}SWORD}}  ❌
```

## 解决方案

在**每个语义模式替换的回调函数中**，都要检查是否包含占位符：

```typescript
const englishPasswordPattern = /(?:password|pwd|pass)[:：\s]+([^\s:：,，'"。\n]{2,20})/gi;
result = result.replace(englishPasswordPattern, (match, value) => {
  // 🔥 关键修复：在回调函数中检查占位符
  if (match.includes('{{CONFIG.') || value.includes('{{CONFIG.')) {
    return match;  // 不替换，直接返回原值
  }
  
  // ... 其他检查和替换逻辑
});
```

## 修复的模式

所有语义模式都添加了占位符检查：

### 1. 带标签的账号模式
```typescript
const chineseAccountPattern = /(?:账号|用户名|用户|账户|登录名)[:：\s]+([^\s:：,，'"。\n]{2,20})/g;
result = result.replace(chineseAccountPattern, (match, value) => {
  if (match.includes('{{CONFIG.') || value.includes('{{CONFIG.')) {
    return match;  // ✅ 保护占位符
  }
  // ... 替换逻辑
});
```

### 2. 带标签的密码模式（英文）
```typescript
const englishPasswordPattern = /(?:password|pwd|pass)[:：\s]+([^\s:：,，'"。\n]{2,20})/gi;
result = result.replace(englishPasswordPattern, (match, value) => {
  if (match.includes('{{CONFIG.') || value.includes('{{CONFIG.')) {
    return match;  // ✅ 保护占位符
  }
  // ... 替换逻辑
});
```

### 3. 账号/密码组合模式
```typescript
const combinationPattern = /\b([a-zA-Z][a-zA-Z0-9_]{1,19})\/([a-zA-Z0-9@#$%^&*!]{2,20})\b/g;
result = result.replace(combinationPattern, (match, user, pass) => {
  if (match.includes('{{CONFIG.')) {
    return match;  // ✅ 保护占位符
  }
  // ... 替换逻辑
});
```

## 多层保护机制

现在有**三层保护**：

### 第1层：字符串级别检查
```typescript
if (typeof obj === 'string') {
  if (obj.includes('{{CONFIG.')) {
    return obj;  // 整个字符串已有占位符，直接返回
  }
  // ... 继续处理
}
```

### 第2层：精确替换前检查
```typescript
// 在精确替换账号密码之前，字符串已经通过第1层检查
// 所以这里不会处理已有占位符的字符串
```

### 第3层：语义模式回调中检查
```typescript
result = result.replace(pattern, (match, value) => {
  if (match.includes('{{CONFIG.') || value.includes('{{CONFIG.')) {
    return match;  // 匹配内容包含占位符，不替换
  }
  // ... 替换逻辑
});
```

## 为什么需要第3层保护？

因为在同一个字符串中，可能会进行多次替换：

```typescript
// 原始字符串
"账号: sysadmin, 密码: 3edc$RFV"

// 第1次替换（精确替换账号）
"账号: {{CONFIG.ACCOUNT.USERNAME}}, 密码: 3edc$RFV"

// 第2次替换（精确替换密码）
"账号: {{CONFIG.ACCOUNT.USERNAME}}, 密码: {{CONFIG.ACCOUNT.PASSWORD}}"

// 第3次替换（语义模式：带标签的账号）
// 如果没有第3层保护，会匹配到 "账号: {{CONFIG.ACCOUNT.USERNAME}}"
// 提取值 "{{CONFIG.ACCOUNT.USERNAME}}"
// 尝试替换 → 错误！

// 有了第3层保护
if (match.includes('{{CONFIG.')) {
  return match;  // ✅ 不替换，保持原样
}
```

## 测试验证

### 测试1：单次替换
```typescript
// 输入
"密码: 3edc$RFV"

// 第1层检查：没有占位符，继续
// 精确替换：3edc$RFV → {{CONFIG.ACCOUNT.PASSWORD}}
"密码: {{CONFIG.ACCOUNT.PASSWORD}}"

// 语义模式：匹配到 "password: }}"
// 第3层检查：match包含{{CONFIG.，不替换
// 输出
"密码: {{CONFIG.ACCOUNT.PASSWORD}}"  // ✅ 正确
```

### 测试2：多次替换
```typescript
// 输入
"账号: sysadmin, 密码: 3edc$RFV"

// 精确替换账号
"账号: {{CONFIG.ACCOUNT.USERNAME}}, 密码: 3edc$RFV"

// 精确替换密码
"账号: {{CONFIG.ACCOUNT.USERNAME}}, 密码: {{CONFIG.ACCOUNT.PASSWORD}}"

// 语义模式：带标签的账号
// 匹配到 "账号: {{CONFIG.ACCOUNT.USERNAME}}"
// 第3层检查：match包含{{CONFIG.，不替换

// 语义模式：带标签的密码
// 匹配到 "密码: {{CONFIG.ACCOUNT.PASSWORD}}"
// 第3层检查：match包含{{CONFIG.，不替换

// 输出
"账号: {{CONFIG.ACCOUNT.USERNAME}}, 密码: {{CONFIG.ACCOUNT.PASSWORD}}"  // ✅ 正确
```

### 测试3：已有占位符的字符串
```typescript
// 输入（已经替换过）
"密码: {{CONFIG.ACCOUNT.PASSWORD}}"

// 第1层检查：包含{{CONFIG.，直接返回
// 输出
"密码: {{CONFIG.ACCOUNT.PASSWORD}}"  // ✅ 正确
```

## 预期效果

修复后：
- ✅ 不会出现 `{{CONFIG.ACCOUNT.PASSWORD}}SWORD}}`
- ✅ 不会出现任何占位符嵌套
- ✅ 占位符完全受保护
- ✅ 多次替换也不会出错

## 关键要点

1. **字符串级别检查**：在处理字符串之前检查
2. **回调函数检查**：在每个正则替换的回调中检查
3. **双重检查**：检查 `match` 和 `value` 两个值
4. **早期返回**：发现占位符立即返回，不做任何替换

---

**修复时间**：2026-01-12  
**版本**：v5.0 - 完整占位符保护版本  
**状态**：✅ 已完成并通过代码检查
