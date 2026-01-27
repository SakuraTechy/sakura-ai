# 🧠 RAG 知识库配置指南

让 AI 记住团队的测试经验，避免重复踩坑。

---

## 📖 什么是 RAG？

**RAG (Retrieval-Augmented Generation)** = 检索增强生成

简单来说：在 AI 生成测试用例时，自动从知识库中检索相关的历史经验，注入到 AI 提示词中，从而生成更专业、更全面的测试用例。

---

## 🤔 为什么需要 RAG？

### 传统 AI 生成的三大问题

1. ❌ **零经验**：每次都是从零开始，无法利用历史测试经验
2. ❌ **易错点重复**：金额≤0 校验、特殊字符处理、并发问题等反复遗漏
3. ❌ **风险场景盲区**：SQL 注入、XSS 攻击、权限绕过等高风险场景识别不足

### Sakura AI RAG 解决方案

✅ **自动检索历史经验**：语义搜索相关测试知识
✅ **注入 AI 提示词**：增强 AI 生成质量
✅ **持续积累知识**：团队经验不断沉淀

---

## 🏗️ 技术架构

### 核心组件

```
AI 生成测试用例
   ↓
向量化查询（Embedding API）
   ↓
Qdrant 语义检索（相似度 ≥ 0.5）
   ↓
构建知识上下文
   ↓
注入 AI Prompt
   ↓
生成专业测试用例
```

### 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| **向量数据库** | Qdrant | 高性能语义检索引擎 |
| **Embedding** | 阿里云通义千问 | 1024 维向量化，支持中文 |
| **相似度算法** | Cosine Similarity | 余弦相似度 ≥ 0.5 |

---

## 📚 知识分类体系

Sakura AI 的知识库分为 4 大类：

### 1. 业务规则（Business Rules）

常见的业务逻辑和验证规则。

**示例**：
- "订单金额必须大于 0，小数点后最多 2 位"
- "手机号必须是 11 位数字"
- "日期范围查询：开始日期不能晚于结束日期"

**相似度阈值**：≥ 0.5

### 2. 测试模式（Test Patterns）

成熟的测试设计模式和测试方法。

**示例**：
- "组合查询边界值测试模板"
- "列表分页功能完整测试"
- "表单字段联动验证模板"

**相似度阈值**：≥ 0.5

### 3. 历史踩坑（Lessons Learned）

团队遇到的易错点和缺陷案例。

**示例**：
- "特殊字符未转义导致查询失败"
- "并发库存扣减未加锁导致超卖"
- "日期时区转换错误导致查询结果错误"

**相似度阈值**：≥ 0.5

### 4. 风险场景（Risk Scenarios）

高风险和安全相关的测试场景。

**示例**：
- "SQL 注入风险：输入 `' OR '1'='1` 验证"
- "XSS 攻击风险：输入 `<script>alert(1)</script>` 验证"
- "支付回调幂等性验证：重复通知不应重复扣款"

**相似度阈值**：≥ 0.5

---

## 🚀 快速开始

### 步骤 1：启动 Qdrant 向量数据库

#### 方式 1：Docker（推荐）

```bash
docker run -d -p 6333:6333 qdrant/qdrant

# 验证启动
curl http://localhost:6333/health
# 预期输出：{"status":"ok"}
```

#### 方式 2：Windows 脚本

```bash
start-qdrant.bat
```

#### 方式 3：本地安装

