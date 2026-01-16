# 按钮提取修复方案

## 问题描述

用户反馈生成的需求文档存在以下问题：

1. **完全没有按钮信息** - 需求文档中没有"操作按钮"章节
2. **内容太少** - 只有查询条件、列表展示字段和业务规则，缺少最重要的按钮章节
3. **业务规则太简单** - 没有按钮相关的操作说明

### 用户提供的需求文档示例

```markdown
## 1. 集配管理模块

### 1.1 集配管理页面

⚠️ **页面类型：mixed**

#### 1.1.1 查询条件
（6个查询字段）

#### 1.1.2 列表展示字段
（12个展示字段）

#### 1.1.3 业务规则
（11条业务规则）
```

**问题**：完全没有"操作按钮"章节！

---

## 根本原因分析

### 1. 提示词结构问题

原来的提示词中：

- **对于 list/form/detail 页面**：明确要求生成"操作按钮"章节
- **对于 mixed/unknown 页面**：操作按钮章节排在 1.1.3，但没有强制要求

实际生成时，AI 把"业务规则"放在了 1.1.3，导致**按钮章节被完全跳过**。

### 2. 按钮信息不够突出

虽然代码中有提取按钮：

```typescript
const queryButtons = [...].map(e => e.text || '');  // 只有查询按钮
const formButtons = [...].map(e => e.text || '');   // 只有表单按钮
```

但**没有提取所有按钮列表**！AI 看不到完整的按钮信息。

### 3. 按钮信息被截断

在 Axure 原型解析结果中：

```typescript
const otherElements = [...].filter(e => e.type !== 'input' && e.type !== 'select');
const otherDetail = otherElements.slice(0, 15).map(...);  // ❌ 只显示前15个
```

按钮包含在 otherElements 中，如果页面元素很多，按钮可能被截断不显示。

---

## 修复方案

### ✅ 修复 1: 强化"操作按钮"章节的必要性

