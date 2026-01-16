# 断言匹配策略 - 执行引擎要求说明

## 问题现象

用户选择了断言匹配策略（严格/智能/宽松），但在执行时发现没有生效。

## 根本原因

**断言匹配策略功能仅在 Playwright Test Runner 中完全支持。**

### 技术原因

#### Playwright Test Runner
- ✅ 使用**文本历史记录机制**
- ✅ 每 500ms 扫描页面文本并记录
- ✅ 即使弹窗消失，也能从历史记录中验证
- ✅ 支持三种精确的匹配策略：
  - 严格匹配：仅完全匹配
  - 智能匹配：完全 → 包含 → 反向包含
  - 宽松匹配：完全 → 包含 → 反向包含 → 关键词

#### MCP 客户端
- ⚠️ 使用 **AI 闭环执行**
- ⚠️ 通过 AI 解析页面快照来验证断言
- ⚠️ 断言匹配由 AI 自主判断
- ⚠️ 匹配策略配置仅作为参考，无法精确控制

## 解决方案

### 方案 1：切换到 Playwright 引擎（推荐）

在执行配置弹窗中：

1. **执行引擎** 选择：`Playwright Test Runner`
2. **断言匹配策略** 选择：`智能匹配（推荐）` 或其他模式

这样断言匹配策略就会完全生效。

### 方案 2：继续使用 MCP 引擎

如果必须使用 MCP 引擎：

- 断言匹配由 AI 判断，无法精确控制
- 建议在测试用例中使用更明确的断言描述
- AI 会尽力匹配，但可能不如 Playwright 精确

## 两种引擎对比

| 特性 | Playwright Test Runner | MCP 客户端 |
|------|----------------------|-----------|
| **断言匹配策略** | ✅ 完全支持 | ⚠️ 有限支持 |
| **弹窗捕获** | ✅ 文本历史记录 | ⚠️ AI 快照分析 |
| **匹配精度** | ✅ 精确可控 | ⚠️ AI 判断 |
| **执行速度** | ✅ 快速 | ⚠️ 较慢（AI 解析） |
| **Trace 录制** | ✅ 支持 | ❌ 不支持 |
| **Video 录制** | ✅ 支持 | ❌ 不支持 |
| **AI 智能** | ⚠️ 有限 | ✅ 强大 |
| **复杂场景** | ⚠️ 需要精确选择器 | ✅ AI 自动处理 |

## 使用建议

### 使用 Playwright 的场景
- ✅ 需要精确的断言匹配控制
- ✅ 需要捕获快速消失的弹窗
- ✅ 需要 Trace 和 Video 录制
- ✅ 测试步骤明确，选择器清晰

### 使用 MCP 的场景
- ✅ 复杂的 UI 交互，选择器难以确定
- ✅ 需要 AI 智能识别元素
- ✅ 测试步骤用自然语言描述
- ⚠️ 对断言匹配精度要求不高

## 示例

### 使用 Playwright（推荐）

```json
{
  "caseId": 80,
  "executionEngine": "playwright",  // ✅ 使用 Playwright
  "enableTrace": true,
  "enableVideo": true,
  "environment": "staging",
  "assertionMatchMode": "auto"  // ✅ 断言匹配策略生效
}
```

**结果**：断言匹配策略完全生效，基于文本历史记录精确匹配。

### 使用 MCP

```json
{
  "caseId": 80,
  "executionEngine": "mcp",  // ⚠️ 使用 MCP
  "enableTrace": true,
  "enableVideo": true,
  "environment": "staging",
  "assertionMatchMode": "auto"  // ⚠️ 仅作为参考
}
```

**结果**：断言匹配由 AI 判断，策略配置效果有限。

## 总结

如果你需要使用**断言匹配策略**功能来精确控制弹窗验证，请务必选择 **Playwright Test Runner** 执行引擎。

这是由两种引擎的技术架构决定的：
- Playwright 使用文本历史记录机制，可以精确控制匹配策略
- MCP 使用 AI 闭环执行，断言由 AI 自主判断

## 相关文档
- [断言匹配策略实施总结](./assertion-match-mode-implementation.md)
- [执行引擎对比](../EXECUTION_ENGINE_COMPARISON.md)
- [弹窗验证修复](./popup-verification-fix.md)
