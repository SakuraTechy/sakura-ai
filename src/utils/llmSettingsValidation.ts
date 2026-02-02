import { modelRegistry } from '../services/modelRegistry';
import type { LLMSettings, ValidationResult, ValidationError } from '../services/settingsService';

/**
 * 验证 LLM 设置
 * 
 * 这是一个共享的验证工具，用于前端和后端统一验证逻辑
 * 
 * @param settings 待验证的 LLM 设置
 * @returns 验证结果
 */
export function validateLLMSettings(settings: LLMSettings): ValidationResult {
  const errors: ValidationError[] = [];

  // 验证模型ID
  if (!settings.selectedModelId) {
    errors.push({
      field: 'selectedModelId',
      message: '请选择一个模型',
      code: 'REQUIRED'
    });
  } else if (!modelRegistry.isValidModelId(settings.selectedModelId)) {
    errors.push({
      field: 'selectedModelId',
      message: '选择的模型无效',
      code: 'INVALID_MODEL'
    });
  }

  // 验证API密钥
  const model = modelRegistry.getModelById(settings.selectedModelId);
  
  // 🔥 修复：根据 requiresCustomAuth 的正确语义验证
  // requiresCustomAuth: true = 需要自定义认证（云端厂商）→ API密钥必填
  // requiresCustomAuth: false = 不需要自定义认证（本地模型）→ API密钥可选
  if (model?.requiresCustomAuth === false) {
    // 本地模型：API密钥可选，如果提供则不验证格式
    // 不做任何验证
  } else {
    // 云端模型（requiresCustomAuth: true 或未设置）：API密钥必填
    if (!settings.apiKey || settings.apiKey.trim() === '') {
      errors.push({
        field: 'apiKey',
        message: 'API密钥不能为空',
        code: 'REQUIRED'
      });
    }
    // 注意：不再验证 sk- 前缀，因为不同厂商的密钥格式不同
  }

  // 验证自定义配置
  if (settings.customConfig) {
    const { temperature, maxTokens, topP } = settings.customConfig;

    // 验证 Temperature
    if (temperature !== undefined) {
      if (temperature < 0 || temperature > 2) {
        errors.push({
          field: 'temperature',
          message: 'Temperature必须在0-2之间',
          code: 'OUT_OF_RANGE'
        });
      }
    }

    // 验证 Max Tokens
    if (maxTokens !== undefined) {
      if (maxTokens < 1 || maxTokens > 8000) {
        errors.push({
          field: 'maxTokens',
          message: 'Max Tokens必须在1-8000之间',
          code: 'OUT_OF_RANGE'
        });
      }
    }

    // 验证 Top P
    if (topP !== undefined) {
      if (topP < 0 || topP > 1) {
        errors.push({
          field: 'topP',
          message: 'Top P必须在0-1之间',
          code: 'OUT_OF_RANGE'
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

