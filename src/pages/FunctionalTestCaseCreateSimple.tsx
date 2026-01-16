import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Save, Loader2, Sparkles, Plus, FolderKanban, ChevronDown } from 'lucide-react';
import { functionalTestCaseService } from '../services/functionalTestCaseService';
import * as systemService from '../services/systemService';
import type { SystemOption, ProjectVersion } from '../types/test';
import { showToast } from '../utils/toast';
import { Input, Select, Modal } from 'antd';
import { useTabs } from '../contexts/TabContext';

const { Option } = Select;
const { TextArea } = Input;

// 草稿缓存的 LocalStorage Key
const DRAFT_CACHE_KEY = 'test_case_create_draft';

/**
 * 测试步骤接口
 */
interface TestStep {
  id: string;
  step: string;
  expectedResult: string;
}

/**
 * 测试场景数据
 */
interface ScenarioData {
  value: string;
  label: string;
  testPoints: { value: string; label: string }[];
}

/**
 * 表单数据接口
 */
interface FormData {
  // 基本信息
  project: string;
  module: string;
  scenario: string;
  testPoint: string;
  
  // 用例信息
  caseType: string;
  caseVersion: string;
  caseId: string;
  priority: 'low' | 'medium' | 'high';
  title: string;
  
  // 测试内容
  preconditions: string;
  testData: string;
  remarks: string;
}

/**
 * 草稿数据接口
 */
interface DraftData {
  formData: FormData;
  testSteps: TestStep[];
  scenariosData: ScenarioData[];
  timestamp: number;
  // 新建相关状态
  showNewModule?: boolean;
  showNewScenario?: boolean;
  showNewTestPoint?: boolean;
  newModuleName?: string;
  newScenarioName?: string;
  newTestPointName?: string;
}

/**
 * 功能测试用例创建页面 - 简化版（基于原型）
 */