参考 [Qdrant 官方文档](https://qdrant.tech/documentation/guides/installation/)

### 步骤 2：配置 Embedding API

#### 获取阿里云 API Key

1. 访问 [阿里云 DashScope 控制台](https://dashscope.console.aliyun.com/apiKey)
2. 登录阿里云账号
3. 创建 API Key
4. 复制 API Key

#### 编辑 `.env` 文件

```bash
# ========== RAG 知识库配置 ==========
QDRANT_URL=http://localhost:6333              # Qdrant 向量数据库地址
EMBEDDING_PROVIDER=aliyun                     # Embedding 提供商
EMBEDDING_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_API_KEY=sk-xxxxx                    # 替换为你的阿里云 API Key
EMBEDDING_MODEL=text-embedding-v4             # 1024 维向量模型
```

### 步骤 3：重启服务

```bash
npm run dev
```

### 步骤 4：验证 RAG 功能

查看日志确认 RAG 已启用：

```bash
tail -f logs/server.log | grep "RAG"

# 示例输出：
# 🔍 [RAG-Step1] 开始向量检索...
# ✅ [RAG-Step2] 向量检索完成 (耗时: 245ms)
# 📊 [RAG-Step3] 业务规则: 2条, 测试模式: 1条, 历史踩坑: 1条
# 🎯 [RAG模式] 将使用知识库增强模式生成测试用例
```

---

## 📊 RAG 工作原理

### 完整流程图

```
用户操作：选择测试目的 "单条件查询验证" → 点击生成测试点
   ↓
┌─────────────────────────────────────────────────────┐
│ Step 1: 构建查询文本                                 │
│ queryText = "单条件查询验证\n验证输入单个查询条件..."  │
│           + 需求文档相关章节内容(前500字)             │
└────────────────┬────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────┐
│ Step 2: 生成向量                                     │
│ Embedding API (阿里云通义千问)                       │
│ "单条件查询..." → [0.234, 0.891, ..., 0.123]        │
│                   (1024维向量)                        │
└────────────────┬────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────┐
│ Step 3: Qdrant 语义检索 (相似度 ≥ 0.5)               │
│ 从 test_knowledge_{systemName} 集合中检索           │
│                                                     │
│ 检索结果:                                            │
│ ✅ 业务规则 (2条, 相似度: 85%, 72%)                 │
│    1. "查询条件必填项校验规则"                       │
│    2. "日期范围查询格式要求"                         │
│ ✅ 测试模式 (1条, 相似度: 69%)                      │
│    1. "组合查询边界值测试模板"                       │
│ ✅ 历史踩坑 (1条, 相似度: 61%)                      │
│    1. "特殊字符未转义导致查询失败"                   │
│ ✅ 风险场景 (0条)                                   │
│                                                     │
│ 📊 总计: 4条相关知识                                │
└────────────────┬────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────┐
│ Step 4: 构建知识上下文                               │
│ 将检索结果格式化为 Markdown:                         │
│                                                     │
│ ## 📚 相关测试经验参考                              │
│ ### 🔥 业务规则 (2条)                               │
│ 1. 查询条件必填项校验规则...                         │
│ 2. 日期范围查询格式要求...                           │
│ ### 💡 测试模式 (1条)                               │
│ 1. 组合查询边界值测试模板...                         │
└────────────────┬────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────┐
│ Step 5: 注入 AI Prompt                              │
│                                                     │
│ systemPrompt = `你是测试用例设计专家...`             │
│              + knowledgeContext                     │
│                                                     │
│ userPrompt = `需求文档: ...`                        │
│            + `测试目的: 单条件查询验证`              │
│            + `相关章节: ...`                         │
│                                                     │
│ → OpenRouter API (GPT-4o / DeepSeek / Claude)      │
└────────────────┬────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────┐
│ 输出: 专业测试用例 (包含RAG知识)                     │
│                                                     │
│ TestPoint 1: 必填项为空测试                          │
│   步骤: 1. 不输入查询条件 2. 点击查询                │
│   预期: 提示"请输入查询条件"                         │
│   风险: medium (来自业务规则知识)                    │
│                                                     │
│ TestPoint 2: 特殊字符输入测试                        │
│   步骤: 1. 输入"test' OR '1'='1" 2. 点击查询         │
│   预期: 查询失败或无结果，不应报错                    │
│   风险: high (来自历史踩坑知识)                      │
└─────────────────────────────────────────────────────┘
```

---

## 📈 RAG 效果对比

### 场景：订单创建功能测试用例生成

| 测试场景 | 无 RAG 生成 | 有 RAG 生成（知识库增强） | RAG 知识来源 |
|---------|-----------|------------------------|-------------|
| 订单金额 | ✅ 正常金额测试 | ✅ 正常金额 + 边界值（0, -1, 0.001, 999999.99） | 业务规则 |
| 库存扣减 | ✅ 基础扣减测试 | ✅ 基础 + 并发扣减冲突测试（100并发） | 历史踩坑 |
| 支付回调 | ❌ 未考虑 | ✅ 支付回调幂等性测试（重复通知验证） | 风险场景 |
| 特殊字符 | ❌ 未考虑 | ✅ SQL注入风险测试（输入 `' OR '1'='1`） | 风险场景 |
| 覆盖率提升 | 70% | 90% | +20% |

### 核心指标提升

| 指标 | 无 RAG | 有 RAG | 提升 |
|------|--------|--------|------|
| **测试覆盖率** | 70-80% | 85-95% | **+15-25%** |
| **专业准确性** | 75-85% | 90-98% | **+15-20%** |
| **边界值覆盖** | 40-60% | 80-95% | **+40-55%** |
| **风险场景识别** | 50-70% | 85-95% | **+35-45%** |

---

## 🔧 知识库管理

### 导入知识

**方式 1：通过 UI 界面**

```
知识库管理 → 新增知识 → 选择分类 → 输入内容 → 保存
```

**方式 2：批量导入（API）**

```bash
POST /api/knowledge/batch-import
Content-Type: application/json

{
  "systemName": "用户管理系统",
  "knowledge": [
    {
      "category": "business_rule",
      "content": "订单金额必须大于0，小数点后最多2位"
    },
    {
      "category": "risk_scenario",
      "content": "SQL注入风险：输入 ' OR '1'='1 验证"
    }
  ]
}
```

### 查看知识库

```bash
# 访问 Qdrant 管理界面
http://localhost:6333/dashboard

# 查看集合
curl http://localhost:6333/collections
```

### 删除知识

```bash
# 删除指定知识
DELETE /api/knowledge/:id

# 清空知识库（慎用）
DELETE /api/knowledge/system/:systemName
```

---

## 🎯 最佳实践

### 1. 知识质量优于数量

✅ **推荐**：精心整理的 50 条高质量测试经验
❌ **避免**：批量导入 1000 条质量参差的数据

### 2. 定期维护知识库

- ✅ 每月审查一次知识库内容
- ✅ 更新过时的测试模式
- ✅ 删除低相似度的检索结果
- ✅ 补充新的业务规则和风险场景

### 3. 知识描述要具体

✅ **好的描述**：
```
"订单金额必须大于 0，小数点后最多 2 位，最大值不超过 999999.99"
```

❌ **差的描述**：
```
"订单金额要验证"
```

### 4. 合理分类知识

- **业务规则**：验证规则、数据约束
- **测试模式**：测试方法、测试模板
- **历史踩坑**：团队遇到的缺陷
- **风险场景**：安全风险、高危操作

---

## 🔍 调试与监控

### 查看 RAG 检索日志

```bash
tail -f logs/server.log | grep "RAG"

# 详细日志示例：
# 🔍 [RAG-Step1] 开始向量检索 (systemName: 用户管理系统, queryText: 单条件查询验证...)
# 📊 [RAG-Step2] 构建查询向量 (耗时: 156ms)
# 🔎 [RAG-Step3] Qdrant 检索 (collection: test_knowledge_用户管理系统, limit: 10)
# ✅ [RAG-Step4] 检索完成 (共找到: 4条, 耗时: 245ms)
# 📚 [RAG-Step5] 知识分类统计:
#    - 业务规则: 2条 (相似度: 0.85, 0.72)
#    - 测试模式: 1条 (相似度: 0.69)
#    - 历史踩坑: 1条 (相似度: 0.61)
#    - 风险场景: 0条
# 🎯 [RAG模式] 将使用知识库增强模式生成测试用例
```

### 启用完整 Prompt 日志

编辑 `.env` 文件：

```bash
LOG_FULL_PROMPT=true
```

重启服务后，日志会输出完整的 AI Prompt（包含 RAG 知识）。

---

## 🐛 故障排除

### Qdrant 连接失败

```bash
# 检查 Qdrant 服务状态
curl http://localhost:6333/health

# 重启 Qdrant (Docker)
docker restart <qdrant_container_id>

# 检查端口占用
netstat -ano | findstr :6333
```

### Embedding API 调用失败

```bash
# 检查 API Key 是否正确
# 查看日志
tail -f logs/server.log | grep "Embedding"

# 测试 API
curl -X POST https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"text-embedding-v4","input":"测试文本"}'
```

### RAG 未生效

**症状**：生成的测试用例没有使用知识库

**原因**：
1. Qdrant 未启动
2. Embedding API 配置错误
3. 知识库为空

**解决**：
```bash
# 1. 检查 Qdrant
curl http://localhost:6333/health

# 2. 检查知识库是否有数据
curl http://localhost:6333/collections

# 3. 查看 RAG 日志
tail -f logs/server.log | grep "RAG"
```

---

## 📊 技术实现

### 核心服务

| 文件 | 功能 |
|------|------|
| `server/services/testCaseKnowledgeBase.ts` | RAG 主服务 |
| `server/services/qdrantService.ts` | Qdrant 客户端 |
| `server/services/embeddingService.ts` | Embedding API 调用 |

### Qdrant 集合结构

```javascript
{
  "collection_name": "test_knowledge_{systemName}",
  "vectors": {
    "size": 1024,    // 向量维度
    "distance": "Cosine"  // 相似度算法
  },
  "payload": {
    "id": "uuid",
    "category": "business_rule|test_pattern|lesson_learned|risk_scenario",
    "content": "知识内容",
    "systemName": "系统名称",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

---

## 🔗 相关文档

- [AI 生成器详解](AI_GENERATOR.md) - 了解 RAG 在哪个阶段使用
- [配置说明](CONFIGURATION.md) - 完整环境变量配置
- [故障排除](TROUBLESHOOTING.md) - 常见问题解决

---

**返回**: [README](../README.md)
