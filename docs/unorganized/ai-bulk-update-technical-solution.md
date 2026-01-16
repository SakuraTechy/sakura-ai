# AI 批量更新用例功能技术方案

> **基于现有测试平台架构的零风险增量实现方案**  
> 版本：v2.0  
> 时间：2025-08-23

---

## 1. 系统架构分析

### 1.1 现有技术栈
- **后端**: Node.js + Express + TypeScript
- **前端**: React 18 + TypeScript + Vite
- **数据库**: MySQL + Prisma ORM
- **AI集成**: @playwright/mcp + 自定义AITestParser
- **实时通信**: WebSocket
- **队列处理**: Bull + Redis
- **截图服务**: Sharp + Playwright

### 1.2 现有数据库模型
```sql
-- 核心业务表（保持不变）
test_cases: id, title, steps(JSON), tags(JSON), system, module, created_at
test_runs: id, suite_id, status, started_at, finished_at
users: id, email, password_hash, created_at
feature_flags: flag_name, is_enabled, rollout_percentage
audit_logs: id, user_id, action, target_type, target_id, meta
```

### 1.3 现有服务架构
```typescript
// 服务层
- TestExecutionService: 测试执行核心
- DatabaseService: 数据库连接池管理
- AITestParser: AI解析服务
- ScreenshotService: 截图管理
- QueueService: 队列处理
- WebSocketManager: 实时通信

// 路由层
- /api/test/*: 测试用例CRUD
- /api/suite/*: 测试套件管理
- /api/screenshots/*: 截图管理
```

---

## 2. 新增数据模型设计

### 2.1 数据库迁移脚本

```sql
-- 新增三张核心表，完全独立于现有业务
-- 1. 用例版本表（用于版本控制与回滚）
CREATE TABLE case_versions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  case_id INT NOT NULL COMMENT '关联test_cases.id',
  version INT NOT NULL COMMENT '版本号，从1开始',
  steps JSON COMMENT '用例步骤快照',
  tags JSON COMMENT '标签快照',
  system VARCHAR(100) COMMENT '系统模块',
  module VARCHAR(100) COMMENT '功能模块', 
  meta JSON COMMENT '扩展字段(优先级/状态等)',
  created_by INT COMMENT '创建用户ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_case_version (case_id, version),
  FOREIGN KEY (case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_id (case_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB COMMENT='用例版本历史表';

-- 2. 批量编辑会话表
CREATE TABLE bulk_edit_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  system VARCHAR(100) NOT NULL COMMENT '目标系统',
  module VARCHAR(100) NOT NULL COMMENT '目标模块',
  tag_filter JSON COMMENT '标签过滤条件',
  priority_filter VARCHAR(50) COMMENT '优先级过滤',
  change_brief TEXT NOT NULL COMMENT '改动描述',
  status ENUM('dry_run', 'applied', 'cancelled', 'failed') DEFAULT 'dry_run',
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  applied_at TIMESTAMP NULL COMMENT '应用时间',
  
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_created_by (created_by),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB COMMENT='批量编辑会话表';

-- 3. AI提案表（存储具体的修改建议）
CREATE TABLE case_patch_proposals (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id INT NOT NULL COMMENT '关联会话ID',
  case_id INT NOT NULL COMMENT '目标用例ID',
  diff_json JSON NOT NULL COMMENT 'JSON Patch格式的修改内容',
  ai_rationale TEXT COMMENT 'AI修改理由',
  side_effects JSON COMMENT '潜在副作用分析',
  risk_level ENUM('low', 'medium', 'high') DEFAULT 'medium',
  recall_reason VARCHAR(255) COMMENT '命中该用例的原因',
  old_hash VARCHAR(255) NOT NULL COMMENT '修改前内容哈希',
  new_hash VARCHAR(255) COMMENT '修改后内容哈希',
  apply_status ENUM('pending', 'applied', 'skipped', 'conflicted') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  applied_at TIMESTAMP NULL,
  
  FOREIGN KEY (session_id) REFERENCES bulk_edit_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  INDEX idx_session_id (session_id),
  INDEX idx_case_id (case_id),
  INDEX idx_apply_status (apply_status)
) ENGINE=InnoDB COMMENT='AI修改提案表';
```

### 2.2 Prisma Schema 扩展

