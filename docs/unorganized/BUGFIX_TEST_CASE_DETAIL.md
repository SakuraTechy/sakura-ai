# 🐛 测试用例详情页面错误修复

## 错误描述
```
TypeError: Cannot read properties of undefined (reading 'length')
```

在编辑测试用例页面（`/test-cases/:id/edit`）出现此错误。

## 根本原因

1. **缺少API端点**
   - 前端调用 `testService.getTestCaseById(id)` 方法
   - 但后端没有 `GET /api/tests/cases/:id` 端点

2. **字段名称不匹配**
   - 数据库使用 `title` 字段
   - 前端代码使用 `name` 字段

3. **缺少数据库字段**
   - 数据库 `test_cases` 表缺少 `priority` 和 `status` 字段
   - 这些字段可能需要添加或从其他地方获取

4. **数据类型不匹配**
   - `steps` 字段在数据库中是 `Json` 类型
   - 前端期望是 `string` 类型

5. **tags字段处理**
   - `tags` 可能为 undefined 或 null
   - 需要安全处理避免 `.length` 或 `.join()` 错误

---

## 已修复内容

### 1. 添加前端API方法
**文件**: `src/services/testService.ts`

添加了 `getTestCaseById` 方法：
```typescript
async getTestCaseById(id: number): Promise<TestCase> {
  const response = await fetch(`${API_BASE_URL}/tests/cases/${id}`, {
    headers: this.getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`获取测试用例失败: ${response.statusText}`);
  }

  return await response.json();
}
```

---

### 2. 添加后端API端点
**文件**: `server/routes/test.ts`

添加了 `GET /cases/:id` 路由：
```typescript
router.get('/cases/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const testCase = await prisma.testCase.findUnique({
    where: { id: parseInt(id) },
    include: {
      versions: {
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });

  if (!testCase) {
    return res.status(404).json({
      success: false,
      error: '测试用例不存在',
    });
  }

  // 字段映射：数据库 title -> 前端 name
  const response = {
    ...testCase,
    name: testCase.title,
  };

  res.json(response);
});
```

---

### 3. 修复前端数据处理
**文件**: `src/pages/TestCaseDetail.tsx`

#### 修复点1: 安全处理steps字段
```typescript
const stepsText = typeof response.steps === 'string'
  ? response.steps
  : (response.steps ? JSON.stringify(response.steps) : '');
```

#### 修复点2: 安全处理tags字段
```typescript
// 在加载数据时
tags: Array.isArray(response.tags) ? response.tags.join(', ') : '',

// 在TagInput组件中
value={(formData.tags || '').split(',').map(t => t.trim()).filter(Boolean)}
```

#### 修复点3: 提供默认值
```typescript
setFormData({
  name: response.name || response.title || '',
  steps: stepsText,
  assertions: response.assertions || '',
  priority: (response.priority as any) || 'medium',
  status: (response.status as any) || 'draft',
  tags: Array.isArray(response.tags) ? response.tags.join(', ') : '',
  system: response.system || '',
  module: response.module || ''
});
```

---

## 未来改进建议

### 1. 数据库Schema优化
建议在 `test_cases` 表中添加以下字段：

```prisma
model test_cases {
  id         Int       @id @default(autoincrement())
  title      String    @db.VarChar(255)
  name       String?   @db.VarChar(255)  // 添加name字段
  steps      Json?
  assertions String?   @db.Text           // 添加assertions字段
  priority   String?   @db.VarChar(20)    // 添加priority字段
  status     String?   @db.VarChar(20)    // 添加status字段
  tags       Json?
  system     String?   @db.VarChar(100)
  module     String?   @db.VarChar(100)
  department String?   @db.VarChar(100)
  created_at DateTime? @default(now())
  // ... 其他字段
}
```

