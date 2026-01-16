# 智能配置变量替换策略

## 设计理念

不依赖硬编码的特定值（如 `admin`, `test`, `sysadmin`），而是：

1. **精确替换项目配置中的实际值**：无论账号密码是什么，只要在文本中出现就替换
2. **基于语义识别**：通过关键词和模式识别账号密码字段
3. **上下文感知**：根据前后文判断是否应该替换

## 替换策略

### 1. 服务器URL替换（优先级最高）

**目的**：避免URL被账号密码替换影响

**模式**：
```
访问 http://example.com:8080
打开 https://test.com/login
进入登录页面 http://192.168.1.100
```

**替换为**：
```
访问 {{CONFIG.SERVER.URL}}
打开 {{CONFIG.SERVER.URL}}
进入登录页面 {{CONFIG.SERVER.URL}}
```

### 2. 精确值替换（核心策略）

**目的**：替换项目配置中的实际账号密码值，无论是什么

**示例**：
- 如果项目配置账号是 `sysadmin`，密码是 `Sys@2024`
- 那么文本中所有的 `sysadmin` 和 `Sys@2024` 都会被替换

**匹配规则**：
- 使用词边界匹配，避免误替换（如URL中的部分）
- 前后必须是空格、标点或字符串边界
- 至少2个字符长度

**示例**：
```
原文：使用账号 sysadmin 和密码 Sys@2024 登录
替换：使用账号 {{CONFIG.ACCOUNT.USERNAME}} 和密码 {{CONFIG.ACCOUNT.PASSWORD}} 登录
```

### 3. 账号/密码组合模式

**模式**：`xxx/xxx`

**识别条件**：
- 两个值都至少2个字符
- 不包含 `http`, `://`, `.com`, `.cn`（排除URL）

**示例**：
```
原文：使用 testuser/Test@123 登录
替换：使用 {{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}} 登录
```

### 4. 带标签的账号模式

**中文标签**：
- 账号、用户名、用户、账户、登录名、用户账号

**英文标签**：
- username、account、user、login

**模式**：
```
账号: xxx
用户名: xxx
username: xxx
account: "xxx"
```

**示例**：
```
原文：账号: testuser, 用户名: admin123
替换：账号: {{CONFIG.ACCOUNT.USERNAME}}, 用户名: {{CONFIG.ACCOUNT.USERNAME}}
```

### 5. 带标签的密码模式

**中文标签**：
- 密码、口令、登录密码

**英文标签**：
- password、pwd、pass

**模式**：
```
密码: xxx
password: xxx
pwd: "xxx"
```

**示例**：
```
原文：密码: Test@123, password: admin
替换：密码: {{CONFIG.ACCOUNT.PASSWORD}}, password: {{CONFIG.ACCOUNT.PASSWORD}}
```

### 6. 输入操作模式（上下文感知）

**操作关键词**：
- 输入、填写、录入

**上下文判断**：
- 如果前面20个字符内包含"账号"、"用户名"等关键词 → 替换为账号占位符
- 如果前面20个字符内包含"密码"等关键词 → 替换为密码占位符

**示例**：
```
原文：
1. 在用户名输入框输入 testuser
2. 在密码输入框输入 Test@123

替换：
1. 在用户名输入框输入 {{CONFIG.ACCOUNT.USERNAME}}
2. 在密码输入框输入 {{CONFIG.ACCOUNT.PASSWORD}}
```

### 7. 访问URL模式

**操作关键词**：
- 访问、打开、进入、浏览

**可选描述**：
- 登录页面、页面、网址、地址、URL

**模式**：
```
访问 http://example.com
打开登录页面 https://test.com/login
进入 http://192.168.1.100:8080
```

**示例**：
```
原文：访问登录页面 http://test.com/login
替换：访问登录页面 {{CONFIG.SERVER.URL}}
```

## 替换顺序

1. **服务器URL** - 优先级最高，避免被其他规则影响
2. **精确值替换** - 替换项目配置中的实际账号密码
3. **语义模式替换** - 基于关键词和模式识别

## 安全机制

### 1. 避免误替换

- **词边界检查**：确保只替换完整的词，不替换URL或其他内容的一部分
- **长度限制**：账号密码至少2个字符，避免替换单个字符
- **上下文检查**：输入操作需要检查前文，确保是账号或密码相关

### 2. 占位符保护

- 已经是占位符的内容（包含 `{{CONFIG.`）不会被重复替换

### 3. 特殊字符转义

- 正则表达式特殊字符会被正确转义，避免匹配错误

