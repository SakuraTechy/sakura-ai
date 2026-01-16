# 测试用例配置数据优化方案

## 一、问题描述

当前项目通过AI生成或手动添加的功能测试用例，在执行时需要访问域名、账号密码、验证码等测试数据。这些数据应该优先从项目管理模块中获取配置的默认账号和服务器等数据，以确保测试能够正常运行。

## 二、优化目标

1. **自动关联配置**：测试用例生成时自动关联项目的默认配置
2. **配置优先级**：测试执行时优先使用项目配置的默认数据
3. **配置可覆盖**：允许测试用例级别覆盖项目默认配置
4. **配置验证**：生成测试用例前验证项目配置完整性

## 三、实施方案

### 3.1 数据库层优化

#### 方案A：扩展测试用例表（推荐）

在 `functional_test_cases` 表中添加配置引用字段：

```sql
-- 添加配置关联字段
ALTER TABLE functional_test_cases 
ADD COLUMN default_account_id INT NULL COMMENT '默认测试账号ID',
ADD COLUMN default_server_id INT NULL COMMENT '默认测试服务器ID',
ADD COLUMN default_database_id INT NULL COMMENT '默认测试数据库ID',
ADD COLUMN test_url VARCHAR(500) NULL COMMENT '测试访问地址',
ADD COLUMN use_project_defaults BOOLEAN DEFAULT TRUE COMMENT '是否使用项目默认配置';

-- 添加外键约束
ALTER TABLE functional_test_cases
ADD CONSTRAINT fk_test_case_account FOREIGN KEY (default_account_id) REFERENCES account_configs(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_test_case_server FOREIGN KEY (default_server_id) REFERENCES server_configs(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_test_case_database FOREIGN KEY (default_database_id) REFERENCES database_configs(id) ON DELETE SET NULL;
```

**优点**：
- 直接关联，查询效率高
- 支持用例级别配置覆盖
- 数据一致性好

**缺点**：
- 需要修改数据库结构
- 需要数据迁移

#### 方案B：使用配置快照（备选）

在测试用例中保存配置快照（JSON格式）：

```sql
ALTER TABLE functional_test_cases 
ADD COLUMN config_snapshot JSON NULL COMMENT '配置快照（账号、服务器、数据库）';
```

**优点**：
- 灵活性高，不依赖外键
- 配置历史可追溯
- 不受配置删除影响

**缺点**：
- 数据冗余
- 配置更新不会自动同步

### 3.2 服务层优化

#### 3.2.1 新增配置获取服务

创建 `server/services/testConfigService.ts`：

```typescript
/**
 * 测试配置服务
 * 负责获取和管理测试用例的配置数据
 */
export class TestConfigService {
  /**
   * 获取项目的默认测试配置
   */
  async getProjectDefaultConfig(projectId: number) {
    // 获取默认账号
    const defaultAccount = await prisma.account_configs.findFirst({
      where: { project_id: projectId, is_default: true, status: 'active' }
    });

    // 获取默认服务器
    const defaultServer = await prisma.server_configs.findFirst({
      where: { project_id: projectId, is_default: true, status: 'active' }
    });

    // 获取默认数据库
    const defaultDatabase = await prisma.database_configs.findFirst({
      where: { project_id: projectId, is_default: true, status: 'active' }
    });

    return {
      account: defaultAccount,
      server: defaultServer,
      database: defaultDatabase
    };
  }

  /**
   * 获取测试用例的完整配置
   * 优先级：用例配置 > 项目默认配置
   */
  async getTestCaseConfig(testCaseId: number) {
    const testCase = await prisma.functional_test_cases.findUnique({
      where: { id: testCaseId },
      include: {
        default_account: true,
        default_server: true,
        default_database: true
      }
    });

    if (!testCase) {
      throw new Error('测试用例不存在');
    }

    // 如果用例配置了特定配置，使用用例配置
    if (!testCase.use_project_defaults) {
      return {
        account: testCase.default_account,
        server: testCase.default_server,
        database: testCase.default_database,
        testUrl: testCase.test_url
      };
    }

    // 否则使用项目默认配置
    const projectConfig = await this.getProjectDefaultConfig(testCase.project_id);
    return {
      ...projectConfig,
      testUrl: testCase.test_url || this.buildTestUrl(projectConfig.server)
    };
  }

  /**
   * 验证项目配置完整性
   */
  async validateProjectConfig(projectId: number): Promise<{
    valid: boolean;
    missing: string[];
  }> {
    const config = await this.getProjectDefaultConfig(projectId);
    const missing: string[] = [];

    if (!config.account) missing.push('默认测试账号');
    if (!config.server) missing.push('默认测试服务器');
    if (!config.database) missing.push('默认测试数据库');

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * 构建测试访问地址
   */
  private buildTestUrl(server: any): string {
    if (!server) return '';
    const protocol = server.host_port === 443 ? 'https' : 'http';
    return `${protocol}://${server.host_name}:${server.host_port}`;
  }
}
```

#### 3.2.2 修改测试用例生成服务

修改 `server/services/functionalTestCaseService.ts`：

```typescript
/**
 * 创建测试用例时自动关联默认配置
 */