```prisma
// 添加到现有 schema.prisma
model case_versions {
  id         Int       @id @default(autoincrement())
  case_id    Int
  version    Int
  steps      Json?
  tags       Json?
  system     String?   @db.VarChar(100)
  module     String?   @db.VarChar(100)
  meta       Json?
  created_by Int?
  created_at DateTime? @default(now()) @db.Timestamp(0)
  test_cases test_cases @relation(fields: [case_id], references: [id], onDelete: Cascade)
  users      users?     @relation(fields: [created_by], references: [id], onDelete: SetNull)

  @@unique([case_id, version])
  @@index([case_id])
  @@index([created_at])
}

model bulk_edit_sessions {
  id              Int       @id @default(autoincrement())
  system          String    @db.VarChar(100)
  module          String    @db.VarChar(100)
  tag_filter      Json?
  priority_filter String?   @db.VarChar(50)
  change_brief    String    @db.Text
  status          bulk_edit_sessions_status @default(dry_run)
  created_by      Int
  created_at      DateTime? @default(now()) @db.Timestamp(0)
  applied_at      DateTime? @db.Timestamp(0)
  users           users     @relation(fields: [created_by], references: [id], onDelete: Cascade)
  proposals       case_patch_proposals[]

  @@index([created_by])
  @@index([status])
  @@index([created_at])
}

model case_patch_proposals {
  id             Int       @id @default(autoincrement())
  session_id     Int
  case_id        Int
  diff_json      Json
  ai_rationale   String?   @db.Text
  side_effects   Json?
  risk_level     proposal_risk_level @default(medium)
  recall_reason  String?   @db.VarChar(255)
  old_hash       String    @db.VarChar(255)
  new_hash       String?   @db.VarChar(255)
  apply_status   proposal_apply_status @default(pending)
  created_at     DateTime? @default(now()) @db.Timestamp(0)
  applied_at     DateTime? @db.Timestamp(0)
  session        bulk_edit_sessions @relation(fields: [session_id], references: [id], onDelete: Cascade)
  test_cases     test_cases @relation(fields: [case_id], references: [id], onDelete: Cascade)

  @@index([session_id])
  @@index([case_id])
  @@index([apply_status])
}

// 新增枚举类型
enum bulk_edit_sessions_status {
  dry_run
  applied
  cancelled
  failed
}

enum proposal_risk_level {
  low
  medium  
  high
}

enum proposal_apply_status {
  pending
  applied
  skipped
  conflicted
}

// 扩展现有模型
model test_cases {
  // ... 现有字段保持不变
  case_versions        case_versions[]
  patch_proposals      case_patch_proposals[]
}

model users {
  // ... 现有字段保持不变  
  case_versions        case_versions[]
  bulk_edit_sessions   bulk_edit_sessions[]
}
```

---

## 3. 后端服务设计

### 3.1 新增服务类架构

```typescript
// server/services/aiBulkUpdateService.ts
export class AIBulkUpdateService {
  constructor(
    private prisma: PrismaClient,
    private aiParser: AITestParser,
    private embedService: EmbeddingService,
    private wsManager: WebSocketManager
  ) {}

  // 干跑模式：生成修改提案
  async createBulkEditSession(params: BulkEditParams): Promise<SessionResult>
  
  // 应用选中的提案
  async applyProposals(sessionId: number, proposalIds: number[]): Promise<ApplyResult>
  
  // 回滚到指定版本
  async rollbackTestCase(caseId: number, toVersion: number): Promise<RollbackResult>
  
  // 获取会话详情
  async getSessionDetails(sessionId: number): Promise<SessionDetails>
}

// server/services/embeddingService.ts  
export class EmbeddingService {
  // 基于关键词和模块匹配相关用例
  async findRelevantTestCases(filters: TestCaseFilters): Promise<TestCase[]>
  
  // 计算用例内容相似度
  async calculateSimilarity(content1: string, content2: string): Promise<number>
}

// server/services/versionService.ts
export class VersionService {
  // 创建用例版本快照
  async createVersion(caseId: number, userId: number): Promise<CaseVersion>
  
  // 获取版本历史
  async getVersionHistory(caseId: number): Promise<CaseVersion[]>
  
  // 版本对比
  async compareVersions(caseId: number, v1: number, v2: number): Promise<VersionDiff>
}
```

### 3.2 API路由设计

```typescript
// server/routes/aiBulkUpdate.ts
export function aiBulkUpdateRoutes(): Router {
  const router = Router();
  
  // 权限中间件：仅管理员和QA主管可访问
  router.use(authMiddleware(['admin', 'qa_lead']));
  router.use(featureFlagMiddleware('FEATURE_AIBULK_UPDATE'));

  // POST /api/v1/ai-bulk/dry-run
  // 创建批量编辑会话，生成修改提案
  router.post('/dry-run', async (req, res) => {
    const { system, module, tagFilter, priorityFilter, changeBrief } = req.body;
    const result = await aiBulkService.createBulkEditSession({
      system, module, tagFilter, priorityFilter, changeBrief,
      userId: req.user.id
    });
    res.json({ ok: true, data: result });
  });

  // POST /api/v1/ai-bulk/apply  
  // 应用选中的修改提案
  router.post('/apply', async (req, res) => {
    const { sessionId, selectedProposals } = req.body;
    const result = await aiBulkService.applyProposals(sessionId, selectedProposals);
    res.json({ ok: true, data: result });
  });

  // POST /api/v1/ai-bulk/cancel
  // 取消整个会话
  router.post('/cancel', async (req, res) => {
    const { sessionId } = req.body;
    await aiBulkService.cancelSession(sessionId);
    res.json({ ok: true });
  });

  // GET /api/v1/ai-bulk/session/:id
  // 获取会话详情和进度
  router.get('/session/:id', async (req, res) => {
    const sessionId = parseInt(req.params.id);
    const details = await aiBulkService.getSessionDetails(sessionId);
    res.json({ ok: true, data: details });
  });

  return router;
}

// server/routes/testCase.ts (扩展现有路由)
// POST /api/testcases/:id/rollback
router.post('/:id/rollback', async (req, res) => {
  const { toVersion } = req.body;
  const caseId = parseInt(req.params.id);
  const result = await versionService.rollbackTestCase(caseId, toVersion);
  res.json({ ok: true, data: result });
});

// GET /api/testcases/:id/versions
router.get('/:id/versions', async (req, res) => {
  const caseId = parseInt(req.params.id);
  const versions = await versionService.getVersionHistory(caseId);
  res.json({ ok: true, data: versions });
});
```

### 3.3 中间件设计

