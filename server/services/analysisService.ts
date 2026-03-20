import { llmConfigManager } from '../../src/services/llmConfigManager.js';
import fs from 'fs';

const REQUIREMENT_GENERATION_PROMPT = `你是一个专业的需求分析师。请根据用户提供的文本内容，生成结构化的需求文档。

输出要求：
1. 使用 Markdown 格式
2. 包含以下结构：
   - # 需求文档标题
   - ## 概述（简要描述需求背景和目标）
   - ## 功能需求（每个需求包含标题、描述、验收标准）
   - ## 非功能需求（如有）
   - ## 约束与假设（如有）
3. 每个功能需求使用 ### 标题，包含：
   - **需求描述**：具体说明
   - **验收标准**：可测试的验证条件列表
   - **优先级**：高/中/低
4. 语言清晰、专业，避免模糊描述
5. 验收标准要具体、可测试

直接输出 Markdown 格式的需求文档，不要输出其他内容。`;

export class AnalysisService {

  async extractTextFromFile(file: Express.Multer.File): Promise<string> {
    const ext = file.originalname.toLowerCase().split('.').pop();

    switch (ext) {
      case 'txt':
      case 'md':
      case 'markdown':
        return file.buffer.toString('utf-8');

      case 'pdf':
        try {
          const pdfParse = await import('pdf-parse');
          const pdfData = await pdfParse.default(file.buffer);
          return pdfData.text;
        } catch {
          throw new Error('PDF 解析失败，请确保已安装 pdf-parse 依赖');
        }

      case 'docx':
      case 'doc':
        try {
          const mammoth = await import('mammoth');
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          return result.value;
        } catch {
          throw new Error('Word 文档解析失败，请确保已安装 mammoth 依赖');
        }

      default:
        throw new Error(`不支持的文件格式: .${ext}，支持 PDF、Word、TXT、Markdown`);
    }
  }

  async generateRequirementDoc(text: string, model?: string): Promise<string> {
    if (!llmConfigManager.isReady()) {
      await llmConfigManager.initialize();
    }
    const config = llmConfigManager.getCurrentConfig();

    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    const baseUrl = config.baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const selectedModel = model || config.model || 'openai/gpt-4o';

    if (!apiKey) {
      throw new Error('AI 服务未配置 API Key，请在设置中配置');
    }

    const apiEndpoint = baseUrl + '/chat/completions';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://sakura-ai.com',
          'X-Title': 'Sakura AI Testing Platform'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: REQUIREMENT_GENERATION_PROMPT },
            { role: 'user', content: `请根据以下内容生成结构化需求文档：\n\n${text}` }
          ],
          temperature: 0.3,
          max_tokens: 4000
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`AI 服务调用失败: ${(errorData as any).error?.message || response.statusText}`);
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('AI 返回了空内容');
      }

      console.log(`✅ AI 需求文档生成成功，使用模型: ${selectedModel}`);
      return content;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('AI 服务响应超时（60秒），请稍后重试');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
