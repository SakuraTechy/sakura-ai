# 功能用例UI自动化测试执行功能说明

## 功能概述

在功能用例管理页面(`FunctionalTestCases`)中添加了UI自动化测试执行功能，允许用户直接对功能用例进行UI自动化测试执行。该功能复制自测试用例管理页面(`TestCases`)的执行逻辑。

## 主要功能特性

### 1. 执行配置对话框

用户点击"UI自动化测试"按钮后，会弹出执行配置对话框，支持以下配置:

- **执行引擎选择**:
  - MCP 客户端(默认): 支持 AI 闭环流程
  - Playwright Test Runner: 支持 Trace 和 Video 录制

- **Playwright 特定配置** (仅在选择Playwright时显示):
  - 启用 Trace 录制: 录制测试执行过程，可在 trace.playwright.dev 查看
  - 启用 Video 录制: 录制测试执行视频，用于调试和回放

- **执行环境选择**:
  - Staging (预发布环境)
  - Production (生产环境)
  - Development (开发环境)

### 2. 执行状态管理

- **执行中状态显示**: 
  - 执行按钮显示加载动画(旋转图标)
  - 防止重复点击和并发执行

- **WebSocket实时监听**:
  - 监听测试执行状态变化
  - 接收执行完成/失败通知
  - 自动更新数据列表

- **超时保护机制**:
  - 10分钟自动清理执行状态
  - 防止状态永久卡住
  - WebSocket断线自动重连(每10秒检查一次)

### 3. 用户界面改进

- **下拉菜单**:
  - 功能测试: 跳转到功能测试执行页面
  - UI自动化测试: 弹出配置对话框

- **执行状态提示**:
  - 开始执行: 显示运行ID和执行引擎
  - 执行完成: 根据状态显示不同提示(成功/失败/取消)
  - 执行失败: 显示错误信息

- **数据自动刷新**:
  - 执行完成后自动刷新用例列表
  - 同步最新的执行状态

## 技术实现

### 1. 功能用例数据转换

功能用例在执行前会自动转换为标准测试用例格式：

```typescript
const testCaseData = {
    name: pendingTestCase.name || pendingTestCase.test_point_name || '未命名测试',
    steps: pendingTestCase.test_point_steps || pendingTestCase.steps || '未定义步骤',
    assertions: pendingTestCase.test_point_expected_result || pendingTestCase.expected_result || '未定义预期结果',
    priority: pendingTestCase.priority || pendingTestCase.test_point_risk_level || 'medium',
    system: pendingTestCase.system || '',
    module: pendingTestCase.module || ''
};
```

转换规则：
- **名称**: 优先使用用例名称，其次使用测试点名称
- **步骤**: 优先使用测试点步骤，其次使用steps字段
- **断言**: 优先使用测试点预期结果，其次使用expected_result字段
- **优先级**: 优先使用priority字段，其次使用风险等级
- **系统/模块**: 直接使用对应字段

### 2. 状态管理

```typescript
// 执行配置状态
const [showExecutionConfig, setShowExecutionConfig] = useState(false);
const [pendingTestCase, setPendingTestCase] = useState<any | null>(null);
const [runningTestId, setRunningTestId] = useState<number | null>(null);
const [executionConfig, setExecutionConfig] = useState({
    executionEngine: 'mcp' as 'mcp' | 'playwright',
    enableTrace: true,
    enableVideo: true,
    environment: 'staging'
});
```

### 3. 核心函数

- `handleExecuteCase`: 处理执行按钮点击，根据style参数分发到不同的执行流程
  - `'default'`: 功能测试（跳转到功能测试执行页面）
  - `'alt'`: 功能测试（备选页面）
  - `'ui-auto'`: UI自动化测试（显示执行配置对话框）

- `handleRunUITest`: 显示执行配置对话框，准备执行UI自动化测试

