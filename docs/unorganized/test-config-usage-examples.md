# 测试配置服务使用示例

## 一、在测试用例生成器中使用配置验证

### 1.1 导入组件和服务

```typescript
import { ProjectConfigValidator } from '../../components/test-config/ProjectConfigValidator';
import * as testConfigService from '../../services/testConfigService';
```

### 1.2 在生成器页面中添加配置验证

```typescript
export function FunctionalTestCaseGenerator() {
  const [projectInfo, setProjectInfo] = useState({
    projectId: null as number | null,
    systemName: '',
    // ... 其他字段
  });

  const [configValid, setConfigValid] = useState(false);

  // 在项目选择后显示配置验证
  return (
    <div>
      {/* 项目选择 */}
      <Select
        value={projectInfo.projectId}
        onChange={(value) => {
          setProjectInfo(prev => ({ ...prev, projectId: value }));
        }}
      >
        {/* 项目选项 */}
      </Select>

      {/* 配置验证组件 */}
      {projectInfo.projectId && (
        <ProjectConfigValidator
          projectId={projectInfo.projectId}
          projectName={projectInfo.systemName}
          onValidationComplete={setConfigValid}
          autoValidate={true}
          showWarnings={true}
        />
      )}

      {/* 生成按钮 - 配置不完整时显示警告 */}
      <button
        onClick={handleGenerate}
        disabled={!configValid}
        className={!configValid ? 'opacity-50 cursor-not-allowed' : ''}
      >
        {configValid ? '生成测试用例' : '请先完善项目配置'}
      </button>
    </div>
  );
}
```

### 1.3 生成前验证配置

```typescript
const handleGenerateTestCases = async () => {
  if (!projectInfo.projectId) {
    showToast.error('请先选择项目');
    return;
  }

  // 验证配置
  try {
    const validation = await testConfigService.validateProjectConfig(projectInfo.projectId);
    
    if (!validation.valid) {
      // 显示配置不完整提示
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
            <p className="mt-3">建议先在"项目管理"中配置这些信息。</p>
            <p className="mt-2">是否继续生成测试用例？</p>
          </div>
        ),
        okText: '去配置',
        cancelText: '继续生成',
        onCancel: () => {
          // 用户选择继续生成
          proceedWithGeneration();
        },
        onOk: () => {
          // 跳转到项目管理页面
          navigate('/system-management', {
            state: { 
              returnPath: location.pathname,
              selectedProjectId: projectInfo.projectId
            }
          });
        }
      });
      return;
    }

    // 配置完整，继续生成
    await proceedWithGeneration();
  } catch (error: any) {
    console.error('验证配置失败:', error);
    showToast.error('验证配置失败');
  }
};

const proceedWithGeneration = async () => {
  // 生成测试用例的逻辑...
};
```

## 二、在测试用例详情页显示配置信息

### 2.1 加载测试用例配置

