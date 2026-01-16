# 测试计划模块 - Bug修复说明

## 修复日期
2025-12-17

## 问题描述

### 问题1: 测试计划页面没有添加顶部标签
**现象**：点击"测试计划"菜单后，顶部Tab栏没有显示"测试计划"标签

**原因**：`TabContext.tsx` 中的路由配置映射 `routeConfig` 缺少测试计划相关的路由

### 问题2: API接口认证失败
**现象**：访问 `/test-plans?page=1&pageSize=20` 接口时报错：
```json
{
    "success": false,
    "error": "未提供认证token"
}
```

**原因**：`testPlanService.ts` 直接使用了原生的 `axios` 而不是配置好的 `apiClient`，导致请求没有携带认证token

## 修复方案

### 修复1: 添加测试计划Tab配置

**文件**：`src/contexts/TabContext.tsx`

**修改内容**：

1. 添加 `Target` 图标导入：
```typescript
import {
  // ... 其他图标
  Target
} from 'lucide-react';
```

2. 在 `routeConfig` 中添加测试计划路由：
```typescript
const routeConfig: Record<string, { title: string; icon: React.ReactNode }> = {
  // ... 其他路由
  '/test-plans': { title: '测试计划', icon: <Target className="h-4 w-4" /> },
};
```

3. 在 `getRouteConfig` 函数中添加测试计划子路由匹配：
```typescript
// 测试计划相关路由
if (pathname === '/test-plans/create') {
  return { title: '新建测试计划', icon: <PlusCircle className="h-4 w-4" /> };
}

if (pathname.match(/^\/test-plans\/\d+$/)) {
  return { title: '测试计划详情', icon: <Target className="h-4 w-4" /> };
}

if (pathname.match(/^\/test-plans\/\d+\/edit$/)) {
  return { title: '编辑测试计划', icon: <Edit3 className="h-4 w-4" /> };
}

if (pathname.match(/^\/test-plans\/\d+\/add-cases$/)) {
  return { title: '添加测试用例', icon: <PlusCircle className="h-4 w-4" /> };
}

if (pathname.match(/^\/test-plans\/\d+\/execute$/)) {
  return { title: '执行测试计划', icon: <Play className="h-4 w-4" /> };
}
```

### 修复2: 使用配置好的axios实例

**文件**：`src/services/testPlanService.ts`

**修改内容**：

1. 修改导入语句：
```typescript
// 修改前
import axios from 'axios';

// 修改后
import apiClient from '../utils/axios';
```

2. 替换所有 `axios` 为 `apiClient`：
```typescript
// 修改前
const response = await axios.get(API_BASE_URL, { params: query });

// 修改后
const response = await apiClient.get(API_BASE_URL, { params: query });
```

所有API方法都已更新：
- `getTestPlans` - 获取列表
- `getTestPlanDetail` - 获取详情
- `createTestPlan` - 创建
- `updateTestPlan` - 更新
- `deleteTestPlan` - 删除
- `addCasesToPlan` - 添加用例
- `removeCaseFromPlan` - 移除用例
- `startTestPlanExecution` - 开始执行
- `updateTestPlanExecution` - 更新执行状态
- `updateTestPlanCaseStatus` - 更新用例状态
- `getTestPlanExecutions` - 获取执行历史

## 修复效果

### 修复1效果
- ✅ 点击"测试计划"菜单后，顶部会显示"测试计划"标签
- ✅ 标签使用 Target 图标
- ✅ 支持所有测试计划相关页面的标签显示：
  - 测试计划列表
  - 新建测试计划
  - 测试计划详情
  - 编辑测试计划
  - 添加测试用例
  - 执行测试计划

### 修复2效果
- ✅ 所有测试计划API请求都会自动携带认证token
- ✅ 认证token从 localStorage 的 `authToken` 字段读取
- ✅ Token自动添加到请求头：`Authorization: Bearer <token>`
- ✅ 如果收到401错误，会自动跳转到登录页面

## 相关配置文件

### axios配置文件
**文件**：`src/utils/axios.ts`

**功能**：
- 创建配置好的axios实例
- 请求拦截器：自动从 localStorage 读取token并添加到请求头
- 响应拦截器：处理401错误，自动跳转登录页

**使用方法**：
```typescript
// 正确的方式
import apiClient from '../utils/axios';
const response = await apiClient.get('/api/endpoint');

// 错误的方式（不会自动添加token）
import axios from 'axios';
const response = await axios.get('/api/endpoint');
```

## 注意事项

### 对于开发者

1. **所有新的API服务都应该使用 `apiClient` 而不是原生 `axios`**
   - 这样才能自动携带认证token
   - 这样才能自动处理401错误

2. **添加新路由时记得更新 `TabContext.tsx`**
   - 在 `routeConfig` 中添加主路由
   - 在 `getRouteConfig` 函数中添加子路由匹配规则

3. **Tab图标应该与导航菜单保持一致**
   - 便于用户识别

### 对于测试人员

1. **测试Tab功能**
   - 点击"测试计划"菜单，检查顶部是否出现标签
   - 切换到其他子页面，检查标签标题是否正确
   - 测试Tab的关闭、切换功能

2. **测试认证功能**
   - 登录后访问测试计划列表，应该正常显示
   - 退出登录后访问测试计划列表，应该跳转到登录页
   - 检查浏览器开发者工具，确认请求头包含 `Authorization`

## 验证步骤

### 验证Tab功能
```
1. 登录系统
2. 点击左侧菜单"测试计划"
3. 检查顶部是否显示"测试计划"标签（带Target图标）
4. 点击"新建计划"
5. 检查是否新增"新建测试计划"标签
6. 返回列表，点击某个计划
7. 检查是否新增"测试计划详情"标签
```

### 验证认证功能
```
1. 打开浏览器开发者工具 - Network标签
2. 访问测试计划列表页面
3. 查看 /api/v1/test-plans 请求
4. 检查Request Headers是否包含：
   Authorization: Bearer <your-token>
5. 检查Response Status应该是 200 OK
6. 检查Response Body应该包含测试计划列表数据
```

## 已修复的文件清单

- ✅ `src/contexts/TabContext.tsx` - 添加测试计划Tab配置
- ✅ `src/services/testPlanService.ts` - 使用apiClient替代axios

## 相关文档

- [测试计划完整实现说明](./TEST_PLAN_COMPLETE_IMPLEMENTATION.md)
- [测试计划快速开始指南](./TEST_PLAN_QUICK_START.md)
- [测试计划使用说明](./TEST_PLAN_MODULE.md)

## 总结

这两个bug都已经完全修复：

1. ✅ **Tab显示问题** - 测试计划相关页面现在都会正确显示标签
2. ✅ **认证Token问题** - 所有API请求现在都会自动携带认证token

测试计划模块现在可以完全正常使用了！🎉

