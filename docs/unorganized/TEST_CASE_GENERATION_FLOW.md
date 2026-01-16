# Sakura AI 测试用例生成流程详解

> 完整的 AI 驱动测试用例生成流程 - 从 Axure 原型到测试用例库

---

## 📋 流程概览

Sakura AI 系统实现了从 Axure 原型文件到完整测试用例的自动化流程,整个过程分为 **3个主要步骤**,涉及 **5个核心API调用** 和 **4个AI处理阶段**。

### 可视化流程图

- **在线查看**: 打开 [test-case-generation-flow.html](./test-case-generation-flow.html) 查看交互式流程图
- **源文件**: [test-case-generation-flow.mmd](./test-case-generation-flow.mmd) (Mermaid格式)

---

## 🎯 三大核心步骤

### 步骤1: 上传 Axure 原型文件

**用户操作:**
1. 选择并上传 Axure HTML 文件(最多20个文件,50MB)
2. 填写必填项目信息:
   - **平台类型**: Web端 / 移动端
   - **页面模式**: 新增页面 / 修改页面
   - **系统名称**: 从字典选择或输入
   - **模块名称**: 输入模块名称
3. 可选填写 **补充业务规则**(辅助AI理解业务逻辑)
4. 点击 "开始生成需求文档" 按钮

**后端处理 (API: `/axure/generate-from-html-direct`):**
```
1. 接收并验证HTML文件
2. 使用 Cheerio 解析HTML结构
   ├─ 提取页面元素 (输入框、按钮、表格等)
   ├─ 识别字段名称和标签
   └─ 提取交互逻辑
3. 调用 AI 模型分析
   ├─ 分析页面结构
   ├─ 识别页面类型 (列表/表单/详情/混合)
   ├─ 生成章节化需求文档
   └─ 应用补充业务规则
4. 创建 AI 会话(sessionId)
5. 返回需求文档 (Markdown格式)
```

**输出:**
- ✅ 结构化的需求文档 (Markdown格式)
- ✅ AI 会话ID (用于后续追溯)
- ✅ 识别的章节数量

---

### 步骤2: 编辑需求文档

**用户操作:**
1. 在 Markdown 编辑器中查看 AI 生成的需求文档
2. (可选) 编辑和修改需求内容
3. 点击 "立即生成测试用例" 按钮

**后端处理 (API: `/functional-test-cases/analyze-modules`):**
```
1. 接收需求文档
2. 调用 AI 模型进行智能测试模块拆分
   ├─ 识别不同的功能模块
   │  ├─ 查询条件模块
   │  ├─ 列表展示模块
   │  ├─ 操作按钮模块
   │  ├─ 表单输入模块
   │  └─ 弹窗/对话框模块
   ├─ 为每个模块设置优先级 (高/中/低)
   ├─ 关联需求文档中的相关章节
   └─ 生成模块描述
3. 返回测试模块列表
```

**输出:**
- ✅ 测试模块列表
- ✅ 每个模块的优先级和描述
- ✅ 关联的需求章节编号

---

### 步骤3: 三阶段渐进式生成

这是最核心的步骤,采用 **渐进式生成策略**,让用户可以精细控制生成过程。

#### 阶段1: 显示测试模块

用户可以看到所有识别出的测试模块,每个模块显示:
- 模块名称和描述
- 优先级标签 (高/中/低)
- 关联的需求章节
- "生成测试目的" 按钮

#### 阶段2: 生成测试目的

**用户操作:**
- 点击某个模块的 "生成测试目的" 按钮

**后端处理 (API: `/functional-test-cases/generate-purposes`):**
```
1. 接收模块信息
2. 调用 AI 模型生成测试目的
   ├─ 分析模块功能点
   ├─ 识别测试场景
   │  ├─ 正常场景 (Happy Path)
   │  ├─ 异常场景 (Error Handling)
   │  ├─ 边界场景 (Edge Cases)
   │  └─ 性能场景 (Performance)
   ├─ 为每个测试目的设置优先级
   ├─ 定义覆盖范围
   └─ 预估测试点数量
3. 返回测试目的列表
```

**输出:**
- ✅ 测试目的列表 (每个模块3-8个测试目的)
- ✅ 每个测试目的的描述和覆盖范围
- ✅ 预估的测试点数量

#### 阶段3: 生成测试点

**用户操作:**
- 方式1: 点击某个测试目的的 "生成测试点" 按钮(单个生成)
- 方式2: 点击模块的 "一键生成所有测试点" 按钮(批量生成)