- `handleConfirmRunUITest`: 确认执行，核心步骤：
  1. 提取功能用例的详细信息（步骤、断言、优先级等）
  2. 转换为标准测试用例格式
  3. 启动WebSocket监听器
  4. 调用`testService.runTestCase`并传递转换后的数据
  5. 等待执行结果并更新UI

### 4. WebSocket集成

```typescript
// 添加消息监听器
testService.addMessageListener(listenerId, (message) => {
    if (message.type === 'test_complete') {
        // 处理执行完成
        setRunningTestId(null);
        testService.removeMessageListener(listenerId);
        showToast.success(`🎉 测试执行完成: ${pendingTestCase.name}`);
        loadData();
    }
});

// 🔥 启动测试 - 传递功能用例的详细信息
await testService.runTestCase(pendingTestCase.id, {
    executionEngine: executionConfig.executionEngine,
    enableTrace: executionConfig.enableTrace,
    enableVideo: executionConfig.enableVideo,
    environment: executionConfig.environment,
    // 传递转换后的测试用例数据
    testCaseData: {
        name: '...',
        steps: '...',
        assertions: '...',
        priority: '...',
        system: '...',
        module: '...'
    }
});
```

## 修改的文件

1. **src/pages/FunctionalTestCases/index.tsx**
   - 添加执行配置相关状态
   - 添加WebSocket初始化和清理逻辑
   - 实现`handleRunUITest`和`handleConfirmRunUITest`函数
   - 添加执行配置对话框Modal

2. **src/pages/FunctionalTestCases/views/TableView.tsx**
   - 导入`Loader2`图标
   - 接收`runningTestId`属性
   - 修改"UI自动化测试"菜单项，调用新的执行函数
   - 显示执行中状态(loading动画)

3. **src/pages/FunctionalTestCases/types.ts**
   - 更新`ViewProps`接口，添加`runningTestId`属性
   - 更新`onExecuteCase`类型，支持'ui-auto'样式

4. **src/services/testService.ts**
   - ✅ 扩展`runTestCase`方法，支持传递`testCaseData`参数
   - ✅ 允许在执行时传递功能用例的详细信息（步骤、断言、优先级等）

## 使用流程

1. 用户在功能用例列表点击"执行用例"按钮
2. 在下拉菜单中选择"UI自动化测试"
3. 弹出执行配置对话框，配置执行参数
4. 点击"开始执行"按钮
5. 系统启动测试执行，显示执行中状态
6. WebSocket监听执行结果
7. 执行完成后显示结果提示，自动刷新数据
8. 可选：跳转到测试运行详情页面查看执行详情

## 注意事项

1. **功能用例数据转换**: 
   - ✅ 功能用例会自动转换为标准测试用例格式
   - ✅ 转换包括：测试步骤、预期结果、优先级、系统模块等信息
   - ✅ 转换后的数据会随执行请求一起发送到后端
   - ⚠️ 如果功能用例缺少必要字段，会使用默认值

2. **WebSocket依赖**: 
   - 需要确保WebSocket服务正常运行
   - 自动重连机制每10秒检查一次连接状态

3. **并发限制**: 
   - 同一时间只能执行一个测试
   - 执行中会显示loading状态，防止重复点击

4. **超时处理**: 
   - 执行超过10分钟会自动清理状态
   - 防止状态永久卡住影响后续操作

5. **数据同步**: 
   - 执行完成后会自动刷新列表数据
   - 确保显示最新的执行状态

## 未来改进方向

1. 支持批量执行多个功能用例
2. 添加执行历史记录查看
3. 优化执行状态的实时反馈
4. 添加执行进度百分比显示
5. 支持取消正在执行的测试

## 测试建议

1. 测试执行配置对话框的打开和关闭
2. 测试不同执行引擎的选择
3. 测试执行中状态的显示
4. 测试WebSocket消息的接收和处理
5. 测试超时保护机制
6. 测试执行完成后的数据刷新

---

**版本**: 1.0.0  
**创建日期**: 2025-12-15  
**作者**: AI Assistant

