import React from 'react';
import { Modal, Tabs, Tag, Table } from 'antd';
import { 
  QuestionCircleOutlined, 
  ThunderboltOutlined, 
  RobotOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  EyeOutlined
} from '@ant-design/icons';

interface ExecutionEngineGuideProps {
  visible: boolean;
  onClose: () => void;
}

const ExecutionEngineGuide: React.FC<ExecutionEngineGuideProps> = ({ visible, onClose }) => {
  // 阻止父弹窗（Radix Dialog）关闭
  React.useEffect(() => {
    if (!visible) return;
    
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      
      // 检查点击是否发生在当前 Modal 的区域内
      const modalContent = target.closest('.ant-modal-content');
      const modalMask = target.closest('.ant-modal-wrap');
      
      // 只有点击在 Modal 内容或遮罩上时才阻止
      if (modalContent || modalMask) {
        e.stopImmediatePropagation();
      }
    };
    
    // 处理 ESC 键关闭 - 在 window 上监听，使用捕获阶段优先执行
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    };
    
    document.addEventListener('pointerdown', handlePointerDown, true);
    // 在 window 上监听，捕获阶段，优先于父弹窗的监听器
    window.addEventListener('keydown', handleKeyDown, true);
    
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [visible, onClose]);

  // 性能对比数据
  const performanceData = [
    {
      key: '1',
      scenario: '10步简单测试',
      mcp: '35-60秒',
      playwright: '3-8秒',
      midscene: '8-15秒',
      improvement: 'Playwright最快'
    },
    {
      key: '3',
      scenario: '50步回归测试',
      mcp: '175-300秒',
      playwright: '15-40秒',
      midscene: '40-75秒',
      improvement: 'Playwright最快'
    },
    {
      key: '2',
      scenario: '20步复杂测试',
      mcp: '70-120秒',
      playwright: '6-16秒',
      midscene: '16-30秒',
      improvement: 'Playwright最快'
    }
  ];

  const performanceColumns = [
    { title: '测试场景', dataIndex: 'scenario', key: 'scenario' },
    { title: 'MCP客户端', dataIndex: 'mcp', key: 'mcp' },
    { title: 'Midscene Runner', dataIndex: 'midscene', key: 'midscene' },
    { title: 'Playwright Runner', dataIndex: 'playwright', key: 'playwright' },
    { 
      title: '性能对比', 
      dataIndex: 'improvement', 
      key: 'improvement',
      render: (text: string) => <Tag color="green">{text}</Tag>
    }
  ];

  // 功能对比数据
  const featureData = [
    {
      key: '1',
      feature: '执行速度',
      mcp: { status: 'warning', text: '较慢（3-6秒/步）' },
      midscene: { status: 'warning', text: '中等（1-2秒/步）' },
      playwright: { status: 'success', text: '快速（<1秒/步）' }
    },
    {
      key: '2',
      feature: 'AI调用频率',
      mcp: { status: 'error', text: '高频（每步都调用）' },
      midscene: { status: 'warning', text: '中频（视觉识别时）' },
      playwright: { status: 'success', text: '低频（仅失败时）' },
    },
    {
      key: '3',
      feature: '成本',
      mcp: { status: 'error', text: '高（大量API调用）' },
      midscene: { status: 'warning', text: '中等（节省70%）' },
      playwright: { status: 'success', text: '低（节省95%）' },
    },
    {
      key: '4',
      feature: '适应性',
      mcp: { status: 'success', text: '强（动态适应）' },
      midscene: { status: 'success', text: '强（AI视觉识别）' },
      playwright: { status: 'warning', text: '中等（预定义）' },
    },
    {
      key: '5',
      feature: '调试能力',
      mcp: { status: 'warning', text: '中等（MCP协议）' },
      midscene: { status: 'success', text: '强（Trace/Video）' },
      playwright: { status: 'success', text: '强（Trace/Video）' },
    },
    {
      key: '6',
      feature: '稳定性',
      mcp: { status: 'warning', text: '依赖AI稳定性' },
      midscene: { status: 'warning', text: '依赖AI视觉' },
      playwright: { status: 'success', text: '高（确定性）' },
    },
    {
      key: '7',
      feature: '元素定位',
      mcp: { status: 'success', text: '文本描述' },
      midscene: { status: 'success', text: 'AI视觉识别' },
      playwright: { status: 'warning', text: 'CSS选择器' },
    }
  ];

  const featureColumns = [
    { title: '功能维度', dataIndex: 'feature', key: 'feature', width: 150 },
    { 
      title: 'MCP客户端', 
      dataIndex: 'mcp', 
      key: 'mcp',
      render: (value: any) => (
        <div className="flex items-center gap-2">
          {value.status === 'success' && <CheckCircleOutlined className="text-green-500" />}
          {value.status === 'warning' && <WarningOutlined className="text-yellow-500" />}
          {value.status === 'error' && <CloseCircleOutlined className="text-red-500" />}
          <span>{value.text}</span>
        </div>
      )
    },
    { 
      title: 'Midscene Runner', 
      dataIndex: 'midscene', 
      key: 'midscene',
      render: (value: any) => (
        <div className="flex items-center gap-2">
          {value.status === 'success' && <CheckCircleOutlined className="text-green-500" />}
          {value.status === 'warning' && <WarningOutlined className="text-yellow-500" />}
          {value.status === 'error' && <CloseCircleOutlined className="text-red-500" />}
          <span>{value.text}</span>
        </div>
      )
    },
    { 
      title: 'Playwright Runner', 
      dataIndex: 'playwright', 
      key: 'playwright',
      render: (value: any) => (
        <div className="flex items-center gap-2">
          {value.status === 'success' && <CheckCircleOutlined className="text-green-500" />}
          {value.status === 'warning' && <WarningOutlined className="text-yellow-500" />}
          {value.status === 'error' && <CloseCircleOutlined className="text-red-500" />}
          <span>{value.text}</span>
        </div>
      )
    },
  ];

  // 使用场景推荐
  const scenarioRecommendations = [
    {
      title: '探索新功能',
      engine: 'MCP客户端',
      icon: <RobotOutlined className="text-purple-500" />,
      reasons: ['AI自动适应页面变化', '无需预定义选择器', '自然语言驱动']
    },
    {
      title: '动态页面测试',
      engine: 'Midscene Runner',
      icon: <EyeOutlined className="text-purple-500" />,
      reasons: ['AI视觉识别元素', '智能缓存提升性能', '平衡速度与适应性']
    },
    {
      title: '快速回归测试',
      engine: 'Playwright Runner',
      icon: <ThunderboltOutlined className="text-blue-500" />,
      reasons: ['执行速度快5-10倍', '成本低95%', '适合CI/CD集成']
    },
    {
      title: '复杂页面交互',
      engine: 'MCP客户端',
      icon: <RobotOutlined className="text-blue-500" />,
      reasons: ['智能元素匹配', '适应页面结构变化', 'AI闭环执行']
    },
    {
      title: '重复执行场景',
      engine: 'Midscene Runner',
      icon: <EyeOutlined className="text-purple-500" />,
      reasons: ['首次执行建立缓存', '后续执行接近Playwright速度', '节省70%成本']
    },
    {
      title: '稳定项目测试',
      engine: 'Playwright Runner',
      icon: <CheckCircleOutlined className="text-green-500" />,
      reasons: ['高性能确定性执行', '详细的Trace调试', '低成本运行']
    },
  ];

  const tabItems = [
    {
      key: '1',
      label: (
        <span className="flex items-center gap-2">
          <FileTextOutlined />
          概述对比
        </span>
      ),
      children: (
        <div className="space-y-6">
          {/* 核心特点对比 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
              <div className="flex items-center gap-2 mb-3">
                <RobotOutlined className="text-2xl text-blue-600" />
                <h3 className="text-lg font-semibold text-blue-900">MCP客户端</h3>
              </div>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-start gap-2">
                  <span className="text-blue-600">•</span>
                  <span>AI实时解析每个测试步骤</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-600">•</span>
                  <span>动态适应页面变化</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-600">•</span>
                  <span>基于页面快照的智能决策</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-600">•</span>
                  <span>自然语言驱动</span>
                </div>
              </div>
            </div>

            <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
              <div className="flex items-center gap-2 mb-3">
                <EyeOutlined className="text-2xl text-purple-600" />
                <h3 className="text-lg font-semibold text-purple-900">Midscene Runner</h3>
              </div>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-start gap-2">
                  <span className="text-purple-600">•</span>
                  <span>AI视觉识别元素定位</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-600">•</span>
                  <span>智能缓存机制（Plan+Locate）</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-600">•</span>
                  <span>支持Trace和Video录制</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-600">•</span>
                  <span>平衡性能与适应性</span>
                </div>
              </div>
            </div>

            <div className="border border-green-200 rounded-lg p-4 bg-green-50">
              <div className="flex items-center gap-2 mb-3">
                <ThunderboltOutlined className="text-2xl text-green-600" />
                <h3 className="text-lg font-semibold text-green-900">Playwright Runner</h3>
              </div>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-start gap-2">
                  <span className="text-green-600">•</span>
                  <span>原生Playwright API直接控制</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600">•</span>
                  <span>支持Trace和Video录制</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600">•</span>
                  <span>高性能确定性执行</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600">•</span>
                  <span>多种元素定位策略</span>
                </div>
              </div>
            </div>
          </div>

          {/* 工作流程对比 */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="text-md font-semibold mb-3 text-gray-800">工作流程对比</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="font-medium text-blue-700 mb-2">MCP客户端流程：</div>
                <div className="space-y-1 text-gray-600">
                  <div>1. 获取页面快照 (1-2秒)</div>
                  <div>2. AI实时解析步骤 (2-3秒)</div>
                  <div>3. 生成MCP命令</div>
                  <div>4. 执行命令 (0.5-1秒)</div>
                  <div>5. 循环下一步</div>
                  <div className="text-blue-600 font-medium mt-2">总计：3.5-6秒/步</div>
                </div>
              </div>
              <div>
                <div className="font-medium text-purple-700 mb-2">Midscene Runner流程：</div>
                <div className="space-y-1 text-gray-600">
                  <div>1. AI生成操作计划 (首次2-3秒)</div>
                  <div>2. AI定位元素 (首次1-2秒)</div>
                  <div>3. 执行操作 (0.3-0.5秒)</div>
                  <div>4. 缓存Plan+Locate结果</div>
                  <div>5. 重复执行直接用缓存</div>
                  <div className="text-purple-600 font-medium mt-2">首次：3-5秒/步</div>
                  <div className="text-purple-600 font-medium">缓存后：0.3-0.5秒/步</div>
                </div>
              </div>
              <div>
                <div className="font-medium text-green-700 mb-2">Playwright Runner流程：</div>
                <div className="space-y-1 text-gray-600">
                  <div>1. 一次性解析所有步骤 (&lt;0.1秒)</div>
                  <div>2. 顺序直接执行 (0.3-0.8秒)</div>
                  <div>3. 失败时才调用AI辅助</div>
                  <div className="text-green-600 font-medium mt-2">总计：0.3-0.8秒/步</div>
                  <div className="text-gray-500 text-xs mt-1">（失败重试时2-3秒）</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      key: '2',
      label: (
        <span className="flex items-center gap-2">
          <ClockCircleOutlined />
          性能对比
        </span>
      ),
      children: (
        <div className="space-y-4">
          <Table 
            dataSource={performanceData} 
            columns={performanceColumns}
            pagination={false}
            size="small"
          />
          
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <CheckCircleOutlined className="text-green-600 text-lg mt-0.5" />
              <div>
                <div className="font-semibold text-green-900 mb-1">性能优势总结</div>
                <div className="text-sm text-gray-700 space-y-1">
                  <div>• Playwright Runner 执行速度快 <strong>5-15倍</strong></div>
                  <div>• 适合大规模回归测试和CI/CD集成</div>
                  <div>• 资源占用更低，可并发执行更多测试</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      key: '3',
      label: (
        <span className="flex items-center gap-2">
          <CheckCircleOutlined />
          功能对比
        </span>
      ),
      children: (
        <div className="space-y-4">
          <Table 
            dataSource={featureData} 
            columns={featureColumns}
            pagination={false}
            size="small"
          />
        </div>
      )
    },
    {
      key: '4',
      label: (
        <span className="flex items-center gap-2">
          <DollarOutlined />
          成本分析
        </span>
      ),
      children: (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-red-200 rounded-lg p-4 bg-red-50">
              <div className="text-lg font-semibold text-red-900 mb-2">MCP客户端成本</div>
              <div className="space-y-2 text-sm text-gray-700">
                <div>10步测试用例：</div>
                <div className="ml-4 space-y-1">
                  <div>• AI调用：10次（每步1次）</div>
                  <div>• 每次输入：~2000 tokens</div>
                  <div>• 每次输出：~200 tokens</div>
                </div>
                <div className="mt-3 pt-3 border-t border-red-200">
                  <div className="font-semibold text-red-700">成本：$0.07 / 次执行</div>
                  <div className="text-xs text-gray-600 mt-1">月度1000次：$70</div>
                </div>
              </div>
            </div>

            <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
              <div className="text-lg font-semibold text-purple-900 mb-2">Midscene Runner成本</div>
              <div className="space-y-2 text-sm text-gray-700">
                <div>10步测试用例（首次）：</div>
                <div className="ml-4 space-y-1">
                  <div>• AI调用：3次（Plan+Locate+Assert）</div>
                  <div>• 每次输入：~2000 tokens</div>
                  <div>• 每次输出：~200 tokens</div>
                </div>
                <div className="mt-2">
                  <div>重复执行（缓存命中）：</div>
                  <div className="ml-4 space-y-1">
                    <div>• AI调用：1次（仅Assert）</div>
                    <div>• Plan+Locate使用缓存</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-purple-200">
                  <div className="font-semibold text-purple-700">首次：$0.021 / 次执行</div>
                  <div className="font-semibold text-purple-700">缓存后：$0.007 / 次执行</div>
                  <div className="text-xs text-gray-600 mt-1">月度1000次（50%缓存）：$14</div>
                </div>
              </div>
            </div>

            <div className="border border-green-200 rounded-lg p-4 bg-green-50">
              <div className="text-lg font-semibold text-green-900 mb-2">Playwright Runner成本</div>
              <div className="space-y-2 text-sm text-gray-700">
                <div>10步测试用例：</div>
                <div className="ml-4 space-y-1">
                  <div>• AI调用：0.5次（仅失败时）</div>
                  <div>• 每次输入：~2000 tokens</div>
                  <div>• 每次输出：~200 tokens</div>
                </div>
                <div className="mt-3 pt-3 border-t border-green-200">
                  <div className="font-semibold text-green-700">成本：$0.0035 / 次执行</div>
                  <div className="text-xs text-gray-600 mt-1">月度1000次：$3.5</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <DollarOutlined className="text-purple-600 text-lg mt-0.5" />
                <div>
                  <div className="font-semibold text-purple-900 mb-1">Midscene 成本优势</div>
                  <div className="text-sm text-gray-700 space-y-1">
                    <div>• 相比 MCP：节省 <strong className="text-purple-700">70-80%</strong> 成本（缓存命中时）</div>
                    <div>• 相比 Playwright：增加 <strong className="text-purple-700">100-200%</strong> 成本</div>
                    <div>• 适合：页面结构不稳定但有重复执行的场景</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <DollarOutlined className="text-green-600 text-lg mt-0.5" />
                <div>
                  <div className="font-semibold text-green-900 mb-1">Playwright 成本优势</div>
                  <div className="text-sm text-gray-700 space-y-1">
                    <div>• 相比 MCP：节省 <strong className="text-green-700">95%</strong> 成本</div>
                    <div>• 相比 Midscene：节省 <strong className="text-green-700">50-80%</strong> 成本</div>
                    <div>• 适合：页面结构稳定的大规模回归测试</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <QuestionCircleOutlined className="text-blue-600 text-lg mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-blue-900 mb-2">成本对比总结</div>
                <div className="text-sm text-gray-700">
                  <div className="flex gap-6">
                    <div className="flex-1">
                      <div className="font-medium text-red-700 mb-1">MCP 客户端</div>
                      <div>• 最高成本</div>
                      <div>• 最灵活</div>
                      <div>• 适合探索</div>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-purple-700 mb-1">Midscene Runner</div>
                      <div>• 中等成本</div>
                      <div>• 有缓存优化</div>
                      <div>• 平衡选择</div>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-green-700 mb-1">Playwright Runner</div>
                      <div>• 最低成本</div>
                      <div>• 最快速度</div>
                      <div>• 适合稳定项目</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      key: '5',
      label: (
        <span className="flex items-center gap-2">
          <QuestionCircleOutlined />
          使用建议
        </span>
      ),
      children: (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {scenarioRecommendations.map((scenario, index) => (
              <div 
                key={index}
                className={`border rounded-lg p-4 ${
                  scenario.engine === 'Playwright Runner' 
                    ? 'border-green-200 bg-green-50' 
                    : scenario.engine === 'Midscene Runner'
                    ? 'border-purple-200 bg-purple-50'
                    : 'border-blue-200 bg-blue-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  {scenario.icon}
                  <div>
                    <div className="font-semibold text-gray-800">{scenario.title}</div>
                    <div className="text-xs text-gray-600">推荐：{scenario.engine}</div>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-gray-700">
                  {scenario.reasons.map((reason, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className={
                        scenario.engine === 'Playwright Runner' 
                          ? 'text-green-600' 
                          : scenario.engine === 'Midscene Runner'
                          ? 'text-purple-600'
                          : 'text-blue-600'
                      }>
                        •
                      </span>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <QuestionCircleOutlined className="text-blue-600 text-lg mt-0.5" />
              <div>
                <div className="font-semibold text-blue-900 mb-2">混合策略（推荐）</div>
                <div className="text-sm text-gray-700 space-y-1">
                  <div>1. <strong>首选 Playwright Runner</strong> - 获得最佳性能和成本效益</div>
                  <div>2. <strong>备选 Midscene Runner</strong> - 页面结构不稳定时使用AI视觉识别</div>
                  <div>3. <strong>探索用 MCP</strong> - 新功能探索和复杂交互场景</div>
                  <div>4. <strong>定期评估迁移</strong> - 将稳定用例迁移到Playwright</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <EyeOutlined className="text-purple-600 text-lg mt-0.5" />
              <div>
                <div className="font-semibold text-purple-900 mb-2">Midscene 缓存机制</div>
                <div className="text-sm text-gray-700 space-y-1">
                  <div>• <strong>可缓存操作</strong>: Plan（计划生成）、Locate（元素定位）</div>
                  <div>• <strong>不可缓存</strong>: Assert（断言验证）、Extract（数据提取）</div>
                  <div>• <strong>缓存策略</strong>: 首次执行建立缓存，后续执行直接使用</div>
                  <div>• <strong>性能提升</strong>: 缓存命中后速度接近Playwright（0.3-0.5秒/步）</div>
                  <div>• <strong>成本节省</strong>: 相比MCP节省70%，相比Playwright增加30%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <WarningOutlined className="text-yellow-600 text-lg mt-0.5" />
              <div>
                <div className="font-semibold text-yellow-900 mb-1">快速决策</div>
                <div className="text-sm text-gray-700 space-y-1">
                  <div>• <strong>需要最快执行？</strong> → 选择 Playwright Runner</div>
                  <div>• <strong>页面结构不稳定？</strong> → 选择 Midscene Runner（有缓存）</div>
                  <div>• <strong>页面频繁变化？</strong> → 选择 MCP客户端（最灵活）</div>
                  <div>• <strong>需要详细调试？</strong> → 选择 Playwright/Midscene（Trace支持）</div>
                  <div>• <strong>成本最敏感？</strong> → 选择 Playwright Runner（节省95%）</div>
                  <div>• <strong>重复执行场景？</strong> → 选择 Midscene Runner（缓存加速）</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <QuestionCircleOutlined className="text-blue-500" />
          <span>执行引擎选择指南</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={900}
      centered
      styles={{
        body: {
          maxHeight: '82vh',
          overflowY: 'scroll',
          padding: '5px'
        }
      }}
      maskClosable={true}
      keyboard={false}
      zIndex={1001}
    >
      <div 
        onWheel={(e) => e.stopPropagation()}
        style={{ minHeight: '100%' }}
      >
        <Tabs items={tabItems} />
      </div>
    </Modal>
  );
};

export default ExecutionEngineGuide;
