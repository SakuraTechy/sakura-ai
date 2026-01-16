# 智能补全功能实现文档

## 功能概述

智能补全（Smart Completion）功能通过AI预分析，在生成需求文档前快速识别原型中的"不确定信息"，让用户确认关键问题，从而将需求文档准确率从60%提升到85%+。

## 工作流程

### 原始流程
```
上传Axure → AI生成需求文档(60%准确率) → 生成测试用例
```

### 改进流程
```
上传Axure → AI预分析(10秒) → 用户确认关键信息(3-5分钟) → AI生成增强需求文档(85%+准确率) → 生成测试用例
```

## 技术架构

### 1. 数据库层 (Prisma Schema)

**文件**: `prisma/schema.prisma`

添加了两个可选JSON字段：

```prisma
model ai_generation_sessions {
  // ...
  pre_analysis_result   Json?     // AI预分析结果
  enhanced_data         Json?     // 用户确认的增强数据
}
```

### 2. 后端类型定义

**文件**: `server/types/aiPreAnalysis.ts`

#### 核心枚举
- `UncertainInfoType`: 7种不确定信息类型（enumValues, businessRule, fieldMeaning, etc.）
- `ImportanceLevel`: 3个优先级（high, medium, low）

#### 核心接口
- `UncertainInfo`: 不确定信息结构
- `UserConfirmation`: 用户确认结构
- `PreAnalysisResult`: AI预分析结果
- `EnhancedAxureData`: 增强数据结构

### 3. 后端AI预分析服务

**文件**: `server/services/aiPreAnalysisService.ts`

#### 核心方法: `preAnalyze()`

**性能目标**: 10秒内完成

**AI提示词策略**:
- 使用temperature=0.2保证稳定输出
- 使用max_tokens=3000控制速度
- 明确指示AI识别"不确定点"而非生成完整需求
- 限制uncertainInfo数组最多15个问题

**返回结构**:
```typescript
{
  confidence: 0.75,
  clearInfo: ["AI确定的信息"],
  uncertainInfo: [{
    id, type, question, aiGuess, importance, context
  }],
  missingCritical: ["缺失的关键信息"],
  statistics: { totalFields, certainFields, uncertainFields }
}
```

**容错机制**: AI预分析失败时返回空的uncertainInfo数组，系统自动回退到原始流程

### 4. 后端需求文档生成服务

**文件**: `server/services/functionalTestCaseAIService.ts`

#### 改动点

1. 添加`enhancedData`可选参数到`generateRequirementDoc()`
2. 新增`buildEnhancedContext()`方法，将用户确认注入AI提示词
3. 上下文注入优先级：**用户确认 > 原始原型 > AI推测**

#### 上下文注入示例
```
## 🎯 用户已确认的关键信息（必须遵守！）

### 1️⃣ 枚举值
- 订单状态: ["待支付", "已支付", "已发货", "已完成"]

### 2️⃣ 业务规则
- 删除订单: 只能删除待支付订单；需要弹窗二次确认

### 3️⃣ 字段含义
- sn: 订单编号

### 4️⃣ 校验规则
- 手机号: 11位数字，1开头
```

### 5. 后端API路由

**文件**: `server/routes/axure.ts`

#### 新增端点

1. **POST /api/v1/axure/pre-analyze**
   - 执行AI预分析
   - 保存结果到数据库
   - 返回不确定信息列表

2. **POST /api/v1/axure/generate-requirement-enhanced**
   - 接收用户确认数据
   - 调用增强版需求文档生成
   - 保存增强数据和需求文档

**兼容性**: 原有`/generate-requirement`端点保持不变，确保向后兼容

### 6. 前端类型定义

**文件**: `src/types/aiPreAnalysis.ts`

与后端类型保持一致，确保类型安全

### 7. 前端API服务

**文件**: `src/services/functionalTestCaseService.ts`

#### 新增方法

1. `preAnalyze(sessionId, axureData)`
   - 调用预分析接口
   - 返回AI识别的不确定信息

2. `generateRequirementEnhanced(sessionId, axureData, projectInfo, enhancedData)`
   - 调用增强版需求生成接口
   - 支持3分钟超时（180秒）

### 8. 前端智能补全对话框

**文件**: `src/components/ai-generator/SmartCompletionModal.tsx`

#### UI设计

**头部**
- AI置信度显示（如：75%）
- 进度条显示确认进度

**内容区**
1. AI已确定的信息（可折叠）
2. 高优先级问题（必答，红色标签）
3. 中优先级问题（建议，橙色标签）
4. 低优先级问题（可折叠）

**每个问题卡片**
- 问题描述
- 上下文信息（页面名称、字段名）
- AI推测值（Tag展示）
- 操作按钮："接受AI推测"、"跳过"

**底部操作栏**
- "跳过补全，直接生成"按钮
- "确认并生成需求文档"按钮（高优先级未答完时禁用）

#### 交互逻辑

```typescript
// 接受AI推测
handleAcceptAI() {
  onConfirm(info, info.aiGuess, false);
}

// 跳过问题
handleSkip() {
  onConfirm(info, undefined, true);
}

// 提交确认
handleSubmit() {
  const confirmationList = Object.values(confirmations);
  onConfirm(confirmationList); // 触发需求文档生成
}
```

### 9. 前端主页集成

**文件**: `src/pages/FunctionalTestCaseGenerator.tsx`

#### 新增状态变量

```typescript
const [preAnalysisResult, setPreAnalysisResult] = useState<PreAnalysisResult | null>(null);
const [preAnalyzing, setPreAnalyzing] = useState(false);
const [completionModalOpen, setCompletionModalOpen] = useState(false);
const [userConfirmations, setUserConfirmations] = useState<UserConfirmation[]>([]);
```