## 实际案例

### 案例1：完整的登录流程

**原文**：
```
测试步骤：
1. 访问 http://test.example.com:8080/login
2. 在用户名输入框输入 sysadmin
3. 在密码输入框输入 Sys@2024
4. 点击登录按钮

测试数据：
账号: sysadmin
密码: Sys@2024
```

**替换后**：
```
测试步骤：
1. 访问 {{CONFIG.SERVER.URL}}
2. 在用户名输入框输入 {{CONFIG.ACCOUNT.USERNAME}}
3. 在密码输入框输入 {{CONFIG.ACCOUNT.PASSWORD}}
4. 点击登录按钮

测试数据：
账号: {{CONFIG.ACCOUNT.USERNAME}}
密码: {{CONFIG.ACCOUNT.PASSWORD}}
```

### 案例2：多种格式混合

**原文**：
```
使用 testuser/Test@123 登录系统
或者使用账号 testuser, 密码 Test@123
也可以输入testuser和Test@123
```

**替换后**：
```
使用 {{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}} 登录系统
或者使用账号 {{CONFIG.ACCOUNT.USERNAME}}, 密码 {{CONFIG.ACCOUNT.PASSWORD}}
也可以输入{{CONFIG.ACCOUNT.USERNAME}}和{{CONFIG.ACCOUNT.PASSWORD}}
```

### 案例3：不同的账号密码值

**项目A配置**：账号 `admin`, 密码 `Admin@123`

**原文**：
```
使用 admin/Admin@123 登录
```

**替换后**：
```
使用 {{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}} 登录
```

**项目B配置**：账号 `sysadmin`, 密码 `Sys@2024`

**原文**：
```
使用 sysadmin/Sys@2024 登录
```

**替换后**：
```
使用 {{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}} 登录
```

## 优势

### 1. 通用性

- 不依赖特定的账号密码值
- 适用于任何项目配置
- 支持各种格式和表达方式

### 2. 智能性

- 基于语义识别，不是简单的字符串匹配
- 上下文感知，避免误替换
- 支持中英文混合

### 3. 可扩展性

- 易于添加新的模式
- 可以支持更多的配置变量类型
- 灵活的替换策略

### 4. 安全性

- 词边界检查避免误替换
- 占位符保护避免重复替换
- 特殊字符正确处理

## 日志输出

每次替换都会输出详细的日志，方便调试：

```
🔄 [ConfigVariable] 开始替换硬编码数据为配置变量占位符 (项目ID: 1)...
📋 [ConfigVariable] 项目配置: {"account":{"account_name":"sysadmin","account_password":"Sys@2024"}}
🔑 [ConfigVariable] 项目配置账号: sysadmin, 密码: Sys@2024
🌐 [ConfigVariable] 项目配置服务器: http://test.example.com:8080
  🔄 替换服务器URL: http://test.example.com:8080 -> {{CONFIG.SERVER.URL}}
  🔄 替换账号名: sysadmin -> {{CONFIG.ACCOUNT.USERNAME}} (3处)
  🔄 替换密码: Sys@2024 -> {{CONFIG.ACCOUNT.PASSWORD}} (2处)
  🔄 替换账号密码组合: sysadmin/Sys@2024 -> 占位符
  🔄 替换带标签的账号: 账号: sysadmin -> 占位符
  🔄 替换输入账号: 输入sysadmin -> 占位符
✅ [ConfigVariable] 成功替换 8 处硬编码数据为配置变量
```

## 测试建议

### 1. 不同的账号密码值

测试各种不同的账号密码组合：
- 简单的：`admin/admin`
- 复杂的：`sysadmin/Sys@2024!`
- 特殊字符：`test.user/Test#123`

### 2. 不同的表达格式

测试各种表达方式：
- 组合格式：`xxx/xxx`
- 带标签：`账号: xxx, 密码: xxx`
- 输入操作：`输入xxx`
- 访问URL：`访问 http://xxx`

### 3. 边界情况

- 短账号密码（1个字符）- 不应该被替换
- URL中包含账号密码 - 不应该被误替换
- 已经是占位符 - 不应该被重复替换

## 相关文档

- [配置变量动态替换功能说明](./CONFIG_VARIABLE_REPLACEMENT.md)
- [修复硬编码数据问题](./FIX_HARDCODED_DATA_ISSUE.md)
- [实施状态](./IMPLEMENTATION_STATUS.md)

---

**创建时间**：2026-01-12  
**版本**：v2.0 - 智能语义识别版本  
**状态**：✅ 已实施
