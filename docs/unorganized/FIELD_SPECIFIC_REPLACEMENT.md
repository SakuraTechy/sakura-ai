# 字段特定替换策略 - 2026-01-12

## 核心需求

根据用户反馈，配置变量替换应该：

1. **只在特定字段中替换**：只在测试相关字段中替换账号密码
2. **不影响其他字段**：名称、标签、描述等字段保持原样
3. **正确处理特殊字符**：密码中的 `$` 等特殊字符需要正确转义

## 问题分析

### 问题1：所有字段都被替换

**之前的行为**：
```javascript
{
  name: '用户登录测试',
  tags: '用户登录',
  test_data: '账号: sysadmin, 密码: 3edc$RFV'
}
```

**错误的替换结果**：
```javascript
{
  name: '用户{{CONFIG.ACCOUNT.USERNAME}}测试',  // ❌ 名称被破坏
  tags: '用户{{CONFIG.ACCOUNT.USERNAME}}',      // ❌ 标签被破坏
  test_data: '账号: {{CONFIG.ACCOUNT.USERNAME}}, 密码: {{CONFIG.ACCOUNT.PASSWORD}}'  // ✅ 正确
}
```

### 问题2：特殊字符处理

密码 `3edc$RFV` 中的 `$` 是正则表达式特殊字符，如果不正确转义会导致匹配失败。

## 解决方案

### 1. 字段白名单机制

只在以下字段中进行配置变量替换：

```typescript
private shouldReplaceField(fieldName: string): boolean {
  const replaceableFields = [
    'preconditions',      // 前置条件
    'test_data',          // 测试数据
    'testData',           // 测试数据（兼容）
    'steps',              // 测试步骤
    'test_point_steps',   // 测试点步骤
    'expected_result',    // 预期结果
    'test_point_expected_result',  // 测试点预期结果
    'expectedResult',     // 预期结果（兼容）
    'assertions'          // 断言（兼容）
  ];
  
  return replaceableFields.includes(fieldName);
}
```

### 2. 递归处理时检查字段名

```typescript
if (obj && typeof obj === 'object') {
  const result: any = {};
  for (const key in obj) {
    // 🔥 关键：只在特定字段中进行替换
    const shouldReplace = this.shouldReplaceField(key);
    
    if (shouldReplace) {
      result[key] = this.deepReplaceHardcoded(obj[key], ...);
    } else {
      // 不替换的字段，直接复制
      result[key] = obj[key];
    }
  }
  return result;
}
```

### 3. 特殊字符转义

使用 `escapeRegex` 方法正确转义所有正则表达式特殊字符：

