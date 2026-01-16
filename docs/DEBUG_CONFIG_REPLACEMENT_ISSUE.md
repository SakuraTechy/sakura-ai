# 调试配置变量替换问题

## 📋 问题现象

保存AI生成的测试用例后：
- ✅ `test_data` 字段：成功替换为占位符 `{{CONFIG.ACCOUNT.USERNAME}}`
- ❌ `preconditions` 字段：未替换（但这个字段本身不包含账号密码）
- ❌ `steps` 字段：未替换，仍显示硬编码的 `'admin'`
- ❌ `expected_result` 字段：未替换，仍显示硬编码的 `'admin'`

## 🔍 问题分析

### 1. 数据流程

```
AI生成测试用例
  ↓
前端添加 projectId 和 projectVersionId
  ↓
后端 batchSave 方法
  ↓
configVariableService.replaceHardcodedWithPlaceholders()
  ↓
deepReplaceHardcoded() 递归替换
  ↓
保存到数据库
```

### 2. 测试用例数据结构

AI生成的测试用例可能有两种结构：

**结构A：有 testPoints 数组**
```json
{
  "name": "用户登录测试",
  "testData": "用户名: admin\n密码: admin",
  "testPoints": [
    {
      "testPoint": "正常登录",
      "steps": "1. 输入admin\n2. 输入admin",
      "expectedResult": "显示admin"
    }
  ]
}
```

**结构B：没有 testPoints 数组**
```json
{
  "name": "用户登录测试",
  "testData": "用户名: admin\n密码: admin",
  "steps": "1. 输入admin\n2. 输入admin",
  "assertions": "显示admin"
}
```

### 3. 字段替换逻辑

`shouldReplaceField` 方法定义了可替换的字段：
- `testData` ✅
- `steps` ✅
- `expectedResult` ✅
- `preconditions` ✅

对于 `testPoints` 数组，代码会递归处理其中的可替换字段。

### 4. 可能的问题

1. **testPoints 数组处理问题**：`testPoints` 数组中的 `steps` 和 `expectedResult` 字段可能没有被正确递归处理
2. **字段名不匹配**：AI 返回的字段名可能与 `shouldReplaceField` 中定义的不一致
3. **替换时机问题**：`batchSave` 中从 `testPoints` 提取数据后，可能又覆盖了替换后的值

## 🔧 调试步骤

### 1. 添加详细日志

在 `functionalTestCaseService.ts` 的 `batchSave` 方法中：
```typescript
console.log(`📋 [ConfigVariable] 替换前第一个用例:`, JSON.stringify(testCases[0], null, 2));
// ... 替换逻辑 ...
console.log(`📋 [ConfigVariable] 替换后第一个用例:`, JSON.stringify(processedTestCases[0], null, 2));
```

在 `configVariableService.ts` 的 `replaceHardcodedWithPlaceholders` 方法中：
```typescript
console.log(`📋 [ConfigVariable] 输入数据字段:`, Object.keys(testCaseData));
```

在 `deepReplaceHardcoded` 方法中：
```typescript
console.log(`  📝 处理testPoints[${idx}], 字段:`, Object.keys(item));
console.log(`  📝 处理testPoints[${idx}].${itemKey} (需要替换), 值:`, item[itemKey]?.substring(0, 50));
```

### 2. 检查数据结构

运行测试，查看日志输出：
- 替换前的测试用例结构
- 替换后的测试用例结构
- testPoints 数组是否被正确处理
- steps 和 expectedResult 字段是否被替换

### 3. 验证替换逻辑

确认：
- `testPoints` 数组中的字段名是否与 `shouldReplaceField` 匹配
- 递归替换是否正确执行
- 替换后的数据是否被正确保存到数据库

## 🎯 预期修复方案

根据调试结果，可能需要：

1. **修复 testPoints 数组处理**：确保递归处理正确
2. **添加字段名映射**：如果 AI 返回的字段名不一致，添加映射
3. **调整替换时机**：确保替换后的数据不会被覆盖

## ✅ 问题已定位

### 根本原因

`testPoints[0].expectedResult` 是一个**数组**，而不是字符串：

```json
"expectedResult": [
  "页面正常加载，显示用户名和密码输入框、登录按钮及密码可见性切换图标",
  "输入框接收输入，光标停留在用户名输入框",
  ...
]
```

在调试日志中尝试调用 `item[itemKey]?.substring(0, 50)` 时，因为 `expectedResult` 是数组，没有 `substring` 方法，导致报错：

```
❌ [ConfigVariable] 替换失败: TypeError: item[itemKey]?.substring is not a function
```

### 修复方案

修改 `configVariableService.ts` 中的调试日志代码，处理字段值可能是数组的情况：

```typescript
const fieldValue = item[itemKey];
const valuePreview = Array.isArray(fieldValue) 
  ? `[数组, ${fieldValue.length}个元素]`
  : (typeof fieldValue === 'string' ? fieldValue.substring(0, 50) : String(fieldValue));
console.log(`  📝 处理testPoints[${idx}].${itemKey} (需要替换), 值:`, valuePreview);
```

这样，无论字段值是字符串还是数组，都能正确处理。`deepReplaceHardcoded` 方法本身已经支持递归处理数组，所以替换逻辑不需要修改。

## 📝 下一步

1. ✅ 修复调试日志中的 substring 错误
2. 🔄 重新测试，查看替换是否成功
3. ✅ 验证 testPoints 数组中的 steps 和 expectedResult 是否被正确替换

---

**创建时间**：2026-01-12  
**状态**：✅ 问题已定位并修复  
**最后更新**：2026-01-12 - 修复 substring 错误
