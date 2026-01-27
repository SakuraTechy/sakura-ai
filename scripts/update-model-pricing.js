#!/usr/bin/env node

/**
 * 模型价格更新脚本
 * 
 * 用法：
 * 1. 从 OpenRouter 同步价格：
 *    node scripts/update-model-pricing.js --sync-openrouter
 * 
 * 2. 更新单个模型价格：
 *    node scripts/update-model-pricing.js --model glm-4.6v --input 0.001 --output 0.001
 * 
 * 3. 查看所有价格：
 *    node scripts/update-model-pricing.js --list
 * 
 * 注意：需要先编译 TypeScript 文件
 *    npm run build
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 直接操作配置文件，不依赖 TypeScript 编译
const configPath = path.join(__dirname, '../config/model-pricing.json');

const args = process.argv.slice(2);

// 辅助函数：读取配置
async function loadConfig() {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('❌ 读取配置文件失败:', error.message);
    process.exit(1);
  }
}

// 辅助函数：格式化时间为北京时间
function formatBeijingTime(isoString) {
  if (!isoString) return '未知';
  
  try {
    const date = new Date(isoString);
    // 转换为北京时间（UTC+8）
    const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    
    // 格式化为：2026-01-23 08:00:00
    const year = beijingTime.getUTCFullYear();
    const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getUTCDate()).padStart(2, '0');
    const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
    const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} (北京时间)`;
  } catch (error) {
    return isoString;
  }
}

// 辅助函数：保存配置
async function saveConfig(config) {
  try {
    // 先序列化为 JSON
    let jsonString = JSON.stringify(config, null, 2);
    
    // 使用正则表达式将科学计数法替换为小数格式
    // 匹配 "input": 3e-10 或 "output": 9e-10 这样的模式
    jsonString = jsonString.replace(/"(input|output)":\s*([0-9.]+)e-([0-9]+)/gi, (match, field, mantissa, exponent) => {
      const num = parseFloat(mantissa + 'e-' + exponent);
      const exp = parseInt(exponent);
      // 转换为固定小数位数
      let fixed = num.toFixed(exp + 10);
      // 去除尾部的 0
      fixed = fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      return `"${field}": ${fixed}`;
    });
    
    await fs.writeFile(
      configPath,
      jsonString,
      'utf-8'
    );
  } catch (error) {
    console.error('❌ 保存配置文件失败:', error.message);
    process.exit(1);
  }
}

// 从 OpenRouter 获取价格
async function fetchOpenRouterPricing() {
  try {
    console.log('🔄 正在从 OpenRouter 获取价格...');
    const response = await fetch('https://openrouter.ai/api/v1/models');
    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('OpenRouter API 返回数据格式错误');
    }
    
    const config = await loadConfig();
    let updatedCount = 0;
    let aliasUpdatedCount = 0;
    
    for (const modelInfo of data.data) {
      const modelId = modelInfo.id; // 完整ID，如 "z-ai/glm-4.6v"
      const pricing = modelInfo.pricing;
      
      if (pricing && pricing.prompt && pricing.completion) {
        const pricingData = {
          input: parseFloat(pricing.prompt) / 1000,
          output: parseFloat(pricing.completion) / 1000,
          source: 'api',
          lastUpdated: new Date().toISOString()
        };
        
        // 1. 更新完整ID
        config.models[modelId] = pricingData;
        updatedCount++;
        
        // 2. 检查是否存在简化名称的配置（如 "glm-4.6v"）
        const parts = modelId.split('/');
        if (parts.length === 2) {
          const simpleName = parts[1]; // 如 "glm-4.6v"
          
          // 如果简化名称已存在，也更新它（无论之前的 source 是什么）
          if (config.models[simpleName]) {
            config.models[simpleName] = {
              ...pricingData,
              source: 'api' // 标记为从API更新
            };
            aliasUpdatedCount++;
          }
        }
      }
    }
    
    config.lastUpdated = new Date().toISOString();
    await saveConfig(config);
    
    console.log(`✅ 从 OpenRouter 更新了 ${updatedCount} 个模型的价格`);
    if (aliasUpdatedCount > 0) {
      console.log(`✅ 同时更新了 ${aliasUpdatedCount} 个简化名称的价格`);
    }
    return updatedCount;
  } catch (error) {
    console.error(`❌ 从 OpenRouter 获取价格失败: ${error.message}`);
    throw error;
  }
}

// 更新单个模型价格
async function updateModelPricing(model, input, output) {
  try {
    const config = await loadConfig();
    
    config.models[model] = {
      input,
      output,
      source: 'config',
      lastUpdated: new Date().toISOString()
    };
    
    config.lastUpdated = new Date().toISOString();
    await saveConfig(config);
    
    console.log(`✅ 模型 "${model}" 的价格已更新`);
    console.log(`   输入: $${input} / 1K tokens`);
    console.log(`   输出: $${output} / 1K tokens`);
  } catch (error) {
    console.error(`❌ 更新模型价格失败: ${error.message}`);
    throw error;
  }
}

// 列出所有价格
async function listPricing() {
  try {
    const config = await loadConfig();
    console.log('📊 所有模型价格配置：\n');
    
    for (const [model, pricing] of Object.entries(config.models)) {
      console.log(`• ${model}`);
      console.log(`  输入: $${pricing.input} / 1K tokens`);
      console.log(`  输出: $${pricing.output} / 1K tokens`);
      console.log(`  来源: ${pricing.source || 'unknown'}`);
      if (pricing.lastUpdated) {
        console.log(`  更新: ${formatBeijingTime(pricing.lastUpdated)}`);
      }
      console.log('');
    }
    
    // 显示配置文件的最后更新时间
    if (config.lastUpdated) {
      console.log(`📅 配置文件最后更新: ${formatBeijingTime(config.lastUpdated)}`);
    }
  } catch (error) {
    console.error(`❌ 列出价格失败: ${error.message}`);
    throw error;
  }
}

// 导出配置
async function exportConfig(outputPath) {
  try {
    const config = await loadConfig();
    await fs.writeFile(
      outputPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );
    console.log(`✅ 配置已导出到: ${outputPath}`);
  } catch (error) {
    console.error(`❌ 导出配置失败: ${error.message}`);
    throw error;
  }
}

// 导入配置
async function importConfig(inputPath) {
  try {
    const content = await fs.readFile(inputPath, 'utf-8');
    const importedConfig = JSON.parse(content);
    
    const currentConfig = await loadConfig();
    
    // 合并模型配置
    currentConfig.models = {
      ...currentConfig.models,
      ...importedConfig.models
    };
    currentConfig.lastUpdated = new Date().toISOString();
    
    await saveConfig(currentConfig);
    
    const count = Object.keys(importedConfig.models || {}).length;
    console.log(`✅ 已导入 ${count} 个模型的价格配置`);
  } catch (error) {
    console.error(`❌ 导入配置失败: ${error.message}`);
    throw error;
  }
}

async function main() {

  // 解析命令行参数
  const command = args[0];

  try {
    switch (command) {
      case '--sync-openrouter':
        await fetchOpenRouterPricing();
        break;

      case '--model': {
        const model = args[1];
        const inputIndex = args.indexOf('--input');
        const outputIndex = args.indexOf('--output');

        if (!model || inputIndex === -1 || outputIndex === -1) {
          console.error('❌ 用法: --model <模型名> --input <价格> --output <价格>');
          process.exit(1);
        }

        const input = parseFloat(args[inputIndex + 1]);
        const output = parseFloat(args[outputIndex + 1]);

        if (isNaN(input) || isNaN(output)) {
          console.error('❌ 价格必须是有效的数字');
          process.exit(1);
        }

        console.log(`📝 更新模型 "${model}" 的价格...`);
        await updateModelPricing(model, input, output);
        break;
      }

      case '--list':
        await listPricing();
        break;

      case '--export': {
        const outputPath = args[1] || './model-pricing-export.json';
        console.log(`📤 导出价格配置到: ${outputPath}`);
        await exportConfig(outputPath);
        break;
      }

      case '--import': {
        const inputPath = args[1];
        if (!inputPath) {
          console.error('❌ 用法: --import <文件路径>');
          process.exit(1);
        }
        console.log(`📥 从文件导入价格配置: ${inputPath}`);
        await importConfig(inputPath);
        break;
      }

      case '--help':
      default:
        console.log(`
模型价格更新脚本

用法：
  node scripts/update-model-pricing.js [命令] [选项]

命令：
  --sync-openrouter              从 OpenRouter 同步价格
  --model <名称> --input <价格> --output <价格>
                                 更新单个模型价格
  --list                         列出所有模型价格
  --export [文件路径]            导出价格配置
  --import <文件路径>            导入价格配置
  --help                         显示帮助信息

示例：
  # 从 OpenRouter 同步价格
  node scripts/update-model-pricing.js --sync-openrouter

  # 更新 GLM-4.6V 的价格
  node scripts/update-model-pricing.js --model glm-4.6v --input 0.001 --output 0.001

  # 查看所有价格
  node scripts/update-model-pricing.js --list

  # 导出价格配置
  node scripts/update-model-pricing.js --export ./backup.json

  # 导入价格配置
  node scripts/update-model-pricing.js --import ./backup.json
        `);
        break;
    }
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ 错误:', error.message);
  process.exit(1);
});