```typescript
private escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

这会将：
- `3edc$RFV` 转义为 `3edc\$RFV`
- `test.user` 转义为 `test\.user`
- `admin*123` 转义为 `admin\*123`

## 替换字段说明

### ✅ 会被替换的字段

| 字段名 | 说明 | 示例 |
|--------|------|------|
| `preconditions` | 前置条件 | "用户已登录系统" |
| `test_data` | 测试数据 | "账号: sysadmin, 密码: 3edc$RFV" |
| `testData` | 测试数据（兼容） | 同上 |
| `steps` | 测试步骤 | "1. 输入账号 sysadmin\n2. 输入密码 3edc$RFV" |
| `test_point_steps` | 测试点步骤 | 同上 |
| `expected_result` | 预期结果 | "成功登录，显示用户名 sysadmin" |
| `test_point_expected_result` | 测试点预期结果 | 同上 |
| `expectedResult` | 预期结果（兼容） | 同上 |
| `assertions` | 断言（兼容） | 同上 |

### ❌ 不会被替换的字段

| 字段名 | 说明 | 原因 |
|--------|------|------|
| `name` | 测试用例名称 | 名称应该保持可读性 |
| `description` | 描述 | 描述应该保持原样 |
| `tags` | 标签 | 标签用于分类，不应包含占位符 |
| `test_point_name` | 测试点名称 | 同名称 |
| `test_purpose` | 测试目的 | 同描述 |
| `scenario_name` | 场景名称 | 同名称 |
| `scenario_description` | 场景描述 | 同描述 |
| `coverage_areas` | 覆盖范围 | 同描述 |
| `system` | 系统名称 | 元数据字段 |
| `module` | 模块名称 | 元数据字段 |
| `priority` | 优先级 | 元数据字段 |
| `status` | 状态 | 元数据字段 |

## 实际效果

### 示例1：完整的测试用例

**输入数据**：
```javascript
{
  name: '用户登录测试',
  description: '验证用户使用正确的账号密码登录',
  tags: '用户登录,冒烟测试',
  system: '数据库安全审计系统',
  module: '登录模块',
  
  preconditions: '用户已访问登录页面',
  test_data: '账号: sysadmin\n密码: 3edc$RFV',
  steps: '1. 输入账号 sysadmin\n2. 输入密码 3edc$RFV\n3. 点击登录',
  expected_result: '成功登录，显示用户名 sysadmin'
}
```

**替换后**：
```javascript
{
  name: '用户登录测试',  // ✅ 保持不变
  description: '验证用户使用正确的账号密码登录',  // ✅ 保持不变
  tags: '用户登录,冒烟测试',  // ✅ 保持不变
  system: '数据库安全审计系统',  // ✅ 保持不变
  module: '登录模块',  // ✅ 保持不变
  
  preconditions: '用户已访问登录页面',  // ✅ 保持不变（没有账号密码）
  test_data: '账号: {{CONFIG.ACCOUNT.USERNAME}}\n密码: {{CONFIG.ACCOUNT.PASSWORD}}',  // ✅ 替换
  steps: '1. 输入账号 {{CONFIG.ACCOUNT.USERNAME}}\n2. 输入密码 {{CONFIG.ACCOUNT.PASSWORD}}\n3. 点击登录',  // ✅ 替换
  expected_result: '成功登录，显示用户名 {{CONFIG.ACCOUNT.USERNAME}}'  // ✅ 替换
}
```

### 示例2：特殊字符密码

**输入数据**：
```javascript
{
  test_data: '密码: 3edc$RFV'
}
```

**处理过程**：
1. `escapeRegex('3edc$RFV')` → `'3edc\\$RFV'`
2. 创建正则表达式：`/(?<![a-zA-Z0-9_])3edc\$RFV(?![a-zA-Z0-9_])/g`
3. 匹配并替换：`'密码: 3edc$RFV'` → `'密码: {{CONFIG.ACCOUNT.PASSWORD}}'`

**替换后**：
```javascript
{
  test_data: '密码: {{CONFIG.ACCOUNT.PASSWORD}}'  // ✅ 正确替换
}
```

## 优势

### 1. 保持数据完整性

- 名称、标签、描述等字段保持原样
- 不会破坏测试用例的可读性
- 元数据字段不受影响

### 2. 精确替换

- 只在需要的地方替换
- 减少误替换的风险
- 提高替换的准确性

### 3. 特殊字符支持

- 正确处理密码中的特殊字符（`$`, `*`, `.`, `+` 等）
- 不会因为特殊字符导致匹配失败
- 支持各种复杂的密码格式

### 4. 向后兼容

- 支持多种字段名（`test_data` 和 `testData`）
- 支持旧版本的字段名
- 平滑升级

## 测试建议

### 测试1：字段隔离

```javascript
// 输入
{
  name: '用户sysadmin登录',
  test_data: '账号: sysadmin'
}

// 预期输出
{
  name: '用户sysadmin登录',  // ✅ 不变
  test_data: '账号: {{CONFIG.ACCOUNT.USERNAME}}'  // ✅ 替换
}
```

### 测试2：特殊字符密码

```javascript
// 输入（密码包含 $, @, # 等特殊字符）
{
  test_data: '密码: 3edc$RFV@2024#'
}

// 预期输出
{
  test_data: '密码: {{CONFIG.ACCOUNT.PASSWORD}}'  // ✅ 正确替换
}
```

### 测试3：多字段混合

```javascript
// 输入
{
  name: '登录测试',
  tags: '登录,sysadmin',
  steps: '输入账号 sysadmin',
  expected_result: '显示用户 sysadmin'
}

// 预期输出
{
  name: '登录测试',  // ✅ 不变
  tags: '登录,sysadmin',  // ✅ 不变
  steps: '输入账号 {{CONFIG.ACCOUNT.USERNAME}}',  // ✅ 替换
  expected_result: '显示用户 {{CONFIG.ACCOUNT.USERNAME}}'  // ✅ 替换
}
```

## 相关文档

- [修复配置变量替换Bug](./FIX_REPLACEMENT_BUGS.md)
- [智能配置变量替换策略](./SMART_REPLACEMENT_STRATEGY.md)
- [配置变量动态替换功能说明](./CONFIG_VARIABLE_REPLACEMENT.md)

---

**创建时间**：2026-01-12  
**版本**：v3.0 - 字段特定替换版本  
**状态**：✅ 已实施
