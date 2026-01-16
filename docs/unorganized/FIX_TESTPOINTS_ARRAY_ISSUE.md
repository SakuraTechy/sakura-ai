# 修复 testPoints 数组字段类型问题

## 📋 问题描述

在处理 AI 生成的测试用例时，配置变量替换功能报错：

```
❌ [ConfigVariable] 替换失败: TypeError: item[itemKey]?.substring is not a function
```

导致 `testPoints` 数组中的 `steps` 和 `expectedResult` 字段没有被替换。

## 🔍 根本原因

AI 生成的测试用例中，`testPoints[0].expectedResult` 是一个**数组**，而不是字符串：

```json
{
  "testPoints": [
    {
      "steps": "1. 【操作】打开登录页面\n...",  // ✅ 字符串
      "expectedResult": [  // ❌ 数组！
        "页面正常加载，显示用户名和密码输入框、登录按钮及密码可见性切换图标",
        "输入框接收输入，光标停留在用户名输入框",
        "输入框接收输入，显示为掩码状态",
        "登录按钮进入加载状态（loading），同时触发前端表单验证",
        "系统成功验证凭据，用户被重定向到首页，显示欢迎信息和导航菜单"
      ]
    }
  ]
}
```

在调试日志代码中，尝试对所有字段值调用 `substring(0, 50)` 方法：

```typescript
console.log(`  📝 处理testPoints[${idx}].${itemKey} (需要替换), 值:`, item[itemKey]?.substring(0, 50));
```

当 `itemKey` 是 `expectedResult` 时，`item[itemKey]` 是一个数组，数组没有 `substring` 方法，导致报错。

## ✅ 解决方案

修改调试日志代码，处理字段值可能是数组的情况：

```typescript
// 🔥 修复：处理字段值可能是数组的情况
const fieldValue = item[itemKey];
const valuePreview = Array.isArray(fieldValue) 
  ? `[数组, ${fieldValue.length}个元素]`
  : (typeof fieldValue === 'string' ? fieldValue.substring(0, 50) : String(fieldValue));
console.log(`  📝 处理testPoints[${idx}].${itemKey} (需要替换), 值:`, valuePreview);
```

### 修改位置

`server/services/configVariableService.ts` - `deepReplaceHardcoded` 方法中的 testPoints 数组处理部分

## 🔄 工作原理

`deepReplaceHardcoded` 方法本身已经支持递归处理各种数据类型：

```typescript
private deepReplaceHardcoded(obj: any, ...): any {
  if (typeof obj === 'string') {
    // 处理字符串：执行替换
    return result;
  }

  if (Array.isArray(obj)) {
    // 处理数组：递归处理每个元素
    return obj.map(item => this.deepReplaceHardcoded(item, ...));
  }

  if (obj && typeof obj === 'object') {
    // 处理对象：递归处理每个字段
    // ...
  }

  return obj;
}
```

所以，即使 `expectedResult` 是数组，`deepReplaceHardcoded` 也能正确处理：
1. 识别出它是数组
2. 递归处理数组中的每个字符串元素
3. 在每个字符串元素中替换硬编码的账号密码

## 🧪 测试验证

### 测试数据

```json
{
  "testPoints": [
    {
      "steps": "1. 输入'admin'\n2. 输入'admin'",
      "expectedResult": [
        "显示'admin'",
        "用户admin登录成功"
      ]
    }
  ]
}
```

### 预期结果

替换后：

```json
{
  "testPoints": [
    {
      "steps": "1. 输入'{{CONFIG.ACCOUNT.USERNAME}}'\n2. 输入'{{CONFIG.ACCOUNT.PASSWORD}}'",
      "expectedResult": [
        "显示'{{CONFIG.ACCOUNT.USERNAME}}'",
        "用户{{CONFIG.ACCOUNT.USERNAME}}登录成功"
      ]
    }
  ]
}
```

## 📊 影响范围

### 受益功能

- ✅ AI 生成的测试用例中，`testPoints` 数组的所有字段都能正确替换
- ✅ 支持字段值为字符串、数组、对象等各种类型
- ✅ 调试日志不再报错，能正确显示字段值预览

### 不受影响

- ✅ 配置变量替换的核心逻辑（已经支持递归处理）
- ✅ 其他字段的替换逻辑
- ✅ 手动创建的测试用例

## 🎯 关键要点

1. **AI 生成的数据结构可能多样**：字段值可能是字符串、数组、对象等
2. **调试日志要健壮**：不能假设字段值的类型
3. **核心逻辑要通用**：`deepReplaceHardcoded` 的递归设计很好，能处理各种数据结构

## 📝 相关文档

- [配置变量动态替换功能说明](./CONFIG_VARIABLE_REPLACEMENT.md)
- [AI生成用例配置替换修复](./FIX_AI_GENERATED_CONFIG_REPLACEMENT.md)
- [调试配置变量替换问题](./DEBUG_CONFIG_REPLACEMENT_ISSUE.md)

---

**修复时间**：2026-01-12  
**修复人员**：Kiro AI Assistant  
**状态**：✅ 已完成
