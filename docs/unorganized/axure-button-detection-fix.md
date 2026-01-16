# Axure 按钮识别修复方案

## 问题描述

用户反馈生成的需求文档中：
1. **完全没有按钮信息** - 显示"本页面无按钮"
2. **下拉框选项未提取** - 下拉框的可选值没有被识别

## 根本原因分析

### 问题 1: 按钮识别失败

经过分析用户提供的 Axure HTML 文件 (`集配管理（新增）-cby.html`)，发现：

**Axure 导出的按钮不是 `<button>` 标签！**

#### Axure 实际的按钮结构

```html
<!-- "审核" 按钮 -->
<div id="u2780" class="ax_default label">
  <div id="u2780_div" class=""></div>
  <div id="u2780_text" class="text ">
    <p><span>审核</span></p>
  </div>
</div>

<!-- "确认下单" 按钮 -->
<div id="u2832" class="ax_default label">
  <div id="u2832_div" class=""></div>
  <div id="u2832_text" class="text ">
    <p><span>确认下单</span></p>
  </div>
</div>

<!-- "详情" 按钮 -->
<div id="u2883" class="ax_default label">
  <div id="u2883_div" class=""></div>
  <div id="u2883_text" class="text ">
    <p><span>详情</span></p>
  </div>
</div>
```

#### 原有解析器的选择器

