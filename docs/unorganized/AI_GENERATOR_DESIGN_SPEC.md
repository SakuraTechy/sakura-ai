# 🎨 AI 测试用例生成器 - 设计规范文档 v2.0

> **设计理念**: "让 AI 驱动的测试用例生成,成为一种愉悦的体验,而不仅仅是一个工具。"

---

## 📋 文档信息

| 项目 | 内容 |
|------|------|
| **项目名称** | Sakura AI AI Generator Redesign |
| **设计版本** | v2.0 |
| **创建日期** | 2025-10-28 |
| **目标页面** | `/functional-test-cases/generator` |
| **设计师** | Claude (World-Class Design Standards) |
| **当前状态** | 设计规范阶段 ✅ |

---

## 📖 目录

1. [设计目标与核心原则](#设计目标与核心原则)
2. [视觉设计系统](#视觉设计系统)
3. [布局架构](#布局架构)
4. [组件设计规范](#组件设计规范)
5. [动画与交互规范](#动画与交互规范)
6. [响应式设计](#响应式设计)
7. [实施方案](#实施方案)

---

## 🎯 设计目标与核心原则

### 🔍 当前问题诊断

| 问题 | 描述 | 影响 |
|------|------|------|
| **视觉层次混乱** | 步骤指示器与内容区域缺乏呼吸感 | ⭐⭐⭐ 高 |
| **信息密度过高** | 表单字段堆叠,缺少视觉分组 | ⭐⭐⭐ 高 |
| **缺乏情感化设计** | 过于工具化,不够友好 | ⭐⭐ 中 |
| **交互反馈不足** | 生成过程缺少进度可视化 | ⭐⭐⭐ 高 |
| **品牌一致性弱** | 与主应用风格不统一 | ⭐⭐ 中 |

### 💡 设计目标

1. **提升视觉品质** - 从工具型界面升级为体验型产品
2. **增强情感连接** - 通过动画和微交互建立用户信任感
3. **优化信息架构** - 降低认知负荷,提升操作效率 📊
4. **统一品牌语言** - 与主应用 TestCases 页面风格保持一致
5. **强化 AI 特色** - 突出 AI 驱动的智能化特性 ✨

### 🎨 设计原则

| 原则 | 说明 | 应用示例 |
|------|------|----------|
| **渐进式披露** | 信息分步展示,避免认知过载 | 步骤卡片自动展开 |
| **即时反馈** | 每个操作都有视觉/动效反馈 | 按钮 Hover 动画 |
| **情境化帮助** | 在需要时提供内联帮助 | 工具提示气泡 |
| **一致性优先** | 复用现有设计系统组件 | 使用统一 Button |
| **AI 人格化** | 通过动画赋予 AI "思考"形象 | 跳动气泡动画 |

---

## 🎨 视觉设计系统

### 1️⃣ 色彩系统

#### AI 功能专属渐变

```css
/* 主渐变 - 紫蓝渐变 */
--gradient-ai-primary: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);

/* 辅助渐变 - 青蓝渐变 */
--gradient-ai-secondary: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);

/* 强调渐变 - 紫粉渐变 */
--gradient-ai-accent: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
```

#### AI 状态色

| 状态 | 颜色 | Hex | 用途 |
|------|------|-----|------|
| 思考中 | 紫色 | `#8b5cf6` | AI 正在处理 |
| 处理中 | 蓝色 | `#3b82f6` | 数据加载 |
| 完成 | 绿色 | `#10b981` | 成功状态 |
| 错误 | 红色 | `#ef4444` | 失败/警告 |

#### 语义化色彩

```css
/* 步骤状态 */
--step-pending: #d1d5db;      /* 未开始 */
--step-active: #3b82f6;       /* 进行中 */
--step-completed: #10b981;    /* 已完成 */
--step-error: #ef4444;        /* 失败 */

/* 用例质量等级 */
--quality-excellent: #10b981; /* 优秀 >= 90 */
--quality-good: #3b82f6;      /* 良好 >= 75 */
--quality-medium: #f59e0b;    /* 中等 >= 60 */
--quality-low: #ef4444;       /* 较低 < 60 */
```

### 2️⃣ 字体系统

```css
/* 字号层级 */
--font-display: 2.5rem;       /* 40px - 页面主标题 */
--font-heading: 2rem;         /* 32px - 步骤标题 */
--font-title: 1.5rem;         /* 24px - 卡片标题 */
--font-subtitle: 1.25rem;     /* 20px - 子标题 */
--font-body: 1rem;            /* 16px - 正文 */
--font-caption: 0.875rem;     /* 14px - 辅助文字 */
--font-small: 0.75rem;        /* 12px - 标签/徽章 */

/* 字重 */
--weight-bold: 700;           /* 主标题 */
--weight-semibold: 600;       /* 次标题 */
--weight-medium: 500;         /* 强调文本 */
--weight-regular: 400;        /* 正文 */

/* 行高 */
--line-height-tight: 1.2;     /* 标题 */
--line-height-normal: 1.5;    /* 正文 */
--line-height-relaxed: 1.75;  /* 长文本 */
```

### 3️⃣ 间距系统 (8px Grid)

```css
--spacing-1: 0.5rem;   /* 8px   - 紧凑间距 */
--spacing-2: 1rem;     /* 16px  - 默认间距 */
--spacing-3: 1.5rem;   /* 24px  - 中等间距 */
--spacing-4: 2rem;     /* 32px  - 大间距 */
--spacing-5: 3rem;     /* 48px  - 超大间距 */
--spacing-6: 4rem;     /* 64px  - 区块间距 */
--spacing-8: 6rem;     /* 96px  - 页面级间距 */
```

### 4️⃣ 圆角系统

```css
--radius-sm: 0.375rem;   /* 6px  - 标签/徽章 */
--radius-md: 0.5rem;     /* 8px  - 按钮/输入框 */
--radius-lg: 0.75rem;    /* 12px - 卡片 */
--radius-xl: 1rem;       /* 16px - 模态框 */
--radius-2xl: 1.5rem;    /* 24px - 主容器 */
--radius-full: 9999px;   /* 完全圆角 */
```

### 5️⃣ 阴影系统

```css
/* 层级阴影 */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
--shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15), 0 10px 10px rgba(0, 0, 0, 0.04);

/* AI 特效阴影 */
--shadow-ai-glow: 0 0 20px rgba(139, 92, 246, 0.3), 0 0 40px rgba(139, 92, 246, 0.1);
--shadow-ai-active: 0 0 30px rgba(59, 130, 246, 0.4), 0 0 60px rgba(59, 130, 246, 0.2);
```

---

## 🏗️ 布局架构

### 整体布局结构

```
┌──────────────────────────────────────────────────┐
│  Header (Sticky)                                 │
│  ┌────────────────────────────────────────────┐  │
│  │ 🎨 AI 测试用例生成器                       │  │
│  │ 从 Axure 原型到完整测试用例,一站式 AI 驱动 │  │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━       │  │
│  │ [1 上传] ──> [2 需求] ──> [3 生成]         │  │
│  └────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────┤
│  Content Area (Scrollable)                       │
│                                                  │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃  Step Card - 渐入动画                     ┃  │
│  ┃  ┌──────────────────────────────────────┐ ┃  │
│  ┃  │  [1] 步骤标题                        │ ┃  │
│  ┃  │  步骤描述文字                        │ ┃  │
│  ┃  │                                      │ ┃  │
│  ┃  │  [主要内容区域]                      │ ┃  │
│  ┃  │                                      │ ┃  │
│  ┃  │  [取消] [下一步 →]                  │ ┃  │
│  ┃  └──────────────────────────────────────┘ ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Result Preview (可折叠)                  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
│  Footer Actions Bar (Sticky)                    │
│  📊 18 总用例 | ✓ 15 已选中  [← 上一步] [保存→] │
└──────────────────────────────────────────────────┘
```

### 容器宽度策略

| 步骤 | 最大宽度 | Tailwind 类 | 说明 |
|------|----------|-------------|------|
| 步骤 1 | 768px | `max-w-3xl` | 上传区域 |
| 步骤 2 | 896px | `max-w-4xl` | 需求文档 |
| 步骤 3 | 1152px | `max-w-6xl` | 用例网格 |

---

## 🧩 组件设计规范

### 1. 页面头部 (Header)

#### 视觉设计

```tsx
<header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200
                   shadow-sm transition-shadow">
  <div className="max-w-7xl mx-auto px-6 py-4">
    {/* 标题区 */}
    <div className="flex items-center gap-4 mb-4">
      {/* AI 图标 - 渐变背景 */}
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500
                      flex items-center justify-center shadow-lg shadow-purple-500/30
                      animate-pulse-glow">
        <Sparkles className="w-6 h-6 text-white" />
      </div>

      {/* 标题组 */}
      <div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600
                       bg-clip-text text-transparent">
          AI 测试用例生成器
        </h1>
        <p className="text-sm text-gray-500">
          从 Axure 原型到完整测试用例,一站式 AI 驱动
        </p>
      </div>
    </div>

    {/* 进度指示器 */}
    <ProgressIndicator currentStep={currentStep} totalSteps={3} />
  </div>
</header>
```

#### 关键特性

- ✅ 毛玻璃效果 (`backdrop-blur-lg`)
- ✅ 渐变标题
- ✅ AI 图标脉冲动画
- ✅ 滚动时阴影加深

---

### 2. 进度指示器 (Progress Indicator)

#### 设计方案 A: 步骤点 + 连线

```tsx
<div className="relative">
  {/* 背景连线 */}
  <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200" />

  {/* 进度连线 - 渐变动画 */}
  <motion.div
    className="absolute top-4 left-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500"
    initial={{ width: 0 }}
    animate={{ width: `${(currentStep / (totalSteps - 1)) * 100}%` }}
    transition={{ duration: 0.5, ease: "easeOut" }}
  />

  {/* 步骤点 */}
  <div className="relative flex justify-between">
    {steps.map((step, index) => (
      <div key={index} className="flex flex-col items-center gap-2">
        {/* 圆点 */}
        <motion.div
          className={clsx(
            "w-8 h-8 rounded-full flex items-center justify-center z-10",
            "transition-all duration-300",
            index < currentStep && "bg-gradient-to-br from-green-400 to-green-600 shadow-lg",
            index === currentStep && "bg-gradient-to-br from-purple-500 to-blue-500 shadow-ai-glow",
            index > currentStep && "bg-gray-200"
          )}
          whileHover={{ scale: 1.1 }}
        >
          {index < currentStep ? (
            <CheckCircle className="w-4 h-4 text-white" />
          ) : (
            <span className="text-sm font-semibold text-white">
              {index + 1}
            </span>
          )}
        </motion.div>

        {/* 步骤名称 */}
        <span className={clsx(
          "text-sm font-medium transition-colors",
          index <= currentStep ? "text-gray-900" : "text-gray-400"
        )}>
          {step.name}
        </span>
      </div>
    ))}
  </div>
</div>
```

#### 设计方案 B: 进度条 + 百分比

```tsx
<div className="space-y-2">
  {/* 百分比显示 */}
  <div className="flex justify-between text-sm">
    <span className="font-medium text-gray-700">生成进度</span>
    <span className="font-bold text-purple-600">{progress}%</span>
  </div>

  {/* 进度条 */}
  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
    <motion.div
      className="h-full bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500
                 bg-size-200 animate-gradient-x"
      initial={{ width: 0 }}
      animate={{ width: `${progress}%` }}
      transition={{ duration: 0.5 }}
    />
  </div>
</div>

<style>{`
@keyframes gradient-x {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
.animate-gradient-x {
  background-size: 200% 100%;
  animation: gradient-x 3s ease infinite;
}
`}</style>
```

**推荐**: 方案 A (步骤点) - 更清晰的步骤导航

---

### 3. 步骤卡片 (Step Card)

#### 激活状态 (Active)

```tsx
<motion.div
  className="bg-white rounded-2xl shadow-xl p-8 mb-6 border-2 border-transparent
             hover:shadow-2xl transition-shadow"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
>
  {/* 头部 */}
  <div className="flex items-center gap-4 mb-6">
    {/* 步骤徽章 */}
    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500
                    flex items-center justify-center text-white font-bold text-xl
                    shadow-lg shadow-purple-500/30">
      1
    </div>

    <div className="flex-1">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">
        上传 Axure 原型
      </h2>
      <p className="text-sm text-gray-500">
        支持 .html / .htm 格式,最大 50MB
      </p>
    </div>
  </div>

  {/* 内容区 */}
  <div className="space-y-6">
    {children}
  </div>

  {/* 底部操作栏 */}
  <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
    <Button variant="outline" onClick={onCancel}>
      取消
    </Button>
    <Button variant="default" onClick={onNext}>
      下一步
    </Button>
  </div>
</motion.div>
```

#### 完成状态 (Completed)

```tsx
<motion.div
  className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4
             hover:border-gray-300 transition-colors cursor-pointer"
  layout
  onClick={() => setCurrentStep(stepIndex)}
>
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <CheckCircle className="w-6 h-6 text-green-500" />
      <div>
        <h3 className="font-semibold text-gray-900">
          步骤 {stepIndex + 1}: 已完成
        </h3>
        <p className="text-sm text-gray-500">
          {completedSummary}
        </p>
      </div>
    </div>

    <Button variant="ghost" size="sm">
      <Edit3 className="w-4 h-4 mr-2" />
      重新编辑
    </Button>
  </div>
</motion.div>
```

---

### 4. 文件上传区 (Upload Dragger)

#### 视觉增强版

```tsx
<Dragger
  accept=".html,.htm"
  beforeUpload={handleFile}
  className="ai-upload-zone"
>
  <div className="py-12 px-6">
    {/* 动画图标 */}
    <motion.div
      animate={{
        y: [0, -12, 0],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    >
      <Upload className="w-20 h-20 mx-auto text-purple-500 mb-6" />
    </motion.div>

    {/* 主文案 */}
    <p className="text-xl font-semibold text-gray-900 mb-2">
      拖拽文件到此处,或点击上传
    </p>

    {/* 辅助说明 */}
    <p className="text-sm text-gray-500 mb-6">
      支持格式: .html, .htm | 文件大小: &lt; 50MB
    </p>

    {/* 特性标签 */}
    <div className="flex items-center justify-center gap-6 text-sm">
      <div className="flex items-center gap-2 text-gray-500">
        <FileText className="w-5 h-5 text-blue-500" />
        <span>HTML 文件</span>
      </div>
      <div className="flex items-center gap-2 text-gray-500">
        <Zap className="w-5 h-5 text-yellow-500" />
        <span>极速解析</span>
      </div>
      <div className="flex items-center gap-2 text-gray-500">
        <Shield className="w-5 h-5 text-green-500" />
        <span>本地处理</span>
      </div>
    </div>
  </div>
</Dragger>

<style>{`
.ai-upload-zone .ant-upload-drag {
  background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
  border: 2px dashed #d1d5db;
  border-radius: 1rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.ai-upload-zone .ant-upload-drag:hover {
  background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
  border-color: #8b5cf6;
  box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.1);
  transform: translateY(-2px);
}

.ai-upload-zone .ant-upload-drag-hover {
  border-color: #3b82f6 !important;
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%) !important;
}
`}</style>
```

---

### 5. AI 思考动画 (AI Thinking)

#### 跳动气泡版

```tsx
<div className="flex flex-col items-center justify-center py-16">
  {/* 主动画区 */}
  <div className="relative w-32 h-32 mb-8">
    {/* 背景光晕 */}
    <motion.div
      className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 to-blue-500
                 opacity-20 blur-2xl"
      animate={{
        scale: [1, 1.3, 1],
        opacity: [0.2, 0.4, 0.2]
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    />

    {/* 跳动的点 */}
    <div className="absolute inset-0 flex items-center justify-center gap-3">
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500
                     shadow-lg"
          animate={{
            y: [0, -15, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: index * 0.2,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>

    {/* 中心图标 */}
    <div className="absolute inset-0 flex items-center justify-center">
      <Brain className="w-14 h-14 text-purple-600" />
    </div>
  </div>

  {/* 文字提示 */}
  <motion.div
    className="text-center"
    animate={{ opacity: [1, 0.6, 1] }}
    transition={{ duration: 2, repeat: Infinity }}
  >
    <p className="text-xl font-semibold text-gray-900 mb-2">
      AI 正在分析原型结构...
    </p>
    <p className="text-sm text-gray-500">
      预计需要 30-60 秒
    </p>
  </motion.div>

  {/* 进度列表 */}
  <div className="mt-8 space-y-3">
    <div className="flex items-center gap-3 text-sm">
      <CheckCircle className="w-5 h-5 text-green-500" />
      <span className="text-gray-700">已识别 12 个页面</span>
    </div>
    <div className="flex items-center gap-3 text-sm">
      <CheckCircle className="w-5 h-5 text-green-500" />
      <span className="text-gray-700">已提取 48 个交互元素</span>
    </div>
    <div className="flex items-center gap-3 text-sm">
      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      <span className="text-gray-700">正在构建交互关系图...</span>
    </div>
  </div>
</div>
```

---

### 6. 用例草稿箱 (Draft Box)

#### 卡片网格布局

```tsx
<div className="space-y-6">
  {/* 头部统计 */}
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-green-600
                      flex items-center justify-center text-white font-bold text-xl shadow-lg">
        {totalCases}
      </div>
      <div>
        <h3 className="text-xl font-semibold text-gray-900">草稿箱</h3>
        <p className="text-sm text-gray-500">
          已生成 {totalCases} 个用例,选中 {selectedCases} 个
        </p>
      </div>
    </div>

    {/* 批量操作 */}
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={selectAll}>
        全选
      </Button>
      <Button variant="outline" size="sm" onClick={deselectAll}>
        取消全选
      </Button>
    </div>
  </div>

  {/* 用例网格 */}
  <motion.div
    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    variants={containerVariants}
    initial="hidden"
    animate="visible"
  >
    {draftCases.map((testCase) => (
      <motion.div
        key={testCase.id}
        variants={itemVariants}
        layout
        className={clsx(
          "relative bg-white rounded-xl p-5 border-2 transition-all duration-200",
          "cursor-pointer hover:shadow-lg",
          testCase.selected
            ? "border-purple-500 shadow-lg ring-4 ring-purple-500/20"
            : "border-gray-200 hover:border-purple-300"
        )}
        onClick={() => toggleSelect(testCase.id)}
        whileHover={{ y: -4 }}
      >
        {/* 选中指示器 */}
        <div className="absolute top-3 right-3">
          <motion.div
            className={clsx(
              "w-7 h-7 rounded-full flex items-center justify-center",
              testCase.selected
                ? "bg-gradient-to-br from-purple-500 to-blue-500"
                : "bg-gray-200"
            )}
            whileTap={{ scale: 0.9 }}
          >
            {testCase.selected && (
              <Check className="w-4 h-4 text-white" />
            )}
          </motion.div>
        </div>

        {/* 批次标记 */}
        <span className="absolute top-3 left-3 px-2.5 py-1 bg-blue-100 text-blue-700
                         text-xs font-medium rounded-full">
          批次 {testCase.batchNumber}
        </span>

        {/* 用例内容 */}
        <div className="mt-8">
          <h4 className="text-base font-semibold text-gray-900 mb-2 line-clamp-2
                         min-h-[3rem]">
            {testCase.name}
          </h4>

          <p className="text-sm text-gray-500 mb-4 line-clamp-3 min-h-[4rem]">
            {testCase.description || '暂无描述'}
          </p>

          {/* 元数据 */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            {/* 优先级 */}
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-gray-400" />
              <span className={clsx(
                "text-xs font-medium",
                testCase.priority === 'critical' && "text-red-600",
                testCase.priority === 'high' && "text-orange-600",
                testCase.priority === 'medium' && "text-blue-600",
                testCase.priority === 'low' && "text-gray-600"
              )}>
                {priorityMap[testCase.priority]}
              </span>
            </div>

            {/* 质量评分 */}
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span className="text-sm font-semibold text-gray-700">
                {testCase.qualityScore || 85}/100
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    ))}
  </motion.div>

  {/* 空状态 */}
  {draftCases.length === 0 && (
    <div className="text-center py-20">
      <FileX className="w-20 h-20 text-gray-300 mx-auto mb-4" />
      <p className="text-lg text-gray-500 mb-2">暂无生成的用例</p>
      <p className="text-sm text-gray-400">
        点击下方"生成下一批"按钮开始生成用例
      </p>
    </div>
  )}
</div>

<script>{`
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3 }
  }
};
`}</script>
```

---

### 7. 底部固定操作栏 (Footer Bar)

```tsx
<div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg
                border-t border-gray-200 shadow-2xl z-50">
  <div className="max-w-7xl mx-auto px-6 py-4">
    <div className="flex items-center justify-between">
      {/* 左侧统计 */}
      <div className="flex items-center gap-8">
        <StatItem
          icon={<FileText className="w-5 h-5 text-blue-600" />}
          label="总用例"
          value={totalCases}
          bgColor="bg-blue-50"
        />
        <div className="w-px h-10 bg-gray-200" />
        <StatItem
          icon={<CheckCircle className="w-5 h-5 text-green-600" />}
          label="已选中"
          value={selectedCases}
          bgColor="bg-green-50"
        />
        <div className="w-px h-10 bg-gray-200" />
        <StatItem
          icon={<Star className="w-5 h-5 text-yellow-500" />}
          label="平均质量"
          value={avgQuality}
          bgColor="bg-yellow-50"
        />
      </div>

      {/* 右侧操作 */}
      <div className="flex items-center gap-3">
        {currentStep > 0 && (
          <Button
            variant="outline"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={handlePrevStep}
          >
            上一步
          </Button>
        )}

        {currentStep < 2 ? (
          <Button
            variant="default"
            size="lg"
            icon={<ArrowRight className="w-4 h-4" />}
            iconPosition="right"
            onClick={handleNextStep}
          >
            下一步
          </Button>
        ) : (
          <Button
            variant="default"
            size="lg"
            icon={<Save className="w-5 h-5" />}
            isLoading={saving}
            disabled={selectedCases === 0}
            onClick={saveToLibrary}
            className="px-8 shadow-lg"
          >
            💾 保存到用例库 ({selectedCases})
          </Button>
        )}
      </div>
    </div>
  </div>
</div>

// 统计项组件
function StatItem({ icon, label, value, bgColor }) {
  return (
    <div className="flex items-center gap-3">
      <div className={clsx("w-10 h-10 rounded-lg flex items-center justify-center", bgColor)}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}
```

---

## 🎬 动画与交互规范

### 过渡时长标准

```css
--duration-instant: 100ms;    /* 按钮点击反馈 */
--duration-fast: 200ms;       /* Hover 效果 */
--duration-normal: 300ms;     /* 标准过渡 */
--duration-slow: 500ms;       /* 复杂动画 */
--duration-slower: 800ms;     /* 页面切换 */
```

### Framer Motion 预设

```tsx
// 页面进入动画
const pageTransition = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }
};

// 列表交错动画
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1
    }
  }
};

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 }
  }
};
```

---

## 📱 响应式设计

### 断点策略

| 设备 | 宽度 | 布局调整 |
|------|------|----------|
| **Mobile** | < 640px | 单列,全宽卡片,底部导航 |
| **Tablet** | 640-1024px | 两列网格,侧边栏 |
| **Desktop** | 1024-1280px | 三列网格,完整布局 |
| **Large** | > 1280px | 最大宽度限制,居中 |

### 移动端优化示例

```tsx
// 自适应头部
<div className="flex flex-col md:flex-row md:items-center gap-4">
  <div className="w-10 h-10 md:w-12 md:h-12 ...">
    <Sparkles className="w-5 h-5 md:w-6 md:h-6" />
  </div>
  <h1 className="text-xl md:text-2xl ...">标题</h1>
</div>

// 响应式网格
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => <Card key={item.id} />)}
</div>

// 移动端隐藏/显示
<div className="hidden md:block">桌面端内容</div>
<div className="md:hidden">移动端内容</div>
```

---

## 🚀 实施方案

### Phase 1: 基础重构 (P0)

**目标**: 完成核心布局和组件重构

- [ ] 创建新的页面容器结构
- [ ] 实现渐进式步骤卡片
- [ ] 重构进度指示器
- [ ] 优化文件上传区
- [ ] 添加 AI 思考动画
- [ ] 实现草稿箱卡片布局

**预计工时**: 2-3 天

### Phase 2: 动画增强 (P1)

**目标**: 集成 Framer Motion 动画系统

- [ ] 页面切换动画
- [ ] 列表交错动画
- [ ] 按钮微交互
- [ ] 加载骨架屏
- [ ] 玻璃态效果

**预计工时**: 1-2 天

### Phase 3: 体验优化 (P2)

**目标**: 锦上添花的细节打磨

- [ ] 深色模式适配
- [ ] 响应式优化
- [ ] 性能优化
- [ ] 可访问性改进
- [ ] 错误状态设计

**预计工时**: 1-2 天

---

## 📦 技术依赖

```json
{
  "dependencies": {
    "framer-motion": "^10.16.4",
    "clsx": "^2.0.0",
    "lucide-react": "^0.294.0",
    "react": "^18.2.0",
    "antd": "^5.11.0"
  }
}
```

---

## 📊 设计评审 Checklist

- [ ] 视觉层次清晰
- [ ] 交互反馈充分
- [ ] 动画流畅自然
- [ ] 品牌一致性强
- [ ] 响应式适配完整
- [ ] 可访问性达标
- [ ] 性能表现良好
- [ ] 代码可维护性高

---

## 🎯 核心设计理念总结

> **"让 AI 的强大能力,通过精致的视觉设计和流畅的交互体验,变得触手可及。"**

### 三大核心价值

1. **降低认知负荷** - 通过渐进式披露和清晰的视觉层次
2. **建立信任感** - 通过即时反馈和 AI 拟人化动画
3. **提升愉悦感** - 通过精致的视觉设计和流畅的动效

### 设计成功标准

- ✅ 用户首次使用无需教程
- ✅ 操作流程流畅无阻碍
- ✅ 视觉设计令人愉悦
- ✅ AI 能力直观可感知
- ✅ 与主应用风格统一

---

**文档版本**: v2.0
**最后更新**: 2025-10-28
**维护者**: Sakura AI Design Team

🎨 **Happy Designing!**