```typescript
// server/middleware/featureFlag.ts
export const featureFlagMiddleware = (flagName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const flag = await prisma.feature_flags.findUnique({
      where: { flag_name: flagName }
    });
    
    if (!flag?.is_enabled) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Feature not available' 
      });
    }
    
    next();
  };
};

// server/middleware/auth.ts (扩展现有)
export const authMiddleware = (allowedRoles: string[] = []) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // 现有身份验证逻辑...
    
    // 角色权限检查
    if (allowedRoles.length > 0) {
      const userRoles = await getUserRoles(req.user.id);
      const hasPermission = allowedRoles.some(role => 
        userRoles.includes(role)
      );
      
      if (!hasPermission) {
        return res.status(403).json({
          ok: false,
          error: 'Insufficient permissions'
        });
      }
    }
    
    next();
  };
};
```

---

## 4. 前端实现设计

### 4.1 组件架构

```typescript
// src/pages/TestCases.tsx (扩展现有页面)
const TestCases: React.FC = () => {
  // 现有逻辑保持不变...
  
  // 新增：AI批量更新按钮（仅特定角色可见）
  const { hasPermission } = useAuth();
  const canUseBulkUpdate = hasPermission(['admin', 'qa_lead']) && 
                          useFeatureFlag('FEATURE_AIBULK_UPDATE');

  return (
    <Layout>
      {/* 现有UI保持不变 */}
      <div className="test-cases-header">
        <h1>测试用例管理</h1>
        <div className="action-buttons">
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            新建用例
          </Button>
          
          {/* 🔥 新增：AI批量更新入口 */}
          {canUseBulkUpdate && (
            <Button 
              variant="outline" 
              onClick={() => setShowBulkUpdateModal(true)}
              className="ai-bulk-button"
            >
              <Bot size={16} />
              AI 批量更新
            </Button>
          )}
        </div>
      </div>
      
      {/* AI批量更新模态框 */}
      <AIBulkUpdateModal 
        open={showBulkUpdateModal}
        onClose={() => setShowBulkUpdateModal(false)}
      />
    </Layout>
  );
};

// src/components/AIBulkUpdate/AIBulkUpdateModal.tsx
interface AIBulkUpdateModalProps {
  open: boolean;
  onClose: () => void;
}

export const AIBulkUpdateModal: React.FC<AIBulkUpdateModalProps> = ({ 
  open, onClose 
}) => {
  const [step, setStep] = useState<'form' | 'preview' | 'applying'>('form');
  const [session, setSession] = useState<BulkEditSession | null>(null);
  
  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="ai-bulk-update-modal">
        {step === 'form' && (
          <BulkUpdateForm 
            onSubmit={handleDryRun}
            onCancel={onClose}
          />
        )}
        
        {step === 'preview' && session && (
          <ProposalPreview
            session={session}
            onApply={handleApply}
            onBack={() => setStep('form')}
            onCancel={onClose}
          />
        )}
        
        {step === 'applying' && (
          <ApplyProgress
            sessionId={session?.id}
            onComplete={handleComplete}
          />
        )}
      </div>
    </Modal>
  );
};
```

### 4.2 核心组件实现

```typescript
// src/components/AIBulkUpdate/BulkUpdateForm.tsx
export const BulkUpdateForm: React.FC<BulkUpdateFormProps> = ({ 
  onSubmit, onCancel 
}) => {
  const [formData, setFormData] = useState<BulkUpdateFormData>({
    system: '',
    module: '',
    tagFilter: [],
    priorityFilter: '',
    changeBrief: ''
  });

  return (
    <div className="bulk-update-form">
      <h2>AI 批量更新用例</h2>
      
      {/* 范围选择 */}
      <div className="form-section">
        <h3>更新范围</h3>
        <div className="form-row">
          <Select
            label="目标系统"
            value={formData.system}
            onChange={(value) => setFormData({...formData, system: value})}
            options={systemOptions}
            required
          />
          <Select
            label="功能模块"
            value={formData.module}
            onChange={(value) => setFormData({...formData, module: value})}
            options={moduleOptions}
            required
          />
        </div>
        
        <MultiSelect
          label="标签筛选（可选）"
          value={formData.tagFilter}
          onChange={(tags) => setFormData({...formData, tagFilter: tags})}
          options={tagOptions}
        />
        
        <Select
          label="优先级筛选（可选）"
          value={formData.priorityFilter}
          onChange={(priority) => setFormData({...formData, priorityFilter: priority})}
          options={[
            { value: '', label: '全部' },
            { value: 'high', label: '高' },
            { value: 'medium', label: '中' },
            { value: 'low', label: '低' }
          ]}
        />
      </div>

      {/* 改动描述 */}
      <div className="form-section">
        <h3>改动描述</h3>
        <TextArea
          label="详细描述需要修改的内容"
          value={formData.changeBrief}
          onChange={(value) => setFormData({...formData, changeBrief: value})}
          placeholder="例如：登录成功后不再跳转首页，而是弹出欢迎模态窗口"
          rows={4}
          required
        />
        <p className="form-help">
          请详细描述功能变更，AI将基于此生成具体的用例修改建议
        </p>
      </div>

      <div className="form-actions">
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={() => onSubmit(formData)} disabled={!isFormValid()}>
          生成修改提案
        </Button>
      </div>
    </div>
  );
};

// src/components/AIBulkUpdate/ProposalPreview.tsx
export const ProposalPreview: React.FC<ProposalPreviewProps> = ({ 
  session, onApply, onBack, onCancel 
}) => {
  const [selectedProposals, setSelectedProposals] = useState<number[]>([]);
  const [expandedProposal, setExpandedProposal] = useState<number | null>(null);

  return (
    <div className="proposal-preview">
      <div className="preview-header">
        <h2>AI 修改提案预览</h2>
        <div className="session-info">
          <span className="system-module">{session.system} / {session.module}</span>
          <span className="proposal-count">
            共找到 {session.proposals.length} 条相关用例
          </span>
        </div>
      </div>

      {/* 批量操作 */}
      <div className="batch-actions">
        <CheckBox
          checked={selectedProposals.length === session.proposals.length}
          onChange={handleSelectAll}
          label={`全选 (${selectedProposals.length}/${session.proposals.length})`}
        />
        
        <div className="risk-filters">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => selectByRisk('low')}
          >
            仅选择低风险 ({getLowRiskCount()})
          </Button>
        </div>
      </div>

      {/* 提案列表 */}
      <div className="proposals-list">
        {session.proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            selected={selectedProposals.includes(proposal.id)}
            expanded={expandedProposal === proposal.id}
            onSelect={(selected) => handleProposalSelect(proposal.id, selected)}
            onExpand={() => toggleExpanded(proposal.id)}
          />
        ))}
      </div>

      <div className="preview-actions">
        <Button variant="outline" onClick={onBack}>
          返回修改
        </Button>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button 
          onClick={() => onApply(selectedProposals)}
          disabled={selectedProposals.length === 0}
          className="apply-button"
        >
          应用选中提案 ({selectedProposals.length})
        </Button>
      </div>
    </div>
  );
};
```