**位置**: [functionalTestCaseAIService.ts:335-384](server/services/functionalTestCaseAIService.ts#L335-L384)

**修改前**:
```typescript
🎯 **章节生成规则**：

**对于列表页（list）**：
- 查询条件：...
- 列表展示字段：...
- 操作按钮：从 type="button" 的元素中提取
```

**修改后**:
```typescript
🎯 **章节生成规则**：

🔥🔥🔥 **最重要：所有页面类型都必须生成"操作按钮"章节！**
⚠️ 无论页面类型如何，必须从原型中提取所有 type="button" 的元素！

**对于列表页（list）**：
- 查询条件：...
- 列表展示字段：...
- 🔥 操作按钮（必须章节！）：
  * 从 type="button" 的元素中提取 **所有按钮**
  * 包括：查询、重置、导出、新增、编辑、删除、审核等
  * 每个按钮都要列出，不要遗漏！

**对于混合页（mixed）或未知页（unknown）**：
- 🔥 操作按钮（最重要！绝对不能遗漏！）：
  * 必须从原型中提取 **所有 type="button" 的元素**
  * 如果原型中有10个按钮，就必须在表格中列出10行
  * 如果原型中有20个按钮，就必须在表格中列出20行
  * 不要因为按钮太多就省略，每个按钮都很重要！
```

---

### ✅ 修复 2: 统一按钮章节格式和位置

**位置**: [functionalTestCaseAIService.ts:415-497](server/services/functionalTestCaseAIService.ts#L415-L497)

**修改前** (mixed 页面):
```markdown
#### 1.1.3 操作按钮（仅当原型中存在时）
| 按钮名称 | 位置 | 触发条件 | 操作说明 | 来源 |
（此处填入从原型提取的实际按钮，不要写任何占位符）

#### 1.1.4 表单字段定义（仅当原型中存在表单时）
...
#### 1.1.7 业务规则
```

**修改后** (所有页面类型):
```markdown
**如果是列表页（list）**：

#### 1.1.1 查询条件
...

#### 1.1.2 列表展示字段
...

#### 1.1.3 操作按钮 ← 🔥 必须生成！
| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
（此处填入从原型提取的所有按钮，每个按钮一行）

#### 1.1.4 业务规则
...

**如果是混合页（mixed）或未知页（unknown）**：

🔥 **重要：无论页面类型如何，必须按以下顺序生成章节！**

#### 1.1.1 查询条件（如果有）
...

#### 1.1.2 列表展示字段（如果有）
...

#### 1.1.3 操作按钮 ← 🔥🔥🔥 这是最重要的章节，绝对不能遗漏！
⚠️ **必须从原型中提取所有 type="button" 的元素！**

| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
（此处填入从原型提取的**所有按钮**，每个按钮占一行，格式示例：）
（查询 | 主要 | 无 | 无 | 根据查询条件筛选数据 | 集配管理-button）
（重置 | 次要 | 无 | 无 | 清空查询条件 | 集配管理-button）
（新增 | 主要 | 需要新增权限 | 无 | 打开新增弹窗 | 集配管理-button）
（删除 | 危险 | 需要删除权限 | 选中数据后可用 | 删除选中的数据 | 集配管理-button）
（如果原型中有10个按钮，就必须列出10行！不要遗漏任何一个按钮！）

#### 1.1.4 表单字段定义（仅当原型中存在表单输入时）
...

#### 1.1.5 业务规则
...
```

**关键改进**:
- ✅ 所有页面类型都在固定位置生成"操作按钮"章节
- ✅ 提供详细的表格格式示例
- ✅ 多次强调"必须"、"不能遗漏"
- ✅ "业务规则"章节后移，确保按钮章节不被跳过

---

### ✅ 修复 3: 提取并显示所有按钮列表

**位置**: [functionalTestCaseAIService.ts:540-608](server/services/functionalTestCaseAIService.ts#L540-L608)

**修改前**:
```typescript
const pageTypeAnalysis: Array<{
  name: string;
  pageType: string;
  inputCount: number;
  buttonCount: number;
  queryButtons: string[];  // 只有查询按钮
  formButtons: string[];   // 只有表单按钮
  suggestion: string;
}> = [];

const pageTypeTable = `
1. ${p.name}
   页面类型: ${p.pageType}
   按钮数量: ${p.buttonCount}
   查询按钮: ${p.queryButtons.join(', ')}
   表单按钮: ${p.formButtons.join(', ')}
`;
```

**修改后**:
```typescript
const pageTypeAnalysis: Array<{
  name: string;
  pageType: string;
  inputCount: number;
  buttonCount: number;
  allButtons: string[];    // 🔥 新增：所有按钮列表
  queryButtons: string[];
  formButtons: string[];
  suggestion: string;
}> = [];

// 🔥 提取所有按钮（这是最重要的！）
const allButtons = (page.elements || [])
  .filter(e => e.type === 'button')
  .map(e => e.text || e.name || '未命名按钮');

const pageTypeTable = `
1. ${p.name}
   页面类型: ${p.pageType}
   按钮数量: ${p.buttonCount}
   🔥 所有按钮列表: ${p.allButtons.join(', ')}  // 🔥 新增
   查询按钮: ${p.queryButtons.join(', ')}
   表单按钮: ${p.formButtons.join(', ')}
   📋 章节建议: 需要生成：查询条件、列表展示字段、操作按钮（必须列出所有按钮！）
`;
```

---

### ✅ 修复 4: 专门添加按钮详细信息部分

**位置**: [functionalTestCaseAIService.ts:635-656](server/services/functionalTestCaseAIService.ts#L635-L656)

**新增代码**:
```typescript
// 🔥 新增：专门提取所有按钮详细信息
const buttonDetails: Array<{page: string; buttons: string[]}> = [];
(axureData.pages || []).forEach(page => {
  const buttons = (page.elements || [])
    .filter(e => e.type === 'button')
    .map(e => e.text || e.name || '未命名按钮');

  if (buttons.length > 0) {
    buttonDetails.push({
      page: page.name || '未命名',
      buttons
    });
  }
});

const buttonDetailSummary = buttonDetails.length > 0
  ? `\n🔥🔥🔥 【最重要！！！】所有按钮详细列表（必须在"操作按钮"章节中全部列出，一个都不能遗漏！）:\n${buttonDetails.map((bd, i) =>
      `页面 ${i + 1}: ${bd.page}
   按钮数量: ${bd.buttons.length}个
   所有按钮: ${bd.buttons.join(', ')}`
    ).join('\n\n')}\n`
  : '';

const userPrompt = `...
${pageTypeTable}${buttonDetailSummary}${longTextSummary}  // 🔥 新增按钮信息在前面
...`;
```

**效果**:
- AI 在提示词最前面就能看到完整的按钮列表
- 使用醒目的 🔥🔥🔥 和"最重要"标记
- 明确要求"必须全部列出，一个都不能遗漏"

---

### ✅ 修复 5: 优化 Axure 原型解析展示

**位置**: [functionalTestCaseAIService.ts:664-689](server/services/functionalTestCaseAIService.ts#L664-L689)

**修改前**:
```typescript
const inputElements = [...].filter(e => e.type === 'input' || e.type === 'select');
const otherElements = [...].filter(e => e.type !== 'input' && e.type !== 'select');

const otherDetail = otherElements.slice(0, 15).map(...);  // ❌ 按钮可能被截断
```

**修改后**:
```typescript
const inputElements = [...].filter(e => e.type === 'input' || e.type === 'select');
const buttonElements = [...].filter(e => e.type === 'button');  // 🔥 专门提取按钮
const otherElements = [...].filter(e => e.type !== 'input' && e.type !== 'select' && e.type !== 'button');

// 🔥 按钮详情（显示所有按钮，不截断！）
const buttonDetail = buttonElements.map(e => {
  return `  - button: "${e.text || e.name || '未命名'}"`;
}).join('\n');

const elementsDetail = [inputDetail, buttonDetail, otherDetail].filter(d => d).join('\n');
```

**改进**:
- ✅ 按钮单独提取，不再和其他元素混在一起
- ✅ 显示**所有按钮**，不截断
- ✅ 按钮信息排在输入框后面，优先级高

---

## 预期效果

### 修复后的需求文档结构

```markdown
## 1. 集配管理模块

### 1.1 集配管理页面

⚠️ **页面类型：mixed**

#### 1.1.1 查询条件
| 字段名             | 控件类型 | 必填 | 默认值                  | 说明 | 来源           |
|--------------------|---------|------|-------------------------|------|----------------|
| 客户名称           | 输入框   | 否   | 请输入客户名称          |      | 集配管理-input |
| 申请日期           | 输入框   | 否   | 开始日期 至 结束日期    |      | 集配管理-input |
| 当前状态           | 下拉框   | 否   |                         |      | 集配管理-select|
| 机构名称           | 输入框   | 否   | 请输入机构名称          |      | 集配管理-input |
| 渠道集采订单号     | 输入框   | 否   | 请输入渠道集采订单号    |      | 集配管理-input |
| 订单处理状态       | 下拉框   | 否   |                         |      | 集配管理-select|

#### 1.1.2 列表展示字段
| 字段名                           | 数据类型 | 格式 | 说明 | 来源           |
|----------------------------------|---------|------|------|----------------|
| 客户名称                         | 文本     |      |      | 集配管理-div   |
| 商品总数量                       | 文本     |      |      | 集配管理-div   |
| 申请日期                         | 文本     |      |      | 集配管理-div   |
| ...（共12个字段）                |          |      |      |                |

#### 1.1.3 操作按钮 ← 🔥 这是新增的章节！
| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
| 查询 | 主要 | 无 | 无 | 根据查询条件筛选数据 | 集配管理-button |
| 重置 | 次要 | 无 | 无 | 清空查询条件 | 集配管理-button |
| 导出 | 次要 | 需要导出权限 | 有数据时可用 | 导出查询结果为Excel | 集配管理-button |
| 新增 | 主要 | 需要新增权限 | 无 | 打开新增集配申请弹窗 | 集配管理-button |
| 编辑 | 次要 | 需要编辑权限 | 选中单条数据后可用 | 编辑集配申请信息 | 集配管理-button |
| 删除 | 危险 | 需要删除权限 | 选中数据后可用 | 删除选中的集配申请 | 集配管理-button |
| 审核 | 主要 | 需要审核权限 | 选中待审核数据后可用 | 打开审核弹窗 | 集配管理-button |
| 查看详情 | 次要 | 无 | 选中单条数据后可用 | 查看集配申请详情 | 集配管理-button |
| ...（所有按钮都会列出）|||||||

#### 1.1.4 业务规则
1. 客户名称、商品总数量、申请日期、申请人、商品渠道等信息需要在页面中展示。(来源: 集配管理)
2. 设定库存时，需要显示商品信息及规格。(来源: 集配管理)
...（共11条规则）
```

---

## 测试步骤

### 1. 重启服务

```bash
# 停止当前服务（Ctrl+C）

# 重新启动
npm run dev
```

### 2. 重新生成需求文档

1. 上传相同的 Axure 文件
2. 填写项目信息
3. 点击"开始解析"
4. （可选）完成智能补全
5. 等待需求文档生成

### 3. 验证结果

检查生成的需求文档是否包含：

- ✅ **操作按钮章节存在** - 章节号为 1.1.3（对于 mixed 页面）
- ✅ **所有按钮都列出** - 如果原型有10个按钮，表格应该有10行
- ✅ **按钮表格格式正确** - 包含：按钮名称、按钮类型、权限要求、触发条件、操作说明、来源
- ✅ **章节顺序正确** - 查询条件 → 列表展示字段 → 操作按钮 → 业务规则

---

## 对比

| 项目 | 修复前 | 修复后 |
|------|--------|--------|
| 按钮章节 | ❌ 无 | ✅ 有（1.1.3） |
| 按钮数量 | ❌ 0个 | ✅ 全部按钮（10+个） |
| 按钮详情 | ❌ 无 | ✅ 表格展示，包含类型、权限、条件、说明 |
| 提示词强调 | ⚠️ 弱 | ✅ 强（多处🔥标记，明确要求） |
| 数据提取 | ⚠️ 只有查询/表单按钮 | ✅ 提取所有按钮 |
| 信息展示 | ⚠️ 按钮可能被截断 | ✅ 单独提取，不截断 |

---

## 相关文件

- [functionalTestCaseAIService.ts](../server/services/functionalTestCaseAIService.ts) - 需求文档生成服务（主要修改）
- [aiPreAnalysisService.ts](../server/services/aiPreAnalysisService.ts) - AI 预分析服务（已有按钮提取逻辑）

---

## 技术要点

### 1. 多层次强化策略

通过在**3个不同位置**强调按钮：

1. **系统提示词** - 告诉 AI 如何生成章节
2. **页面类型分析表** - 列出所有按钮名称
3. **按钮详细列表** - 专门的按钮信息部分

这样 AI 无论如何都能看到按钮信息。

### 2. 明确的章节顺序

对于 mixed/unknown 页面，明确规定章节顺序：

```
1.1.1 查询条件（如果有）
1.1.2 列表展示字段（如果有）
1.1.3 操作按钮 ← 固定在这里，必须生成
1.1.4 表单字段定义（如果有）
1.1.5 业务规则
```

这样 AI 不会把业务规则放错位置。

### 3. 视觉强化标记

使用多种标记引起 AI 注意：

- 🔥🔥🔥 - 最重要的内容
- ⚠️ - 警告和强调
- ← - 指向关键信息
- **加粗** - 突出关键词
- "必须"、"绝对不能遗漏" - 强制性语言

---

**修复时间**: 2025-11-05
**版本**: v2.0
