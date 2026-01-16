# 断言匹配日志输出到前端

## 问题描述

用户希望将断言匹配相关的详细日志也显示在前端执行日志中，包括：
- 匹配模式（严格/智能/宽松）
- 匹配类型（完全匹配/包含匹配/反向包含匹配/关键词匹配）
- 警告信息（期望文本 vs 实际文本）
- 建议信息

## 解决方案

### 1. 在 PlaywrightTestRunner 中添加日志回调机制

**文件**: `server/services/playwrightTestRunner.ts`

#### 1.1 构造函数添加日志回调参数

```typescript
constructor(
  evidenceService: EvidenceService,
  streamService: StreamService,
  artifactsDir: string,
  logCallback?: (message: string, level?: 'info' | 'warning' | 'error' | 'success') => void // 🔥 新增：日志回调
) {
  this.evidenceService = evidenceService;
  this.streamService = streamService;
  this.artifactsDir = artifactsDir;
  this.logCallback = logCallback; // 🔥 保存日志回调
}
```

#### 1.2 在 findInTextHistory 方法中添加日志回调调用

在所有关键日志输出位置添加日志回调：

```typescript
// 🔥 新增：将日志发送到前端
if (this.logCallback) {
  this.logCallback(`🔍 在文本历史记录中查找: "${searchText}"`, 'info');
  this.logCallback(`📊 历史记录共有 ${this.textHistory.size} 条文本`, 'info');
  this.logCallback(`⚙️ 匹配模式: ${matchMode === 'strict' ? '严格匹配' : matchMode === 'auto' ? '智能匹配' : '宽松匹配'}`, 'info');
}
```

关键日志点：
- 查找开始：显示搜索文本、历史记录数量、匹配模式
- 完全匹配成功
- 严格模式未找到
- 包含匹配成功
- 反向包含匹配成功（带警告）
- 智能模式未找到
- 关键词匹配成功（带警告）
- 宽松模式未找到

#### 1.3 在 executeStep 方法的弹窗验证部分添加日志回调

```typescript
// 🔥 新增：将日志发送到前端
if (this.logCallback) {
  this.logCallback(`✅ 在文本历史记录中找到弹窗: "${historyResult.matchedText}"`, 'success');
  this.logCallback(`📊 匹配类型: ${historyResult.matchType}`, 'info');
}

// 🔥 如果是宽松匹配（反向包含或关键词匹配），给出警告
if (historyResult.matchType?.includes('反向包含') || historyResult.matchType?.includes('关键词')) {
  // 🔥 新增：将警告日志发送到前端
  if (this.logCallback) {
    this.logCallback(`⚠️ 警告：使用了宽松匹配策略`, 'warning');
    this.logCallback(`   期望文本: "${step.value}"`, 'warning');
    this.logCallback(`   实际文本: "${historyResult.matchedText}"`, 'warning');
    this.logCallback(`💡 建议：检查测试用例中的期望文本是否准确`, 'info');
  }
}
```

### 2. 在 testExecution.ts 中传递日志回调

**文件**: `server/services/testExecution.ts`

在 `initializePlaywrightRunner` 方法中创建日志回调并传递给 PlaywrightTestRunner：

```typescript
// 🔥 创建日志回调函数，将 PlaywrightTestRunner 的日志发送到前端
const logCallback = (message: string, level?: 'info' | 'warning' | 'error' | 'success') => {
  this.addLog(runId, message, level || 'info');
};

// 创建 Playwright Test Runner 实例
const artifactsDir = this.evidenceService.getArtifactsDir();
this.playwrightRunner = new PlaywrightTestRunner(
  this.evidenceService,
  this.streamService,
  artifactsDir,
  logCallback // 🔥 传递日志回调
);
```

## 日志输出示例

### 智能匹配模式（auto）

