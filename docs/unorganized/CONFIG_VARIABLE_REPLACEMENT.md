# 配置变量动态替换功能说明

## 📋 功能概述

配置变量动态替换功能解决了测试用例中硬编码账号密码的问题，实现了测试数据与项目配置的自动同步。

### 核心问题

在之前的实现中：
- AI生成的测试用例直接使用需求文档中的硬编码账号密码（如 `admin/admin`）
- 手动创建的测试用例也可能包含硬编码数据
- 当项目配置更新后，测试用例中的数据不会自动更新
- 需要手动修改每个测试用例，维护成本高

### 解决方案

使用**配置变量占位符 + 动态替换**机制：

1. **保存阶段**：自动检测并替换硬编码为占位符（如 `{{CONFIG.ACCOUNT.USERNAME}}`）
2. **存储阶段**：数据库中保存占位符
3. **读取阶段**：动态替换占位符为当前项目配置的实际值
4. **配置更新**：配置更新后，测试用例显示自动同步

## 🎯 支持的配置变量

### 账号相关
- `{{CONFIG.ACCOUNT.USERNAME}}` - 账号名
- `{{CONFIG.ACCOUNT.PASSWORD}}` - 密码
- `{{CONFIG.ACCOUNT.TYPE}}` - 账号类型

### 服务器相关
- `{{CONFIG.SERVER.URL}}` - 服务器完整URL（如 `http://example.com:8080`）
- `{{CONFIG.SERVER.HOST}}` - 服务器主机名
- `{{CONFIG.SERVER.PORT}}` - 服务器端口

### 数据库相关
- `{{CONFIG.DATABASE.HOST}}` - 数据库主机
- `{{CONFIG.DATABASE.PORT}}` - 数据库端口
- `{{CONFIG.DATABASE.NAME}}` - 数据库名称
- `{{CONFIG.DATABASE.SCHEMA}}` - 数据库模式

## 🔄 工作流程

### 1. AI生成测试用例

```
需求文档内容:
"用户使用账号 admin 和密码 admin 登录系统"

↓ AI生成测试用例

原始测试用例:
{
  name: "用户登录测试",
  steps: "1. 输入账号 admin\n2. 输入密码 admin\n3. 点击登录",
  testData: "账号: admin, 密码: admin"
}

↓ replaceHardcodedWithPlaceholders()

保存到数据库:
{
  name: "用户登录测试",
  steps: "1. 输入账号 {{CONFIG.ACCOUNT.USERNAME}}\n2. 输入密码 {{CONFIG.ACCOUNT.PASSWORD}}\n3. 点击登录",
  testData: "账号: {{CONFIG.ACCOUNT.USERNAME}}, 密码: {{CONFIG.ACCOUNT.PASSWORD}}"
}

↓ 前端查询时 batchReplacePlaceholders()

前端显示:
{
  name: "用户登录测试",
  steps: "1. 输入账号 testuser\n2. 输入密码 Test@123\n3. 点击登录",
  testData: "账号: testuser, 密码: Test@123"
}
```

### 2. 手动创建测试用例

```
用户输入:
{
  name: "登录测试",
  steps: "使用 admin/admin 登录"
}

↓ replaceHardcodedWithPlaceholders()

保存到数据库:
{
  name: "登录测试",
  steps: "使用 {{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}} 登录"
}

↓ 查询时动态替换

前端显示:
{
  name: "登录测试",
  steps: "使用 testuser/Test@123 登录"
}
```

### 3. 配置更新后自动同步

```
初始状态:
项目配置: { username: "admin", password: "admin123" }
测试用例显示: "使用账号 admin 和密码 admin123 登录"

↓ 管理员更新项目配置

更新后:
项目配置: { username: "testuser", password: "Test@123" }
测试用例显示: "使用账号 testuser 和密码 Test@123 登录"

✅ 无需修改测试用例，自动同步！
```

## 💻 技术实现

### 核心服务：ConfigVariableService

```typescript
// 1. 替换硬编码为占位符（保存时）
async replaceHardcodedWithPlaceholders(testCaseData: any, projectId: number): Promise<any>

// 2. 替换占位符为实际值（读取时）
async replacePlaceholdersWithValues(text: string, projectId: number): Promise<string>

// 3. 批量替换（优化性能）
async batchReplacePlaceholders(testCases: any[], projectId: number): Promise<any[]>
```