**迁移SQL:**
```sql
ALTER TABLE test_cases
  ADD COLUMN name VARCHAR(255),
  ADD COLUMN assertions TEXT,
  ADD COLUMN priority VARCHAR(20) DEFAULT 'medium',
  ADD COLUMN status VARCHAR(20) DEFAULT 'draft';

-- 从title复制到name
UPDATE test_cases SET name = title WHERE name IS NULL;
```

---

### 2. 类型定义统一
建议统一前后端类型定义，避免字段名称不一致。

**选项1: 在后端统一映射**
```typescript
// 创建一个转换函数
function mapTestCaseForFrontend(testCase: any) {
  return {
    ...testCase,
    name: testCase.name || testCase.title,
    steps: typeof testCase.steps === 'string'
      ? testCase.steps
      : JSON.stringify(testCase.steps || {}),
    tags: Array.isArray(testCase.tags) ? testCase.tags : [],
    priority: testCase.priority || 'medium',
    status: testCase.status || 'active',
  };
}
```

**选项2: 使用DTO (Data Transfer Object)**
```typescript
export class TestCaseDTO {
  id: number;
  name: string;
  steps: string;
  assertions?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'draft' | 'disabled';
  tags: string[];
  system?: string;
  module?: string;

  static fromDatabase(dbRecord: any): TestCaseDTO {
    return {
      id: dbRecord.id,
      name: dbRecord.title,
      steps: typeof dbRecord.steps === 'string'
        ? dbRecord.steps
        : JSON.stringify(dbRecord.steps),
      // ... 其他字段映射
    };
  }
}
```

---

### 3. 错误处理增强
```typescript
// 在loadTestCase中添加更详细的错误处理
const loadTestCase = async () => {
  if (!id || id === 'new') return;

  try {
    setLoading(true);
    const response = await testService.getTestCaseById(parseInt(id));

    // 验证响应数据
    if (!response || !response.id) {
      throw new Error('返回的测试用例数据无效');
    }

    setTestCase(response);
    setFormData(mapResponseToForm(response));
  } catch (error) {
    console.error('加载测试用例失败:', error);

    // 根据错误类型给出不同提示
    if (error.message.includes('404')) {
      showToast.error('测试用例不存在或已被删除');
    } else if (error.message.includes('403')) {
      showToast.error('您没有权限查看此测试用例');
    } else {
      showToast.error('加载测试用例失败，请稍后重试');
    }

    navigate('/test-cases');
  } finally {
    setLoading(false);
  }
};
```

---

## 测试验证

修复后请验证以下场景：

### ✅ 场景1: 新建测试用例
1. 访问 `/test-cases/new`
2. 填写表单
3. 保存成功

### ✅ 场景2: 编辑已有测试用例
1. 从测试用例列表点击"编辑"
2. 访问 `/test-cases/:id/edit`
3. 表单正确加载现有数据
4. 修改后保存成功

### ✅ 场景3: 字段为空的测试用例
1. 编辑一个 tags/system/module 为空的用例
2. 不应出现 undefined 错误

### ✅ 场景4: 步骤编辑器切换
1. 在文本模式和表格模式之间切换
2. 数据不丢失
3. 保存后正确存储

---

## 相关文件清单

### 已修改文件
- ✅ `src/services/testService.ts` - 添加getTestCaseById方法
- ✅ `src/pages/TestCaseDetail.tsx` - 修复数据处理逻辑
- ✅ `server/routes/test.ts` - 添加GET /cases/:id端点

### 需要测试的文件
- `src/pages/TestCases.tsx` - 编辑按钮点击
- `src/components/StepTableEditor.tsx` - 步骤编辑器
- `src/components/ui/TagInput.tsx` - 标签输入

---

## 相关Issue

- [ ] 数据库缺少priority和status字段
- [ ] 字段命名不一致(title vs name)
- [ ] steps字段类型不统一(Json vs string)
- [ ] 需要统一的数据转换层(DTO)

建议在下个版本中进行数据库迁移，添加缺失字段并统一命名规范。