**后端处理 (API: `/functional-test-cases/generate-points`):**
```
1. 接收测试目的信息
2. 调用 AI 模型生成详细测试点
   ├─ 分解测试目的为具体步骤
   ├─ 生成测试步骤 (Step by Step)
   │  └─ 每个步骤包含: 操作、输入数据、检查点
   ├─ 生成预期结果
   │  └─ 详细描述每个步骤的预期行为
   ├─ 生成测试数据
   │  ├─ 正常数据示例
   │  ├─ 边界数据示例
   │  └─ 异常数据示例
   ├─ 添加校验规则
   │  └─ 断言和验证点
   └─ 计算质量评分 (0-100)
3. 返回完整测试用例
```

**输出:**
- ✅ 完整的测试用例
  - 用例名称
  - 测试步骤 (数组)
  - 预期结果 (数组)
  - 测试数据
  - 前置条件
  - 后置清理
  - 质量评分

#### 草稿箱管理

所有生成的测试用例会自动添加到 **草稿箱**:

1. **查看用例**: 点击 "查看用例" 按钮查看详情
2. **编辑用例**: 在详情对话框中修改用例内容
3. **勾选用例**: 勾选要保存的测试目的
4. **批量保存**: 点击 "保存选中用例" 按钮

**后端处理 (API: `/functional-test-cases/batch-save`):**
```
1. 接收选中的测试用例列表
2. 验证用例数据完整性
3. 开启数据库事务
4. 保存测试用例主表 (functional_test_cases)
   ├─ 系统名称
   ├─ 模块名称
   ├─ 用例名称
   ├─ 创建人
   └─ AI会话ID
5. 保存测试点明细 (functional_test_points)
   ├─ 测试步骤
   ├─ 预期结果
   ├─ 测试数据
   └─ 优先级
6. 关联 AI 会话记录
7. 提交事务
```

**输出:**
- ✅ 保存成功的用例数量
- ✅ 标记已保存的测试目的(显示绿色标签)
- ✅ 用例数据持久化到数据库

---

## 🔄 完整数据流

```
用户上传HTML文件
    ↓
后端解析HTML + AI生成需求文档
    ↓
用户编辑需求文档 (可选)
    ↓
后端AI分析需求 → 拆分测试模块
    ↓
前端展示测试模块列表
    ↓
用户选择模块 → 点击"生成测试目的"
    ↓
后端AI生成测试目的列表
    ↓
前端展示测试目的 (可展开/折叠)
    ↓
用户选择测试目的 → 点击"生成测试点"
    ↓
后端AI生成详细测试用例
    ↓
前端添加到草稿箱
    ↓
用户勾选 → 点击"保存选中用例"
    ↓
后端批量保存到数据库
    ↓
跳转到用例库页面
```

---

## 🎨 前端核心组件

| 组件 | 路径 | 职责 |
|------|------|------|
| `FunctionalTestCaseGenerator` | `src/pages/FunctionalTestCaseGenerator.tsx` | 主页面,协调整个流程 |
| `MultiFileUpload` | `src/components/ai-generator/MultiFileUpload.tsx` | 多文件上传 |
| `MarkdownEditor` | `src/components/ai-generator/MarkdownEditor.tsx` | 需求文档编辑器 |
| `AIThinking` | `src/components/ai-generator/AIThinking.tsx` | AI处理进度提示 |
| `DraftCaseCard` | `src/components/ai-generator/DraftCaseCard.tsx` | 草稿箱用例卡片 |
| `TestCaseDetailModal` | `src/components/ai-generator/TestCaseDetailModal.tsx` | 用例详情对话框 |
| `ProgressIndicator` | `src/components/ai-generator/ProgressIndicator.tsx` | 步骤进度指示器 |

---

## 🔧 后端核心服务

| 服务 | 路径 | 职责 |
|------|------|------|
| `functionalTestCaseAIService` | `server/services/functionalTestCaseAIService.ts` | AI生成核心逻辑 |
| `mcpClient` | `server/services/mcpClient.ts` | MCP协议客户端 |
| `axure路由` | `server/routes/axure.ts` | Axure相关API |
| `functionalTestCase路由` | `server/routes/functionalTestCase.ts` | 用例管理API |

---

## 📊 数据库表结构

### 主要表:

