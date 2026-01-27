import express from 'express';
import { ModelPricingService } from '../services/modelPricingService.js';

const router = express.Router();
const pricingService = ModelPricingService.getInstance();

/**
 * 获取所有模型价格配置
 * GET /api/model-pricing
 */
router.get('/', async (req, res) => {
  try {
    const pricing = pricingService.getAllPricing();
    res.json({
      success: true,
      data: pricing
    });
  } catch (error: any) {
    console.error('获取价格配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取单个模型价格
 * GET /api/model-pricing/:model
 */
router.get('/:model', async (req, res) => {
  try {
    const { model } = req.params;
    const pricing = pricingService.getModelPricing(model);
    res.json({
      success: true,
      data: {
        model,
        pricing
      }
    });
  } catch (error: any) {
    console.error('获取模型价格失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 更新模型价格
 * PUT /api/model-pricing/:model
 * Body: { input: number, output: number }
 */
router.put('/:model', async (req, res) => {
  try {
    const { model } = req.params;
    const { input, output } = req.body;
    
    if (typeof input !== 'number' || typeof output !== 'number') {
      return res.status(400).json({
        success: false,
        error: '输入和输出价格必须是数字'
      });
    }
    
    await pricingService.updateModelPricing(model, { input, output });
    
    res.json({
      success: true,
      message: `模型 "${model}" 的价格已更新`
    });
  } catch (error: any) {
    console.error('更新模型价格失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 从 OpenRouter 更新价格
 * POST /api/model-pricing/sync/openrouter
 */
router.post('/sync/openrouter', async (req, res) => {
  try {
    await pricingService.fetchOpenRouterPricing();
    res.json({
      success: true,
      message: '已从 OpenRouter 同步价格'
    });
  } catch (error: any) {
    console.error('从 OpenRouter 同步价格失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 导出价格配置
 * GET /api/model-pricing/export
 */
router.get('/export/config', async (req, res) => {
  try {
    const pricing = pricingService.getAllPricing();
    res.json({
      success: true,
      data: {
        models: pricing,
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      }
    });
  } catch (error: any) {
    console.error('导出价格配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 导入价格配置
 * POST /api/model-pricing/import
 * Body: { models: Record<string, ModelPricing> }
 */
router.post('/import', async (req, res) => {
  try {
    const { models } = req.body;
    
    if (!models || typeof models !== 'object') {
      return res.status(400).json({
        success: false,
        error: '无效的价格配置格式'
      });
    }
    
    // 批量更新价格
    for (const [model, pricing] of Object.entries(models)) {
      await pricingService.updateModelPricing(model, pricing as any);
    }
    
    res.json({
      success: true,
      message: `已导入 ${Object.keys(models).length} 个模型的价格配置`
    });
  } catch (error: any) {
    console.error('导入价格配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