```typescript
export function FunctionalTestCaseDetail() {
  const { id } = useParams();
  const [testCase, setTestCase] = useState<any>(null);
  const [testConfig, setTestConfig] = useState<any>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  useEffect(() => {
    if (id) {
      loadTestCase();
      loadTestConfig();
    }
  }, [id]);

  const loadTestConfig = async () => {
    if (!id) return;

    setLoadingConfig(true);
    try {
      const config = await testConfigService.getTestCaseConfig(parseInt(id));
      setTestConfig(config);
    } catch (error: any) {
      console.error('加载测试配置失败:', error);
      showToast.error('加载测试配置失败');
    } finally {
      setLoadingConfig(false);
    }
  };

  return (
    <div>
      {/* 测试用例基本信息 */}
      <div className="mb-4">
        <h2>{testCase?.name}</h2>
        {/* ... */}
      </div>

      {/* 测试配置信息 */}
      {testConfig && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            测试配置
          </h3>
          
          <div className="space-y-2">
            {/* 测试账号 */}
            {testConfig.account && (
              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <span className="text-xs text-blue-700 font-medium">测试账号：</span>
                  <span className="text-xs text-blue-900 ml-2">
                    {testConfig.account.account_name}
                  </span>
                  <span className="text-xs text-blue-600 ml-2">
                    ({testConfig.account.account_type})
                  </span>
                </div>
              </div>
            )}

            {/* 测试服务器 */}
            {testConfig.server && (
              <div className="flex items-start gap-2">
                <Server className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <span className="text-xs text-blue-700 font-medium">测试服务器：</span>
                  <span className="text-xs text-blue-900 ml-2">
                    {testConfig.server.host_name}:{testConfig.server.host_port}
                  </span>
                  <span className="text-xs text-blue-600 ml-2">
                    ({testConfig.server.server_type})
                  </span>
                </div>
              </div>
            )}

            {/* 测试地址 */}
            {testConfig.testUrl && (
              <div className="flex items-start gap-2">
                <ExternalLink className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <span className="text-xs text-blue-700 font-medium">测试地址：</span>
                  <a 
                    href={testConfig.testUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline ml-2"
                  >
                    {testConfig.testUrl}
                  </a>
                </div>
              </div>
            )}

            {/* 数据库配置 */}
            {testConfig.database && (
              <div className="flex items-start gap-2">
                <Database className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <span className="text-xs text-blue-700 font-medium">测试数据库：</span>
                  <span className="text-xs text-blue-900 ml-2">
                    {testConfig.database.database_name}:{testConfig.database.database_port}
                  </span>
                  <span className="text-xs text-blue-600 ml-2">
                    ({testConfig.database.database_type})
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 配置缺失提示 */}
          {(!testConfig.account || !testConfig.server) && (
            <div className="mt-3 pt-3 border-t border-blue-200">
              <p className="text-xs text-yellow-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                部分配置缺失，可能影响测试执行
              </p>
            </div>
          )}
        </div>
      )}

      {/* 测试步骤等其他内容 */}
      {/* ... */}
    </div>
  );
}
```

## 三、在测试执行时使用配置

### 3.1 执行前获取配置

```typescript
export function TestCaseExecute() {
  const { id } = useParams();
  const [testConfig, setTestConfig] = useState<any>(null);

  const executeTest = async () => {
    if (!id) return;

    try {
      // 获取测试配置
      const config = await testConfigService.getTestCaseConfig(parseInt(id));
      
      // 验证配置完整性
      if (!config.account || !config.server) {
        Modal.error({
          title: '测试配置不完整',
          content: (
            <div>
              <p>无法执行测试，缺少以下配置：</p>
              <ul className="list-disc pl-5 mt-2">
                {!config.account && <li className="text-red-600">测试账号</li>}
                {!config.server && <li className="text-red-600">测试服务器</li>}
              </ul>
              <p className="mt-3">请先在项目管理中配置这些信息。</p>
            </div>
          )
        });
        return;
      }

      // 执行测试，传入配置
      const result = await testService.executeTestCase(parseInt(id), {
        executionEngine: 'playwright',
        enableTrace: true,
        enableVideo: true,
        // 传入测试配置
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
      
      // 跳转到执行结果页面
      navigate(`/test-executions/${result.executionId}`);
    } catch (error: any) {
      console.error('执行测试失败:', error);
      showToast.error(error.message || '执行测试失败');
    }
  };

  return (
    <div>
      {/* 测试用例信息 */}
      {/* ... */}

      {/* 执行按钮 */}
      <button
        onClick={executeTest}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        开始执行
      </button>
    </div>
  );
}
```

### 3.2 批量执行时验证配置

