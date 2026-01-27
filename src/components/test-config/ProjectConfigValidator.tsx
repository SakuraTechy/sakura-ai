import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Settings, ExternalLink } from 'lucide-react';
import { Modal } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import * as testConfigService from '../../services/testConfigService';
import type { ConfigValidation } from '../../services/testConfigService';

interface ProjectConfigValidatorProps {
  projectId: number | null;
  projectName?: string;
  onValidationComplete?: (isValid: boolean) => void;
  autoValidate?: boolean;
  showWarnings?: boolean;
}

/**
 * 项目配置验证组件
 * 用于在测试用例生成前验证项目配置完整性
 */
export function ProjectConfigValidator({
  projectId,
  projectName,
  onValidationComplete,
  autoValidate = true,
  showWarnings = true
}: ProjectConfigValidatorProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [validation, setValidation] = useState<ConfigValidation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 自动验证
  useEffect(() => {
    if (autoValidate && projectId) {
      validateConfig();
    }
  }, [projectId, autoValidate]);

  // 验证配置
  const validateConfig = async () => {
    if (!projectId) {
      setError('请先选择项目');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await testConfigService.validateProjectConfig(projectId);
      setValidation(result);
      onValidationComplete?.(result.valid);
    } catch (err: any) {
      console.error('验证配置失败:', err);
      setError(err.message || '验证配置失败');
      onValidationComplete?.(false);
    } finally {
      setLoading(false);
    }
  };

  // 跳转到项目管理页面
  const goToProjectManagement = () => {
    navigate('/systems', {
      state: {
        returnPath: location.pathname,
        returnTitle: 'AI 智能生成器',
        selectedProjectId: projectId
      }
    });
  };

  // 显示配置不完整提示
  const showConfigIncompleteModal = () => {
    Modal.confirm({
      title: '项目配置不完整',
      icon: <AlertCircle className="text-yellow-500" />,
      content: (
        <div className="space-y-3">
          <p className="text-gray-700">
            当前项目 <strong className="text-gray-900">{projectName || `项目${projectId}`}</strong> 缺少以下配置：
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {validation?.missing.map((item, index) => (
              <li key={index} className="text-red-600">{item}</li>
            ))}
          </ul>
          {validation?.warnings && validation.warnings.length > 0 && (
            <>
              <p className="text-gray-700 mt-3">警告信息：</p>
              <ul className="list-disc pl-5 space-y-1">
                {validation.warnings.map((item, index) => (
                  <li key={index} className="text-yellow-600">{item}</li>
                ))}
              </ul>
            </>
          )}
          <p className="text-gray-700 mt-3">
            建议先在"项目管理"中配置这些信息，以确保测试用例能够正常执行。
          </p>
          <p className="text-gray-600 text-sm mt-2">
            是否继续生成测试用例？（不推荐）
          </p>
        </div>
      ),
      okText: '去配置',
      okType: 'primary',
      cancelText: '继续生成',
      onOk: goToProjectManagement,
      width: 520
    });
  };

  // 如果正在加载，显示加载状态
  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          <span className="text-sm text-blue-700">正在验证项目配置...</span>
        </div>
      </div>
    );
  }

  // 如果有错误，显示错误信息
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">配置验证失败</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // 如果没有验证结果，不显示
  if (!validation) {
    return null;
  }

  // 配置完整
  if (validation.valid) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-900">项目配置完整</p>
            <p className="text-sm text-green-700 mt-1">
              已配置默认测试账号和服务器，可以正常生成和执行测试用例
            </p>
            {showWarnings && validation.warnings.length > 0 && (
              <div className="mt-2 pt-2 border-t border-green-200">
                <p className="text-xs text-green-700 font-medium mb-1">提示：</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {validation.warnings.map((warning, index) => (
                    <li key={index} className="text-xs text-green-600">{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <button
            onClick={goToProjectManagement}
            className="text-green-600 hover:text-green-700 transition-colors"
            title="查看配置"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // 配置不完整
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-900">项目配置不完整</p>
          <p className="text-sm text-yellow-700 mt-1">
            缺少以下配置：
            <span className="font-medium ml-1">
              {validation.missing.join('、')}
            </span>
          </p>
          {showWarnings && validation.warnings.length > 0 && (
            <div className="mt-2 pt-2 border-t border-yellow-200">
              <p className="text-xs text-yellow-700 font-medium mb-1">警告：</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {validation.warnings.map((warning, index) => (
                  <li key={index} className="text-xs text-yellow-600">{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={goToProjectManagement}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              去配置
            </button>
            <button
              onClick={showConfigIncompleteModal}
              className="text-sm text-yellow-700 hover:text-yellow-800 underline"
            >
              查看详情
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 简化版配置状态指示器
 */
export function ConfigStatusBadge({ 
  projectId, 
  compact = false 
}: { 
  projectId: number | null; 
  compact?: boolean;
}) {
  const [validation, setValidation] = useState<ConfigValidation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (projectId) {
      validateConfig();
    }
  }, [projectId]);

  const validateConfig = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const result = await testConfigService.validateProjectConfig(projectId);
      setValidation(result);
    } catch (err) {
      console.error('验证配置失败:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
        <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-600"></div>
        验证中...
      </span>
    );
  }

  if (!validation) return null;

  if (validation.valid) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
        <CheckCircle className="w-3 h-3" />
        {!compact && '配置完整'}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">
      <AlertCircle className="w-3 h-3" />
      {!compact && `缺少${validation.missing.length}项配置`}
    </span>
  );
}
