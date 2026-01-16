# 修复硬编码数据问题 - 2026-01-12

## 问题描述

用户反馈：AI生成的测试用例和手动添加的测试用例中，显示的依然是硬编码的账号密码（如 `admin`），而不是项目配置中的数据（如 `sysadmin`）。

### 问题截图分析

从用户提供的截图可以看到：
- 测试步骤中显示：`在用户名输入框输入'sysadmin'`
- 测试数据中显示：`用户名: admin, 密码: admin`

这说明：
1. 测试步骤中的数据已经被替换（显示 `sysadmin`）
2. 但测试数据字段中的数据没有被替换（依然显示 `admin`）

## 根本原因

原来的替换逻辑存在以下问题：

1. **替换规则不够全面**：只替换了与项目配置完全匹配的账号密码，没有替换常见的硬编码模式（如 `admin`, `test`, `sysadmin`）

2. **替换模式不够智能**：没有考虑到账号密码可能出现在不同的上下文中：
   - 账号/密码组合：`admin/admin`
   - 带标签的格式：`账号: admin`, `密码: admin`
   - 输入操作：`输入admin`

## 解决方案

### 1. 增强替换规则

修改 `configVariableService.ts` 中的 `replaceHardcodedWithPlaceholders()` 方法，增加以下替换规则：

```typescript
// 1. 优先替换项目配置中的账号密码（精确匹配）
if (accountName) {
  // 替换项目配置中的账号名
}

if (accountPassword) {
  // 替换项目配置中的密码
}

// 2. 替换常见的硬编码模式
const patterns = [
  // 账号/密码组合
  { regex: /admin\/admin/gi, replacement: '{{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}}' },
  { regex: /test\/test/gi, replacement: '{{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}}' },
  { regex: /sysadmin\/sysadmin/gi, replacement: '{{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}}' },
  
  // 带标签的账号
  { regex: /(?:账号|用户名)[:：\s]*['"]?admin['"]?/gi, replacement: '账号: {{CONFIG.ACCOUNT.USERNAME}}' },
  { regex: /(?:账号|用户名)[:：\s]*['"]?test['"]?/gi, replacement: '账号: {{CONFIG.ACCOUNT.USERNAME}}' },
  { regex: /(?:账号|用户名)[:：\s]*['"]?sysadmin['"]?/gi, replacement: '账号: {{CONFIG.ACCOUNT.USERNAME}}' },
  
  // 带标签的密码
  { regex: /(?:密码|password)[:：\s]*['"]?admin['"]?/gi, replacement: '密码: {{CONFIG.ACCOUNT.PASSWORD}}' },
  { regex: /(?:密码|password)[:：\s]*['"]?test['"]?/gi, replacement: '密码: {{CONFIG.ACCOUNT.PASSWORD}}' },
  { regex: /(?:密码|password)[:：\s]*['"]?sysadmin['"]?/gi, replacement: '密码: {{CONFIG.ACCOUNT.PASSWORD}}' },
  
  // 输入操作
  { regex: /输入['"]?admin['"]?/gi, replacement: '输入{{CONFIG.ACCOUNT.USERNAME}}' },
  { regex: /输入['"]?test['"]?/gi, replacement: '输入{{CONFIG.ACCOUNT.USERNAME}}' },
  { regex: /输入['"]?sysadmin['"]?/gi, replacement: '输入{{CONFIG.ACCOUNT.USERNAME}}' },
];
```

### 2. 简化实现

为了避免TypeScript类型错误，采用简单的字符串替换方式，而不是使用函数类型的占位符。

### 3. 增加日志

添加详细的日志输出，方便调试：
- 显示项目配置的账号密码
- 显示替换前后的数据
- 显示替换的数量

## 修改的文件

1. `server/services/configVariableService.ts`
   - 重写 `replaceHardcodedWithPlaceholders()` 方法
   - 增加更全面的替换规则
   - 添加详细的日志输出

## 测试建议

### 1. AI生成测试用例
```
1. 上传包含 "admin/admin" 的需求文档
2. AI生成测试用例
3. 查看测试用例详情
4. 验证：所有 "admin" 都被替换为项目配置的账号密码
```

### 2. 手动创建测试用例
```
1. 手动创建测试用例，输入 "账号: admin, 密码: admin"
2. 保存测试用例
3. 查看测试用例详情
4. 验证：显示的是项目配置的账号密码
```

### 3. 不同的硬编码模式
```
测试以下模式是否都能正确替换：
- admin/admin
- test/test
- sysadmin/sysadmin
- 账号: admin
- 密码: admin
- 输入admin
```

## 预期效果

修复后，无论测试用例中使用什么硬编码的账号密码（`admin`, `test`, `sysadmin` 等），都会被自动替换为配置变量占位符，然后在显示时动态替换为项目配置中的实际账号密码。

### 示例

**保存时**：
```
原始数据: "账号: admin, 密码: admin"
↓
存储数据: "账号: {{CONFIG.ACCOUNT.USERNAME}}, 密码: {{CONFIG.ACCOUNT.PASSWORD}}"
```

**显示时**：
```
存储数据: "账号: {{CONFIG.ACCOUNT.USERNAME}}, 密码: {{CONFIG.ACCOUNT.PASSWORD}}"
↓
显示数据: "账号: sysadmin, 密码: sysadmin"  (使用项目配置的实际值)
```

## 注意事项

1. **配置完整性**：确保项目已配置默认账号和密码
2. **重新生成**：已有的测试用例需要重新生成或手动编辑才能应用新的替换规则
3. **日志查看**：如果替换不生效，查看服务器日志了解详细信息

## 相关文档

- [配置变量动态替换功能说明](./CONFIG_VARIABLE_REPLACEMENT.md)
- [实施状态](./IMPLEMENTATION_STATUS.md)
- [工作完成总结](./WORK_COMPLETED_2026-01-12.md)

---

**修复时间**：2026-01-12  
**状态**：✅ 已完成并通过代码检查
