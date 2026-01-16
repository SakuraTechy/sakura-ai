# 功能测试用例存储结构优化

## 需求说明
1. **测试点独立存储**：功能测试用例以测试点为维度存储，每个测试点是一条独立的数据库记录
2. **前端序号显示**：列表第一列显示前端自动生成的序号，不使用数据库ID

## 实施的修改

### 1. 数据库Schema变更 (prisma/schema.prisma)

#### 修改 `functional_test_cases` 表
- ❌ **移除字段**：
  - `steps` - 测试步骤（移至测试点表）
  - `assertions` - 断言（移至测试点表）
  - `test_points` - JSON格式的测试点数组
  - `test_points_count` - 测试点计数

- ✅ **保留字段**：
  - 用例基本信息：id, name, description, system, module, priority, tags, status
  - 元数据：source, ai_session_id, creator_id, test_type, preconditions, test_data
  - 章节信息：section_id, section_name, batch_number
  - 时间戳：created_at, updated_at

#### 新增 `functional_test_points` 表
```prisma
model functional_test_points {
  id                  Int                      @id @default(autoincrement())
  test_case_id        Int                      // 关联的测试用例ID
  test_point_index    Int                      // 测试点序号(1,2,3...)
  test_point_name     String                   @db.VarChar(500)
  steps               String                   @db.Text
  expected_result     String                   @db.Text
  risk_level          test_point_risk_level    @default(medium)
  created_at          DateTime                 @default(now())
  updated_at          DateTime                 @updatedAt

  functional_test_case functional_test_cases  @relation(...)

  @@unique([test_case_id, test_point_index])
  @@index([test_case_id])
}
```

#### 新增枚举
```prisma
enum test_point_risk_level {
  low
  medium
  high
}
```

### 2. 后端服务修改 (server/services/functionalTestCaseService.ts)

#### `batchSave` 方法（批量保存）
**变更前**：
- 使用 `createMany` 批量插入用例
- 测试点作为JSON数组存储在 `test_points` 字段

**变更后**：
- 逐个创建测试用例
- 为每个用例的测试点创建独立记录到 `functional_test_points` 表
- 在事务中保证数据一致性

```typescript
// 1. 保存测试用例主体
const savedCase = await tx.functional_test_cases.create({ ... });

// 2. 保存该用例的所有测试点
for (let i = 0; i < tc.testPoints.length; i++) {
  await tx.functional_test_points.create({
    data: {
      test_case_id: savedCase.id,
      test_point_index: i + 1,
      test_point_name: point.testPoint,
      steps: point.steps,
      expected_result: point.expectedResult,
      risk_level: point.riskLevel
    }
  });
}
```

#### `getFlatList` 方法（平铺列表查询）
**变更前**：
- 查询 `functional_test_cases` 表
- 在内存中解析 `test_points` JSON
- 在内存中展开为平铺行

**变更后**：
- 直接查询 `functional_test_points` 表，JOIN `functional_test_cases`
- 数据库层面完成关联和排序
- 更高效，支持更大数据量

```typescript
const testPoints = await this.prisma.functional_test_points.findMany({
  where: { functional_test_case: caseWhere },
  orderBy: [
    { functional_test_case: { created_at: 'desc' } },
    { test_point_index: 'asc' }
  ],
  include: { functional_test_case: { include: { users: true } } }
});
```

### 3. 前端页面修改 (src/pages/FunctionalTestCases.tsx)

#### 列表第一列改为前端序号
**变更前**：
```tsx
<th>用例ID</th>
...
<td>{isFirstRow && `#${row.id}`}</td>
```

**变更后**：
```tsx
<th>序号</th>
...
<td>{rowNumber}</td>  // rowNumber = (page - 1) * pageSize + idx + 1
```

**特点**：
- 连续的序号，方便用户阅读
- 考虑分页偏移量
- 每行都显示序号（而非仅第一行）

### 4. 数据迁移脚本 (scripts/migrate-test-points.js)

为避免数据丢失，创建了迁移脚本：
- 读取现有 `functional_test_cases.test_points` JSON数据
- 将每个测试点插入到 `functional_test_points` 表
- 保持数据完整性

**注意**：实际部署时应先运行此脚本，再执行 schema 变更。

## 优势总结

### 数据库层面
✅ 规范化设计，符合数据库范式
✅ 测试点可独立查询、更新、删除
✅ 支持对测试点的独立索引和查询优化
✅ 避免JSON解析开销
✅ 更好的数据完整性和约束

### 应用层面
✅ 查询性能更优（数据库层面JOIN和过滤）
✅ 支持对测试点的精细化操作
✅ 更灵活的扩展性（可为测试点添加更多属性）
✅ 前端序号更直观，用户体验更好

### 扩展性
✅ 可为测试点添加：执行记录、历史版本、附件等关联
✅ 可按测试点维度进行统计分析
✅ 支持测试点级别的权限控制

## 部署建议

1. **数据库备份**：在执行变更前，务必备份 `functional_test_cases` 表
2. **迁移步骤**：
   ```bash
   # 1. 创建新表
   npx prisma db push --accept-data-loss

   # 2. 运行数据迁移（可选，如果有现有数据）
   node scripts/migrate-test-points.js

   # 3. 重启服务
   npm run dev
   ```
3. **验证**：检查列表页面能否正常显示测试点数据

## 潜在风险与注意事项

⚠️ **破坏性变更**：旧的JSON格式测试点数据将被删除
⚠️ **API兼容性**：如有其他模块依赖 `test_points` JSON字段，需同步修改
⚠️ **性能考虑**：大批量保存时（>1000条），事务可能较慢，考虑分批处理

## 后续优化建议

1. **批量操作优化**：对于超大批量（>1000），可使用批量插入语句提升性能
2. **缓存策略**：对常查询的测试用例，可添加Redis缓存
3. **数据迁移工具**：提供Web界面的数据迁移和校验工具
4. **测试点执行记录**：未来可扩展测试点级别的执行追踪
