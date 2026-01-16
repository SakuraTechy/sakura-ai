# 修复项目管理中服务器和数据库配置保存验证问题

## 问题描述

在项目管理的服务器和数据库配置中，存在两个问题：

1. **验证问题**：当删除所有参数配置后，仍然可以保存成功，但实际上应该进行必填字段验证
2. **参数清空问题**：当用户删除所有参数配置后，原有的参数数据依然存在，无法被清空

## 问题原因

### 1. 验证问题原因

前端的表单验证逻辑不完整，缺少了服务器端要求的必填字段验证：

#### 服务器配置缺少的验证：
- `host_port`：主机端口
- `username`：用户名  
- `password`：密码

#### 数据库配置缺少的验证：
- `project_id`：所属项目（已修复）
- `database_port`：数据库端口
- `database_schema`：数据库/模式
- `username`：用户名
- `password`：密码
- `connection_string`：连接串

### 2. 参数清空问题原因

**前端逻辑**：
```typescript
parameters: Object.keys(parameters).length > 0 ? parameters : undefined
```

当用户删除所有参数后，`parameters` 字段被设置为 `undefined`，这意味着这个字段不会被传递到服务器端。

**服务器端逻辑**：
```typescript
if (data.parameters !== undefined) updateData.parameters = data.parameters || null;
```

由于前端没有传递 `parameters` 字段（`undefined`），服务器端就不会更新这个字段，原有的参数数据会保留。

## 修复方案

### 1. 修复服务器配置验证

在 `handleServerSubmit` 函数中添加了以下验证：

```typescript
if (!serverFormData.host_port || serverFormData.host_port <= 0) {
  showToast.error('主机端口不能为空且必须大于0');
  return;
}
if (!serverFormData.username.trim()) {
  showToast.error('用户名不能为空');
  return;
}
if (!serverFormData.password.trim()) {
  showToast.error('密码不能为空');
  return;
}
```

### 2. 修复数据库配置验证

在 `handleDatabaseSubmit` 函数中添加了以下验证：

```typescript
if (!databaseFormData.project_id) {
  showToast.error('请选择所属项目');
  return;
}
if (!databaseFormData.database_port || databaseFormData.database_port <= 0) {
  showToast.error('数据库端口不能为空且必须大于0');
  return;
}
if (!databaseFormData.database_schema.trim()) {
  showToast.error('数据库/模式不能为空');
  return;
}
if (!databaseFormData.username.trim()) {
  showToast.error('用户名不能为空');
  return;
}
if (!databaseFormData.password.trim()) {
  showToast.error('密码不能为空');
  return;
}
if (!databaseFormData.connection_string.trim()) {
  showToast.error('连接串不能为空');
  return;
}
```

### 3. 修复参数清空问题

**前端修复**：将 `undefined` 改为 `null`

```typescript
// 修复前
parameters: Object.keys(parameters).length > 0 ? parameters : undefined

// 修复后  
parameters: Object.keys(parameters).length > 0 ? parameters : null
```

**服务器端类型修复**：更新接口定义以支持 `null` 值

```typescript
// CreateServerInput 和 UpdateServerInput
parameters?: Record<string, string> | null;

// CreateDatabaseInput 和 UpdateDatabaseInput  
parameters?: Record<string, string> | null;
```

## 修复效果

修复后的验证逻辑确保：

1. **服务器配置**：必须填写项目、服务器类型、主机名称、主机端口、用户名、密码
2. **数据库配置**：必须填写项目、数据库类型、数据库名称、数据库端口、数据库/模式、用户名、密码、连接串
3. **参数清空**：当用户删除所有参数后，数据库中的参数会被正确清空为 `null`

## 测试验证

通过测试验证了修复的有效性：
- 空配置会显示所有必填字段的错误提示
- 部分配置会显示缺失字段的错误提示  
- 完整配置可以正常保存
- 删除所有参数后，原有参数数据会被正确清空

## 文件修改

- `src/pages/SystemManagement.tsx`：添加了完整的表单验证逻辑，修复了参数传递逻辑
- `server/services/serverService.ts`：更新了接口类型定义
- `server/services/databaseService.ts`：更新了接口类型定义

## 修复时间

2026-01-13

## 修复状态

✅ 已完成