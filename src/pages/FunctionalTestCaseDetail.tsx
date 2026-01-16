import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit, Play, Loader2 } from 'lucide-react';
import { functionalTestCaseService } from '../services/functionalTestCaseService';
import { showToast } from '../utils/toast';
import { parseStepsFromString } from '../components/test-case/TestStepsEditor';

/**
 * 功能测试用例详情页面
 */
export function FunctionalTestCaseDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [testCase, setTestCase] = useState<any>(null);
  
  // 加载测试用例数据
  useEffect(() => {
    const loadTestCase = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const result = await functionalTestCaseService.getById(Number(id));
        
        if (result.success && result.data) {
          setTestCase(result.data);
        } else {
          showToast.error('加载测试用例失败');
          navigate('/functional-test-cases');
        }
      } catch (error) {
        console.error('加载测试用例失败:', error);
        showToast.error('加载测试用例失败');
        navigate('/functional-test-cases');
      } finally {
        setLoading(false);
      }
    };
    
    loadTestCase();
  }, [id, navigate]);
  
  const handleEdit = () => {
    navigate(`/functional-test-cases/${id}/edit`);
  };
  
  const handleExecute = () => {
    navigate(`/functional-test-cases/${id}/execute`);
  };
  
  const handleExecuteAlt = () => {
    navigate(`/functional-test-cases/${id}/execute-alt`);
  };
  
  const handleClose = () => {
    navigate('/functional-test-cases');
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }
  
  if (!testCase) {
    return null;
  }
  
  // 解析测试步骤 - 使用统一的解析函数（支持【操作】【预期】格式）
  const parsedSteps = parseStepsFromString(testCase.steps || '');
  
  // 检查解析结果是否包含预期结果
  const hasEmbeddedExpected = parsedSteps.some(ps => ps.expected && ps.expected.trim());
  
  // 获取单独存储的预期结果字段
  const separateExpectedResult = testCase.expectedResult || testCase.expected_result || testCase.assertions || '';
  
  let steps: Array<{ step: string; expectedResult: string }>;
  
  if (parsedSteps.length > 0 && hasEmbeddedExpected) {
    // 使用【操作】【预期】格式的解析结果
    steps = parsedSteps.map(ps => ({
      step: ps.operation,
      expectedResult: ps.expected
    }));
  } else if (parsedSteps.length > 0 && separateExpectedResult) {
    // 步骤和预期结果分开存储：按行号匹配
    const assertionsArray = separateExpectedResult.split('\n').filter((s: string) => s.trim());
    steps = parsedSteps.map((ps, index) => ({
      step: ps.operation,
      expectedResult: assertionsArray[index]?.replace(/^\d+[.、:：]\s*/, '') || ''
    }));
  } else if (parsedSteps.length > 0) {
    // 只有步骤，没有预期结果
    steps = parsedSteps.map(ps => ({
      step: ps.operation,
      expectedResult: ps.expected || ''
    }));
  } else {
    // 兜底：直接按行分割
    const stepsArray = testCase.steps?.split('\n').filter((s: string) => s.trim()) || [];
    const assertionsArray = separateExpectedResult.split('\n').filter((s: string) => s.trim());
    steps = stepsArray.map((step: string, index: number) => ({
      step: step.replace(/^\d+[.、:：]\s*/, ''),
      expectedResult: assertionsArray[index]?.replace(/^\d+[.、:：]\s*/, '') || ''
    }));
  }
  
  const priorityBadge = testCase.priority === 'high' ? 'bg-red-100 text-red-700' :
                       testCase.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                       'bg-green-100 text-green-700';
  
  const priorityText = testCase.priority === 'high' ? '高' :
                      testCase.priority === 'medium' ? '中' : '低';
  
  return (
    <div className="min-h-screen bg-gray-50 pb-5">
      <div className="max-w-[1100px] mx-auto">
        {/* 用例信息卡片 */}
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-700 text-white px-8 py-6 flex items-start justify-between gap-5">
            <div className="flex-1">
              {/* <div className="font-mono text-[15px] opacity-95 mb-2.5 tracking-wide font-medium">{ `TC_${String(testCase.id).padStart(5, '0')}`}</div> */}
              <h1 className="text-2xl font-bold mb-3.5 leading-[1.4] tracking-tight">{testCase.name}</h1>
              <div className="flex gap-5 text-[13px] opacity-90">
                <div className="flex items-center gap-1.5">
                  <span>👤</span>
                  <span>创建者：{testCase.createdBy || testCase.users?.username || '未知'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>📅</span>
                  <span>创建时间：{testCase.createdAt || testCase.created_at ? new Date(testCase.createdAt || testCase.created_at).toLocaleString('zh-CN') : '未知'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>🔄</span>
                  <span>最后更新：{testCase.updatedAt || testCase.updated_at ? new Date(testCase.updatedAt || testCase.updated_at).toLocaleString('zh-CN') : '未知'}</span>
                </div>
              </div>
              {(testCase.testScenario || testCase.scenarioName || testCase.scenario_name) && (testCase.testPoints?.[0]?.testPointName || testCase.testPoints?.[0]?.testPoint || testCase.test_point_name) && (
                <div className="mt-3.5 bg-white/15 rounded-md px-4 py-2.5 text-[13px] flex items-center gap-2">
                  📁 {testCase.system} → 📦 {testCase.module} → 📋 {testCase.testScenario || testCase.scenarioName || testCase.scenario_name} → 🎯 {testCase.testPoints?.[0]?.testPointName || testCase.testPoints?.[0]?.testPoint || testCase.test_point_name}
                </div>
              )}
            </div>
            <button
              onClick={handleClose}
              className="bg-white/20 hover:bg-white/30 border border-white/30 hover:border-white/50 text-white px-5 py-2.5 rounded-md text-sm font-medium transition-all"
            >
              返回列表
            </button>
          </div>

          <div className="overflow-hidden">
          {/* 卡片内容 */}
          <div className="px-6 py-5">
            
            {/* 基本信息 */}
            <div className="mb-[18px]">
              <div className="flex items-center gap-1.5 mb-2.5 text-[13px] font-semibold text-gray-700">
                <span className="text-sm">📋</span>
                <span>基本信息</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                  <div className="text-xs text-gray-500 mb-1 font-medium">所属项目</div>
                  <div className="text-[13px] font-semibold text-gray-900">{testCase.system || '-'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                  <div className="text-xs text-gray-500 mb-1 font-medium">所属模块</div>
                  <div className="text-[13px] font-semibold text-gray-900">{testCase.module || '-'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                  <div className="text-xs text-gray-500 mb-1 font-medium">测试场景</div>
                  <div className="text-[13px] font-semibold text-gray-900">{testCase.testScenario || testCase.scenarioName || testCase.scenario_name || '-'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                  <div className="text-xs text-gray-500 mb-1 font-medium">测试点</div>
                  <div className="text-[13px] font-semibold text-gray-900">{testCase.testPoints?.[0]?.testPointName || testCase.testPoints?.[0]?.testPoint || '-'}</div>
                </div>
              </div>
            </div>
            
            {/* 用例信息 */}
            <div className="mb-[18px]">
              <div className="flex items-center gap-1.5 mb-2.5 text-[13px] font-semibold text-gray-700">
                <span className="text-sm">📝</span>
                <span>用例信息</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                  <div className="text-xs text-gray-500 mb-1 font-medium">用例类型</div>
                  <div className="text-[13px] font-semibold text-gray-900">
                    {testCase.testType || testCase.caseType || testCase.case_type 
                      ? (() => {
                          const type = testCase.testType || testCase.caseType || testCase.case_type;
                          const typeMap: { [key: string]: string } = {
                            'SMOKE': '冒烟用例',
                            'FULL': '全量用例',
                            'ABNORMAL': '异常用例',
                            'BOUNDARY': '边界用例',
                            'PERFORMANCE': '性能用例',
                            'SECURITY': '安全用例',
                            'USABILITY': '可用性用例',
                            'COMPATIBILITY': '兼容性用例',
                            'RELIABILITY': '可靠性用例'
                          };
                          return typeMap[type] || type;
                        })()
                      : '-'}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                  <div className="text-xs text-gray-500 mb-1 font-medium">用例版本</div>
                  <div className="text-[13px] font-semibold text-gray-900">
                    {testCase.project_version?.version_name || testCase.project_version?.version_code || 'V1.0'}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                  <div className="text-xs text-gray-500 mb-1 font-medium">用例ID</div>
                  <div className="text-[13px] font-semibold text-gray-900">{ `TC_${String(testCase.id).padStart(5, '0')}`}</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                  <div className="text-xs text-gray-500 mb-1 font-medium">用例优先级</div>
                  <div>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityBadge}`}>
                      {priorityText}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 前置条件和测试数据 */}
            <div className="grid grid-cols-2 gap-3.5 mb-[18px]">
              <div>
                <div className="flex items-center gap-1.5 mb-2.5 text-[13px] font-semibold text-gray-700">
                  <span className="text-sm">🔧</span>
                  <span>前置条件</span>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-[13px] text-gray-700 leading-[1.6] min-h-[80px] whitespace-pre-wrap">
                  {testCase.preconditions || '无特殊前置条件'}
                </div>
              </div>
              
              <div>
                <div className="flex items-center gap-1.5 mb-2.5 text-[13px] font-semibold text-gray-700">
                  <span className="text-sm">📊</span>
                  <span>测试数据</span>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-[13px] text-gray-700 leading-[1.6] min-h-[80px] whitespace-pre-wrap">
                  {testCase.testData || testCase.test_data || '无'}
                </div>
              </div>
            </div>
            
            {/* 测试步骤 */}
            <div className="mb-[18px]">
              <div className="flex items-center gap-1.5 mb-2.5 text-[13px] font-semibold text-gray-700">
                <span className="text-sm">📝</span>
                <span>测试步骤</span>
              </div>
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <div className="flex flex-col gap-2.5">
                  {steps.map((step: any, index: number) => (
                    <div key={index} className="flex gap-3 px-3 py-2.5 bg-white border border-gray-200 rounded-md">
                      <div className="w-[26px] h-[26px] rounded-full bg-gradient-to-br from-indigo-500 to-purple-700 text-white flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1 flex gap-3.5">
                        <div className="flex-1">
                          <div className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5 tracking-[0.3px]">操作步骤</div>
                          <div className="text-[13px] text-gray-800 leading-[1.5]">{step.step}</div>
                        </div>
                        <div className="flex-1">
                          <div className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5 tracking-[0.3px]">预期结果</div>
                          <div className="text-[13px] text-gray-800 leading-[1.5]">{step.expectedResult}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* 备注说明 */}
            {testCase.description && (
              <div className="mb-0">
                <div className="flex items-center gap-1.5 mb-2.5 text-[13px] font-semibold text-gray-700">
                  <span className="text-sm">💡</span>
                  <span>备注说明</span>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-[13px] text-gray-700 leading-[1.6]">
                  {testCase.description}
                </div>
              </div>
            )}
          </div>
          
          {/* 底部操作栏 */}
          <div className="flex items-center justify-end px-6 py-3.5 bg-gray-50 border-t border-gray-200">
            {/* <div className="text-xs text-gray-500">
              💡 提示：有两种执行页面样式可选
            </div> */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 px-[18px] py-2 bg-white border border-gray-300 text-gray-700 rounded-[5px] text-xs font-semibold hover:border-indigo-500 hover:text-indigo-500 transition-all"
              >
                关闭
              </button>
              <button
                onClick={handleEdit}
                className="inline-flex items-center gap-1.5 px-[18px] py-2 bg-white border border-gray-300 text-gray-700 rounded-[5px] text-xs font-semibold hover:border-indigo-500 hover:text-indigo-500 transition-all"
              >
                <Edit className="w-3.5 h-3.5" />
                编辑
              </button>
              <button
                onClick={handleExecuteAlt}
                className="inline-flex items-center gap-1.5 px-[18px] py-2 bg-white border border-gray-300 text-gray-700 rounded-[5px] text-xs font-semibold hover:border-indigo-500 hover:text-indigo-500 transition-all"
              >
                <Play className="w-3.5 h-3.5" />
                执行
              </button>
              {/* <button
                onClick={handleExecute}
                className="inline-flex items-center gap-1.5 px-[18px] py-2 bg-gradient-to-r from-indigo-500 to-purple-700 text-white rounded-[5px] text-xs font-semibold hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)] hover:-translate-y-0.5 transition-all"
              >
                <Play className="w-3.5 h-3.5" />
                ▶️ 执行测试（原型样式）
              </button> */}
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

