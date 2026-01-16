# 从功能用例导入UI测试用例功能

## 功能概述

在测试用例管理页面新增"导入功能用例"功能,允许用户从功能测试用例库中选择用例,并自动转化为UI自动化测试用例。

## 功能位置

- **页面路径**: `/test-cases`
- **触发入口**: 测试用例Tab页右上角操作区,"导入功能用例"按钮(绿色按钮,位于"创建测试用例"按钮左侧)

## 主要功能点

### 1. 导入入口

在测试用例管理页面的操作区,新增"导入功能用例"按钮:
- 图标: Download (下载图标)
- 按钮颜色: 绿色 (green-600)
- 位置: 仅在"测试用例"Tab下显示,位于"创建测试用例"按钮之前

### 2. 功能用例选择弹窗

点击"导入功能用例"按钮后,打开Modal弹窗,包含以下功能:

#### 2.1 搜索功能
- 搜索框支持按用例名称搜索
- 支持回车键快速搜索
- 搜索按钮触发搜索操作

#### 2.2 批量选择
- **全选当前页**: 选择当前页面所有可见用例
- **清空选择**: 清空所有已选用例

#### 2.3 用例列表展示
每个功能用例卡片显示:
- 复选框: 用于选择该用例
- 用例名称
- 优先级标签 (高/中/低,不同颜色区分)
- 用例描述 (如果有,最多显示2行)
- 元信息:
  - 所属项目/系统
  - 所属模块
  - 标签(最多显示2个,超出显示省略号)

#### 2.4 分页功能
- 显示当前页码和总页数
- 上一页/下一页按钮
- 显示当前查看的记录范围
- 默认每页显示20条

#### 2.5 状态统计
- Footer左侧显示已选择的用例数量
- 导入按钮显示选中数量: "导入选中用例 (X)"

### 3. 数据转化逻辑

功能测试用例转化为UI测试用例时的字段映射:

| 功能用例字段 | UI测试用例字段 | 转化规则 |
|------------|--------------|---------|
| name | name | 添加前缀 `[导入]` |
| steps | steps | 直接复制 |
| assertions/expected_result | assertions | 优先使用assertions,如果没有则使用expected_result |
| priority | priority | HIGH/CRITICAL → high, MEDIUM → medium, LOW → low |
| status | status | PUBLISHED → active, DRAFT → draft, ARCHIVED → disabled |
| tags | tags | 数组或逗号分隔字符串,统一转为数组 |
| system | system | 直接复制 |
| module | module | 直接复制 |
| - | department | 使用当前登录用户的项目 |
| - | author | 使用当前登录用户信息 |
| - | created | 当前日期 |
| - | lastRun | "从未运行" |
| - | success_rate | 0 |

### 4. 导入流程

1. 用户点击"导入功能用例"按钮
2. 系统加载功能用例列表(默认第1页,每页20条)
3. 用户可以:
   - 搜索筛选用例
   - 翻页查看更多用例
   - 勾选需要导入的用例
4. 点击"导入选中用例"按钮
5. 系统逐个转化并创建UI测试用例
6. 显示导入结果:
   - 全部成功: "成功导入 X 个测试用例!"
   - 部分失败: "导入完成:成功 X 个,失败 Y 个"
7. 刷新测试用例列表
8. 关闭导入弹窗并重置状态

### 5. 错误处理

- 加载功能用例失败: 显示错误提示,列表显示空状态
- 未选择任何用例点击导入: 提示"请至少选择一个功能用例"
- 单个用例导入失败: 记录失败数量,继续导入其他用例
- 批量导入失败: 显示错误信息,不影响已成功导入的用例

## 技术实现

### 前端实现

#### 新增状态管理
```typescript
const [showImportModal, setShowImportModal] = useState(false);
const [functionalCases, setFunctionalCases] = useState<any[]>([]);
const [importLoading, setImportLoading] = useState(false);
const [selectedFunctionalCases, setSelectedFunctionalCases] = useState<number[]>([]);
const [importSearchTerm, setImportSearchTerm] = useState('');
const [importPagination, setImportPagination] = useState({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0
});
```

#### 核心函数

1. **loadFunctionalCases**: 加载功能用例列表
   - 调用 `/api/v1/functional-test-cases` API
   - 支持分页和搜索参数
   - 更新功能用例列表和分页信息

2. **convertFunctionalToUICase**: 转化单个功能用例
   - 实现字段映射逻辑
   - 处理优先级和状态枚举转换
   - 添加导入标识前缀

3. **handleImportFunctionalCases**: 批量导入处理
   - 校验是否选择了用例
   - 循环转化并创建UI测试用例
   - 统计成功和失败数量
   - 刷新列表并显示结果

### API依赖

- **GET /api/v1/functional-test-cases**: 获取功能用例列表
  - 查询参数: page, pageSize, search
  - 返回: 功能用例列表 + 分页信息

- **POST /api/test/cases**: 创建UI测试用例
  - 由 testService.createTestCase() 调用
  - 请求体: 转化后的测试用例对象

## 用户体验优化

1. **加载状态**: 显示Loading动画,避免空白等待
2. **空状态提示**: 无数据时显示友好的空状态页面
3. **实时反馈**: 选择用例时高亮显示
4. **批量操作**: 支持全选和清空,提高操作效率
5. **导入结果**: 清晰显示成功/失败数量
6. **自动刷新**: 导入成功后自动刷新列表

## 未来优化方向

1. **高级筛选**: 支持按系统、模块、优先级筛选
2. **预览对比**: 导入前预览转化后的用例内容
3. **批量编辑**: 导入前统一修改某些字段(如优先级、标签)
4. **导入历史**: 记录导入历史,支持查看和回溯
5. **智能转化**: 基于AI优化步骤描述,使其更适合自动化执行
6. **冲突检测**: 检测是否已存在相同用例,避免重复导入

