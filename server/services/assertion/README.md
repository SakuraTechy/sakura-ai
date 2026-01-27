# 断言验证服务（Assertion Service）

## 概述

断言验证服务是一个集中管理所有断言验证逻辑的服务模块，提供统一的验证接口，支持多种断言类型，具有灵活的扩展机制。

## 特性

- ✅ **统一接口**：所有验证通过统一的 `verify()` 方法
- ✅ **策略模式**：每种验证类型独立实现，易于扩展
- ✅ **类型安全**：完整的 TypeScript 类型定义
- ✅ **日志记录**：完整的日志记录和回调机制
- ✅ **错误处理**：详细的错误信息和调试建议
- ✅ **匹配模式**：支持 strict/auto/loose 三种匹配模式
- ✅ **历史记录**：文本历史记录捕获快速消失的内容

## 已实现的验证策略

1. **FileDownloadStrategy** - 文件下载验证
2. **PopupStrategy** - 弹窗/提示验证
3. **ElementVisibilityStrategy** - 元素可见性验证
4. **TextContentStrategy** - 文本内容验证

## 快速开始

### 1. 初始化服务

```typescript
import { AssertionService } from './assertion/AssertionService';
import { FileDownloadStrategy } from './assertion/strategies/FileDownloadStrategy';
import { PopupStrategy } from './assertion/strategies/PopupStrategy';
import { AssertionType } from './assertion/types';

// 初始化服务（单例）
const assertionService = AssertionService.getInstance({
  logging: {
    enabled: true,
    level: 'info',
    callback: (message, level) => {
      console.log(`[${level}] ${message}`);
    }
  }
});

// 注册验证策略
assertionService.registerStrategy(AssertionType.FILE_DOWNLOAD, new FileDownloadStrategy());
assertionService.registerStrategy(AssertionType.POPUP, new PopupStrategy());
```

### 2. 执行验证

```typescript
import type { Assertion, VerificationContext } from './assertion/types';

// 创建断言对象
const assertion: Assertion = {
  id: 'test-1',
  description: '验证文件下载成功',
  type: AssertionType.FILE_DOWNLOAD
};

// 创建验证上下文
const context: VerificationContext = {
  page: page,  // Playwright Page 对象
  runId: 'run-123',
  artifactsDir: '/path/to/artifacts',
  logCallback: (message, level) => {
    console.log(`[${level}] ${message}`);
  }
};

// 执行验证
const result = await assertionService.verify(assertion, context);

if (result.success) {
  console.log('✅ 验证成功');
} else {
  console.log('❌ 验证失败:', result.error);
  console.log('💡 建议:', result.suggestions);
}
```

## 使用示例

### 文件下载验证

```typescript
const assertion: Assertion = {
  id: 'download-1',
  description: '验证文件下载成功',
  type: AssertionType.FILE_DOWNLOAD,
  timeout: 30000  // 30秒内的文件被认为是最近下载的
};

const result = await assertionService.verify(assertion, context);
```

### 弹窗验证

```typescript
const assertion: Assertion = {
  id: 'popup-1',
  description: '验证弹窗显示"操作成功"',
  type: AssertionType.POPUP,
  expectedValue: '操作成功',
  matchMode: 'auto',  // strict | auto | loose
  timeout: 10000
};

const result = await assertionService.verify(assertion, context);
```

### 元素可见性验证

```typescript
const assertion: Assertion = {
  id: 'visibility-1',
  description: '验证提交按钮可见',
  type: AssertionType.ELEMENT_VISIBILITY,
  selector: '#submit-button',  // CSS 选择器
  timeout: 5000
};

const result = await assertionService.verify(assertion, context);
```

### 文本内容验证

```typescript
const assertion: Assertion = {
  id: 'text-1',
  description: '验证页面包含"欢迎使用"',
  type: AssertionType.TEXT_CONTENT,
  expectedValue: '欢迎使用',
  matchMode: 'auto',
  timeout: 3000
};

const result = await assertionService.verify(assertion, context);
```

## 匹配模式

### strict（严格模式）
- 只使用完全匹配
- 适用于精确验证场景

### auto（智能模式，默认）
- 完全匹配 > 包含匹配 > 反向包含匹配
- 适用于大多数场景

### loose（宽松模式）
- 完全匹配 > 包含匹配 > 反向包含匹配 > 关键词匹配
- 适用于文本可能有变化的场景
- 会提供警告信息

## 验证结果

```typescript
interface AssertionResult {
  success: boolean;           // 验证是否成功
  assertionType: string;      // 验证策略名称
  matchType?: string;         // 匹配类型
  actualValue?: any;          // 实际值
  expectedValue?: any;        // 期望值
  error?: string;             // 错误信息
  warnings?: string[];        // 警告信息
  suggestions?: string[];     // 调试建议
  duration?: number;          // 验证耗时（毫秒）
  metadata?: Record<string, any>;  // 额外元数据
}
```

## 扩展自定义策略

```typescript
import type { VerificationStrategy, Assertion, VerificationContext, AssertionResult } from './types';

export class CustomStrategy implements VerificationStrategy {
  public readonly name = 'CustomStrategy';
  public readonly priority = 50;  // 优先级（数字越小优先级越高）

  public canHandle(assertion: Assertion): boolean {
    // 判断是否可以处理该断言
    return assertion.description.includes('自定义关键词');
  }

  public async verify(
    assertion: Assertion,
    context: VerificationContext
  ): Promise<AssertionResult> {
    // 实现验证逻辑
    try {
      // ... 验证逻辑
      return {
        success: true,
        assertionType: this.name,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        assertionType: this.name,
        error: error.message,
        suggestions: ['调试建议1', '调试建议2']
      };
    }
  }
}

// 注册自定义策略
assertionService.registerStrategy('custom', new CustomStrategy());
```

## 文本历史记录

文本历史记录用于捕获快速消失的弹窗和提示信息：

```typescript
import { TextHistoryManager } from './assertion/TextHistoryManager';

// 获取文本历史管理器
const textHistoryManager = assertionService.getTextHistoryManager();

// 添加文本到历史记录
textHistoryManager.addText('操作成功');

// 在历史记录中查找
const result = textHistoryManager.findInHistory('操作成功', 'auto');
console.log(result.found);  // true
console.log(result.matchType);  // '完全匹配'

// 清空历史记录
textHistoryManager.clear();
```

## 性能指标

- 平均验证时间: < 100ms（不含等待）
- 文件下载验证: < 50ms
- 弹窗验证: < 3s（含等待）
- 元素可见性验证: < 5s（含等待）
- 文本内容验证: < 3s（含等待）

## 测试

运行所有测试：

```bash
npm test -- server/services/assertion
```

运行特定策略测试：

```bash
npm test -- FileDownloadStrategy
npm test -- PopupStrategy
npm test -- ElementVisibilityStrategy
npm test -- TextContentStrategy
```

## 架构

```
AssertionService (主服务)
├── VerificationStrategyRegistry (策略注册表)
│   ├── FileDownloadStrategy
│   ├── PopupStrategy
│   ├── ElementVisibilityStrategy
│   └── TextContentStrategy
├── TextHistoryManager (文本历史记录管理器)
└── AssertionLogger (断言日志记录器)
```

## 设计模式

- **策略模式**：每种验证类型独立实现
- **责任链模式**：按优先级依次尝试不同的验证策略
- **单例模式**：AssertionService 作为单例，全局共享
- **工厂模式**：VerificationStrategyRegistry 负责创建和管理策略实例

## 贡献

欢迎贡献新的验证策略！请参考现有策略的实现方式。

## 许可证

MIT