[axureParseService.ts:289-301](../server/services/axureParseService.ts#L289-L301)

```typescript
const selectors = [
  'input',
  'button',        // ❌ Axure 不使用 <button> 标签
  'select',
  'textarea',
  'a[href]',
  '[data-label]',
  '[onclick]',
  '.btn',          // ❌ Axure 不使用 .btn 类
  '.button',       // ❌ Axure 不使用 .button 类
  '[role="button"]',  // ❌ Axure 不使用 role 属性
  '[type="submit"]'
];
```

**结果**：解析器完全无法识别 Axure 按钮！

---

## 修复方案

### ✅ 修复 1: 添加 Axure 按钮选择器

**位置**: [axureParseService.ts:289-323](../server/services/axureParseService.ts#L289-L323)

**修改前**:
```typescript
const selectors = [
  'input',
  'button',
  'select',
  'textarea',
  'a[href]',
  '[data-label]',
  '[onclick]',
  '.btn',
  '.button',
  '[role="button"]',
  '[type="submit"]'
];

$(pageElem)
  .find(selectors.join(', '))
  .each((i, elem) => {
    const $elem = $(elem);
    const type = elem.tagName ? elem.tagName.toLowerCase() : 'unknown';
    // ... 后续处理
  });
```

**修改后**:
```typescript
const selectors = [
  'input',
  'button',
  'select',
  'textarea',
  'a[href]',
  '[data-label]',
  '[onclick]',
  '.btn',
  '.button',
  '[role="button"]',
  '[type="submit"]',
  '.ax_default.label'  // 🔥 新增：Axure 导出的按钮
];

$(pageElem)
  .find(selectors.join(', '))
  .each((i, elem) => {
    const $elem = $(elem);
    let type = elem.tagName ? elem.tagName.toLowerCase() : 'unknown';

    // 🔥 关键修复：将 Axure 的 label div 识别为 button
    if (type === 'div' && $elem.hasClass('ax_default') && $elem.hasClass('label')) {
      const text = $elem.text().trim();
      // 如果文本内容看起来像按钮（短文本，不是字段标签），将其识别为按钮
      if (text.length > 0 && text.length <= 10 &&
          (text.includes('查询') || text.includes('重置') || text.includes('导出') ||
           text.includes('新增') || text.includes('编辑') || text.includes('删除') ||
           text.includes('审核') || text.includes('确认') || text.includes('确定') ||
           text.includes('取消') || text.includes('保存') || text.includes('提交') ||
           text.includes('详情') || text.includes('下单') || text.includes('上传') ||
           text.includes('下载') || text.includes('打印') || text.includes('返回') ||
           text.includes('关闭') || text.includes('刷新'))) {
        type = 'button';  // 🔥 强制识别为 button
      }
    }

    // ... 后续处理保持不变
  });
```

---

## 识别逻辑说明

### 1. 选择器匹配

添加 `.ax_default.label` 选择器，匹配所有 Axure 导出的 label 元素。

### 2. 按钮文本识别

为了区分按钮和普通标签（如字段标签"客户名称"），使用以下规则：

**按钮特征**:
- ✅ 文本长度 ≤ 10 个字符
- ✅ 包含常见按钮关键词：
  - 操作类：查询、重置、导出、新增、编辑、删除
  - 确认类：审核、确认、确定、取消、保存、提交
  - 导航类：详情、返回、关闭、刷新
  - 特殊操作：下单、上传、下载、打印

**字段标签特征**:
- ❌ 文本长度 > 10 个字符（如"渠道集采订单号"）
- ❌ 不包含按钮关键词

### 3. 类型强制转换

当检测到符合条件的 `div.ax_default.label` 时，将其 `type` 强制设置为 `'button'`，确保后续处理逻辑能够正确识别。

---

## 支持的按钮关键词

| 类别 | 关键词 |
|------|--------|
| 查询操作 | 查询、搜索、重置、刷新 |
| 数据操作 | 新增、编辑、删除、保存、提交 |
| 审核操作 | 审核、确认、确定、取消 |
| 导出操作 | 导出、下载、打印、上传 |
| 导航操作 | 详情、返回、关闭 |
| 业务操作 | 下单、确认下单 |

---

## 预期效果

### 修复前

```markdown
#### 1.1.3 操作按钮
⚠️ **本页面无按钮**
```

### 修复后

```markdown
#### 1.1.3 操作按钮
| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
| 审核 | 主要 | 需要审核权限 | 选中数据后可用 | 打开审核弹窗 | 集配管理-button |
| 确认下单 | 主要 | 需要下单权限 | 审核通过后可用 | 确认订单并下单 | 集配管理-button |
| 详情 | 次要 | 无 | 选中单条数据后可用 | 查看详细信息 | 集配管理-button |
| 查询 | 主要 | 无 | 无 | 根据查询条件筛选数据 | 集配管理-button |
| 重置 | 次要 | 无 | 无 | 清空查询条件 | 集配管理-button |
| 导出 | 次要 | 需要导出权限 | 有数据时可用 | 导出查询结果 | 集配管理-button |
| ...（所有按钮）|||||||
```

---

## 测试步骤

### 1. 重启服务

```bash
# 停止当前服务（Ctrl+C）
# 重新启动
npm run dev
```

### 2. 上传 Axure 文件

**重要**：确保上传 HTML 文件，而不只是 JS 文件！

- ✅ 正确：上传 `集配管理（新增）-cby.html`
- ❌ 错误：只上传 `data.js`

Axure 导出包含多个文件：
- `*.html` - **主文件**，包含页面结构和按钮元素
- `data.js` - 辅助数据文件
- `styles.css` - 样式文件
- `images/` - 图片资源

**系统会自动处理所有文件，但 HTML 是必须的！**

### 3. 生成需求文档

1. 填写项目信息
2. 点击"开始解析"
3. 等待需求文档生成
4. 查看"操作按钮"章节

### 4. 验证结果

检查生成的需求文档：

- ✅ **有"操作按钮"章节**
- ✅ **按钮数量正确** - 如果 Axure 有 10 个按钮，表格应该有 10 行
- ✅ **按钮名称正确** - "审核"、"确认下单"、"详情"等
- ✅ **章节顺序正确** - 查询条件 → 列表展示字段 → 操作按钮 → 业务规则

---

## 调试日志

如果按钮仍然没有被识别，查看后端日志：

```
📄 开始解析Axure文件: .../集配管理（新增）-cby.html
🔍 步骤1: 尝试提取主内容区域...
  ✓ 找到主容器: #base
  📋 找到 X 个label-input关联
  ✅ 提取完成: XX 个元素 (包含业务规则说明)
    - button 类型: 10 个  ← 🔥 检查这一行
  🔍 页面类型识别 "集配管理": input=6, button=10, div=12
```

如果 `button 类型: 0 个`，说明按钮仍未被识别。请检查：

1. 是否上传了 HTML 文件（不只是 JS）
2. 按钮文本是否包含支持的关键词
3. 按钮文本长度是否 ≤ 10

---

## 扩展支持

### 添加更多按钮关键词

如果你的 Axure 原型使用了其他按钮文本，可以在识别逻辑中添加：

[axureParseService.ts:314-321](../server/services/axureParseService.ts#L314-L321)

```typescript
if (text.length > 0 && text.length <= 10 &&
    (text.includes('查询') || text.includes('重置') || text.includes('导出') ||
     text.includes('新增') || text.includes('编辑') || text.includes('删除') ||
     text.includes('审核') || text.includes('确认') || text.includes('确定') ||
     text.includes('取消') || text.includes('保存') || text.includes('提交') ||
     text.includes('详情') || text.includes('下单') || text.includes('上传') ||
     text.includes('下载') || text.includes('打印') || text.includes('返回') ||
     text.includes('关闭') || text.includes('刷新') ||
     text.includes('你的关键词'))) {  // 🔥 在这里添加
  type = 'button';
}
```

### 调整文本长度限制

如果你的按钮文本较长（如"批量导出Excel"），可以调整长度限制：

```typescript
// 修改前
if (text.length > 0 && text.length <= 10 && ...)

// 修改后
if (text.length > 0 && text.length <= 15 && ...)  // 🔥 增加到15
```

---

## 相关文件

- [axureParseService.ts](../server/services/axureParseService.ts) - Axure 解析服务（本次修改）
- [functionalTestCaseAIService.ts](../server/services/functionalTestCaseAIService.ts) - 需求文档生成服务（之前修改）
- [button-extraction-fix.md](button-extraction-fix.md) - 需求文档生成修复说明

---

## 技术细节

### Axure HTML 结构

Axure RP 9/10 导出的 HTML 使用以下约定：

1. **容器**：`<div id="base">` 或 `<body>`
2. **输入框**：`<input type="text">` 或 `<select>`
3. **按钮**：`<div class="ax_default label">` ← **不是 `<button>`！**
4. **文本**：`<div class="ax_default label">` ← 和按钮一样！
5. **图片**：`<div class="ax_default image1">`
6. **表格**：`<div>` 或自定义元素

### 区分按钮和标签的挑战

由于 Axure 使用相同的 HTML 结构表示按钮和文本标签，必须通过**内容特征**区分：

| 元素类型 | 文本示例 | 长度 | 特征 |
|---------|---------|------|------|
| 按钮 | "查询"、"审核"、"详情" | 2-4字 | 操作性词汇 |
| 按钮 | "确认下单"、"批量编辑" | 4-6字 | 复合操作词汇 |
| 字段标签 | "客户名称"、"申请日期" | 4-6字 | 名词 |
| 字段标签 | "渠道集采订单号" | 7+字 | 长描述 |

当前实现使用**关键词匹配 + 长度限制**的启发式算法，准确率较高但不是100%。

### 改进方向

更精确的识别可以考虑：

1. **位置信息**：按钮通常在页面顶部或右侧
2. **父元素类名**：按钮的父容器可能有特定类名
3. **样式信息**：按钮通常有特殊的背景色或边框
4. **交互信息**：按钮通常有 `onclick` 或 `[data-action]` 属性

但这些需要更复杂的解析逻辑。当前的关键词方案已经能满足大多数场景。

---

**修复时间**: 2025-11-05
**版本**: v1.0
