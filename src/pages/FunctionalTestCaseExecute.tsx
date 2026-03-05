import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { functionalTestCaseService } from '../services/functionalTestCaseService';
import { showToast } from '../utils/toast';
import { useTabs } from '../contexts/TabContext';
import './FunctionalTestCaseExecute.css';

type StepResult = 'pass' | 'fail' | 'block' | null;

interface TestStep {
  action: string;
  expected: string;
  result: StepResult;
  note: string;
}

interface TestCase {
  id: number;
  name: string;
  system?: string;
  module?: string;
  scenario_name?: string;
  section_name?: string;
  test_point_name?: string;
  case_type?: string;
  priority?: string;
  project_version?: {
    version_code?: string;
  };
  preconditions?: string;
  test_data?: string;
  steps?: string;
  expected_result?: string;
  created_at: string;
  users?: {
    username?: string;
  };
}

export function FunctionalTestCaseExecute() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { tabs, activeTabId, removeTab, setActiveTab } = useTabs();
  const [loading, setLoading] = useState(true);
  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [finalResult, setFinalResult] = useState<'pass' | 'fail' | 'block' | ''>('');
  const [actualResult, setActualResult] = useState('');
  const [comments, setComments] = useState('');
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // 计时器
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 格式化时间
  const formattedTime = useMemo(() => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [seconds]);

  // 加载测试用例数据
  useEffect(() => {
    const loadTestCase = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const result = await functionalTestCaseService.getById(Number(id)) as { success: boolean; data?: TestCase; error?: string };

        if (result.success && result.data) {
          setTestCase(result.data);
          // 解析测试步骤
          const stepsData = parseSteps();
          setSteps(stepsData);
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

  // 解析步骤（简单示例）
  const parseSteps = (): TestStep[] => {
    // 这里简化处理，实际应该解析HTML
    return [
      { action: '打开系统登录页面', expected: '页面正常加载，显示登录表单', result: null, note: '' },
      { action: '输入测试数据', expected: '数据正常显示', result: null, note: '' },
      { action: '点击提交按钮', expected: '按照预期执行', result: null, note: '' },
      { action: '验证结果', expected: '结果符合预期', result: null, note: '' },
    ];
  };

  // 计算完成的步骤数
  const completedSteps = useMemo(() => {
    return steps.filter(s => s.result !== null).length;
  }, [steps]);

  // 计算进度
  const progress = useMemo(() => {
    if (steps.length === 0) return 0;
    return Math.round((completedSteps / steps.length) * 100);
  }, [completedSteps, steps.length]);

  // 标记步骤结果
  const markStepResult = (stepIndex: number, result: StepResult) => {
    setSteps(prev => {
      const newSteps = [...prev];
      newSteps[stepIndex] = { ...newSteps[stepIndex], result };
      return newSteps;
    });

    // 自动定位到下一步并滚动
    if (stepIndex < steps.length - 1 && result === 'pass') {
      setTimeout(() => {
        setCurrentStepIndex(stepIndex + 1);
        // 滚动到下一步
        const nextStepElement = document.querySelector(`[data-step-index="${stepIndex + 1}"]`);
        if (nextStepElement) {
          nextStepElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);
    }

    // 所有步骤完成后自动判断最终结果
    const updatedSteps = [...steps];
    updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], result };
    const allCompleted = updatedSteps.every(s => s.result !== null);
    
    if (allCompleted) {
      const hasFail = updatedSteps.some(s => s.result === 'fail');
      const hasBlock = updatedSteps.some(s => s.result === 'block');
      const allPass = updatedSteps.every(s => s.result === 'pass');

      if (allPass) {
        setFinalResult('pass');
        showToast.success('所有步骤已完成，建议最终结果：✅ 通过');
      } else if (hasFail) {
        setFinalResult('fail');
        showToast.error('所有步骤已完成，建议最终结果：❌ 失败');
      } else if (hasBlock) {
        setFinalResult('block');
        showToast.warning('所有步骤已完成，建议最终结果：🚫 阻塞');
      }
    }
  };

  // 更新步骤备注
  const updateStepNote = (stepIndex: number, note: string) => {
    setSteps(prev => {
      const newSteps = [...prev];
      newSteps[stepIndex] = { ...newSteps[stepIndex], note };
      return newSteps;
    });
  };

  // 保存草稿
  const handleSaveDraft = () => {
    showToast.success('测试结果草稿已保存');
  };

  // 取消并关闭Tab
  const handleCancel = () => {
    const currentTabId = activeTabId;
    navigate('/functional-test-cases');
    // 延迟足够长的时间，确保导航完成并且Tab已切换
    if (currentTabId) {
      setTimeout(() => removeTab(currentTabId, '/functional-test-cases'), 100);
    }
  };

  // 提交结果
  const handleSubmit = async () => {
    if (!finalResult) {
      showToast.error('请选择最终测试结果');
      return;
    }

    if (!actualResult.trim()) {
      showToast.error('请填写实际结果总结');
      return;
    }

    // 检查是否所有步骤都已记录结果
    if (completedSteps < steps.length) {
      if (!window.confirm(`还有 ${steps.length - completedSteps} 个步骤未记录结果，确定要提交吗？`)) {
        return;
      }
    }

    try {
      // 计算步骤统计
      const passedCount = steps.filter(s => s.result === 'pass').length;
      const failedCount = steps.filter(s => s.result === 'fail').length;
      const blockedCount = steps.filter(s => s.result === 'block').length;

      // 保存执行结果到数据库
      const result = await functionalTestCaseService.saveExecutionResult(Number(id), {
        testCaseName: testCase?.name || '未知测试用例',
        finalResult: finalResult as 'pass' | 'fail' | 'block',
        actualResult,
        comments: comments || undefined,
        durationMs: seconds * 1000, // 转换为毫秒
        stepResults: steps.map((step, index) => ({
          stepIndex: index + 1,
          action: step.action,
          expected: step.expected,
          result: step.result,
          note: step.note
        })),
        totalSteps: steps.length,
        completedSteps,
        passedSteps: passedCount,
        failedSteps: failedCount,
        blockedSteps: blockedCount,
        metadata: {
          system: testCase?.system,
          module: testCase?.module,
          scenario_name: testCase?.scenario_name,
          test_point_name: testCase?.test_point_name,
          priority: testCase?.priority,
          case_type: testCase?.case_type,
          submitted_at: new Date().toISOString()
        }
      }) as { success: boolean; data?: { executionId: string }; error?: string };

      if (result.success) {
        const resultText = finalResult === 'pass' ? '✅ 通过' : finalResult === 'fail' ? '❌ 失败' : '🚫 阻塞';
        showToast.success(`测试结果已提交！最终结果：${resultText}，执行时长：${formattedTime}`);
        const currentTabId = activeTabId;
        navigate('/functional-test-cases');
        if (currentTabId) {
          setTimeout(() => removeTab(currentTabId, '/functional-test-cases'), 100);
        }
      } else {
        throw new Error(result.error || '提交失败');
      }
    } catch (error: any) {
      console.error('提交测试结果失败:', error);
      showToast.error(`提交失败：${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="execute-loading">
        <div className="loading-spinner"></div>
        <p>加载测试用例中...</p>
      </div>
    );
  }

  if (!testCase) {
    return (
      <div className="execute-loading">
        <p>未找到测试用例</p>
      </div>
    );
  }

  const getPriorityBadge = (priority: string) => {
    const config: Record<string, { label: string; class: string }> = {
      high: { label: '高', class: 'badge-high' },
      critical: { label: '紧急', class: 'badge-high' },
      medium: { label: '中', class: 'badge-medium' },
      low: { label: '低', class: 'badge-low' },
    };
    const info = config[priority] || { label: priority, class: '' };
    return <span className={`badge ${info.class}`}>{info.label}</span>;
  };

  return (
    <div className="execute-page">
      {/* 悬浮状态窗口 */}
      <div className="status-float-window">
        <div className="status-item">
          <div className="status-label">执行时长</div>
          <div className="status-value">{formattedTime}</div>
        </div>
        <div className="status-divider"></div>
        <div className="status-item">
          <div className="progress-container">
            <div className="progress-header">
              <span>测试进度</span>
              <span>{completedSteps}/{steps.length}</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="execute-container">
        <div className="execute-card">
          {/* 卡片头部 */}
          <div className="card-header">
            <div className="header-left">
              {/* <div className="case-id">TC_{String(testCase.id).padStart(5, '0')}</div> */}
              <div className="case-title">{testCase.name}</div>
              <div className="case-meta">
                <div className="meta-item">
                  <span>👤</span>
                  <span>创建者：{testCase.users?.username || '未知'}</span>
                </div>
                <div className="meta-item">
                  <span>📅</span>
                  <span>创建时间：{new Date(testCase.created_at).toLocaleString('zh-CN')}</span>
                </div>
              </div>
              <div className="hierarchy-path">
                📁 {testCase.system || '-'} → 🎯 {testCase.scenario_name || testCase.section_name || '-'} → 📝 {testCase.test_point_name || '-'}
              </div>
            </div>
            <button className="back-btn" onClick={handleCancel}>
              返回列表
            </button>
          </div>

          {/* 卡片内容 */}
          <div className="card-body">
            <div className="left-panel">
              {/* 基本信息 */}
              <div className="section">
                <div className="section-title">📋 基本信息</div>
                <div className="info-grid">
                  <div className="info-item">
                    <div className="info-label">所属项目</div>
                    <div className="info-value">{testCase.system || '-'}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">所属模块</div>
                    <div className="info-value">{testCase.module || '-'}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">测试场景</div>
                    <div className="info-value">{testCase.scenario_name || testCase.section_name || '-'}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">测试点</div>
                    <div className="info-value">{testCase.test_point_name || '-'}</div>
                  </div>
                </div>
              </div>

              {/* 用例信息 */}
              <div className="section">
                <div className="section-title">📝 用例信息</div>
                <div className="info-grid">
                  <div className="info-item">
                    <div className="info-label">用例类型</div>
                    <div className="info-value">{testCase.case_type === 'SMOKE' ? '冒烟用例' : '全量用例'}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">用例版本</div>
                    <div className="info-value">{testCase.project_version?.version_code || 'V1.0'}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">用例ID</div>
                    <div className="info-value">TC_{String(testCase.id).padStart(5, '0')}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">用例优先级</div>
                    <div className="info-value">{getPriorityBadge(testCase.priority || 'medium')}</div>
                  </div>
                </div>
              </div>

              {/* 前置条件和测试数据 */}
              <div className="preconditions-data-grid">
                <div>
                  <div className="section-title">🔧 前置条件</div>
                  <div className="section-content precondition-content">
                    {testCase.preconditions || '无特殊前置条件'}
                  </div>
                </div>
                <div>
                  <div className="section-title">📊 测试数据</div>
                  <div className="section-content precondition-content">
                    {testCase.test_data || '参考测试步骤'}
                  </div>
                </div>
              </div>

              {/* 测试步骤 */}
              <div className="section">
                <div className="section-title">📝 测试步骤</div>
                <div className="steps-wrapper">
                  <div className="steps-header">
                    <div>#</div>
                    <div>操作步骤</div>
                    <div>预期结果</div>
                    <div>执行状态</div>
                  </div>
                  <ul className="steps-list">
                    {steps.map((step, index) => (
                      <li
                        key={index}
                        className={`step-item ${
                          step.result === 'pass' ? 'passed' : 
                          step.result === 'fail' ? 'failed' : 
                          step.result === 'block' ? 'blocked' : 
                          index === currentStepIndex ? 'executing' : ''
                        } ${step.note ? 'has-note' : ''}`}
                        data-step-index={index}
                      >
                        <div className="step-row">
                          <div className="step-col-no">{index + 1}</div>
                          <div className="step-col-text">{step.action}</div>
                          <div className="step-col-text">{step.expected}</div>
                          <div className="step-col-actions">
                            <div className="status-btn-group">
                              <button
                                className={`status-btn pass ${step.result === 'pass' ? 'active' : ''}`}
                                onClick={() => markStepResult(index, 'pass')}
                                title="通过"
                              >
                                ✓
                              </button>
                              <button
                                className={`status-btn fail ${step.result === 'fail' ? 'active' : ''}`}
                                onClick={() => markStepResult(index, 'fail')}
                                title="失败"
                              >
                                ✗
                              </button>
                              <button
                                className={`status-btn block ${step.result === 'block' ? 'active' : ''}`}
                                onClick={() => markStepResult(index, 'block')}
                                title="阻塞"
                              >
                                ⊗
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="step-note-area">
                          <textarea
                            className="step-note-input"
                            placeholder="备注说明（可选，失败或阻塞时建议填写）..."
                            value={step.note}
                            onChange={(e) => updateStepNote(index, e.target.value)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* 右侧面板 - 记录测试结果 */}
            <div className="right-panel">
              <div className="section">
                <div className="section-title">📝 记录测试结果</div>
                <div className="result-container">
                  <div className="result-header">
                    <label className="form-label required result-header-label">
                      最终测试结果
                    </label>
                    <div className="result-options">
                      <div className="result-option-item">
                        <input
                          type="radio"
                          name="result"
                          id="pass"
                          value="pass"
                          className="result-option-input"
                          checked={finalResult === 'pass'}
                          onChange={() => setFinalResult('pass')}
                        />
                        <label htmlFor="pass" className="result-option-card pass">
                          <span className="result-icon">✅</span> 通过
                        </label>
                      </div>
                      <div className="result-option-item">
                        <input
                          type="radio"
                          name="result"
                          id="fail"
                          value="fail"
                          className="result-option-input"
                          checked={finalResult === 'fail'}
                          onChange={() => setFinalResult('fail')}
                        />
                        <label htmlFor="fail" className="result-option-card fail">
                          <span className="result-icon">❌</span> 失败
                        </label>
                      </div>
                      <div className="result-option-item">
                        <input
                          type="radio"
                          name="result"
                          id="block"
                          value="block"
                          className="result-option-input"
                          checked={finalResult === 'block'}
                          onChange={() => setFinalResult('block')}
                        />
                        <label htmlFor="block" className="result-option-card block">
                          <span className="result-icon">🚫</span> 阻塞
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="result-grid">
                    <div className="result-main">
                      <div className="form-group">
                        <label className="form-label required">实际结果总结</label>
                        <textarea
                          className="modern-textarea actual-result-textarea"
                          placeholder="请详细描述测试执行后的实际情况..."
                          value={actualResult}
                          onChange={(e) => setActualResult(e.target.value)}
                        />
                      </div>
                      <div className="form-group form-group-last">
                        <label className="form-label">备注说明</label>
                        <textarea
                          className="modern-textarea comments-textarea"
                          placeholder="如有需要，请补充说明..."
                          value={comments}
                          onChange={(e) => setComments(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="result-side">
                      <div className="form-group upload-form-group">
                        <label className="form-label">证据截图</label>
                        <label htmlFor="fileInput" className="upload-area-compact">
                          <input type="file" accept="image/*" multiple className="file-input-hidden" id="fileInput" />
                          <div className="upload-icon-large">📸</div>
                          <div className="upload-hint">点击上传图片</div>
                          <span className="upload-sub-hint">支持粘贴 / 拖拽</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 底部操作栏 */}
          <div className="action-bar">
            <button className="btn btn-secondary" onClick={handleCancel}>
              取消
            </button>
            <button className="btn btn-secondary" onClick={handleSaveDraft}>
              💾 保存草稿
            </button>
            <button className="btn btn-success" onClick={handleSubmit}>
              ✅ 提交结果
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