```
⚙️ 匹配模式: 智能匹配
🔍 在文本历史记录中查找: "系统无证书，请上传证书1"
📊 历史记录共有 87 条文本
⚠️ 反向包含匹配: 期望文本 "系统无证书，请上传证书1" 包含实际文本 "系统无证书，请上传证书"
💡 提示：期望文本可能有多余字符，建议检查测试用例
✅ 在文本历史记录中找到弹窗: "系统无证书，请上传证书"
📊 匹配类型: 反向包含匹配
⚠️ 警告：使用了宽松匹配策略
   期望文本: "系统无证书，请上传证书1"
   实际文本: "系统无证书，请上传证书"
💡 建议：检查测试用例中的期望文本是否准确
💡 弹窗已消失，但历史记录证明它曾经出现过
```

### 严格匹配模式（strict）

```
⚙️ 匹配模式: 严格匹配
🔍 在文本历史记录中查找: "系统无证书，请上传证书1"
📊 历史记录共有 87 条文本
❌ 严格模式下未找到完全匹配的文本
```

### 宽松匹配模式（loose）

```
⚙️ 匹配模式: 宽松匹配
🔍 在文本历史记录中查找: "系统无证书，请上传证书1"
📊 历史记录共有 87 条文本
🔍 宽松模式：尝试关键词匹配，关键词: 请上传证书1, 系统无证书
⚠️ 关键词匹配成功: "系统无证书，请上传证书" (匹配 2/2 个关键词)
💡 提示：使用了宽松匹配，建议检查期望文本是否准确
✅ 在文本历史记录中找到弹窗: "系统无证书，请上传证书"
📊 匹配类型: 关键词匹配 (2/2)
⚠️ 警告：使用了宽松匹配策略
   期望文本: "系统无证书，请上传证书1"
   实际文本: "系统无证书，请上传证书"
💡 建议：检查测试用例中的期望文本是否准确
💡 弹窗已消失，但历史记录证明它曾经出现过
```

## 技术细节

### 日志回调函数签名

```typescript
logCallback?: (message: string, level?: 'info' | 'warning' | 'error' | 'success') => void
```

### 日志级别说明

- `info`: 普通信息（蓝色）
- `warning`: 警告信息（黄色）
- `error`: 错误信息（红色）
- `success`: 成功信息（绿色）

### 日志传递流程

```
PlaywrightTestRunner.findInTextHistory()
  ↓ (调用 logCallback)
TestExecutionService.addLog()
  ↓ (通过 WebSocket)
前端执行日志面板
```

## 测试验证

### 测试场景 1：智能匹配模式

**测试用例**: ID 80（登录弹窗验证）
**断言匹配模式**: 智能匹配（auto）
**期望结果**: 
- 显示匹配模式为"智能匹配"
- 显示反向包含匹配成功
- 显示警告信息和建议

### 测试场景 2：严格匹配模式

**测试用例**: ID 80（登录弹窗验证）
**断言匹配模式**: 严格匹配（strict）
**期望结果**:
- 显示匹配模式为"严格匹配"
- 显示未找到完全匹配的文本
- 断言失败

### 测试场景 3：宽松匹配模式

**测试用例**: ID 80（登录弹窗验证）
**断言匹配模式**: 宽松匹配（loose）
**期望结果**:
- 显示匹配模式为"宽松匹配"
- 显示关键词匹配过程
- 显示匹配成功的关键词数量
- 显示警告信息和建议

## 相关文件

- `server/services/playwrightTestRunner.ts` - 添加日志回调机制
- `server/services/testExecution.ts` - 传递日志回调
- `docs/fixes/assertion-match-mode-implementation.md` - 断言匹配策略实现文档
- `docs/fixes/assertion-match-mode-strict-mode-fix.md` - 严格模式修复文档

## 注意事项

1. **日志回调是可选的**: 如果没有传递日志回调，PlaywrightTestRunner 仍然会正常工作，只是不会将日志发送到前端
2. **日志级别**: 根据日志内容选择合适的级别，帮助用户快速识别问题
3. **日志内容**: 保持日志简洁明了，避免过多技术细节
4. **性能影响**: 日志回调是同步调用，不会影响测试执行性能

## 后续优化建议

1. **日志过滤**: 允许用户在前端选择显示哪些级别的日志
2. **日志导出**: 支持将执行日志导出为文件
3. **日志搜索**: 在前端添加日志搜索功能
4. **日志高亮**: 对关键信息（如匹配类型、警告）进行高亮显示