async create(data: any, userId: number) {
  // 获取项目默认配置
  const testConfigService = new TestConfigService();
  const projectConfig = await testConfigService.getProjectDefaultConfig(data.projectId);

  // 创建测试用例
  const testCase = await this.prisma.functional_test_cases.create({
    data: {
      // ... 原有字段
      project_id: data.projectId,
      project_version_id: data.projectVersionId,
      
      // 🆕 关联默认配置
      default_account_id: projectConfig.account?.id,
      default_server_id: projectConfig.server?.id,
      default_database_id: projectConfig.database?.id,
      test_url: data.testUrl || testConfigService.buildTestUrl(projectConfig.server),
      use_project_defaults: true
    }
  });

  return testCase;
}

/**
 * 批量保存时自动关联配置
 */
async batchSave(params: BatchSaveParams) {
  const { testCases, projectId } = params;
  
  // 获取项目默认配置
  const testConfigService = new TestConfigService();
  const projectConfig = await testConfigService.getProjectDefaultConfig(projectId);

  // 批量创建时关联配置
  for (const tc of testCases) {
    await this.prisma.functional_test_cases.create({
      data: {
        // ... 原有字段
        default_account_id: projectConfig.account?.id,
        default_server_id: projectConfig.server?.id,
        default_database_id: projectConfig.database?.id,
        use_project_defaults: true
      }
    });
  }
}
```

### 3.3 前端层优化

#### 3.3.1 测试用例生成器增加配置验证

修改 `src/pages/FunctionalTestCaseGenerator.tsx`：

```typescript
// 在生成测试用例前验证项目配置
const validateProjectConfig = async () => {
  if (!projectInfo.projectId) {
    showToast.error('请先选择项目');
    return false;
  }

  try {
    const validation = await testConfigService.validateProjectConfig(projectInfo.projectId);
    
    if (!validation.valid) {
      Modal.confirm({
        title: '项目配置不完整',
        content: (
          <div>
            <p>当前项目缺少以下配置：</p>
            <ul className="list-disc pl-5 mt-2">
              {validation.missing.map(item => (
                <li key={item} className="text-red-600">{item}</li>
              ))}
            </ul>
            <p className="mt-3">建议先在"项目管理"中配置这些信息，以确保测试用例能够正常执行。</p>
            <p className="mt-2">是否继续生成测试用例？</p>
          </div>
        ),
        okText: '继续生成',
        cancelText: '去配置',
        onCancel: () => {
          navigate('/system-management', {
            state: { 
              returnPath: location.pathname,
              returnTitle: 'AI测试用例生成器',
              selectedProjectId: projectInfo.projectId
            }
          });
        }
      });
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('验证项目配置失败:', error);
    return true; // 验证失败时允许继续
  }
};

// 在生成测试用例前调用验证
const handleGenerateTestCases = async () => {
  const isValid = await validateProjectConfig();
  if (!isValid) return;
  
  // 继续生成测试用例...
};
```

#### 3.3.2 测试用例详情显示配置信息

修改 `src/pages/FunctionalTestCaseDetail.tsx`：

```typescript
// 加载测试用例配置
const [testConfig, setTestConfig] = useState<any>(null);

useEffect(() => {
  const loadTestConfig = async () => {
    if (!testCase?.id) return;
    
    try {
      const config = await testConfigService.getTestCaseConfig(testCase.id);
      setTestConfig(config);
    } catch (error) {
      console.error('加载测试配置失败:', error);
    }
  };
  
  loadTestConfig();
}, [testCase?.id]);

// 在UI中显示配置信息
<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
  <h3 className="text-sm font-semibold text-blue-900 mb-3">测试配置</h3>
  
  {testConfig?.account && (
    <div className="mb-2">
      <span className="text-xs text-blue-700">测试账号：</span>
      <span className="text-xs text-blue-900 font-medium">
        {testConfig.account.account_name}
      </span>
    </div>
  )}
  
  {testConfig?.server && (
    <div className="mb-2">
      <span className="text-xs text-blue-700">测试服务器：</span>
      <span className="text-xs text-blue-900 font-medium">
        {testConfig.server.host_name}:{testConfig.server.host_port}
      </span>
    </div>
  )}
  
  {testConfig?.testUrl && (
    <div className="mb-2">
      <span className="text-xs text-blue-700">测试地址：</span>
      <a 
        href={testConfig.testUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-xs text-blue-600 hover:underline"
      >
        {testConfig.testUrl}
      </a>
    </div>
  )}
</div>
```

#### 3.3.3 测试执行时使用配置

修改 `src/pages/TestCases.tsx` 和 `src/pages/TestPlanExecute.tsx`：

```typescript
// 执行测试前获取配置
const executeTestCase = async (testCaseId: number) => {
  try {
    // 获取测试配置
    const config = await testConfigService.getTestCaseConfig(testCaseId);
    
    if (!config.account || !config.server) {
      showToast.error('测试配置不完整，请先在项目管理中配置默认账号和服务器');
      return;
    }
    
    // 执行测试，传入配置
    await testService.executeTestCase(testCaseId, {
      executionEngine: executionConfig.executionEngine,
      enableTrace: executionConfig.enableTrace,
      enableVideo: executionConfig.enableVideo,
      // 🆕 传入测试配置
      testConfig: {
        url: config.testUrl,
        username: config.account.account_name,
        password: config.account.account_password,
        serverHost: config.server.host_name,
        serverPort: config.server.host_port,
        database: config.database ? {
          host: config.database.database_name,
          port: config.database.database_port,
          schema: config.database.database_schema,
          username: config.database.username,
          password: config.database.password
        } : undefined
      }
    });
    
    showToast.success('测试开始执行');
  } catch (error: any) {
    showToast.error(error.message || '执行失败');
  }
};
```

### 3.4 API层优化

#### 3.4.1 新增配置API

创建 `server/routes/testConfig.ts`：

```typescript
import express from 'express';
import { TestConfigService } from '../services/testConfigService.js';

const router = express.Router();
const testConfigService = new TestConfigService();

/**
 * 获取项目默认配置
 */
router.get('/projects/:projectId/default-config', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const config = await testConfigService.getProjectDefaultConfig(projectId);
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取测试用例配置
 */
router.get('/test-cases/:testCaseId/config', async (req, res) => {
  try {
    const testCaseId = parseInt(req.params.testCaseId);
    const config = await testConfigService.getTestCaseConfig(testCaseId);
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 验证项目配置
 */
router.get('/projects/:projectId/validate-config', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const validation = await testConfigService.validateProjectConfig(projectId);
    res.json(validation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

## 四、实施步骤

### 阶段1：数据库迁移（1-2天）

1. 创建数据库迁移脚本
2. 在测试环境执行迁移
3. 验证数据完整性

### 阶段2：服务层开发（2-3天）

1. 创建 `TestConfigService`
2. 修改 `FunctionalTestCaseService`
3. 添加配置API路由
4. 编写单元测试

### 阶段3：前端集成（3-4天）

1. 修改测试用例生成器，添加配置验证
2. 修改测试用例详情页，显示配置信息
3. 修改测试执行逻辑，使用配置数据
4. 添加配置管理UI（可选）

### 阶段4：测试验证（2-3天）

1. 功能测试：验证配置关联正确性
2. UI自动化测试：验证配置在执行时生效
3. 边界测试：验证配置缺失时的提示
4. 性能测试：验证配置查询效率

## 五、注意事项

### 5.1 数据迁移

- 对现有测试用例，需要批量关联项目默认配置
- 迁移脚本需要处理配置不存在的情况
- 建议先在测试环境验证

### 5.2 向后兼容

- 保持现有API接口不变
- 新增字段设置为可选
- 提供配置缺失时的降级方案

### 5.3 性能优化

- 配置查询添加缓存
- 批量操作时减少数据库查询
- 使用数据库索引优化查询

### 5.4 安全考虑

- 密码字段加密存储
- API访问权限控制
- 敏感信息脱敏显示

## 六、预期效果

1. **自动化程度提升**：测试用例生成时自动关联配置，减少手动配置工作
2. **配置一致性**：统一使用项目管理模块的配置，避免配置不一致
3. **执行成功率提升**：配置完整性验证，减少因配置缺失导致的执行失败
4. **维护成本降低**：配置集中管理，修改配置后自动生效

## 七、后续优化方向

1. **配置模板**：支持配置模板，快速复制配置到新项目
2. **配置版本**：支持配置历史版本，方便回滚
3. **配置继承**：支持项目组级别配置，子项目继承父项目配置
4. **配置验证规则**：支持自定义配置验证规则
5. **配置导入导出**：支持配置批量导入导出