### 集成点

#### 1. 测试用例保存（batchSave）
```typescript
// server/services/functionalTestCaseService.ts
async batchSave(params: BatchSaveParams) {
  // AI生成的测试用例
  let processedTestCases = testCases;
  
  if (testCases[0].projectId) {
    // 🔄 替换硬编码为占位符
    processedTestCases = await Promise.all(
      testCases.map(tc => 
        this.configVariableService.replaceHardcodedWithPlaceholders(tc, tc.projectId)
      )
    );
  }
  
  // 保存到数据库...
}
```

#### 2. 测试用例创建（create）
```typescript
async create(data: any, userId: number) {
  let processedData = data;
  
  if (data.projectVersionId) {
    // 获取项目ID
    const projectVersion = await this.prisma.project_versions.findUnique({
      where: { id: data.projectVersionId },
      select: { project_id: true }
    });
    
    if (projectVersion?.project_id) {
      // 🔄 替换硬编码为占位符
      processedData = await this.configVariableService.replaceHardcodedWithPlaceholders(
        data,
        projectVersion.project_id
      );
    }
  }
  
  // 保存到数据库...
}
```

#### 3. 测试用例更新（update）
```typescript
async update(id: number, data: any) {
  let processedData = data;
  
  if (data.projectVersionId) {
    // 🔄 替换硬编码为占位符
    processedData = await this.configVariableService.replaceHardcodedWithPlaceholders(
      data,
      projectVersion.project_id
    );
  }
  
  // 更新数据库...
}
```

#### 4. 测试用例查询（getFlatList）
```typescript
async getFlatList(params: ListParams) {
  // 查询测试用例...
  const paginatedRows = flatRows.slice(startIndex, endIndex);
  
  // 🔄 按项目分组，批量替换占位符
  const projectGroups = new Map<number, any[]>();
  paginatedRows.forEach(row => {
    if (row.project_version?.project_id) {
      const projectId = row.project_version.project_id;
      if (!projectGroups.has(projectId)) {
        projectGroups.set(projectId, []);
      }
      projectGroups.get(projectId)!.push(row);
    }
  });
  
  // 批量替换每个项目的测试用例
  for (const [projectId, rows] of projectGroups.entries()) {
    const replacedRows = await this.configVariableService.batchReplacePlaceholders(rows, projectId);
    // 更新原数组...
  }
  
  return { data: paginatedRows, total };
}
```

#### 5. 测试用例详情（getById）
```typescript
async getById(id: number) {
  const testCase = await this.prisma.functional_test_cases.findFirst({
    where: { id },
    include: {
      project_version: {
        select: {
          project_id: true  // 需要project_id来替换配置变量
        }
      }
    }
  });
  
  let result = { ...testCase, testPoints };
  
  // 🔄 动态替换占位符为实际值
  if (testCase.project_version?.project_id) {
    result = await this.configVariableService.batchReplacePlaceholders(
      [result], 
      testCase.project_version.project_id
    );
    result = result[0];
  }
  
  return result;
}
```

## 🎨 替换算法

### 1. 硬编码检测与替换

```typescript
// 创建替换规则
const replacements = [
  // 账号名替换
  {
    pattern: new RegExp(escapeRegex(accountName), 'gi'),
    placeholder: '{{CONFIG.ACCOUNT.USERNAME}}',
    description: '账号名'
  },
  // 密码替换
  {
    pattern: new RegExp(escapeRegex(accountPassword), 'gi'),
    placeholder: '{{CONFIG.ACCOUNT.PASSWORD}}',
    description: '密码'
  },
  // 常见的硬编码模式
  {
    pattern: /admin\/admin|test\/test|user\/password/gi,
    placeholder: '{{CONFIG.ACCOUNT.USERNAME}}/{{CONFIG.ACCOUNT.PASSWORD}}',
    description: '账号/密码组合'
  }
];

// 深度遍历替换
function deepReplace(obj: any, replacements: Array<...>): any {
  if (typeof obj === 'string') {
    let result = obj;
    for (const { pattern, placeholder } of replacements) {
      result = result.replace(pattern, placeholder);
    }
    return result;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepReplace(item, replacements));
  }
  
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      result[key] = deepReplace(obj[key], replacements);
    }
    return result;
  }
  
  return obj;
}
```

### 2. 占位符替换为实际值

