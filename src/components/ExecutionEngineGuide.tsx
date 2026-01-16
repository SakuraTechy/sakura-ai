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
  FileTextOutlined
} from '@ant-design/icons';

interface ExecutionEngineGuideProps {
  visible: boolean;
  onClose: () => void;
}

const ExecutionEngineGuide: React.FC<ExecutionEngineGuideProps> = ({ visible, onClose }) => {
  // 性能对比数据
  const performanceData = [
    {
      key: '1',
      scenario: '10步简单测试',
      mcp: '35-60秒',
      playwright: '3-8秒',
      improvement: '5-10倍'
    },
    {
      key: '2',
      scenario: '20步复杂测试',
      mcp: '70-120秒',
      playwright: '6-16秒',
      improvement: '8-12倍'
    },
    {
      key: '3',
      scenario: '50步回归测试',
      mcp: '175-300秒',
      playwright: '15-40秒',
      improvement: '10-15倍'
    }
  ];

  const performanceColumns = [
    { title: '测试场景', dataIndex: 'scenario', key: 'scenario' },
    { title: 'MCP客户端', dataIndex: 'mcp', key: 'mcp' },
    { title: 'Playwright Runner', dataIndex: 'playwright', key: 'playwright' },
    { 
      title: '性能提升', 
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
      playwright: { status: 'success', text: '快速（<1秒/步）' }
    },
    {
      key: '2',
      feature: 'AI调用频率',
      mcp: { status: 'error', text: '高频（每步都调用）' },
      playwright: { status: 'success', text: '低频（仅失败时）' }
    },
    {
      key: '3',
      feature: '成本',
      mcp: { status: 'error', text: '高（大量API调用）' },
      playwright: { status: 'success', text: '低（节省95%）' }
    },
    {
      key: '4',
      feature: '适应性',
      mcp: { status: 'success', text: '强（动态适应）' },
      playwright: { status: 'warning', text: '中等（预定义）' }
    },
    {
      key: '5',
      feature: '调试能力',
      mcp: { status: 'warning', text: '中等（MCP协议）' },
      playwright: { status: 'success', text: '强（Trace/Video）' }
    },
    {
      key: '6',
      feature: '稳定性',
      mcp: { status: 'warning', text: '依赖AI稳定性' },
      playwright: { status: 'success', text: '高（确定性）' }
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
    }
  ];

  // 使用场景推荐
  const scenarioRecommendations = [
    {
      title: '快速回归测试',
      engine: 'Playwright Runner',
      icon: <ThunderboltOutlined className="text-blue-500" />,
      reasons: ['执行速度快5-10倍', '成本低95%', '适合CI/CD集成']
    },
    {
      title: '探索新功能',
      engine: 'MCP客户端',
      icon: <RobotOutlined className="text-purple-500" />,
      reasons: ['AI自动适应页面变化', '无需预定义选择器', '自然语言驱动']
    },
    {
      title: '稳定项目测试',
      engine: 'Playwright Runner',
      icon: <CheckCircleOutlined className="text-green-500" />,
      reasons: ['高性能确定性执行', '详细的Trace调试', '低成本运行']
    },
    {
      title: '动态页面测试',
      engine: 'MCP客户端',
      icon: <RobotOutlined className="text-purple-500" />,
      reasons: ['智能元素匹配', '适应页面结构变化', 'AI闭环执行']
    }
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
          <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4 text-sm">
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
          <div className="grid grid-cols-2 gap-4">
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

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <DollarOutlined className="text-green-600 text-lg mt-0.5" />
              <div>
                <div className="font-semibold text-green-900 mb-1">成本节省</div>
                <div className="text-sm text-gray-700">
                  使用 Playwright Runner 可节省 <strong className="text-green-700">95%</strong> 的AI API调用成本
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
          <div className="grid grid-cols-2 gap-4">
            {scenarioRecommendations.map((scenario, index) => (
              <div 
                key={index}
                className={`border rounded-lg p-4 ${
                  scenario.engine === 'Playwright Runner' 
                    ? 'border-green-200 bg-green-50' 
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
                      <span className={scenario.engine === 'Playwright Runner' ? 'text-green-600' : 'text-blue-600'}>
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
                  <div>2. <strong>自动降级到 MCP</strong> - 元素定位失败时自动切换</div>
                  <div>3. <strong>根据场景选择</strong> - 稳定测试用Playwright，探索性测试用MCP</div>
                  <div>4. <strong>定期评估迁移</strong> - 将稳定用例迁移到Playwright</div>
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
                  <div>• <strong>需要快速执行？</strong> → 选择 Playwright Runner</div>
                  <div>• <strong>页面结构不稳定？</strong> → 选择 MCP客户端</div>
                  <div>• <strong>需要详细调试？</strong> → 选择 Playwright Runner（Trace支持）</div>
                  <div>• <strong>成本敏感？</strong> → 选择 Playwright Runner（节省95%）</div>
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
      style={{ top: 20 }}
    >
      <Tabs items={tabItems} />
    </Modal>
  );
};

export default ExecutionEngineGuide;
