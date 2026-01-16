# 阿里云通义千问 Embedding API 配置指南

## 为什么选择阿里云？

| 特性 | 阿里云通义千问 | Google Gemini | 智谱AI |
|------|---------------|---------------|--------|
| **国内访问** | ✅ 直连，无需代理 | ❌ 需要代理 | ✅ 直连 |
| **API兼容** | ✅ OpenAI兼容 | ❌ 需单独适配 | ❌ 需单独适配 |
| **向量维度** | 1536（高质量） | 768 | 1024 |
| **免费额度** | ✅ 100万tokens/月 | ✅ 无限制 | ✅ 有限额度 |
| **稳定性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

**结论：阿里云是国内用户的最佳选择！**

---

## 快速开始（5分钟）

### Step 1: 获取阿里云 API Key

1. 访问：https://dashscope.console.aliyun.com/apiKey
2. 登录阿里云账号（没有就注册一个，手机号即可）
3. 点击「创建 API-KEY」
4. 复制生成的 API Key（格式：sk-xxxxxxxxxxxxxxxx）

### Step 2: 配置 .env 文件

打开项目根目录的 `.env` 文件，找到知识库配置部分：

```bash
# ========== Qdrant向量数据库知识库配置 ==========
QDRANT_URL=http://localhost:6333

# Embedding提供商选择
EMBEDDING_PROVIDER=aliyun

# 阿里云通义千问 Embedding
EMBEDDING_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_API_KEY=sk-你的阿里云API_KEY  # 👈 替换为Step1获取的API Key
EMBEDDING_MODEL=text-embedding-v2
```

**重要：**
- 将 `EMBEDDING_API_KEY` 替换为你的真实 API Key
- 其他配置保持不变

### Step 3: 验证配置

运行导入脚本测试连接：

```bash
npx tsx server/scripts/importKnowledge.ts
```

**成功标志：**
```
✅ 单条知识导入成功，开始批量导入...
✅ 知识已添加: [business_rule] 订单金额计算规则
✅ 知识已添加: [business_rule] 库存扣减时机
...
```

**如果失败：**
- 检查 API Key 是否正确
- 检查网络连接（阿里云无需代理，但需要能访问互联网）
- 查看错误信息并参考下方「常见问题」

---

## 技术细节

### API 兼容性

阿里云通义千问提供了 **OpenAI 兼容模式**，这意味着：
- 可以使用 OpenAI SDK（`openai` npm包）
- API 调用方式完全相同
- 只需修改 `baseURL` 和 `apiKey`

### 调用示例

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.EMBEDDING_API_KEY
});

const response = await client.embeddings.create({
  model: 'text-embedding-v2',
  input: '测试文本'
});

console.log(response.data[0].embedding); // 1536维向量
```

### 向量维度

- **text-embedding-v2**: 1536维（推荐）
- **text-embedding-v1**: 1536维（旧版）

1536维与 OpenAI `text-embedding-3-small` 相同，质量较高。

### 费用说明

**免费额度**：
- 每月 100万 tokens
- 1个汉字 ≈ 2 tokens
- 1条知识（平均100字）≈ 200 tokens
- **免费额度可导入约 5000 条知识**

**超出后计费**：
- 0.0007元 / 1000 tokens
- 约 0.7元 / 100万 tokens
- **成本极低**

---

## 与其他方案对比

### 方案A：Google Gemini（完全免费，需代理）

**优点**：
- ✅ 完全免费，无限制
- ✅ 质量较好

**缺点**：
- ❌ 需要科学上网（代理）
- ❌ 国内访问不稳定
- ❌ 需单独适配 API（非 OpenAI 兼容）

**适用场景**：有稳定代理的个人开发者

### 方案B：阿里云通义千问（国内推荐）⭐

**优点**：
- ✅ 国内直连，速度快
- ✅ OpenAI 兼容，无需修改代码
- ✅ 1536维高质量向量
- ✅ 免费额度充足

**缺点**：
- ⚠️ 超出免费额度后需付费（成本极低）

**适用场景**：国内企业/团队，追求稳定性

### 方案C：智谱AI（国产替代）

**优点**：
- ✅ 国内直连
- ✅ 有免费额度

**缺点**：
- ❌ 非 OpenAI 兼容，需单独开发
- ❌ 1024维（质量略低于1536维）

**适用场景**：必须使用国产AI的项目

---

## 常见问题

### Q1: 如何获取阿里云账号？

**A**:
1. 访问 https://www.aliyun.com/
2. 点击「免费注册」
3. 使用手机号注册（需要实名认证）
4. 进入控制台 → 产品与服务 → 通义千问 → API-KEY管理

### Q2: API Key 安全吗？

**A**:
- ✅ API Key 仅存储在本地 `.env` 文件中
- ✅ `.env` 文件已在 `.gitignore` 中，不会上传到 Git
- ⚠️ 不要将 API Key 硬编码到代码中
- ⚠️ 定期轮换 API Key

### Q3: 可以切换回 Gemini 吗？

**A**: 可以！修改 `.env`:

```bash
# 切换到 Gemini
EMBEDDING_PROVIDER=gemini
GEMINI_API_KEY=你的Gemini_API_KEY

# 注释掉阿里云配置
# EMBEDDING_PROVIDER=aliyun
# EMBEDDING_API_KEY=...
```

### Q4: 如何监控 API 调用量？

**A**:
1. 登录阿里云控制台
2. 通义千问 → 用量统计
3. 查看每日调用次数和 token 消耗

### Q5: 导入知识很慢怎么办？

**A**:
- 原因：每条知识都需要调用 Embedding API（约1秒/条）
- 优化：代码已实现串行导入，20条知识约需20-30秒
- 建议：首次导入后无需重复导入，知识库持久化存储

---

## 下一步

配置完成后，继续执行：

1. ✅ 配置 API Key
2. ▶️ 运行导入脚本: `npx tsx server/scripts/importKnowledge.ts`
3. ▶️ 访问 Qdrant 管理界面验证: http://localhost:6333/dashboard
4. ▶️ 集成到测试用例生成流程（参考 `KNOWLEDGE_BASE_QUICK_START.md` Day3）

---

**开始导入知识库吧！🚀**