### 4.3 差异对比组件

```typescript
// src/components/AIBulkUpdate/DiffViewer.tsx
export const DiffViewer: React.FC<DiffViewerProps> = ({ proposal }) => {
  const { oldContent, newContent } = useMemo(() => {
    return applyJsonPatch(proposal.originalSteps, proposal.diff_json);
  }, [proposal]);

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <h4>修改对比</h4>
        <div className="diff-stats">
          <span className="additions">+{getAdditionCount(proposal.diff_json)}</span>
          <span className="deletions">-{getDeletionCount(proposal.diff_json)}</span>
        </div>
      </div>
      
      <div className="diff-content">
        <div className="diff-panel">
          <div className="panel-header">修改前</div>
          <CodeBlock language="json" code={JSON.stringify(oldContent, null, 2)} />
        </div>
        
        <div className="diff-panel">
          <div className="panel-header">修改后</div>
          <CodeBlock language="json" code={JSON.stringify(newContent, null, 2)} />
        </div>
      </div>
      
      <div className="diff-summary">
        <h5>修改说明</h5>
        <p>{proposal.ai_rationale}</p>
        
        {proposal.side_effects && proposal.side_effects.length > 0 && (
          <div className="side-effects">
            <h6>潜在影响</h6>
            <ul>
              {proposal.side_effects.map((effect, index) => (
                <li key={index} className={`effect-${effect.severity}`}>
                  {effect.description}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
```

### 4.4 版本历史组件

```typescript
// src/components/TestCase/VersionHistory.tsx
export const VersionHistory: React.FC<VersionHistoryProps> = ({ 
  caseId, onRollback 
}) => {
  const [versions, setVersions] = useState<CaseVersion[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<[number, number] | null>(null);

  return (
    <div className="version-history">
      <div className="version-header">
        <h3>版本历史</h3>
        <Button onClick={refreshVersions}>刷新</Button>
      </div>

      <div className="version-timeline">
        {versions.map((version) => (
          <div key={version.id} className="version-item">
            <div className="version-meta">
              <span className="version-number">v{version.version}</span>
              <span className="version-date">
                {formatDate(version.created_at)}
              </span>
              <span className="version-author">
                {version.created_by_name}
              </span>
            </div>
            
            <div className="version-actions">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => showVersionDiff(version.version)}
              >
                查看详情
              </Button>
              
              {version.version > 1 && (
                <Button
                  size="sm"
                  onClick={() => handleRollback(version.version)}
                  className="rollback-button"
                >
                  回滚到此版本
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 版本对比模态框 */}
      <VersionCompareModal
        open={showCompareModal}
        caseId={caseId}
        version1={selectedVersions?.[0]}
        version2={selectedVersions?.[1]}
        onClose={() => setShowCompareModal(false)}
      />
    </div>
  );
};
```

---

## 5. AI集成方案

### 5.1 LLM提示词模板

```typescript
// server/services/aiPromptTemplates.ts
export const AI_BULK_UPDATE_TEMPLATE = `
你是测试用例修改专家。基于用户的功能变更描述，对测试用例进行精确修改。

## 输入信息
- 功能变更描述：{changeBrief}
- 原始测试用例：{originalTestCase}
- 系统模块：{system}/{module}

## 输出要求
严格按照以下JSON格式输出，不要包含任何额外文本：

{
  "reasoning": "修改理由的详细说明",
  "patch": [
    {
      "op": "replace|add|remove",
      "path": "/steps/0/action",
      "value": "新的值"
    }
  ],
  "side_effects": [
    {
      "description": "可能的副作用描述",
      "severity": "low|medium|high"
    }
  ],
  "risk_level": "low|medium|high"
}

