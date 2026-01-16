# getAllTestRuns API 使用示例

## 功能说明

改进了 `testService.getAllTestRuns()` 方法，现在支持前端指定排序字段和排序方向（升序/降序）。

## API 签名

```typescript
async getAllTestRuns(options?: {
  sortBy?: 'startedAt' | 'finishedAt' | 'startTime';
  sortOrder?: 'asc' | 'desc';
}): Promise<TestRun[]>
```

## 使用示例

### 1. 获取测试运行列表（默认不排序）

```typescript
import { testService } from '@/services/testService';

// 不指定排序参数，返回原始顺序
const testRuns = await testService.getAllTestRuns();
```

### 2. 按开始时间降序排列（最新的在前）

```typescript
// 最常用的场景：最新的测试运行显示在最前面
const testRuns = await testService.getAllTestRuns({
  sortBy: 'startedAt',
  sortOrder: 'desc'  // 降序：最新的在前
});
```

### 3. 按开始时间升序排列（最旧的在前）

```typescript
const testRuns = await testService.getAllTestRuns({
  sortBy: 'startedAt',
  sortOrder: 'asc'  // 升序：最旧的在前
});
```

### 4. 按完成时间排序

```typescript
// 按完成时间降序
const testRuns = await testService.getAllTestRuns({
  sortBy: 'finishedAt',
  sortOrder: 'desc'
});

// 按完成时间升序
const testRuns = await testService.getAllTestRuns({
  sortBy: 'finishedAt',
  sortOrder: 'asc'
});
```

### 5. 在 React 组件中使用

```typescript
import React, { useEffect, useState } from 'react';
import { testService } from '@/services/testService';
import type { TestRun } from '@/types/test';

function TestRunsPage() {
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadTestRuns();
  }, [sortOrder]);

  const loadTestRuns = async () => {
    try {
      // 使用排序选项加载数据
      const runs = await testService.getAllTestRuns({
        sortBy: 'startedAt',
        sortOrder: sortOrder
      });
      setTestRuns(runs);
    } catch (error) {
      console.error('加载测试运行失败:', error);
    }
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  return (
    <div>
      <button onClick={toggleSortOrder}>
        {sortOrder === 'desc' ? '最新在前 ↓' : '最旧在前 ↑'}
      </button>
      {/* 渲染测试运行列表 */}
    </div>
  );
}
```

## 排序字段说明

| 字段 | 说明 | 数据类型 |
|------|------|----------|
| `startedAt` | 测试开始时间 | Date |
| `startTime` | 测试开始时间（别名） | Date |
| `finishedAt` | 测试完成时间 | Date (可选) |

## 排序方向说明

| 值 | 说明 | 效果 |
|------|------|------|
| `desc` | 降序 | 最新的记录在前面（推荐用于显示最近的测试） |
| `asc` | 升序 | 最旧的记录在前面（用于查看历史记录） |

## 注意事项

1. **默认行为**：如果不传递 `options` 参数，将返回后端原始顺序的数据
2. **空值处理**：如果某条记录的排序字段为空，会被视为时间戳为 0（最早）
3. **性能考虑**：排序在前端进行，适用于数据量不大的场景（建议 < 1000 条）
4. **推荐用法**：通常使用 `{ sortBy: 'startedAt', sortOrder: 'desc' }` 让最新的测试运行显示在最前面

## 实现细节

- 排序逻辑在前端实现，不依赖后端 API 修改
- 使用 JavaScript 原生的 `Array.sort()` 方法
- 日期比较通过 `getTime()` 转换为时间戳进行数值比较
- 支持对任意日期字段进行排序

