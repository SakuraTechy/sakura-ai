import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Select } from 'antd';
import {
  Save,
  RotateCcw,
  TestTube,
  CheckCircle,
  XCircle,
  Loader,
  AlertCircle,
  Cpu,
  Zap,
  Download,
  Upload,
  RefreshCw,
  Info,
  HelpCircle,
  Settings as SettingsIcon,
  Trash2,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  modelRegistry, 
  settingsService, 
  llmConfigManager,
  type ModelDefinition,
  type LLMSettings,
  type ValidationError,
  type ConnectionTestResult
} from '../services';
import { 
  ErrorHandler, 
  type EnhancedError,
  handleApiError,
  handleStorageError,
  handleConfigError,
  handleValidationErrors
} from '../utils/errorHandling';
import {
  ConfigChangeDetector,
  StateManager,
  ImportExportManager,
  type ConfigChange,
  type ConfirmationDialogConfig
} from '../utils/stateManagement';

export function Settings() {
  // 状态管理
  const [showApiKey, setShowApiKey] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelDefinition[]>([]);
  const [currentSettings, setCurrentSettings] = useState<LLMSettings | null>(null);
  const [formData, setFormData] = useState<LLMSettings>({
    selectedModelId: '',
    apiKey: '',
    customModelName: '',
    customConfig: {
      temperature: 0.3,
      maxTokens: 1500
    }
  });
  
  // UI状态
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  const [pendingChanges, setPendingChanges] = useState<ConfigChange[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  // 🔥 新增：厂商模型列表状态
  const [providerModels, setProviderModels] = useState<Array<{ id: string; name: string; owned_by?: string }>>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [useCustomInput, setUseCustomInput] = useState(false); // 是否使用手动输入模式

  // 初始化
  useEffect(() => {
    initializeSettings();
  }, []);

  const initializeSettings = async () => {
    try {
      setIsLoading(true);
      
      // 获取可用模型
      const models = modelRegistry.getAvailableModels();
      setAvailableModels(models);
      
      // 获取当前设置
      let settings = await settingsService.getLLMSettings();
      
      // 🔥 确保 baseUrl 和 customModelName 根据模型配置正确设置
      if (settings.selectedModelId) {
        const model = modelRegistry.getModelById(settings.selectedModelId);
        if (model) {
          settings = {
            ...settings,
            baseUrl: settings.baseUrl || model.customBaseUrl || 'https://openrouter.ai/api/v1',
            customModelName: settings.customModelName || model.openRouterModel // 自动填充默认模型名称
          };
        }
      }
      
      setCurrentSettings(settings);
      setFormData(settings);
      
      // 🔥 如果模型要求手动输入，自动启用手动输入模式
      if (settings.selectedModelId) {
        const model = modelRegistry.getModelById(settings.selectedModelId);
        if (model?.requiresManualInput) {
          setUseCustomInput(true);
        }
      }
      
      // 🔥 如果有 apiKey 和 selectedModelId，且模型不要求手动输入，自动获取厂商模型列表
      if (settings.selectedModelId && settings.apiKey) {
        const model = modelRegistry.getModelById(settings.selectedModelId);
        if (!model?.requiresManualInput) {
          console.log('🔄 自动获取厂商模型列表...');
          // 延迟执行，确保状态已更新
          setTimeout(() => {
            autoFetchProviderModels(settings.selectedModelId, settings.apiKey, settings.baseUrl);
          }, 100);
        }
      }
      
      console.log('✅ 设置页面初始化完成', { 
        modelId: settings.selectedModelId, 
        baseUrl: settings.baseUrl,
        customModelName: settings.customModelName 
      });
    } catch (error) {
      console.error('❌ 设置页面初始化失败:', error);
      setSaveMessage({ type: 'error', text: '加载设置失败' });
    } finally {
      setIsLoading(false);
    }
  };

  // 获取选中模型的信息
  const getSelectedModel = (): ModelDefinition | null => {
    return availableModels.find(model => model.id === formData.selectedModelId) || null;
  };

  // 处理模型选择变更
  const handleModelChange = (modelId: string) => {
    const model = modelRegistry.getModelById(modelId);
    if (model) {
      setFormData(prev => ({
        ...prev,
        selectedModelId: modelId,
        baseUrl: model.customBaseUrl || 'https://openrouter.ai/api/v1',
        customModelName: model.openRouterModel, // 自动填充默认模型名称
        customConfig: {
          ...prev.customConfig,
          temperature: model.defaultConfig.temperature,
          maxTokens: model.defaultConfig.maxTokens
        }
      }));
      setValidationErrors([]);
      setConnectionResult(null);
      // 清空厂商模型列表
      setProviderModels([]);
      setModelsError(null);
      // 🔥 如果模型要求手动输入，自动启用；否则默认关闭
      setUseCustomInput(model.requiresManualInput || false);
      
      // 🔥 如果有 apiKey 且不需要手动输入，自动获取厂商模型列表
      if (formData.apiKey && !model.requiresManualInput) {
        const newBaseUrl = model.customBaseUrl || 'https://openrouter.ai/api/v1';
        setTimeout(() => {
          autoFetchProviderModels(modelId, formData.apiKey, newBaseUrl);
        }, 100);
      }
    }
  };

  // 🔥 自动获取厂商可用模型列表（不依赖 formData 状态）
  const autoFetchProviderModels = async (modelId: string, apiKey: string, customBaseUrl?: string) => {
    if (!modelId || !apiKey) {
      return;
    }

    setIsLoadingModels(true);
    setModelsError(null);

    try {
      // 构建查询参数，包含可选的自定义 baseUrl
      let url = `/api/config/available-models?modelId=${encodeURIComponent(modelId)}&apiKey=${encodeURIComponent(apiKey)}`;
      if (customBaseUrl) {
        url += `&baseUrl=${encodeURIComponent(customBaseUrl)}`;
      }
      const response = await fetch(url);
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || '获取模型列表失败');
      }

      setProviderModels(result.data.models || []);
      console.log(`✅ 自动获取到 ${result.data.models?.length || 0} 个可用模型`);
      
      // 如果没有模型，自动切换到手动输入模式
      if (!result.data.models || result.data.models.length === 0) {
        setModelsError('未获取到可用模型，可手动输入');
        setUseCustomInput(true);
      }
    } catch (error: any) {
      console.error('❌ 自动获取模型列表失败:', error);
      setModelsError(error.message || '获取模型列表失败，可手动输入');
      // 不自动切换到手动输入模式，让用户可以重试
    } finally {
      setIsLoadingModels(false);
    }
  };

  // 🔥 手动获取厂商可用模型列表（使用 formData 状态）
  const fetchProviderModels = async () => {
    if (!formData.selectedModelId || !formData.apiKey) {
      setModelsError('请先选择模型并输入API密钥');
      return;
    }
    await autoFetchProviderModels(formData.selectedModelId, formData.apiKey, formData.baseUrl);
  };

  // 处理表单字段变更
  const handleFieldChange = (field: string, value: any) => {
    if (field.startsWith('customConfig.')) {
      const configField = field.replace('customConfig.', '');
      setFormData(prev => ({
        ...prev,
        customConfig: {
          ...prev.customConfig,
          [configField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
    
    // 清除相关的验证错误
    setValidationErrors(prev => prev.filter(error => error.field !== field));
    setSaveMessage(null);
  };

  // 验证表单
  const validateForm = async (): Promise<boolean> => {
    try {
      const validation = await settingsService.validateLLMSettings(formData);
      setValidationErrors(validation.errors);
      return validation.isValid;
    } catch (error) {
      console.error('表单验证失败:', error);
      return false;
    }
  };

  // 保存设置
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSaveMessage(null);
      
      // 🔥 检查是否已通过连接测试
      if (!connectionResult?.success) {
        setSaveMessage({ type: 'error', text: '请先测试连接并确保连接成功后再保存设置' });
        return;
      }
      
      // 验证表单
      const isValid = await validateForm();
      if (!isValid && validationErrors.length > 0) {
        const enhancedErrors = handleValidationErrors(validationErrors);
        const errorMessages = enhancedErrors.map(e => e.userMessage).join(', ');
        setSaveMessage({ type: 'error', text: `配置验证失败: ${errorMessages}` });
        return;
      }
      
      // 🔥 确保 baseUrl 根据模型配置正确设置（优先使用 formData 中的值）
      const selectedModel = modelRegistry.getModelById(formData.selectedModelId);
      const settingsToSave: LLMSettings = {
        ...formData,
        baseUrl: formData.baseUrl || selectedModel?.customBaseUrl || 'https://openrouter.ai/api/v1'
      };
      
      console.log('💾 [前端] 保存设置数据:', {
        selectedModelId: settingsToSave.selectedModelId,
        baseUrl: settingsToSave.baseUrl,
        customModelName: settingsToSave.customModelName,
        hasApiKey: !!settingsToSave.apiKey
      });
      
      // 🔥 修复：settingsService.saveLLMSettings 内部已包含 API 同步，不需要再次调用
      // 保存设置到localStorage并同步到服务器
      await settingsService.saveLLMSettings(settingsToSave);
      
      // 更新前端配置管理器（仅更新内存中的配置）
      await llmConfigManager.updateConfig(settingsToSave);
      
      // 获取模型名称用于显示
      const modelName = settingsToSave.customModelName || selectedModel?.name || '新模型';
      console.log('✅ 设置保存成功:', modelName);
      
      setCurrentSettings(settingsToSave);
      setSaveMessage({ 
        type: 'success', 
        text: `设置保存成功，已切换到 ${modelName}` 
      });
      
    } catch (error: any) {
      console.error('❌ 保存设置失败:', error);
      
      // 使用增强的错误处理
      let enhancedError: EnhancedError;
      
      if (error.validationErrors) {
        enhancedError = handleValidationErrors(error.validationErrors)[0];
      } else if (error.type === 'STORAGE_ERROR') {
        enhancedError = handleStorageError(error);
      } else if (error.type === 'CONFIG_ERROR') {
        enhancedError = handleConfigError(error);
      } else {
        enhancedError = ErrorHandler.fromUnknownError(error);
      }
      
      setSaveMessage({ type: 'error', text: enhancedError.userMessage });
    } finally {
      setIsSaving(false);
    }
  };

  // 重置设置
  const handleReset = async () => {
    try {
      if (currentSettings) {
        setFormData(currentSettings);
        setValidationErrors([]);
        setSaveMessage(null);
        setConnectionResult(null);
      }
    } catch (error) {
      console.error('重置设置失败:', error);
    }
  };

  // 重置到默认配置
  const handleResetToDefaults = async () => {
    try {
      setIsSaving(true);
      setSaveMessage(null);
      
      // 重置LLM设置到默认值
      const defaultSettings = await settingsService.resetLLMToDefaults();
      
      // 更新配置管理器
      await llmConfigManager.updateConfig(defaultSettings);
      
      // 更新UI状态
      setCurrentSettings(defaultSettings);
      setFormData(defaultSettings);
      setValidationErrors([]);
      setConnectionResult(null);
      
      setSaveMessage({ type: 'success', text: '配置已重置为默认值' });
      console.log('✅ 配置重置为默认值成功');
      
    } catch (error: any) {
      console.error('❌ 重置配置失败:', error);
      
      // 使用增强的错误处理
      let enhancedError: EnhancedError;
      
      if (error.type === 'STORAGE_ERROR') {
        enhancedError = handleStorageError(error);
      } else if (error.type === 'CONFIG_ERROR') {
        enhancedError = handleConfigError(error);
      } else {
        enhancedError = ErrorHandler.fromUnknownError(error);
      }
      
      setSaveMessage({ type: 'error', text: enhancedError.userMessage });
    } finally {
      setIsSaving(false);
    }
  };

  // 测试连接
  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setConnectionResult(null);
      setSaveMessage(null);
      
      // 先验证表单
      const isValid = await validateForm();
      if (!isValid) {
        setSaveMessage({ type: 'error', text: '请先修正配置错误' });
        return;
      }
      
      // 🔥 确保 baseUrl 根据模型配置正确设置（优先使用 formData 中的值）
      const selectedModel = modelRegistry.getModelById(formData.selectedModelId);
      const testSettings: LLMSettings = {
        ...formData,
        baseUrl: formData.baseUrl || selectedModel?.customBaseUrl || 'https://openrouter.ai/api/v1'
      };
      
      console.log('🧪 [前端] 测试连接配置:', {
        selectedModelId: testSettings.selectedModelId,
        baseUrl: testSettings.baseUrl,
        customModelName: testSettings.customModelName
      });
      
      // 临时更新配置管理器进行测试
      await llmConfigManager.updateConfig(testSettings);
      
      // 测试连接
      const result = await llmConfigManager.testConnection();
      setConnectionResult(result);
      
      // 清除之前的保存消息（连接测试结果会在 connectionResult 区域显示，不需要 saveMessage）
      setSaveMessage(null);
      
    } catch (error: any) {
      console.error('❌ 连接测试失败:', error);
      
      // 异常情况下，设置连接结果为失败状态
      const enhancedError = handleApiError(error);
      setConnectionResult({
        success: false,
        error: enhancedError.userMessage,
        modelInfo: modelRegistry.getModelById(formData.selectedModelId) || modelRegistry.getDefaultModel(),
        timestamp: new Date()
      });
      
      // 清除保存消息（错误信息已在 connectionResult 中显示）
      setSaveMessage(null);
    } finally {
      setIsTesting(false);
    }
  };

  // 获取字段错误信息
  const getFieldError = (fieldName: string): string | null => {
    const error = validationErrors.find(err => err.field === fieldName);
    return error ? error.message : null;
  };

  // 检查表单是否有变更
  const hasChanges = (): boolean => {
    if (!currentSettings) return false;
    return JSON.stringify(formData) !== JSON.stringify(currentSettings);
  };

  // 导出配置
  const handleExportConfig = async () => {
    try {
      setIsExporting(true);
      
      const configData = await settingsService.exportSettings();
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `Sakura AI-config-${timestamp}.json`;
      
      ImportExportManager.downloadConfig(configData, filename);
      setSaveMessage({ type: 'success', text: '配置导出成功' });
      
    } catch (error: any) {
      console.error('❌ 导出配置失败:', error);
      setSaveMessage({ type: 'error', text: error.message || '导出配置失败' });
    } finally {
      setIsExporting(false);
    }
  };

  // 导入配置
  const handleImportConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setSaveMessage(null);
      
      // 读取文件内容
      const configData = await ImportExportManager.readConfigFile(file);
      
      // 验证文件格式
      const validation = ImportExportManager.validateConfigFile(configData);
      if (!validation.isValid) {
        setSaveMessage({ type: 'error', text: validation.error || '配置文件格式无效' });
        return;
      }
      
      // 导入设置
      await settingsService.importSettings(configData);
      
      // 重新加载设置
      await initializeSettings();
      
      // 更新配置管理器
      const newSettings = await settingsService.getLLMSettings();
      await llmConfigManager.updateConfig(newSettings);
      
      setSaveMessage({ type: 'success', text: '配置导入成功' });
      
    } catch (error: any) {
      console.error('❌ 导入配置失败:', error);
      
      // 使用增强的错误处理
      let enhancedError: EnhancedError;
      
      if (error.type === 'STORAGE_ERROR') {
        enhancedError = handleStorageError(error);
      } else if (error.type === 'CONFIG_ERROR') {
        enhancedError = handleConfigError(error);
      } else {
        enhancedError = ErrorHandler.fromUnknownError(error);
      }
      
      setSaveMessage({ type: 'error', text: enhancedError.userMessage });
    } finally {
      setIsImporting(false);
      // 清除文件输入
      event.target.value = '';
    }
  };

  // 检测配置变更
  const detectConfigChanges = (): ConfigChange[] => {
    if (!currentSettings) return [];
    return ConfigChangeDetector.detectChanges(currentSettings, formData);
  };

  // 处理保存前的变更确认
  const handleSaveWithConfirmation = async () => {
    const changes = detectConfigChanges();
    
    if (changes.length === 0) {
      await handleSave();
      return;
    }

    // 检查是否有重要变更
    const hasSignificantChanges = ConfigChangeDetector.hasSignificantChanges(changes);
    
    if (hasSignificantChanges) {
      // 显示确认对话框
      setPendingChanges(changes);
      setShowConfirmDialog(true);
    } else {
      // 直接保存
      await handleSave();
    }
  };

  // 处理确认对话框结果
  const handleConfirmationResult = async (confirmed: boolean) => {
    setShowConfirmDialog(false);
    setPendingChanges([]);
    
    if (confirmed) {
      await handleSave();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">加载设置中...</span>
      </div>
    );
  }

  const selectedModel = getSelectedModel();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">LLM 模型配置</h2>
        <p className="text-gray-600">配置AI模型和参数设置</p>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="space-y-6">
          
          {/* 模型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择AI模型
            </label>
            <select
              value={formData.selectedModelId}
              onChange={(e) => handleModelChange(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                getFieldError('selectedModelId') ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">请选择模型</option>
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider}) - {model.costLevel === 'high' ? '高性能' : '高性价比'}
                </option>
              ))}
            </select>
            {getFieldError('selectedModelId') && (
              <p className="mt-1 text-sm text-red-600">{getFieldError('selectedModelId')}</p>
            )}
          </div>

          {/* 模型信息卡片 */}
          {selectedModel && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  {selectedModel.costLevel === 'high' ? (
                    <Zap className="h-6 w-6 text-yellow-600" />
                  ) : (
                    <Cpu className="h-6 w-6 text-green-600" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{selectedModel.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{selectedModel.description}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedModel.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full"
                      >
                        {capability}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* API 地址配置 */}
          {formData.selectedModelId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API 地址
                <span className="ml-2 text-xs text-gray-500">
                  {selectedModel?.requiresManualInput
                    ? '(请手动输入本地地址)'
                    : '(可从厂商获取或使用指定的地址)'
                  }
                </span>
              </label>
              <input
                type="text"
                value={formData.baseUrl || ''}
                onChange={(e) => handleFieldChange('baseUrl', e.target.value)}
                placeholder={selectedModel?.customBaseUrl || 'https://openrouter.ai/api/v1'}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  getFieldError('baseUrl') ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {getFieldError('baseUrl') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('baseUrl')}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                默认: {selectedModel?.customBaseUrl || 'https://openrouter.ai/api/v1'}
              </p>
            </div>
          )}

          {/* 模型名称选择 */}
          {formData.selectedModelId && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  模型名称
                  <span className="ml-2 text-xs text-gray-500">
                    {selectedModel?.requiresManualInput 
                      ? '(请手动输入模型名称)'
                      : '(可从厂商获取或手动输入)'
                    }
                  </span>
                </label>
                {!selectedModel?.requiresManualInput && (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setUseCustomInput(!useCustomInput)}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      {useCustomInput ? '切换为选择模式' : '切换为手动输入'}
                    </button>
                  </div>
                )}
              </div>
              
              {(useCustomInput || selectedModel?.requiresManualInput) ? (
                /* 手动输入模式 */
                <input
                  type="text"
                  value={formData.customModelName || ''}
                  onChange={(e) => handleFieldChange('customModelName', e.target.value)}
                  placeholder={selectedModel?.openRouterModel || '请输入模型名称'}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    getFieldError('customModelName') ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
              ) : (
                /* 选择模式 */
                <div className="flex space-x-2">
                  <div className="flex-1 relative">
                    <Select
                      className="w-full h-10 rounded-md border-gray-300"
                      // size="large"
                      // style={{ width: '100%', height: '32px' }}
                      value={formData.customModelName || selectedModel?.openRouterModel || undefined}
                      onChange={(value) => handleFieldChange('customModelName', value)}
                      disabled={isLoadingModels}
                      loading={isLoadingModels}
                      placeholder="请选择模型"
                      showSearch
                      optionFilterProp="label"
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      status={getFieldError('customModelName') ? 'error' : undefined}
                      options={[
                        // 默认模型选项
                        {
                          label: selectedModel?.openRouterModel || '默认模型',
                          value: selectedModel?.openRouterModel || ''
                        },
                        // 如果当前保存的模型不是默认模型且不在 providerModels 中，单独显示
                        ...(formData.customModelName && 
                           formData.customModelName !== selectedModel?.openRouterModel &&
                           !providerModels.some(m => m.id === formData.customModelName)
                          ? [{
                              label: `${formData.customModelName} (当前配置)`,
                              value: formData.customModelName
                            }]
                          : []),
                        // 厂商模型列表
                        ...providerModels
                          .filter(model => model.id !== selectedModel?.openRouterModel)
                          .map(model => ({
                            label: model.id,
                            value: model.id
                          }))
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={fetchProviderModels}
                    disabled={isLoadingModels || !formData.apiKey}
                    title={!formData.apiKey ? '请先输入API密钥' : '从厂商获取可用模型列表'}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingModels ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              )}
              
              {getFieldError('customModelName') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('customModelName')}</p>
              )}
              
              {modelsError && !useCustomInput && !selectedModel?.requiresManualInput && (
                <p className="mt-1 text-sm text-amber-600">
                  <AlertCircle className="inline h-3 w-3 mr-1" />
                  {modelsError}
                </p>
              )}
              
              <p className="mt-1 text-sm text-gray-500">
                {providerModels.length > 0 && !useCustomInput && !selectedModel?.requiresManualInput ? (
                  <>已获取 {providerModels.length} 个可用模型</>
                ) : (
                  <>
                    默认: {selectedModel?.openRouterModel || '未选择模型'}
                    {!formData.apiKey && !selectedModel?.requiresManualInput && ' (输入API密钥后可获取厂商模型列表)'}
                  </>
                )}
              </p>
            </div>
          )}

          {/* API密钥 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API 密钥 {selectedModel?.requiresCustomAuth === false && selectedModel?.provider === 'Local' && (
                <span className="text-gray-500 font-normal">（本地模型可选）</span>
              )}
              {selectedModel?.requiresCustomAuth !== false && (
                <span className="text-red-500 font-normal">*</span>
              )}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={formData.apiKey}
                onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                placeholder={
                  selectedModel?.requiresCustomAuth === false && selectedModel?.provider === 'Local'
                    ? '本地模型无需API密钥（可选）'
                    : 'sk-or-v1-...'
                }
                className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  getFieldError('apiKey') || (selectedModel?.requiresCustomAuth !== false && !formData.apiKey) 
                    ? 'border-red-300' 
                    : 'border-gray-300'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700 transition-colors"
                aria-label={showApiKey ? '隐藏密钥' : '显示密钥'}
              >
                {showApiKey ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
            {getFieldError('apiKey') && (
              <p className="mt-1 text-sm text-red-600">{getFieldError('apiKey')}</p>
            )}
            {!getFieldError('apiKey') && selectedModel?.requiresCustomAuth !== false && !formData.apiKey && (
              <p className="mt-1 text-sm text-red-600">
                <AlertCircle className="inline h-3 w-3 mr-1" />
                云端模型必须配置API密钥
              </p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              {selectedModel?.requiresCustomAuth !== false
                ? (() => {
                    // 需要自定义认证的云端模型
                    if (selectedModel?.provider === 'Local') {
                      return '本地模型（Ollama、LM Studio等）通常不需要API密钥，如果您的本地服务配置了认证，请填写对应的密钥';
                    } else if (selectedModel?.provider === '百度') {
                      return (
                        <>
                          从 <a href="https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">百度智能云千帆</a> 获取API密钥（免费额度充足，需要Access Token）
                        </>
                      );
                    } else if (selectedModel?.provider === '阿里云') {
                      return (
                        <>
                          从 <a href="https://dashscope.console.aliyun.com/apiKey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">阿里云通义千问</a> 获取API密钥（免费额度充足）
                        </>
                      );
                    } else if (selectedModel?.provider === 'DeepSeek') {
                      return (
                        <>
                          从 <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">DeepSeek平台</a> 获取API密钥（免费额度充足）
                        </>
                      );
                    } else if (selectedModel?.provider === '月之暗面') {
                      return (
                        <>
                          从 <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">月之暗面Kimi平台</a> 获取API密钥（免费额度充足）
                        </>
                      );
                    } else if (selectedModel?.provider === '智谱AI') {
                      return (
                        <>
                          从 <a href="https://www.bigmodel.cn/invite?icode=GPn%2FAVpUcRZGmZ8p1ApgeVwpqjqOwPB5EXW6OL4DgqY%3D" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">智谱AI平台</a> 获取API密钥（免费额度充足）
                        </>
                      );
                    } else if (selectedModel?.provider === '火山引擎') {
                      return (
                        <>
                          从 <a href="https://activity.volcengine.com/2026/newyear-referral?ac=MMADFCCYM3WJ&rc=49TGX47J" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">火山引擎</a> 获取API密钥（免费额度充足）
                        </>
                      );
                    } else if (selectedModel?.provider === '七牛云') {
                      return (
                        <>
                          从 <a href="https://s.qiniu.com/miu2mq" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">七牛云</a> 获取API密钥（免费额度充足）
                        </>
                      );    
                    } else if (selectedModel?.provider === 'OpenRouter') {
                      return (
                        <>
                          从 <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">OpenRouter平台</a> 获取API密钥（支持多家厂商模型）
                        </>
                      );
                    } else if (selectedModel?.provider === 'Zenmux' || selectedModel?.provider === 'Google (Zenmux)') {
                      return (
                        <>
                          从 <a href="https://zenmux.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Zenmux平台</a> 获取API密钥（免费额度充足）
                        </>
                      );
                    } else if (selectedModel?.provider === 'NewApi') {
                      return (
                        <>
                          从 <a href="https://claude.ticketpro.cc/register?aff=X1E2" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">NewApi平台</a> 获取API密钥（兼容OpenAI格式）
                        </>
                      );
                    } else {
                      return `从 ${selectedModel?.provider || '模型提供商'} 获取认证密钥（参考项目文档配置）`;
                    }
                  })()
                : selectedModel?.customBaseUrl
                ? `从 ${selectedModel?.provider || '模型提供商'} 获取API密钥`
                : (
                  <>
                    从 <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">OpenRouter</a> 获取API密钥
                  </>
                )
              }
            </p>
          </div>

          {/* 模型参数 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temperature (创造性)
              </label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.customConfig?.temperature || 0.3}
                  onChange={(e) => handleFieldChange('customConfig.temperature', parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500">
                  <span>保守 (0)</span>
                  <span className="font-medium">{formData.customConfig?.temperature || 0.3}</span>
                  <span>创新 (2)</span>
                </div>
              </div>
              {getFieldError('temperature') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('temperature')}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Tokens (最大令牌数)
              </label>
              <input
                type="number"
                min="1"
                max="8000"
                value={formData.customConfig?.maxTokens || 1500}
                onChange={(e) => handleFieldChange('customConfig.maxTokens', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  getFieldError('maxTokens') ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {getFieldError('maxTokens') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('maxTokens')}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">控制AI响应的最大长度</p>
            </div>
          </div>

          {/* 连接测试结果 */}
          {connectionResult && (
            <div className={`rounded-lg p-4 ${
              connectionResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-center space-x-2">
                {connectionResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className={`font-medium ${
                  connectionResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {connectionResult.success ? '连接测试成功' : '连接测试失败'}
                </span>
                {connectionResult.success && connectionResult.responseTime && (
                  <span className="text-green-600">({connectionResult.responseTime}ms)</span>
                )}
              </div>
              {!connectionResult.success && connectionResult.error && (
                <p className="mt-2 text-sm text-red-700">{connectionResult.error}</p>
              )}
            </div>
          )}

          {/* 保存消息 */}
          {saveMessage && (
            <div className={`rounded-lg p-4 ${
              saveMessage.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-center space-x-2">
                {saveMessage.type === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <span className={`font-medium ${
                  saveMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
                }`}>
                  {saveMessage.text}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex justify-between">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !formData.selectedModelId || (!formData.apiKey && selectedModel?.requiresCustomAuth !== false)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isTesting ? (
                <Loader className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              {isTesting ? '测试中...' : '测试连接'}
            </button>

            <div className="flex space-x-3">
              <button
                onClick={handleReset}
                disabled={!hasChanges() || isSaving}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="h-4 w-4 mr-2 inline" />
                重置
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={!hasChanges() || isSaving || !connectionResult?.success}
                title={!connectionResult?.success ? '请先测试连接并确保连接成功' : undefined}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? (
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isSaving ? '保存中...' : '保存设置'}
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 默认导出以确保兼容性
export default Settings;