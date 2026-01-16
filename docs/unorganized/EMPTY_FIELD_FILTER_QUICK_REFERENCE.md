# "为空"字段过滤逻辑 - 快速参考

## 核心逻辑

### 1. 检测"为空"场景

```typescript
const isEmptyScenario = name.includes(`${field}为空`);
```

### 2. 检测"保持为空"的操作

支持的模式：
- ✅ `保持为空`
- ✅ `保持用户名为空`
- ✅ `保持用户名输入框为空`
- ✅ `不输入用户名`
- ✅ `不填写用户名`
- ✅ `留空用户名`
- ✅ `用户名输入框为空`
- ✅ `用户名字段为空`

```typescript
const keepEmptyPatterns = [
  '保持为空', '保持.*为空', '不输入', '不填写', '留空', '为空',
  '输入框为空', '字段为空', '保持.*输入框为空', '保持.*字段为空'
];
const hasKeepEmptyAction = keepEmptyPatterns.some(pattern => {
  const regex = new RegExp(pattern, 'i');
  return regex.test(steps) && steps.includes(field);
});
```

### 3. 检测"输入具体值"的操作

**必须满足：**
- 包含"输入"关键词
- 值用引号包裹（单引号或双引号）
- 值不是空值描述（"为空"、"空"、"留空"、"（空）"）
- 步骤中不包含"输入框为空"或"字段为空"

```typescript
const inputWithValuePattern = new RegExp(
  `(在|向)?${field}(输入框|字段)?[中]?输入['"]([^'"]+)['"]`,
  'i'
);
const inputMatch = steps.match(inputWithValuePattern);

const isInputtingConcreteValue = inputMatch && 
  inputMatch[3] && 
  inputMatch[3].trim().length > 0 && 
  !['为空', '空', '留空', '（空）'].includes(inputMatch[3].trim()) && 
  !steps.includes('输入框为空') && 
  !steps.includes('字段为空');
```

### 4. 过滤规则

```typescript
if (isInputtingConcreteValue && !hasKeepEmptyAction) {
  // ❌ 过滤：用例名称表明"字段为空"，但操作步骤中在输入具体值
  return { filtered: true, reason: '逻辑不一致' };
}
```

## 示例

### ✅ 正确的"为空"用例

```typescript
// 示例1：保持为空
{
  name: '用户名为空时无法登录',
  steps: '1. 打开登录页面\n2. 保持用户名输入框为空\n3. 点击登录按钮'
}

// 示例2：不输入
{
  name: '密码为空时无法登录',
  steps: '1. 打开登录页面\n2. 在用户名输入框中输入"admin"\n3. 不输入密码\n4. 点击登录按钮'
}

// 示例3：留空
{
  name: '邮箱为空时无法注册',
  steps: '1. 打开注册页面\n2. 在用户名输入框中输入"testuser"\n3. 留空邮箱\n4. 点击注册按钮'
}

// 示例4：输入框为空
{
  name: '验证码为空时无法登录',
  steps: '1. 打开登录页面\n2. 在用户名输入框中输入"admin"\n3. 验证码输入框为空\n4. 点击登录按钮'
}
```

### ❌ 错误的"为空"用例（会被过滤）

```typescript
// 示例1：名称说为空，但步骤中输入了值
{
  name: '用户名为空时无法登录',
  steps: '1. 打开登录页面\n2. 在用户名输入框中输入"admin"\n3. 点击登录按钮'
}
// 过滤原因：用例名称表明"用户名为空"，但操作步骤中在输入用户名的具体值（admin）

// 示例2：名称说为空，但步骤中输入了值
{
  name: '手机号为空时无法注册',
  steps: '1. 打开注册页面\n2. 向手机号输入框输入"13800138000"\n3. 点击注册按钮'
}
// 过滤原因：用例名称表明"手机号为空"，但操作步骤中在输入手机号的具体值（13800138000）
```

## 常见问题

### Q1: 为什么"保持用户名输入框为空"不会被误判？

**A:** 修复后的逻辑使用正则表达式 `保持.*为空` 和 `输入框为空`，能够正确匹配这种模式。

### Q2: 为什么必须用引号包裹输入值？

**A:** 引号是区分"输入具体值"和"描述性文本"的关键标志：
- ✅ `在用户名输入框中输入"admin"` - 明确输入了值
- ❌ `保持用户名输入框为空` - 描述性文本，不是输入值

### Q3: 如果AI生成的步骤没有用引号包裹值怎么办？

**A:** 这是AI生成质量问题，应该在AI提示词中要求：
```
操作步骤格式要求：
- 输入操作必须用引号包裹具体值，例如：在用户名输入框中输入"admin"
- 空值操作使用明确的描述，例如：保持用户名输入框为空、不输入用户名
```

### Q4: 支持哪些字段？

**A:** 支持所有表单字段，包括但不限于：
- 用户名、密码、邮箱、手机号、验证码
- 姓名、身份证号、地址、备注
- 任何自定义字段

## 测试验证

运行测试脚本验证修复：

```bash
# 基础测试（3个用例）
node test-empty-field-filter.js

# 扩展测试（10个用例）
node test-empty-field-filter-extended.js
```

预期结果：所有测试通过率 100%

## 相关文件

- 核心逻辑：`server/services/functionalTestCaseAIService.ts` (第3220-3245行)
- 详细文档：`docs/FIX_EMPTY_FIELD_FILTER_BUG.md`
- 测试脚本：`test-empty-field-filter.js`, `test-empty-field-filter-extended.js`