1. **functional_test_cases** - 测试用例主表
   - `id`: 主键
   - `name`: 用例名称
   - `system_name`: 系统名称
   - `module_name`: 模块名称
   - `ai_session_id`: AI会话ID
   - `created_by`: 创建人
   - `created_at`: 创建时间

2. **functional_test_points** - 测试点明细表
   - `id`: 主键
   - `case_id`: 关联用例ID
   - `point_name`: 测试点名称
   - `steps`: 测试步骤 (JSON)
   - `expected_results`: 预期结果 (JSON)
   - `test_data`: 测试数据 (JSON)
   - `priority`: 优先级

3. **ai_generation_sessions** - AI会话记录表
   - `id`: 会话ID (UUID)
   - `session_type`: 会话类型 (axure_generation)
   - `input_data`: 输入数据 (JSON)
   - `output_data`: 输出数据 (JSON)
   - `created_at`: 创建时间

---

## 🚀 核心技术栈

### 前端技术
- **框架**: React 18 + TypeScript
- **样式**: Tailwind CSS
- **动画**: Framer Motion
- **UI组件**: Ant Design + 自定义组件
- **路由**: React Router v6
- **状态管理**: React Hooks (useState, useEffect)

### 后端技术
- **运行时**: Node.js
- **框架**: Express
- **ORM**: Prisma
- **AI协议**: MCP (Model Context Protocol)
- **HTML解析**: Cheerio
- **数据库**: MySQL

### AI模型
- **支持的模型**: Claude (Anthropic) / GPT-4 (OpenAI)
- **调用方式**: 通过 MCP 协议统一调用
- **Prompt工程**: 结构化提示词 + Few-shot 示例

---

## ⚡ 性能优化

1. **渐进式加载**: 不一次性生成所有用例,而是按需生成
2. **批量处理**: 支持一键批量生成,提高效率
3. **本地缓存**: 前端状态管理,避免重复请求
4. **超时控制**: 长时间AI调用设置5分钟超时
5. **事务保证**: 数据库批量保存使用事务,保证一致性

---

## 🎯 用户体验优化

1. **实时反馈**: 所有AI处理都有进度提示和loading动画
2. **可编辑性**: 每个阶段都支持编辑和修改
3. **可撤销性**: 草稿箱用例可以删除和重新生成
4. **可见性**: 清晰的步骤指示器,用户始终知道自己在哪一步
5. **容错性**: 单个用例生成失败不影响其他用例

---

## 📝 使用建议

### 上传阶段
- ✅ 上传完整的HTML文件(不要省略 JS 和 CSS 引用)
- ✅ 填写准确的系统名称和模块名称
- ✅ 补充关键业务规则,有助于AI生成更准确的测试点

### 需求文档阶段
- ✅ 仔细检查AI生成的需求文档
- ✅ 补充AI遗漏的关键信息
- ✅ 删除不相关的内容

### 用例生成阶段
- ✅ 优先生成高优先级模块的用例
- ✅ 使用"一键生成"功能批量生成,提高效率
- ✅ 生成后仔细检查用例质量,必要时重新生成

### 保存阶段
- ✅ 勾选质量评分高的用例
- ✅ 查看详情,确认用例符合预期
- ✅ 批量保存,避免逐个保存

---

## 🔍 故障排查

### 常见问题

1. **生成需求文档超时**
   - 原因: HTML文件过大或网络问题
   - 解决: 简化HTML内容或检查网络连接

2. **测试模块拆分不准确**
   - 原因: 需求文档描述不清晰
   - 解决: 回到步骤2编辑需求文档,补充关键信息

3. **测试点生成质量低**
   - 原因: 需求文档信息不足或业务规则缺失
   - 解决: 在步骤1补充更多业务规则,或在步骤2完善需求描述

4. **批量保存失败**
   - 原因: 数据库连接问题或数据格式错误
   - 解决: 检查数据库连接,查看后端日志

---

## 📚 相关文档

- [用户手册](./USER_MANUAL.md)
- [API文档](./API_DOCUMENTATION.md)
- [架构设计](./ARCHITECTURE.md)
- [故障排查指南](./TROUBLESHOOTING.md)
- [RAG知识库配置](./RAG_SETUP.md)

---

## 🤝 贡献指南

如果您发现流程中的问题或有改进建议,欢迎:
1. 提交 Issue
2. 提交 Pull Request
3. 联系开发团队

---

**最后更新**: 2025-11-14
**文档版本**: v1.0
**维护者**: Sakura AI 开发团队