## 约束条件
1. 只能修改 /steps/* 和 /assertions/* 路径
2. 不得修改用例的基本结构
3. 确保修改后的用例逻辑完整
4. 风险评估要客观准确

## 示例变更
变更描述：登录成功后显示欢迎弹窗而不是跳转首页
原用例断言：页面跳转至首页
修改后断言：显示欢迎弹窗并包含用户名
`;

export const RECALL_RELEVANCE_TEMPLATE = `
判断测试用例是否与功能变更相关。

变更描述：{changeBrief}
测试用例：{testCaseTitle}
系统模块：{system}/{module}
用例标签：{tags}

输出格式：
{
  "is_relevant": true|false,
  "relevance_score": 0.0-1.0,
  "recall_reason": "命中原因说明"
}

相关性判断标准：
1. 关键词匹配：变更涉及的功能点
2. 模块匹配：相同系统/模块
3. 流程关联：上下游业务流程
4. 标签关联：相关业务标签
`;
```

### 5.2 AI服务集成

```typescript
// server/services/aiService.ts
export class AIService {
  constructor(
    private mcpClient: PlaywrightMcpClient,
    private aiParser: AITestParser
  ) {}

  async generateBulkUpdateProposals(
    params: BulkUpdateParams,
    targetCases: TestCase[]
  ): Promise<CasePatchProposal[]> {
    const proposals: CasePatchProposal[] = [];
    
    for (const testCase of targetCases) {
      // 1. 相关性判断
      const relevanceResult = await this.checkRelevance(params.changeBrief, testCase);
      if (!relevanceResult.is_relevant) {
        continue;
      }

      // 2. 生成修改提案
      const updateResult = await this.generateCaseUpdate(params.changeBrief, testCase);
      if (!updateResult.patch || updateResult.patch.length === 0) {
        continue;
      }

      // 3. 计算内容哈希
      const oldHash = this.calculateHash(testCase.steps);
      const newSteps = this.applyJsonPatch(testCase.steps, updateResult.patch);
      const newHash = this.calculateHash(newSteps);

      proposals.push({
        case_id: testCase.id,
        diff_json: updateResult.patch,
        ai_rationale: updateResult.reasoning,
        side_effects: updateResult.side_effects,
        risk_level: updateResult.risk_level,
        recall_reason: relevanceResult.recall_reason,
        old_hash: oldHash,
        new_hash: newHash,
        apply_status: 'pending'
      });
    }

    return proposals;
  }

  private async checkRelevance(
    changeBrief: string, 
    testCase: TestCase
  ): Promise<RelevanceResult> {
    const prompt = RECALL_RELEVANCE_TEMPLATE
      .replace('{changeBrief}', changeBrief)
      .replace('{testCaseTitle}', testCase.title)
      .replace('{system}', testCase.system || '')
      .replace('{module}', testCase.module || '')
      .replace('{tags}', JSON.stringify(testCase.tags));

    const result = await this.aiParser.parseWithRetry(prompt);
    return JSON.parse(result);
  }

  private async generateCaseUpdate(
    changeBrief: string,
    testCase: TestCase
  ): Promise<UpdateResult> {
    const prompt = AI_BULK_UPDATE_TEMPLATE
      .replace('{changeBrief}', changeBrief)
      .replace('{originalTestCase}', JSON.stringify(testCase.steps, null, 2))
      .replace('{system}', testCase.system || '')
      .replace('{module}', testCase.module || '');

    const result = await this.aiParser.parseWithRetry(prompt);
    return JSON.parse(result);
  }

  private applyJsonPatch(original: any, patches: JsonPatch[]): any {
    // JSON Patch 应用逻辑
    let result = JSON.parse(JSON.stringify(original));
    
    for (const patch of patches) {
      switch (patch.op) {
        case 'replace':
          this.setValueByPath(result, patch.path, patch.value);
          break;
        case 'add':
          this.addValueByPath(result, patch.path, patch.value);
          break;
        case 'remove':
          this.removeValueByPath(result, patch.path);
          break;
      }
    }
    
    return result;
  }

  private calculateHash(content: any): string {
    const crypto = require('crypto');
    const contentStr = JSON.stringify(content);
    return crypto.createHash('sha256').update(contentStr).digest('hex');
  }
}
```

---

## 6. 安全与监控方案

### 6.1 权限控制

```typescript
// server/middleware/permissions.ts
export class PermissionService {
  static readonly BULK_UPDATE_PERMISSIONS = ['admin', 'qa_lead'];
  
  static async checkBulkUpdatePermission(userId: number): Promise<boolean> {
    const userRoles = await prisma.user_roles.findMany({
      where: { user_id: userId },
      include: { roles: true }
    });
    
    return userRoles.some(ur => 
      this.BULK_UPDATE_PERMISSIONS.includes(ur.roles.name)
    );
  }

  static async logBulkUpdateAction(
    userId: number,
    action: string,
    targetType: string,
    targetId: number,
    meta: any
  ): Promise<void> {
    await prisma.audit_logs.create({
      data: {
        user_id: userId,
        action,
        target_type: targetType,
        target_id: targetId,
        meta: JSON.stringify(meta),
        created_at: new Date()
      }
    });
  }
}

// 审计日志示例
const auditActions = {
  BULK_SESSION_CREATED: 'bulk_session_created',
  BULK_PROPOSALS_APPLIED: 'bulk_proposals_applied', 
  BULK_SESSION_CANCELLED: 'bulk_session_cancelled',
  TEST_CASE_ROLLBACK: 'test_case_rollback'
};
```

### 6.2 功能开关管理

```typescript
// server/services/featureFlagService.ts
export class FeatureFlagService {
  static async initializeBulkUpdateFlag(): Promise<void> {
    await prisma.feature_flags.upsert({
      where: { flag_name: 'FEATURE_AIBULK_UPDATE' },
      update: {},
      create: {
        flag_name: 'FEATURE_AIBULK_UPDATE',
        is_enabled: false, // 默认关闭
        rollout_percentage: 0,
        updated_at: new Date()
      }
    });
  }

  static async enableBulkUpdate(rolloutPercentage: number = 100): Promise<void> {
    await prisma.feature_flags.update({
      where: { flag_name: 'FEATURE_AIBULK_UPDATE' },
      data: {
        is_enabled: true,
        rollout_percentage,
        updated_at: new Date()
      }
    });
  }

  static async isFeatureEnabled(
    flagName: string, 
    userId?: number
  ): Promise<boolean> {
    const flag = await prisma.feature_flags.findUnique({
      where: { flag_name: flagName }
    });

    if (!flag?.is_enabled) return false;
    
    // 灰度发布逻辑
    if (flag.rollout_percentage < 100 && userId) {
      const hash = require('crypto')
        .createHash('md5')
        .update(`${flagName}_${userId}`)
        .digest('hex');
      const hashNum = parseInt(hash.substring(0, 8), 16);
      const percentage = (hashNum % 100) + 1;
      return percentage <= flag.rollout_percentage;
    }

    return true;
  }
}
```

### 6.3 性能监控

```typescript
// server/services/monitoringService.ts
export class MonitoringService {
  static async logBulkUpdateMetrics(
    sessionId: number,
    metrics: BulkUpdateMetrics
  ): Promise<void> {
    await prisma.job_logs.create({
      data: {
        job_name: `bulk_update_session_${sessionId}`,
        status: metrics.success ? 'SUCCESS' : 'FAILED',
        message: JSON.stringify({
          totalCases: metrics.totalCases,
          relevantCases: metrics.relevantCases,
          appliedChanges: metrics.appliedChanges,
          duration: metrics.duration,
          aiTokenUsed: metrics.aiTokenUsed,
          errorCount: metrics.errorCount
        }),
        started_at: metrics.startTime,
        ended_at: metrics.endTime
      }
    });
  }

  static async trackAIUsage(
    sessionId: number,
    promptId: number,
    tokenUsed: number,
    costUsd: number
  ): Promise<void> {
    await prisma.ai_runs.create({
      data: {
        prompt_id: promptId,
        run_id: sessionId,
        token_used: tokenUsed,
        cost_usd: costUsd,
        executed_at: new Date()
      }
    });
  }
}
```

---

## 7. 部署与运维

### 7.1 数据库迁移

```sql
-- migrations/20250823_add_bulk_update_tables.sql
-- 执行顺序：开发环境 -> 测试环境 -> 生产环境

START TRANSACTION;

-- 1. 创建新表
CREATE TABLE IF NOT EXISTS case_versions (
  -- [完整建表语句见第2节]
);

CREATE TABLE IF NOT EXISTS bulk_edit_sessions (
  -- [完整建表语句见第2节]  
);

CREATE TABLE IF NOT EXISTS case_patch_proposals (
  -- [完整建表语句见第2节]
);

-- 2. 初始化功能开关
INSERT INTO feature_flags (flag_name, is_enabled, rollout_percentage, updated_at) 
VALUES ('FEATURE_AIBULK_UPDATE', FALSE, 0, NOW())
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- 3. 为现有用例创建初始版本
INSERT INTO case_versions (case_id, version, steps, tags, system, module, created_by, created_at)
SELECT id, 1, steps, tags, system, module, NULL, created_at 
FROM test_cases
WHERE NOT EXISTS (
  SELECT 1 FROM case_versions WHERE case_id = test_cases.id AND version = 1
);

COMMIT;
```

### 7.2 环境配置

```typescript
// 环境变量配置
interface BulkUpdateConfig {
  FEATURE_AIBULK_UPDATE_ENABLED: boolean;
  BULK_UPDATE_MAX_CASES_PER_SESSION: number; // 默认50
  BULK_UPDATE_MAX_PROPOSALS_PER_APPLY: number; // 默认10  
  AI_BULK_UPDATE_TIMEOUT: number; // 默认300秒
  EMBEDDING_SERVICE_URL?: string;
  AI_MODEL_BULK_UPDATE: string; // 默认使用现有AI配置
}

// server/config/bulkUpdate.ts
export const bulkUpdateConfig: BulkUpdateConfig = {
  FEATURE_AIBULK_UPDATE_ENABLED: process.env.NODE_ENV !== 'production',
  BULK_UPDATE_MAX_CASES_PER_SESSION: parseInt(process.env.BULK_UPDATE_MAX_CASES_PER_SESSION || '50'),
  BULK_UPDATE_MAX_PROPOSALS_PER_APPLY: parseInt(process.env.BULK_UPDATE_MAX_PROPOSALS_PER_APPLY || '10'),
  AI_BULK_UPDATE_TIMEOUT: parseInt(process.env.AI_BULK_UPDATE_TIMEOUT || '300'),
  EMBEDDING_SERVICE_URL: process.env.EMBEDDING_SERVICE_URL,
  AI_MODEL_BULK_UPDATE: process.env.AI_MODEL_BULK_UPDATE || 'claude-3-sonnet'
};
```

### 7.3 监控告警

```typescript
// server/monitors/bulkUpdateMonitor.ts
export class BulkUpdateMonitor {
  static async setupHealthChecks(): Promise<void> {
    // 检查功能开关状态
    setInterval(async () => {
      const flag = await prisma.feature_flags.findUnique({
        where: { flag_name: 'FEATURE_AIBULK_UPDATE' }
      });
      
      console.log(`[Monitor] Bulk Update Feature: ${flag?.is_enabled ? 'ON' : 'OFF'}`);
    }, 60000); // 每分钟检查

    // 检查会话状态
    setInterval(async () => {
      const staleSessions = await prisma.bulk_edit_sessions.findMany({
        where: {
          status: 'dry_run',
          created_at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      });

      if (staleSessions.length > 0) {
        console.warn(`[Monitor] Found ${staleSessions.length} stale sessions`);
        // 可选：自动清理或发送告警
      }
    }, 3600000); // 每小时检查
  }

  static async alertOnError(error: Error, context: any): Promise<void> {
    console.error('[BulkUpdate] Error occurred:', error.message, context);
    
    // 记录错误日志
    await prisma.job_logs.create({
      data: {
        job_name: 'bulk_update_error',
        status: 'FAILED',
        message: JSON.stringify({
          error: error.message,
          stack: error.stack,
          context
        }),
        started_at: new Date(),
        ended_at: new Date()
      }
    });
  }
}
```

---

## 8. 测试策略

### 8.1 单元测试

```typescript
// server/services/__tests__/aiBulkUpdateService.test.ts
describe('AIBulkUpdateService', () => {
  let service: AIBulkUpdateService;
  let mockPrisma: MockPrismaClient;
  
  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    service = new AIBulkUpdateService(mockPrisma, mockAI, mockEmbedding, mockWS);
  });

  describe('createBulkEditSession', () => {
    it('should create session and generate proposals', async () => {
      // 准备测试数据
      const params = {
        system: '电商系统',
        module: '登录',
        changeBrief: '登录后显示欢迎弹窗',
        userId: 1
      };

      mockPrisma.test_cases.findMany.mockResolvedValue([
        { id: 1, title: '登录测试', steps: [...], system: '电商系统', module: '登录' }
      ]);

      // 执行测试
      const result = await service.createBulkEditSession(params);

      // 验证结果
      expect(result.sessionId).toBeDefined();
      expect(result.proposals).toHaveLength(1);
      expect(mockPrisma.bulk_edit_sessions.create).toHaveBeenCalled();
    });

    it('should handle no relevant cases found', async () => {
      mockPrisma.test_cases.findMany.mockResolvedValue([]);
      
      const result = await service.createBulkEditSession(validParams);
      
      expect(result.proposals).toHaveLength(0);
      expect(result.sessionId).toBeDefined();
    });
  });

  describe('applyProposals', () => {
    it('should apply selected proposals and create versions', async () => {
      const sessionId = 123;
      const proposalIds = [1, 2];
      
      // Mock数据准备
      mockPrisma.case_patch_proposals.findMany.mockResolvedValue([
        { id: 1, case_id: 10, diff_json: [...], apply_status: 'pending' },
        { id: 2, case_id: 11, diff_json: [...], apply_status: 'pending' }
      ]);

      const result = await service.applyProposals(sessionId, proposalIds);

      expect(result.appliedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(mockPrisma.case_versions.createMany).toHaveBeenCalled();
    });
  });
});
```

### 8.2 集成测试

```typescript
// server/__tests__/integration/bulkUpdate.integration.test.ts
describe('Bulk Update Integration', () => {
  let app: Express;
  let testDb: PrismaClient;
  
  beforeAll(async () => {
    // 设置测试数据库和应用
    testDb = await setupTestDatabase();
    app = await createTestApp();
  });

  describe('POST /api/v1/ai-bulk/dry-run', () => {
    it('should create session with valid permissions', async () => {
      const user = await createTestUser(['admin']);
      const token = generateTestToken(user);

      const response = await request(app)
        .post('/api/v1/ai-bulk/dry-run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          system: '测试系统',
          module: '测试模块',
          changeBrief: '测试变更描述'
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.data.sessionId).toBeDefined();
    });

    it('should reject without proper permissions', async () => {
      const user = await createTestUser(['user']); // 普通用户
      const token = generateTestToken(user);

      const response = await request(app)
        .post('/api/v1/ai-bulk/dry-run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          system: '测试系统',
          module: '测试模块',
          changeBrief: '测试变更描述'
        });

      expect(response.status).toBe(403);
      expect(response.body.ok).toBe(false);
    });

    it('should reject when feature flag is disabled', async () => {
      // 关闭功能开关
      await testDb.feature_flags.update({
        where: { flag_name: 'FEATURE_AIBULK_UPDATE' },
        data: { is_enabled: false }
      });

      const user = await createTestUser(['admin']);
      const token = generateTestToken(user);

      const response = await request(app)
        .post('/api/v1/ai-bulk/dry-run')
        .set('Authorization', `Bearer ${token}`)
        .send(validRequest);

      expect(response.status).toBe(404);
    });
  });
});
```

### 8.3 端到端测试

```typescript
// tests/e2e/bulkUpdate.e2e.test.ts
describe('Bulk Update E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  it('should complete full bulk update workflow', async () => {
    // 1. 导航到测试用例页面
    await page.goto('/test-cases');
    
    // 2. 点击AI批量更新按钮
    await page.click('[data-testid="ai-bulk-update-button"]');
    
    // 3. 填写更新表单
    await page.fill('[data-testid="system-select"]', '电商系统');
    await page.fill('[data-testid="module-select"]', '登录');
    await page.fill('[data-testid="change-brief"]', '登录后显示欢迎弹窗');
    
    // 4. 生成提案
    await page.click('[data-testid="generate-proposals"]');
    await page.waitForSelector('[data-testid="proposal-list"]');
    
    // 5. 选择提案
    await page.click('[data-testid="proposal-1"] [data-testid="proposal-checkbox"]');
    
    // 6. 应用更改
    await page.click('[data-testid="apply-proposals"]');
    await page.waitForSelector('[data-testid="apply-success"]');
    
    // 7. 验证结果
    const successMessage = await page.textContent('[data-testid="apply-success"]');
    expect(successMessage).toContain('应用成功');
  });

  it('should support rollback functionality', async () => {
    // 准备：先执行一次批量更新
    await performBulkUpdate(page);
    
    // 1. 进入测试用例详情
    await page.goto('/test-cases/1');
    
    // 2. 打开版本历史
    await page.click('[data-testid="version-history-tab"]');
    
    // 3. 回滚到上一版本
    await page.click('[data-testid="rollback-to-v1"]');
    await page.click('[data-testid="confirm-rollback"]');
    
    // 4. 验证回滚成功
    await page.waitForSelector('[data-testid="rollback-success"]');
    const versionInfo = await page.textContent('[data-testid="current-version"]');
    expect(versionInfo).toContain('v1');
  });
});
```

---

## 9. 验收标准

### 9.1 功能验收
- [x] **权限控制**: 仅admin/qa_lead角色可见AI批量更新入口
- [x] **功能开关**: FEATURE_AIBULK_UPDATE开关控制功能启停
- [x] **干跑模式**: 支持预览修改提案，不直接应用
- [x] **选择性应用**: 支持逐条选择应用修改提案  
- [x] **版本控制**: 每次应用前自动创建版本快照
- [x] **一键回滚**: 支持回滚到任意历史版本
- [x] **审计日志**: 完整记录所有操作日志

### 9.2 性能验收
- [x] **响应时间**: 干跑生成提案 < 30秒
- [x] **批量限制**: 单次处理用例数 ≤ 50条
- [x] **应用限制**: 单次应用提案数 ≤ 10条
- [x] **资源控制**: AI调用超时设置 ≤ 300秒

### 9.3 安全验收
- [x] **数据隔离**: 新增表完全独立，不影响现有业务
- [x] **权限验证**: API层严格权限验证
- [x] **操作审计**: 所有关键操作记录audit_logs
- [x] **回滚保护**: 版本数据不可删除，确保回滚路径

### 9.4 兼容性验收
- [x] **现有功能**: test_cases/test_runs等现有功能完全正常
- [x] **API兼容**: 现有API接口无任何变更
- [x] **前端兼容**: 现有页面功能无影响
- [x] **数据完整**: 现有数据完整性保持不变

---

## 10. 上线计划

### 10.1 阶段性发布

**Phase 1: 基础设施 (Week 1-2)**
- 数据库表创建和迁移
- 后端服务框架搭建
- 权限和功能开关实现
- 基础API开发

**Phase 2: 核心功能 (Week 3-4)**  
- AI集成和提案生成
- 干跑模式实现
- 版本控制系统
- 前端基础UI

**Phase 3: 高级功能 (Week 5-6)**
- 批量应用逻辑
- 回滚功能实现
- 差异对比界面
- 完整前端交互

**Phase 4: 测试优化 (Week 7-8)**
- 完整测试套件
- 性能优化
- 监控告警
- 文档完善

### 10.2 风险控制

```typescript
// 渐进式发布策略
const rolloutPlan = {
  week1: { enabled: false }, // 仅开发环境
  week2: { enabled: true, users: ['admin'], percentage: 0 },
  week3: { enabled: true, users: ['admin', 'qa_lead'], percentage: 10 },
  week4: { enabled: true, users: ['admin', 'qa_lead'], percentage: 50 },
  week5: { enabled: true, users: ['admin', 'qa_lead'], percentage: 100 }
};

// 应急回滚预案
const emergencyRollback = {
  level1: 'Disable feature flag', // 关闭功能开关
  level2: 'Block API endpoints',   // 阻断API访问
  level3: 'Database rollback'      // 数据库回滚（极端情况）
};
```

### 10.3 成功指标

```typescript
interface SuccessMetrics {
  adoption: {
    activeUsers: number;      // 活跃用户数
    sessionsPerWeek: number; // 每周会话数
  };
  quality: {
    proposalAccuracy: number;  // 提案准确率 >80%
    userSatisfaction: number;  // 用户满意度 >4.0/5.0
  };
  performance: {
    avgResponseTime: number;   // 平均响应时间 <30s
    systemStability: number;   // 系统稳定性 >99.9%
  };
  business: {
    timeReduction: number;     // 用例维护时间减少 >50%
    errorReduction: number;    // 手动维护错误减少 >30%
  };
}
```

---

## 总结

这个技术方案完全基于您现有的系统架构，采用增量式开发方式，确保零风险上线。核心特点包括：

1. **完全兼容**: 不修改任何现有表结构和API
2. **安全可控**: 多层权限控制+功能开关+审计日志  
3. **渐进发布**: 灰度发布+应急回滚+监控告警
4. **用户友好**: 直观的UI交互+完整的版本管理
5. **技术先进**: 基于AI的智能提案+JSON Patch精确修改

该方案可以立即开始实施，预计8周内完成全部功能开发和上线。