export function FunctionalTestCaseCreateSimple() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const copyFromId = searchParams.get('copyFrom');  // 🆕 复制模式：源用例ID
  const { addTab } = useTabs();
  const [saving, setSaving] = useState(false);
  const [generatingData, setGeneratingData] = useState(false);
  const [loadingCopySource, setLoadingCopySource] = useState(false);  // 🆕 加载源用例状态
  
  // 系统字典列表
  const [systemOptions, setSystemOptions] = useState<SystemOption[]>([]);
  // 项目版本列表
  const [projectVersions, setProjectVersions] = useState<ProjectVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  // 测试场景列表
  const [scenariosData, setScenariosData] = useState<ScenarioData[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  // 模块列表
  const [modulesData, setModulesData] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  
  // 表单数据
  const [formData, setFormData] = useState<FormData>({
    project: '',
    module: '',
    scenario: '',
    testPoint: '',
    caseType: '',
    caseVersion: '',
    caseId: '',
    priority: 'high',
    title: '',
    preconditions: '',
    testData: '',
    remarks: ''
  });
  
  // 测试步骤
  const [testSteps, setTestSteps] = useState<TestStep[]>([
    { id: `step-${Date.now()}`, step: '', expectedResult: '' }
  ]);
  
  // 新建场景/测试点/模块输入框显示状态
  const [showNewModule, setShowNewModule] = useState(false);
  const [showNewScenario, setShowNewScenario] = useState(false);
  const [showNewTestPoint, setShowNewTestPoint] = useState(false);
  const [newModuleName, setNewModuleName] = useState('');
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newTestPointName, setNewTestPointName] = useState('');
  
  // 拖拽相关状态
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
  
  // 草稿加载状态
  const [draftLoaded, setDraftLoaded] = useState(false);
  
  // 获取当前选中场景的测试点列表
  const currentTestPoints = scenariosData.find(s => s.value === formData.scenario)?.testPoints || [];
  
  // 加载系统字典列表
  useEffect(() => {
    const loadSystems = async () => {
      try {
        const systems = await systemService.getActiveSystems();
        setSystemOptions(systems);
      } catch (error) {
        console.error('加载系统列表失败:', error);
        showToast.error('加载系统列表失败');
      }
    };
    loadSystems();
  }, []);

  // 🆕 复制模式：加载源用例数据
  useEffect(() => {
    const loadCopySource = async () => {
      if (!copyFromId) return;
      
      try {
        setLoadingCopySource(true);
        const result: any = await functionalTestCaseService.getById(Number(copyFromId));
        
        if (result.success && result.data) {
          const testCase = result.data;
          
          // 反向映射用例类型
          const reverseCaseTypeMap: { [key: string]: string } = {
            'SMOKE': 'smoke',
            'FULL': 'full',
            'ABNORMAL': 'abnormal',
            'BOUNDARY': 'boundary',
            'PERFORMANCE': 'performance',
            'SECURITY': 'security',
            'USABILITY': 'usability',
            'COMPATIBILITY': 'compatibility',
            'RELIABILITY': 'reliability'
          };
          const dbCaseType = testCase.test_type || testCase.case_type || testCase.testType || testCase.caseType || '';
          const formCaseType = reverseCaseTypeMap[dbCaseType] || '';
          
          // 填充表单数据（名称添加"（副本）"后缀）
          setFormData({
            project: testCase.system || '',
            module: testCase.module || '',
            scenario: testCase.testScenario || testCase.scenarioName || testCase.scenario_name || '',
            testPoint: testCase.testPoints?.[0]?.testPointName || testCase.testPoints?.[0]?.testPoint || testCase.test_point_name || '',
            caseType: formCaseType,
            caseVersion: testCase.project_version?.version_name || testCase.project_version?.version_code || '',
            caseId: testCase.caseId || testCase.case_id || '',  // 🆕 复制时带出原用例ID
            priority: testCase.priority || 'medium',
            title: `${testCase.name || ''}（副本）`,  // 名称添加后缀
            preconditions: testCase.preconditions || '',
            testData: testCase.testData || testCase.test_data || '',
            remarks: testCase.description || ''
          });
          
          // 解析测试步骤
          if (testCase.steps) {
            const stepsArray = testCase.steps.split('\n').filter((s: string) => s.trim());
            const assertionsArray = (testCase.assertions || testCase.expected_result)?.split('\n').filter((s: string) => s.trim()) || [];
            
            const parsedSteps: TestStep[] = stepsArray.map((step: string, index: number) => ({
              id: `step-${Date.now()}-${index}`,
              step: step.replace(/^\d+\.\s*/, ''),
              expectedResult: assertionsArray[index]?.replace(/^\d+\.\s*/, '') || ''
            }));
            
            if (parsedSteps.length > 0) {
              setTestSteps(parsedSteps);
            }
          }
          
          showToast.success('已加载源数据，可修改后保存');
        } else {
          showToast.error('加载源用例失败');
        }
      } catch (error) {
        console.error('加载源用例失败:', error);
        showToast.error('加载源用例失败');
      } finally {
        setLoadingCopySource(false);
      }
    };
    
    loadCopySource();
  }, [copyFromId]);

  // 根据选择的项目加载版本列表
  useEffect(() => {
    const loadProjectVersions = async () => {
      if (!formData.project) {
        setProjectVersions([]);
        return;
      }

      // 根据项目名称找到项目ID
      const selectedSystem = systemOptions.find(s => s.name === formData.project);
      if (!selectedSystem) {
        setProjectVersions([]);
        return;
      }

      try {
        setLoadingVersions(true);
        const versions = await systemService.getProjectVersions(selectedSystem.id);
        setProjectVersions(versions);
        
        // 如果当前选择的版本不在新的版本列表中，清空版本选择
        if (formData.caseVersion && !versions.find(v => v.version_name === formData.caseVersion)) {
          setFormData(prev => ({ ...prev, caseVersion: '' }));
        }
      } catch (error) {
        console.error('加载项目版本失败:', error);
        showToast.error('加载项目版本失败');
        setProjectVersions([]);
      } finally {
        setLoadingVersions(false);
      }
    };

    loadProjectVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.project, systemOptions]);

  // 根据选择的项目加载测试场景列表
  useEffect(() => {
    const loadScenarios = async () => {
      if (!formData.project) {
        setScenariosData([]);
        return;
      }

      try {
        setLoadingScenarios(true);
        const scenarios = await functionalTestCaseService.getScenariosBySystem(formData.project);
        
        // 如果当前选择的场景不在新加载的列表中，将其作为临时选项添加进去（用于草稿恢复）
        let finalScenarios = scenarios;
        if (formData.scenario && formData.scenario !== '__new__' && !scenarios.find(s => s.value === formData.scenario)) {
          // 检查是否是自定义场景（custom- 开头）
          if (formData.scenario.startsWith('custom-')) {
            // 尝试从当前 scenariosData 中找到这个场景的完整信息（可能来自草稿恢复）
            setScenariosData(prev => {
              const existingScenario = prev.find(s => s.value === formData.scenario);
              if (existingScenario) {
                // 合并：保留草稿中的自定义场景，添加新加载的场景
                const customScenarios = prev.filter(s => s.value.startsWith('custom-'));
                return [...scenarios, ...customScenarios];
              }
              return scenarios;
            });
            setLoadingScenarios(false);
            return; // 提前返回，因为已经设置了 scenariosData
          } else {
            // 普通场景，添加为临时选项
            finalScenarios = [...scenarios, { value: formData.scenario, label: formData.scenario, testPoints: [] }];
          }
        }
        
        setScenariosData(finalScenarios);
      } catch (error) {
        console.error('加载测试场景失败:', error);
        // 不显示错误提示，因为可能是新项目还没有场景数据
        // 如果有当前场景值，至少添加它
        if (formData.scenario && formData.scenario !== '__new__') {
          setScenariosData([{ value: formData.scenario, label: formData.scenario, testPoints: [] }]);
        } else {
          setScenariosData([]);
        }
      } finally {
        setLoadingScenarios(false);
      }
    };

    loadScenarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.project]);

  // 根据选择的项目加载模块列表
  useEffect(() => {
    const loadModules = async () => {
      if (!formData.project) {
        setModulesData([]);
        return;
      }

      try {
        setLoadingModules(true);
        const modules = await functionalTestCaseService.getModulesBySystem(formData.project);
        
        // 如果当前选择的模块不在新加载的列表中，将其作为临时选项添加进去（用于草稿恢复）
        let finalModules = modules;
        if (formData.module && !modules.find(m => m.value === formData.module)) {
          finalModules = [...modules, { value: formData.module, label: formData.module }];
        }
        
        setModulesData(finalModules);
      } catch (error) {
        console.error('加载模块列表失败:', error);
        // 不显示错误提示，因为可能是新项目还没有模块数据
        // 如果有当前模块值，至少添加它
        if (formData.module) {
          setModulesData([{ value: formData.module, label: formData.module }]);
        } else {
          setModulesData([]);
        }
      } finally {
        setLoadingModules(false);
      }
    };

    loadModules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.project]);

  // 页面加载时检查草稿
  useEffect(() => {
    const checkDraft = () => {
      if (draftLoaded) return;

      try {
        const draftStr = localStorage.getItem(DRAFT_CACHE_KEY);
        if (!draftStr) {
          setDraftLoaded(true);
          return;
        }

        const draft: DraftData = JSON.parse(draftStr);
        const timeDiff = Date.now() - draft.timestamp;
        const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

        // 格式化时间显示
        let timeText = '';
        if (daysDiff > 0) {
          timeText = ` ${daysDiff}天 前`;
        } else {
          const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
          if (hoursDiff > 0) {
            timeText = ` ${hoursDiff}小时 前`;
          } else {
            const minutesDiff = Math.floor(timeDiff / (1000 * 60));
            timeText = ` ${minutesDiff}分钟 前`;
          }
        }

        // 处理显示文本：如果是新建，显示新建的名称
        const displayModule = draft.formData.module === '__new__' 
          ? (draft.newModuleName ? `${draft.newModuleName}（新建）` : '新建模块')
          : (draft.formData.module || '未选择');
        
        // 场景：如果是 __new__ 显示新建状态，如果是 custom- 开头则从 scenariosData 查找名称
        let displayScenario = '未选择';
        if (draft.formData.scenario === '__new__') {
          displayScenario = draft.newScenarioName ? `${draft.newScenarioName}（新建）` : '新建场景';
        } else if (draft.formData.scenario) {
          if (draft.formData.scenario.startsWith('custom-')) {
            // 从 scenariosData 中查找对应的名称
            const scenario = draft.scenariosData?.find(s => s.value === draft.formData.scenario);
            displayScenario = scenario ? `${scenario.label}（已添加）` : draft.formData.scenario;
          } else {
            displayScenario = draft.formData.scenario;
          }
        }
        
        // 测试点：如果是 __new__ 显示新建状态，如果是 custom-point- 开头则从 scenariosData 查找名称
        let displayTestPoint = '未选择';
        if (draft.formData.testPoint === '__new__') {
          displayTestPoint = draft.newTestPointName ? `${draft.newTestPointName}（新建）` : '新建测试点';
        } else if (draft.formData.testPoint) {
          if (draft.formData.testPoint.startsWith('custom-point-')) {
            // 从 scenariosData 中查找对应的名称
            const scenario = draft.scenariosData?.find(s => s.value === draft.formData.scenario);
            const testPoint = scenario?.testPoints?.find(tp => tp.value === draft.formData.testPoint);
            displayTestPoint = testPoint ? `${testPoint.label}（已添加）` : draft.formData.testPoint;
          } else {
            displayTestPoint = draft.formData.testPoint;
          }
        }
        
        Modal.confirm({
          title: '发现未完成的草稿',
          width: 600,
          content: (
            <div>
              <p>发现未完成的草稿（保存于{timeText}）</p>
              <p>所属项目：{draft.formData.project || '未选择'}</p>
              <p>所属模块：{displayModule}</p>
              <p>测试场景：{displayScenario}</p>
              <p>测试点：{displayTestPoint}</p>
              <p>用例标题：{draft.formData.title || '未填写'}</p>
              <br />
              <p>是否继续编辑？</p>
            </div>
          ),
          okText: '恢复草稿',
          cancelText: '开始新建',
          onOk: () => {
            // 恢复草稿数据
            setFormData(draft.formData);
            setTestSteps(draft.testSteps);
            if (draft.scenariosData && draft.scenariosData.length > 0) {
              setScenariosData(draft.scenariosData);
            }
            
            // 恢复新建相关状态
            if (draft.showNewModule !== undefined) {
              setShowNewModule(draft.showNewModule);
            }
            if (draft.showNewScenario !== undefined) {
              setShowNewScenario(draft.showNewScenario);
            }
            if (draft.showNewTestPoint !== undefined) {
              setShowNewTestPoint(draft.showNewTestPoint);
            }
            if (draft.newModuleName) {
              setNewModuleName(draft.newModuleName);
            }
            if (draft.newScenarioName) {
              setNewScenarioName(draft.newScenarioName);
            }
            if (draft.newTestPointName) {
              setNewTestPointName(draft.newTestPointName);
            }
            
            showToast.success('已恢复上次编辑的内容');
          },
          onCancel: () => {
            // 不恢复，清除草稿
            localStorage.removeItem(DRAFT_CACHE_KEY);
          }
        });
      } catch (error) {
        console.error('加载草稿失败:', error);
        localStorage.removeItem(DRAFT_CACHE_KEY);
      } finally {
        setDraftLoaded(true);
      }
    };

    // 等待系统列表加载完成后再检查草稿
    if (systemOptions.length > 0) {
      checkDraft();
    }
  }, [systemOptions, draftLoaded]);
  
  /**
   * 处理表单字段变更
   */
  const handleFieldChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // 如果切换项目，重置版本、模块、场景和测试点选择，并隐藏所有新建输入框
    if (field === 'project') {
      setFormData(prev => ({ ...prev, caseVersion: '', module: '', scenario: '', testPoint: '' }));
      // 隐藏所有新建输入框
      setShowNewModule(false);
      setShowNewScenario(false);
      setShowNewTestPoint(false);
      // 清空新建输入内容
      setNewModuleName('');
      setNewScenarioName('');
      setNewTestPointName('');
    }
    
    // 如果选择"新建模块"
    if (field === 'module' && value === '__new__') {
      setShowNewModule(true);
    } else if (field === 'module') {
      setShowNewModule(false);
      setNewModuleName('');
    }
    
    // 如果切换场景，重置测试点
    if (field === 'scenario') {
      setFormData(prev => ({ ...prev, testPoint: '' }));
      
      // 如果选择"新建场景"
      if (value === '__new__') {
        setShowNewScenario(true);
        setShowNewTestPoint(true);
      } else {
        setShowNewScenario(false);
        setShowNewTestPoint(false);
        setNewScenarioName('');
        setNewTestPointName('');
      }
    }
    
    // 如果选择"新建测试点"
    if (field === 'testPoint' && value === '__new__') {
      setShowNewTestPoint(true);
    } else if (field === 'testPoint') {
      setShowNewTestPoint(false);
      setNewTestPointName('');
    }
  };
  
  /**
   * 添加新模块
   */
  const handleAddNewModule = () => {
    if (!newModuleName.trim()) {
      showToast.error('请输入模块名称');
      return;
    }
    
    const newModule = {
      value: newModuleName.trim(),
      label: newModuleName.trim()
    };
    
    setModulesData(prev => [...prev, newModule]);
    setFormData(prev => ({ ...prev, module: newModule.value }));
    setShowNewModule(false);
    setNewModuleName('');
    showToast.success('模块已添加');
  };
  
  /**
   * 添加新场景
   */
  const handleAddNewScenario = () => {
    if (!newScenarioName.trim()) {
      showToast.error('请输入测试场景名称');
      return;
    }
    
    const newScenario: ScenarioData = {
      value: `custom-${Date.now()}`,
      label: newScenarioName.trim(),
      testPoints: []
    };
    
    setScenariosData(prev => [...prev, newScenario]);
    setFormData(prev => ({ ...prev, scenario: newScenario.value, testPoint: '' }));
    setShowNewScenario(false);
    setNewScenarioName('');
    showToast.success('测试场景已添加');
  };
  
  /**
   * 添加新测试点
   */
  const handleAddNewTestPoint = () => {
    if (!formData.scenario || formData.scenario === '__new__') {
      showToast.error('请先选择测试场景');
      return;
    }
    
    if (!newTestPointName.trim()) {
      showToast.error('请输入测试点名称');
      return;
    }
    
    const newTestPoint = {
      value: `custom-point-${Date.now()}`,
      label: newTestPointName.trim()
    };
    
    setScenariosData(prev => prev.map(s => 
      s.value === formData.scenario 
        ? { ...s, testPoints: [...s.testPoints, newTestPoint] }
        : s
    ));
    
    setFormData(prev => ({ ...prev, testPoint: newTestPoint.value }));
    setShowNewTestPoint(false);
    setNewTestPointName('');
    showToast.success('测试点已添加');
  };
  
  /**
   * 添加测试步骤
   */
  const handleAddStep = () => {
    const newStep: TestStep = {
      id: `step-${Date.now()}`,
      step: '',
      expectedResult: ''
    };
    setTestSteps(prev => [...prev, newStep]);
  };
  
  /**
   * 删除测试步骤
   */
  const handleDeleteStep = (stepId: string) => {
    if (testSteps.length <= 1) {
      showToast.error('至少保留一个测试步骤');
      return;
    }
    setTestSteps(prev => prev.filter(s => s.id !== stepId));
  };
  
  /**
   * 更新测试步骤
   */
  const handleUpdateStep = (stepId: string, field: 'step' | 'expectedResult', value: string) => {
    setTestSteps(prev => prev.map(s => 
      s.id === stepId ? { ...s, [field]: value } : s
    ));
  };
  
  /**
   * 在指定位置之前插入步骤
   */
  const handleInsertBefore = (stepId: string) => {
    const index = testSteps.findIndex(s => s.id === stepId);
    if (index === -1) return;
    
    const newStep: TestStep = {
      id: `step-${Date.now()}`,
      step: '',
      expectedResult: ''
    };
    
    const newSteps = [...testSteps];
    newSteps.splice(index, 0, newStep);
    setTestSteps(newSteps);
  };
  
  /**
   * 在指定位置之后插入步骤
   */
  const handleInsertAfter = (stepId: string) => {
    const index = testSteps.findIndex(s => s.id === stepId);
    if (index === -1) return;
    
    const newStep: TestStep = {
      id: `step-${Date.now()}`,
      step: '',
      expectedResult: ''
    };
    
    const newSteps = [...testSteps];
    newSteps.splice(index + 1, 0, newStep);
    setTestSteps(newSteps);
  };
  
  /**
   * 复制测试步骤
   */
  const handleCopyStep = (stepId: string) => {
    const step = testSteps.find(s => s.id === stepId);
    if (!step) return;
    
    const newStep: TestStep = {
      id: `step-${Date.now()}`,
      step: step.step,
      expectedResult: step.expectedResult
    };
    
    const index = testSteps.findIndex(s => s.id === stepId);
    const newSteps = [...testSteps];
    newSteps.splice(index + 1, 0, newStep);
    setTestSteps(newSteps);
  };
  
  /**
   * 拖拽开始
   */
  const handleDragStart = (e: React.DragEvent, stepId: string) => {
    setDraggedStepId(stepId);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  /**
   * 拖拽经过
   */
  const handleDragOver = (e: React.DragEvent, targetStepId: string) => {
    e.preventDefault();
    if (!draggedStepId || draggedStepId === targetStepId) return;
    
    const draggedIndex = testSteps.findIndex(s => s.id === draggedStepId);
    const targetIndex = testSteps.findIndex(s => s.id === targetStepId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const newSteps = [...testSteps];
    const [draggedStep] = newSteps.splice(draggedIndex, 1);
    newSteps.splice(targetIndex, 0, draggedStep);
    setTestSteps(newSteps);
  };
  
  /**
   * 拖拽结束
   */
  const handleDragEnd = () => {
    setDraggedStepId(null);
  };
  
  /**
   * AI生成测试数据
   */
  const handleGenerateTestData = async () => {
    if (!formData.title) {
      showToast.error('请先填写测试用例标题，AI将根据标题生成测试数据');
      return;
    }
    
    setGeneratingData(true);
    
    // 模拟AI生成（实际应调用后端API）
    setTimeout(() => {
      const mockData = `用户名：testuser001\n密码：Test@123456\n邮箱：testuser@example.com\n手机号：13800138000\n验证码：888888`;
      setFormData(prev => ({ ...prev, testData: mockData }));
      setGeneratingData(false);
      showToast.success('测试数据已生成');
    }, 2000);
  };
  
  /**
   * 表单验证
   */
  const validateForm = (): boolean => {
    // 验证基本信息
    if (!formData.project) {
      showToast.error('请选择所属项目');
      return false;
    }
    
    if (!formData.module) {
      showToast.error('请选择所属模块');
      return false;
    }
    
    // 验证场景和测试点
    if (!formData.scenario || formData.scenario === '__new__') {
      showToast.error('请选择或添加测试场景');
      return false;
    }
    
    if (!formData.testPoint || formData.testPoint === '__new__') {
      showToast.error('请选择或添加测试点');
      return false;
    }
    
    // 验证用例信息
    if (!formData.caseType) {
      showToast.error('请选择用例类型');
      return false;
    }
    
    if (!formData.caseVersion) {
      showToast.error('请选择用例版本');
      return false;
    }
    
    // if (!formData.caseId) {
    //   showToast.error('请填写用例ID');
    //   return false;
    // }
    
    if (!formData.title) {
      showToast.error('请填写用例标题');
      return false;
    }
    
    // 验证测试步骤
    const hasValidSteps = testSteps.some(s => s.step.trim() !== '');
    if (!hasValidSteps) {
      showToast.error('请至少填写一个测试步骤');
      return false;
    }
    
    return true;
  };
  
  /**
   * 保存草稿
   */
  const handleSaveDraft = useCallback((silent = false) => {
    try {
      const draftData: DraftData = {
        formData,
        testSteps,
        scenariosData,
        timestamp: Date.now(),
        // 保存新建相关状态
        showNewModule,
        showNewScenario,
        showNewTestPoint,
        newModuleName,
        newScenarioName,
        newTestPointName
      };
      
      localStorage.setItem(DRAFT_CACHE_KEY, JSON.stringify(draftData));
      if (!silent) {
        showToast.success('测试用例草稿已保存');
      }
    } catch (error) {
      console.error('保存草稿失败:', error);
      if (!silent) {
        showToast.error('保存草稿失败');
      }
    }
  }, [formData, testSteps, scenariosData, showNewModule, showNewScenario, showNewTestPoint, newModuleName, newScenarioName, newTestPointName]);
  
  /**
   * 自动保存草稿（每3分钟）
   */
  useEffect(() => {
    // 检查是否有内容需要保存
    const hasContent = () => {
      return formData.title || 
             formData.project || 
             formData.module ||
             formData.scenario ||
             formData.caseId || 
             testSteps.some(s => s.step || s.expectedResult);
    };
    
    // 设置定时器，每3分钟自动保存
    const autoSaveInterval = setInterval(() => {
      if (hasContent() && !saving) {
        handleSaveDraft(true); // 静默保存，不显示提示
        console.log('自动保存草稿:', new Date().toLocaleTimeString());
      }
    }, 3 * 60 * 1000); // 3分钟
    
    // 清除定时器
    return () => clearInterval(autoSaveInterval);
  }, [formData, testSteps, saving, handleSaveDraft]);
  
  /**
   * 提交创建
   */
  const handleSubmit = async () => {
    if (saving) return;
    if (!validateForm()) return;
    
    try {
      setSaving(true);
      
      // 构建测试步骤文本
      const stepsText = testSteps
        .filter(s => s.step.trim())
        .map((s, index) => `${index + 1}. ${s.step}`)
        .join('\n');
      
      const assertionsText = testSteps
        .filter(s => s.expectedResult.trim())
        .map((s, index) => `${index + 1}. ${s.expectedResult}`)
        .join('\n');
      
      // 获取场景和测试点的显示名称
      const scenarioLabel = scenariosData.find(s => s.value === formData.scenario)?.label || formData.scenario;
      const testPointLabel = currentTestPoints.find(p => p.value === formData.testPoint)?.label || formData.testPoint;
      
      // 获取项目版本ID
      const selectedVersion = projectVersions.find(v => v.version_name === formData.caseVersion);
      
      // 映射用例类型到数据库枚举值
      const caseTypeMap: { [key: string]: string } = {
        'smoke': 'SMOKE',
        'full': 'FULL',
        'abnormal': 'ABNORMAL',
        'boundary': 'BOUNDARY',
        'performance': 'PERFORMANCE',
        'security': 'SECURITY',
        'usability': 'USABILITY',
        'compatibility': 'COMPATIBILITY',
        'reliability': 'RELIABILITY'
      };
      const mappedCaseType = caseTypeMap[formData.caseType] || 'FULL';
      
      // 构建测试用例数据（与后端路由API接口保持一致）
      const testCaseData = {
        // 用例基本信息
        caseId: formData.caseId,  // 用例编号，如 TC_LOGIN_001
        name: formData.title,  // 用例标题
        description: formData.remarks || '',  // 用例描述（备注说明）
        system: formData.project,  // 所属项目
        module: formData.module,  // 所属模块
        priority: formData.priority,  // 优先级
        status: 'DRAFT' as const,  // 状态：草稿
        
        // 用例类型（发送映射后的数据库枚举值）
        caseType: mappedCaseType,  // 数据库枚举值（SMOKE/FULL等）
        testType: mappedCaseType,  // 保持一致
        
        // 场景和分类信息
        testScenario: scenarioLabel,  // ⚠️ 后端路由期望使用 testScenario 字段
        scenarioName: scenarioLabel,  // 测试场景名称（service层使用）
        scenarioDescription: `验证${scenarioLabel}功能`,  // 场景描述（可选）
        tags: scenarioLabel,  // 标签（使用场景名称）
        coverageAreas: scenarioLabel,  // 覆盖范围
        sectionName: '',  // 章节名称（手动创建时为空）
        
        // 测试步骤和预期结果（用例级别，放在外层）
        steps: stepsText,  // 用例级别的测试步骤
        assertions: assertionsText,  // 用例级别的预期结果
        expectedResult: assertionsText,  // 预期结果（兼容字段）
        
        // 测试相关信息
        preconditions: formData.preconditions,  // 前置条件
        testData: formData.testData,  // 测试数据
        
        // 项目版本
        projectVersionId: selectedVersion?.id,  // 项目版本ID
        
        // 测试点信息（每个用例对应一个测试点）
        testPoints: [{
          testPoint: testPointLabel,  // ⚠️ 后端统一使用 testPoint 字段
          testPointName: testPointLabel,  // 测试点名称（兼容字段）
          testPurpose: `验证${testPointLabel}功能`,  // 测试目的
          steps: stepsText,  // 测试步骤（测试点级别）
          expectedResult: assertionsText,  // 预期结果（测试点级别）
          riskLevel: 'medium' as const  // 风险等级
        }]
      };
      
      // 调用创建API
      const result = await functionalTestCaseService.create(testCaseData) as { success: boolean; error?: string };
      
      if (result.success) {
        // 清除草稿
        localStorage.removeItem(DRAFT_CACHE_KEY);
        
        showToast.success('测试用例创建成功');
        setTimeout(() => {
          navigate('/functional-test-cases');
        }, 1000);
      } else {
        showToast.error('创建失败：' + (result.error || '未知错误'));
      }
    } catch (error) {
      console.error('创建测试用例失败:', error);
      showToast.error('创建失败：' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setSaving(false);
    }
  };
  
  /**
   * 取消创建
   */
  const handleCancel = () => {
    // 检查是否有未保存的内容
    const hasContent = 
      formData.title || 
      formData.project || 
      formData.caseId || 
      testSteps.some(s => s.step || s.expectedResult);

    if (hasContent) {
      Modal.confirm({
        title: '保存草稿？',
        content: '当前有未保存的内容，是否保存为草稿？',
        okText: '保存并离开',
        cancelText: '直接离开',
        onOk: () => {
          handleSaveDraft();
          navigate('/functional-test-cases');
        },
        onCancel: () => {
          navigate('/functional-test-cases');
        }
      });
    } else {
      navigate('/functional-test-cases');
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 pb-5">
      {/* 🆕 复制模式加载状态 */}
      {loadingCopySource && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg px-8 py-6 flex items-center gap-3 shadow-xl">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-gray-700">正在加载源用例数据...</span>
          </div>
        </div>
      )}
      <div className="max-w-[1100px] mx-auto">
        {/* 用例信息卡片 */}
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-700 text-white px-8 py-6 flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-[28px] font-bold mb-2 tracking-tight">
                {copyFromId ? '复制测试用例' : '创建测试用例'}
              </h1>
              <p className="text-sm opacity-90">
                {copyFromId ? '基于现有用例创建新用例，请修改后保存' : '填写完整的测试用例信息'}
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="bg-white/20 hover:bg-white/30 border border-white/30 hover:border-white/50 text-white px-5 py-2.5 rounded-md text-sm font-medium transition-all"
            >
              返回列表
            </button>
          </div>

          <div className="overflow-hidden">
          {/* 提示信息 */}
          <div className="px-6 py-5">
            <div className="bg-indigo-50/50 border-l-[3px] border-indigo-500 px-3.5 py-2.5 rounded-[5px] mb-4">
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-1">
                  <p className="text-xs font-semibold text-indigo-700 mb-1">💡 填写提示</p>
                  <p className="text-[11px] text-indigo-600 leading-relaxed">
                    请仔细填写测试用例信息，确保测试步骤清晰、预期结果明确。带 * 号的为必填项。
                  </p>
                </div>
              </div>
            </div>
            {/* 基本信息 */}
            <div className="mb-5">
              <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-800">📋 基本信息</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3.5 mb-2.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    所属项目 <span className="text-red-500">*</span>
                  </label>
                  <Select
                  showSearch
                  allowClear
                    suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                    value={formData.project || undefined}
                    onChange={(value) => handleFieldChange('project', value)}
                    placeholder="请选择项目"
                    className="w-full [&_.ant-select-selector]:!h-[32px] [&_.ant-select-selector]:!py-[7px] [&_.ant-select-selector]:!px-2.5 [&_.ant-select-selector]:!text-[13px] [&_.ant-select-selector]:!rounded-[5px] [&_.ant-select-selector]:!border-gray-300"
                  >
                    <Option value="">请选择项目</Option>
                    {systemOptions.map(sys => (
                      <Option key={sys.id} value={sys.name}>{sys.name}</Option>
                    ))}
                  </Select>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    所属模块 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <Select
                      suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                      value={formData.module || undefined}
                      onChange={(value) => handleFieldChange('module', value)}
                      placeholder={formData.project ? (loadingModules ? "加载中..." : "请选择模块") : "请先选择项目"}
                      disabled={!formData.project || loadingModules}
                      loading={loadingModules}
                      showSearch
                      allowClear
                      filterOption={(input, option) =>
                        (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                      }
                      className="flex-1 [&_.ant-select-selector]:!h-[32px] [&_.ant-select-selector]:!py-[7px] [&_.ant-select-selector]:!px-2.5 [&_.ant-select-selector]:!text-[13px] [&_.ant-select-selector]:!rounded-[5px] [&_.ant-select-selector]:!border-gray-300"
                    >
                      <Option value="">请选择模块</Option>
                      {modulesData.map(m => (
                        <Option key={m.value} value={m.value}>{m.label}</Option>
                      ))}
                      <Option value="__new__">+ 新建模块</Option>
                    </Select>
                    <button
                      onClick={() => {
                        if (!formData.project) {
                          showToast.error('请先选择项目');
                          return;
                        }
                        setShowNewModule(true);
                        setFormData(prev => ({ ...prev, module: '__new__' }));
                      }}
                      disabled={!formData.project}
                      className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-700 text-white rounded-[5px] flex items-center justify-center text-sm font-medium hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      title="新建模块"
                    >
                      +
                    </button>
                  </div>
                  {formData.project && modulesData.length === 0 && !loadingModules && (
                    <div className="text-xs text-gray-500 mt-1">该项目暂无模块，可以新建模块</div>
                  )}
                  {showNewModule && (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={newModuleName}
                        onChange={(e) => setNewModuleName(e.target.value)}
                        placeholder="请输入新模块名称"
                        onPressEnter={handleAddNewModule}
                        className="!h-[32px] !py-[7px] !px-2.5 !text-[13px] !rounded-[5px]"
                      />
                      <button
                        onClick={handleAddNewModule}
                        className="px-4 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-700 text-white rounded-[5px] text-xs font-semibold hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)] hover:-translate-y-0.5 transition-all"
                        style={{ width: '70px' }}
                      >
                        确 认
                      </button>
                    </div>
                  )}
                </div>
              </div>
                
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    测试场景 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <Select
                      suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                      value={formData.scenario || undefined}
                      onChange={(value) => handleFieldChange('scenario', value)}
                      placeholder={formData.project ? (loadingScenarios ? "加载中..." : "请选择测试场景") : "请先选择项目"}
                      disabled={!formData.project || loadingScenarios}
                      loading={loadingScenarios}
                      showSearch
                      allowClear
                      className="flex-1 [&_.ant-select-selector]:!h-[32px] [&_.ant-select-selector]:!py-[7px] [&_.ant-select-selector]:!px-2.5 [&_.ant-select-selector]:!text-[13px] [&_.ant-select-selector]:!rounded-[5px] [&_.ant-select-selector]:!border-gray-300"
                    >
                      <Option value="">请选择测试场景</Option>
                      {scenariosData.map(s => (
                        <Option key={s.value} value={s.value}>{s.label}</Option>
                      ))}
                      <Option value="__new__">+ 新建场景</Option>
                    </Select>
                    <button
                      onClick={() => {
                        setShowNewScenario(true);
                        setFormData(prev => ({ ...prev, scenario: '__new__' }));
                      }}
                      className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-700 text-white rounded-[5px] flex items-center justify-center text-sm font-medium hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      title="新建测试场景"
                    >
                      +
                    </button>
                  </div>
                  {formData.project && scenariosData.length === 0 && !loadingScenarios && (
                    <div className="text-xs text-gray-500 mt-1">该项目暂无测试场景，可以新建场景</div>
                  )}
                  {showNewScenario && (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={newScenarioName}
                        onChange={(e) => setNewScenarioName(e.target.value)}
                        placeholder="请输入新测试场景名称"
                        onPressEnter={handleAddNewScenario}
                        className="!h-[32px] !py-[7px] !px-2.5 !text-[13px] !rounded-[5px]"
                      />
                      <button
                        onClick={handleAddNewScenario}
                        className="px-4 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-700 text-white rounded-[5px] text-xs font-semibold hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)] hover:-translate-y-0.5 transition-all"
                        style={{ width: '70px' }}
                      >
                        确 认
                      </button>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    测试点 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <Select
                      suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                      value={formData.testPoint || undefined}
                      onChange={(value) => handleFieldChange('testPoint', value)}
                      placeholder={formData.scenario ? "请选择测试点" : "请先选择测试场景"}
                      className="flex-1 [&_.ant-select-selector]:!h-[32px] [&_.ant-select-selector]:!py-[7px] [&_.ant-select-selector]:!px-2.5 [&_.ant-select-selector]:!text-[13px] [&_.ant-select-selector]:!rounded-[5px] [&_.ant-select-selector]:!border-gray-300"
                      disabled={!formData.scenario || formData.scenario === '__new__'}
                      showSearch
                      allowClear
                    >
                      <Option value="">请选择测试点</Option>
                      {currentTestPoints.map(p => (
                        <Option key={p.value} value={p.value}>{p.label}</Option>
                      ))}
                      <Option value="__new__">+ 新建测试点</Option>
                    </Select>
                    <button
                      onClick={() => {
                        if (!formData.scenario || formData.scenario === '__new__') {
                          showToast.error('请先选择测试场景');
                          return;
                        }
                        setShowNewTestPoint(true);
                        setFormData(prev => ({ ...prev, testPoint: '__new__' }));
                      }}
                      className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-700 text-white rounded-[5px] flex items-center justify-center text-sm font-medium hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      disabled={!formData.scenario || formData.scenario === '__new__'}
                      title="新建测试点"
                    >
                      +
                    </button>
                  </div>
                  {showNewTestPoint && (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={newTestPointName}
                        onChange={(e) => setNewTestPointName(e.target.value)}
                        placeholder="请输入新测试点名称"
                        onPressEnter={handleAddNewTestPoint}
                        className="!h-[32px] !py-[7px] !px-2.5 !text-[13px] !rounded-[5px]"
                      />
                      <button
                        onClick={handleAddNewTestPoint}
                        className="px-4 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-700 text-white rounded-[5px] text-xs font-semibold hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)] hover:-translate-y-0.5 transition-all"
                        style={{ width: '70px' }}
                      >
                        确 认
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* 用例信息 */}
            <div className="mb-5">
              <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-800">📝 用例信息</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3.5 mb-2.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    用例类型 <span className="text-red-500">*</span>
                  </label>
                  <Select
                    suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                    value={formData.caseType || undefined}
                    onChange={(value) => handleFieldChange('caseType', value)}
                    placeholder="请选择用例类型"
                    showSearch
                    allowClear
                    filterOption={(input, option) =>
                      (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                    className="w-full [&_.ant-select-selector]:!h-[32px] [&_.ant-select-selector]:!py-[7px] [&_.ant-select-selector]:!px-2.5 [&_.ant-select-selector]:!text-[13px] [&_.ant-select-selector]:!rounded-[5px] [&_.ant-select-selector]:!border-gray-300"
                  >
                    <Option value="">请选择用例类型</Option>
                    <Option value="smoke">冒烟用例</Option>
                    <Option value="full">全量用例</Option>
                    <Option value="abnormal">异常用例</Option>
                    <Option value="boundary">边界用例</Option>
                    <Option value="performance">性能用例</Option>
                    <Option value="security">安全用例</Option>
                    <Option value="usability">可用性用例</Option>
                    <Option value="compatibility">兼容性用例</Option>
                    <Option value="reliability">可靠性用例</Option>
                  </Select>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    用例版本 <span className="text-red-500">*</span>
                  </label>
                  <Select
                    suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                    value={formData.caseVersion || undefined}
                    onChange={(value) => handleFieldChange('caseVersion', value)}
                    placeholder={formData.project ? (loadingVersions ? "加载中..." : "请选择用例版本") : "请先选择项目"}
                    disabled={!formData.project || loadingVersions}
                    loading={loadingVersions}
                    showSearch
                      allowClear
                    className="w-full [&_.ant-select-selector]:!h-[32px] [&_.ant-select-selector]:!py-[7px] [&_.ant-select-selector]:!px-2.5 [&_.ant-select-selector]:!text-[13px] [&_.ant-select-selector]:!rounded-[5px] [&_.ant-select-selector]:!border-gray-300"
                  >
                    <Option value="">请选择用例版本</Option>
                    {projectVersions
                      .filter(v => v.status === 'active')
                      .map(version => (
                        <Option key={version.id} value={version.version_name}>
                          {version.version_name} {version.is_main ? '(主线)' : ''}
                        </Option>
                      ))}
                  </Select>
                  {formData.project && projectVersions.length === 0 && !loadingVersions && (
                    <div className="text-xs text-gray-500 mt-1">
                      该项目暂无版本，请先在
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          // 保存当前创建页面的路径，以便返回时能正确导航回来
                          const currentPath = window.location.pathname;
                          addTab({
                            path: '/systems',
                            title: '项目管理',
                            icon: <FolderKanban className="h-4 w-4" />
                          });
                          navigate('/systems', { 
                            state: { 
                              returnPath: currentPath,
                              returnTitle: '创建测试用例'
                            },
                            replace: false  // 不使用replace，保留浏览器历史记录
                          });
                        }}
                        className="text-indigo-600 hover:text-indigo-800 underline cursor-pointer mx-1"
                      >
                        项目管理
                      </button>
                      中添加版本
                    </div>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3.5 mb-2.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    用例ID <span className="text-red-500"></span>
                  </label>
                  <Input
                    value={formData.caseId}
                    onChange={(e) => handleFieldChange('caseId', e.target.value)}
                    placeholder="格式：TC_模块_序号，例如：TC_LOGIN_001"
                    className="!h-[32px] !py-[7px] !px-2.5 !text-[13px] !rounded-[5px]"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    用例优先级 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2.5">
                    <label className="flex-1">
                      <input
                        type="radio"
                        name="priority"
                        value="high"
                        checked={formData.priority === 'high'}
                        onChange={(e) => handleFieldChange('priority', e.target.value)}
                        className="hidden peer"
                      />
                      <div className="h-8 flex items-center justify-center bg-gray-100 border border-gray-300 rounded-[5px] cursor-pointer transition-all peer-checked:border-indigo-500 peer-checked:bg-indigo-50/50 peer-checked:text-indigo-700 text-xs font-medium">
                        高
                      </div>
                    </label>
                    <label className="flex-1">
                      <input
                        type="radio"
                        name="priority"
                        value="medium"
                        checked={formData.priority === 'medium'}
                        onChange={(e) => handleFieldChange('priority', e.target.value)}
                        className="hidden peer"
                      />
                      <div className="h-8 flex items-center justify-center bg-gray-100 border border-gray-300 rounded-[5px] cursor-pointer transition-all peer-checked:border-indigo-500 peer-checked:bg-indigo-50/50 peer-checked:text-indigo-700 text-xs font-medium">
                        中
                      </div>
                    </label>
                    <label className="flex-1">
                      <input
                        type="radio"
                        name="priority"
                        value="low"
                        checked={formData.priority === 'low'}
                        onChange={(e) => handleFieldChange('priority', e.target.value)}
                        className="hidden peer"
                      />
                      <div className="h-8 flex items-center justify-center bg-gray-100 border border-gray-300 rounded-[5px] cursor-pointer transition-all peer-checked:border-indigo-500 peer-checked:bg-indigo-50/50 peer-checked:text-indigo-700 text-xs font-medium">
                        低
                      </div>
                    </label>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  用例标题 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.title}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  placeholder="请输入清晰简洁的测试用例标题"
                  className="!h-[32px] !py-[7px] !px-2.5 !text-[13px] !rounded-[5px]"
                />
              </div>
            </div>
            
            {/* 前置条件和测试数据 */}
            <div className="grid grid-cols-2 gap-3.5 mb-5">
              <div>
                <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-800 mb-1.5">🔧 前置条件</span>
                </div>
                <TextArea
                  value={formData.preconditions}
                  onChange={(e) => handleFieldChange('preconditions', e.target.value)}
                  placeholder="请描述执行此测试用例前需要满足的条件..."
                  rows={5}
                  className="!py-2 !px-2.5 !text-[13px] !leading-[1.5] !rounded-[5px]"
                />
              </div>
              
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-3 pb-2 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-800">📊 测试数据</span>
                  <button
                    onClick={handleGenerateTestData}
                    disabled={generatingData}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 h-[26px] bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-[11px] font-semibold rounded-[4px] hover:shadow-[0_3px_8px_rgba(159,122,234,0.4)] hover:-translate-y-px transition-all disabled:opacity-50"
                  >
                    {generatingData ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        🤖 AI 自动生成
                      </>
                    )}
                  </button>
                </div>
                <TextArea
                  value={formData.testData}
                  onChange={(e) => handleFieldChange('testData', e.target.value)}
                  placeholder="请描述测试过程中使用的数据..."
                  rows={5}
                  className="!py-2 !px-2.5 !text-[13px] !leading-[1.5] !rounded-[5px]"
                />
              </div>
            </div>
            
            {/* 测试步骤 */}
            <div className="mb-5">
              <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-800">📝 测试步骤</span>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="space-y-2">
                  {testSteps.map((step, index) => (
                    <div
                      key={step.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, step.id)}
                      onDragOver={(e) => handleDragOver(e, step.id)}
                      onDragEnd={handleDragEnd}
                      className={`bg-white border border-gray-200 rounded-[5px] p-2 transition-all hover:border-gray-300 hover:shadow-sm ${
                        draggedStepId === step.id ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 flex items-center justify-center w-[18px] h-[18px] text-sm flex-shrink-0"
                          title="拖动排序"
                        >
                          ⋮⋮
                        </div>
                        
                        <div className="w-[22px] h-[22px] rounded-full bg-gradient-to-br from-indigo-500 to-purple-700 text-white flex items-center justify-center text-[11px] font-semibold flex-shrink-0 mt-0.5">
                          {index + 1}
                        </div>
                        
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5 tracking-wide">
                              操作步骤
                            </div>
                            <TextArea
                              value={step.step}
                              onChange={(e) => handleUpdateStep(step.id, 'step', e.target.value)}
                              placeholder="请输入操作步骤..."
                              rows={2}
                              className="!text-xs !py-1.5 !px-2 !rounded-[4px] !min-h-[40px] !max-h-[200px]"
                            />
                          </div>
                          
                          <div>
                            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5 tracking-wide">
                              预期结果
                            </div>
                            <TextArea
                              value={step.expectedResult}
                              onChange={(e) => handleUpdateStep(step.id, 'expectedResult', e.target.value)}
                              placeholder="请输入预期结果..."
                              rows={2}
                              className="!text-xs !py-1.5 !px-2 !rounded-[4px] !min-h-[40px] !max-h-[200px]"
                            />
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                          <button
                            onClick={() => handleInsertBefore(step.id)}
                            className="w-[22px] h-[22px] flex items-center justify-center border border-gray-300 bg-white rounded-[3px] hover:bg-gray-50 hover:border-gray-400 hover:-translate-y-px transition-all text-[11px] text-gray-600"
                            title="在上方插入"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => handleInsertAfter(step.id)}
                            className="w-[22px] h-[22px] flex items-center justify-center border border-gray-300 bg-white rounded-[3px] hover:bg-gray-50 hover:border-gray-400 hover:-translate-y-px transition-all text-[11px] text-gray-600"
                            title="在下方插入"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => handleCopyStep(step.id)}
                            className="w-[22px] h-[22px] flex items-center justify-center border border-gray-300 bg-white rounded-[3px] hover:bg-gray-50 hover:border-gray-400 hover:-translate-y-px transition-all text-[11px] text-gray-600"
                            title="复制"
                          >
                            📋
                          </button>
                          <button
                            onClick={() => handleDeleteStep(step.id)}
                            className="w-[22px] h-[22px] flex items-center justify-center border border-gray-300 bg-white rounded-[3px] hover:bg-red-50 hover:border-red-400 hover:-translate-y-px transition-all text-[11px] text-red-600"
                            title="删除"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <button
                    onClick={handleAddStep}
                    className="w-full py-2 border border-dashed border-gray-300 bg-white rounded-[5px] text-gray-600 text-xs font-medium hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all"
                  >
                    ➕ 添加步骤
                  </button>
                </div>
              </div>
            </div>
            
            {/* 备注说明 */}
            <div className="mb-5">
              <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-800">💡 备注说明</span>
              </div>
              <TextArea
                value={formData.remarks}
                onChange={(e) => handleFieldChange('remarks', e.target.value)}
                placeholder="补充说明或注意事项..."
                rows={4}
                className="!py-2 !px-2.5 !text-[13px] !leading-[1.5] !rounded-[5px]"
              />
            </div>
          </div>
          
          {/* 底部操作栏 */}
          <div className="flex items-center justify-end gap-2 px-6 py-3.5 bg-gray-50 border-t border-gray-200">
            <button
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-[5px] text-xs font-semibold hover:border-indigo-500 hover:text-indigo-500 transition-all"
            >
              取消
            </button>
            <button
              onClick={() => handleSaveDraft()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-[5px] text-xs font-semibold hover:border-indigo-500 hover:text-indigo-500 transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              保存草稿
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-700 text-white rounded-[5px] text-xs font-semibold hover:shadow-[0_6px_20px_rgba(102,126,234,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  创建中...
                </>
              ) : (
                <>
                 {/* <Plus className="w-3.5 h-3.5" /> */}
                  创建用例
                </>
              )}
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