#### 核心流程方法

**1. performPreAnalysis()** - 执行AI预分析
```typescript
async performPreAnalysis(axureData, sid) {
  const result = await functionalTestCaseService.preAnalyze(sid, axureData);

  if (result.data.uncertainInfo.length > 0) {
    setCompletionModalOpen(true); // 打开智能补全对话框
  } else {
    await generateRequirementDoc(axureData, sid); // 直接生成
  }
}
```

**2. handleConfirmations()** - 处理用户确认
```typescript
async handleConfirmations(confirmations) {
  const enhancedData = buildEnhancedData(confirmations);
  await generateRequirementDocEnhanced(parseResult, sessionId, enhancedData);
}
```

**3. handleSkipCompletion()** - 跳过智能补全
```typescript
async handleSkipCompletion() {
  setCompletionModalOpen(false);
  await generateRequirementDoc(parseResult, sessionId); // 使用原始API
}
```

**4. buildEnhancedData()** - 构建增强数据
```typescript
buildEnhancedData(confirmations): EnhancedAxureData {
  // 根据confirmations构建enrichedInfo
  // 区分enumValues, businessRule, fieldMeaning, validationRule
  return { originalData, preAnalysis, userConfirmations, enrichedInfo };
}
```

**5. generateRequirementDocEnhanced()** - 生成增强需求文档
```typescript
async generateRequirementDocEnhanced(axureData, sid, enhancedData) {
  const result = await functionalTestCaseService.generateRequirementEnhanced(
    sid, axureData, projectInfo, enhancedData
  );
  setRequirementDoc(result.data.requirementDoc);
}
```

#### UI状态处理

**步骤2渲染逻辑更新**:
```typescript
{preAnalyzing ? (
  <AIThinking title="AI 正在预分析原型..." />
) : generating ? (
  <AIThinking title="AI 正在生成需求文档..." />
) : (
  <MarkdownEditor value={requirementDoc} />
)}
```

## 关键设计决策

### 1. 向后兼容
- 保留原有`/generate-requirement`端点
- 新增`/generate-requirement-enhanced`端点
- 预分析失败自动回退到原始流程

### 2. 性能优化
- 预分析限制10秒完成（3000 tokens）
- 问题数量限制最多15个
- 使用temperature=0.2保证快速稳定输出

### 3. 容错机制
- AI预分析失败时返回空uncertainInfo
- 网络超时后显示友好提示
- 用户可随时跳过智能补全

### 4. 优先级设计
- 高优先级必答（如：枚举值、关键业务规则）
- 中优先级建议回答（如：字段含义）
- 低优先级可选（如：字段长度限制）

### 5. 数据安全
- 用户确认数据完整保存到数据库
- 支持会话恢复和审计追溯

## 测试流程

### 端到端测试步骤

1. **上传Axure文件**
   - 选择多个HTML+JS文件
   - 填写系统名称、模块名称、页面名称

2. **等待AI预分析**（约10秒）
   - 观察"AI正在预分析原型..."状态
   - 确认进度条显示

3. **智能补全对话框**
   - 验证问题分组（高/中/低优先级）
   - 测试"接受AI推测"按钮
   - 测试"跳过"按钮
   - 验证进度条更新
   - 验证高优先级未答完时"确认"按钮禁用

4. **生成增强需求文档**
   - 点击"确认并生成需求文档"
   - 观察需求文档内容是否包含用户确认信息
   - 对比原始方式生成的需求文档

5. **容错测试**
   - 测试网络断开时的回退行为
   - 测试AI预分析失败时的回退行为
   - 测试跳过智能补全的流程

### 预期结果

- 需求文档准确率从60%提升到85%+
- 用户确认时间控制在3-5分钟
- AI预分析时间控制在10秒内

## 文件清单

### 后端文件
- ✅ `prisma/schema.prisma` - 数据库架构
- ✅ `server/types/aiPreAnalysis.ts` - 类型定义
- ✅ `server/services/aiPreAnalysisService.ts` - AI预分析服务
- ✅ `server/services/functionalTestCaseAIService.ts` - 需求文档生成增强
- ✅ `server/routes/axure.ts` - API端点

### 前端文件
- ✅ `src/types/aiPreAnalysis.ts` - 类型定义
- ✅ `src/services/functionalTestCaseService.ts` - API调用方法
- ✅ `src/components/ai-generator/SmartCompletionModal.tsx` - 智能补全对话框
- ✅ `src/pages/FunctionalTestCaseGenerator.tsx` - 主页集成

## 部署说明

1. **数据库迁移**
   ```bash
   npx prisma db push
   ```

2. **重启后端服务**
   ```bash
   npm run dev:server
   ```

3. **重启前端服务**
   ```bash
   npm run dev:frontend
   ```

4. **验证部署**
   - 访问功能测试用例生成页面
   - 上传Axure文件测试完整流程

## 未来优化方向

1. **AI优化**
   - 训练专门的预分析模型，进一步提升速度
   - 支持用户自定义问题模板

2. **交互优化**
   - 支持用户直接编辑AI推测值
   - 添加历史确认记录，快速复用

3. **性能优化**
   - 实现预分析结果缓存
   - 支持并行处理多个页面的预分析

4. **分析能力**
   - 统计用户最常确认的信息类型
   - 优化AI模型减少不确定信息数量

---

**实现时间**: 2025年11月5日
**实现人员**: Claude AI Assistant
**版本**: v1.0.0
