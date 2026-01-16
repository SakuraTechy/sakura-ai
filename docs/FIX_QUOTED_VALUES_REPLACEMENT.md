# 修复单引号包裹值的配置变量替换

## 📋 问题描述

AI生成的测试用例中，单引号包裹的账号密码（如 `'admin'`）没有被替换为配置变量占位符。

### 问题示例

**保存前的数据：**
```
steps: "2. 在用户名输入框中输入'admin'\n3. 在密码输入框中输入'admin'"
```

**保存后的数据：**
```
steps: "2. 在用户名输入框中输入'admin'\n3. 在密码输入框中输入'admin'"
```

❌ `'admin'` 没有被替换为 `'{{CONFIG.ACCOUNT.USERNAME}}'`

## 🔍 根本原因

### 1. 项目配置账号不匹配

项目配置的账号是 `sysadmin`，而AI生成的测试用例中使用的是 `admin`。

配置变量替换的"精确替换"逻辑只替换项目配置中的实际值：
```typescript
// 只替换 sysadmin，不替换 admin
const accountRegex = new RegExp(
  `(?<![a-zA-Z0-9_])${this.escapeRegex(accountName)}(?![a-zA-Z0-9_])`,
  'g'
);
```

### 2. 语义替换规则不完整

现有的"基于语义的智能替换"只处理带标签的模式：
- ✅ `用户名：admin` → 替换
- ✅ `username: admin` → 替换
- ❌ `输入'admin'` → **不替换**

缺少对单引号包裹值的处理。

## ✅ 解决方案

添加新的替换规则，专门处理单引号包裹的账号密码：

```typescript
// 4.3 单引号包裹的账号密码模式：'admin', 'password'
// 匹配：输入'admin'、输入'password'、显示'admin'等
const quotedValuePattern = /(输入|显示|内容为|用户名为|密码为|账号为)['']([^'']{2,20})['']/g;
result = result.replace(quotedValuePattern, (match, prefix, value) => {
  // 如果匹配的内容包含占位符，不替换
  if (match.includes('{{CONFIG.') || value.includes('{{CONFIG.')) {
    return match;
  }
  // 跳过纯数字、URL等
  if (/^\d+$/.test(value) || value.includes('/') || value.includes('.') || value.includes('http')) {
    return match;
  }
  localCount++;
  console.log(`  🔄 [${fieldName || parentFieldName}] 替换单引号包裹的值: '${value}' -> 占位符`);
  return `${prefix}'${this.PLACEHOLDERS.ACCOUNT_USERNAME}'`;
});
```

### 匹配模式

- `输入'admin'` → `输入'{{CONFIG.ACCOUNT.USERNAME}}'`
- `显示'admin'` → `显示'{{CONFIG.ACCOUNT.USERNAME}}'`
- `内容为'admin'` → `内容为'{{CONFIG.ACCOUNT.USERNAME}}'`
- `用户名为'admin'` → `用户名为'{{CONFIG.ACCOUNT.USERNAME}}'`

### 修改位置

`server/services/configVariableService.ts` - `deepReplaceHardcoded` 方法中的语义替换部分

## 🧪 测试验证

### 测试数据

```json
{
  "steps": "1. 打开登录页面\n2. 在用户名输入框中输入'admin'\n3. 在密码输入框中输入'admin'\n4. 点击登录按钮"
}
```

### 预期结果

```json
{
  "steps": "1. 打开登录页面\n2. 在用户名输入框中输入'{{CONFIG.ACCOUNT.USERNAME}}'\n3. 在密码输入框中输入'{{CONFIG.ACCOUNT.PASSWORD}}'\n4. 点击登录按钮"
}
```

## 📊 影响范围

### 受益功能

- ✅ AI生成的测试用例中，单引号包裹的账号密码能正确替换
- ✅ 支持多种语义模式：输入、显示、内容为等
- ✅ 避免误替换：跳过纯数字、URL等

### 不受影响

- ✅ 精确替换逻辑（替换项目配置的实际值）
- ✅ 其他语义替换规则（带标签的账号密码）
- ✅ 手动创建的测试用例

## 🎯 关键要点

1. **AI生成的数据可能不一致**：AI可能使用通用的 `admin`，而不是项目配置的实际账号
2. **需要多层替换策略**：
   - 第一层：精确替换项目配置的实际值
   - 第二层：语义替换常见的硬编码模式
3. **避免误替换**：使用严格的匹配规则，跳过数字、URL等

## 📝 相关文档

- [配置变量动态替换功能说明](./CONFIG_VARIABLE_REPLACEMENT.md)
- [智能替换策略](./SMART_REPLACEMENT_STRATEGY.md)
- [修复硬编码数据问题](./FIX_HARDCODED_DATA_ISSUE.md)

---

**修复时间**：2026-01-12  
**修复人员**：Kiro AI Assistant  
**状态**：✅ 已完成