```typescript
export function TestPlanExecute() {
  const { planId } = useParams();
  const [testCases, setTestCases] = useState<any[]>([]);

  const executeBatch = async () => {
    if (!planId) return;

    try {
      // 获取所有测试用例的项目ID
      const projectIds = [...new Set(testCases.map(tc => tc.project_id))];

      // 批量验证项目配置
      const validations = await testConfigService.batchValidateProjects(projectIds);

      // 检查是否有配置不完整的项目
      const invalidProjects = validations.filter(v => !v.valid);

      if (invalidProjects.length > 0) {
        Modal.warning({
          title: '部分项目配置不完整',
          content: (
            <div>
              <p>以下项目配置不完整，可能影响测试执行：</p>
              <ul className="list-disc pl-5 mt-2">
                {invalidProjects.map(v => (
                  <li key={v.projectId} className="text-yellow-600">
                    项目 {v.projectId}: 缺少 {v.missing.join('、')}
                  </li>
                ))}
              </ul>
              <p className="mt-3">是否继续执行？</p>
            </div>
          ),
          okText: '继续执行',
          cancelText: '取消',
          onOk: () => {
            proceedWithExecution();
          }
        });
        return;
      }

      // 配置完整，继续执行
      await proceedWithExecution();
    } catch (error: any) {
      console.error('验证配置失败:', error);
      showToast.error('验证配置失败');
    }
  };

  const proceedWithExecution = async () => {
    // 批量执行测试用例...
  };

  return (
    <div>
      {/* 测试计划信息 */}
      {/* ... */}

      {/* 批量执行按钮 */}
      <button
        onClick={executeBatch}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        批量执行
      </button>
    </div>
  );
}
```

## 四、在项目管理页面显示配置状态

### 4.1 显示配置完整性徽章

```typescript
import { ConfigStatusBadge } from '../../components/test-config/ProjectConfigValidator';

export function SystemManagement() {
  const [projects, setProjects] = useState<any[]>([]);

  return (
    <div>
      {projects.map(project => (
        <div key={project.id} className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{project.name}</h3>
            
            {/* 配置状态徽章 */}
            <ConfigStatusBadge projectId={project.id} />
          </div>

          {/* 项目其他信息 */}
          {/* ... */}
        </div>
      ))}
    </div>
  );
}
```

## 五、服务端API使用示例

### 5.1 在路由中注册配置API

```typescript
// server/index.ts
import testConfigRoutes from './routes/testConfig.js';

// 注册路由
app.use('/api/v1/test-config', testConfigRoutes);
```

### 5.2 在测试用例服务中使用配置服务

```typescript
// server/services/functionalTestCaseService.ts
import { TestConfigService } from './testConfigService.js';

export class FunctionalTestCaseService {
  private testConfigService: TestConfigService;

  constructor() {
    this.testConfigService = new TestConfigService();
  }

  async create(data: any, userId: number) {
    // 验证项目配置
    const validation = await this.testConfigService.validateProjectConfig(data.projectId);
    
    if (!validation.valid) {
      console.warn(`⚠️ 项目 ${data.projectId} 配置不完整:`, validation.missing);
    }

    // 获取项目默认配置
    const projectConfig = await this.testConfigService.getProjectDefaultConfig(data.projectId);

    // 创建测试用例（这里暂时不修改数据库结构，只记录日志）
    console.log('📋 项目默认配置:', {
      hasAccount: !!projectConfig.account,
      hasServer: !!projectConfig.server,
      hasDatabase: !!projectConfig.database
    });

    // 创建测试用例...
    const testCase = await this.prisma.functional_test_cases.create({
      data: {
        // ... 原有字段
      }
    });

    return testCase;
  }
}
```

## 六、注意事项

1. **配置验证时机**：
   - 测试用例生成前验证
   - 测试执行前验证
   - 批量操作前批量验证

2. **用户体验**：
   - 配置不完整时给出明确提示
   - 提供快速跳转到配置页面的入口
   - 允许用户选择继续或去配置

3. **性能优化**：
   - 配置查询结果可以缓存
   - 批量验证时使用批量查询
   - 避免重复验证

4. **错误处理**：
   - 配置服务异常时不应阻塞主流程
   - 提供降级方案
   - 记录错误日志便于排查

5. **安全考虑**：
   - 密码等敏感信息不要在前端明文显示
   - API访问需要权限控制
   - 配置数据传输加密