```typescript
function replacePlaceholdersInString(text: string, config: any): string {
  if (!text || !text.includes('{{CONFIG.')) {
    return text;
  }
  
  let result = text;
  
  // 替换账号相关
  if (config.account) {
    result = result.replace(
      /\{\{CONFIG\.ACCOUNT\.USERNAME\}\}/g,
      config.account.account_name || ''
    );
    result = result.replace(
      /\{\{CONFIG\.ACCOUNT\.PASSWORD\}\}/g,
      config.account.account_password || ''
    );
  }
  
  // 替换服务器相关
  if (config.server) {
    const serverUrl = buildServerUrl(config.server);
    result = result.replace(
      /\{\{CONFIG\.SERVER\.URL\}\}/g,
      serverUrl
    );
  }
  
  return result;
}
```

## ✅ 核心优势

### 1. 数据一致性
- 测试用例始终使用项目配置中的最新数据
- 避免硬编码导致的数据不一致问题

### 2. 易于维护
- 配置更新后，所有测试用例自动同步
- 无需手动修改每个测试用例
- 大幅降低维护成本

### 3. 向后兼容
- 不修改数据库结构
- 完全兼容现有数据
- 平滑升级，无需数据迁移

### 4. 透明替换
- 对用户透明，前端显示的是实际值
- 用户无需了解占位符机制
- 良好的用户体验

### 5. 灵活扩展
- 可以轻松添加新的配置变量类型
- 支持自定义替换规则
- 扩展性强

### 6. 性能优化
- 批量替换，减少数据库查询
- 按项目分组，避免重复查询配置
- 只在需要时进行替换

## 🧪 测试场景

### 场景1：AI生成测试用例
```
1. 上传包含账号密码的需求文档
2. AI生成测试用例
3. 验证：测试用例中的账号密码已替换为占位符
4. 查询测试用例列表
5. 验证：显示的是项目配置中的实际账号密码
```

### 场景2：手动创建测试用例
```
1. 手动创建测试用例，输入硬编码账号密码
2. 保存测试用例
3. 验证：数据库中保存的是占位符
4. 查询测试用例详情
5. 验证：显示的是项目配置中的实际账号密码
```

### 场景3：配置更新后自动同步
```
1. 查询测试用例，记录显示的账号密码
2. 更新项目配置中的账号密码
3. 再次查询测试用例
4. 验证：显示的账号密码已自动更新为新配置
```

### 场景4：多项目隔离
```
1. 创建两个项目，配置不同的账号密码
2. 为每个项目生成测试用例
3. 查询项目A的测试用例
4. 验证：显示的是项目A的配置
5. 查询项目B的测试用例
6. 验证：显示的是项目B的配置
```

## 📝 注意事项

### 1. 配置完整性
- 确保项目配置了默认账号、服务器、数据库
- 如果配置不完整，占位符可能无法正确替换

### 2. 占位符格式
- 占位符格式固定：`{{CONFIG.CATEGORY.FIELD}}`
- 不要手动修改占位符格式
- 系统会自动处理占位符

### 3. 性能考虑
- 批量操作时，系统会自动优化查询
- 大量测试用例时，替换可能需要一些时间
- 建议按项目分批处理

### 4. 错误处理
- 替换失败不会阻塞流程
- 失败时返回原数据
- 查看日志了解失败原因

## 🔮 未来扩展

### 1. 更多配置变量类型
- 环境变量
- API密钥
- 第三方服务配置

### 2. 自定义占位符
- 允许用户定义自己的占位符
- 支持复杂的替换规则

### 3. 配置版本管理
- 支持配置历史版本
- 可以回滚到历史配置

### 4. 测试执行集成
- 在测试执行时也动态替换占位符
- 支持不同环境使用不同配置

## 📚 相关文档

- [测试配置优化方案](./test-config-optimization-plan.md)
- [实施状态](./IMPLEMENTATION_STATUS.md)
- [使用示例](./test-config-usage-examples.md)
- [快速参考](./test-config-quick-reference.md)
- [AI生成用例配置替换修复](./FIX_AI_GENERATED_CONFIG_REPLACEMENT.md) - 🆕 修复AI生成测试用例的配置变量替换问题

---

**创建时间**：2026-01-12  
**版本**：v1.1  
**状态**：✅ 已完成实施  
**最后更新**：2026-01-12 - 修复AI生成测试用例的配置变量替换问题
