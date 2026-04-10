import { getApiBaseUrl } from '../config/api';

const API_BASE_URL = getApiBaseUrl('/api');
const TOKEN_KEY = 'authToken';

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const handleResponse = async (response: Response) => {
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('authUser');
    alert('登录已过期，请重新登录');
    window.location.href = '/login';
    throw new Error('认证失败，请重新登录');
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `请求失败: ${response.status}`);
  }
  return response.json();
};

class AnalysisServiceClass {
  /** full=true 时返回完整正文（与需求分析保存一致，供市场洞察导入等场景使用） */
  async uploadDocument(
    file: File,
    options?: { full?: boolean }
  ): Promise<{ filename: string; size: number; text: string }> {
    const token = localStorage.getItem(TOKEN_KEY);
    const formData = new FormData();
    formData.append('file', file);

    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const q = options?.full ? '?full=1' : '';
    const response = await fetch(`${API_BASE_URL}/analysis/upload${q}`, {
      method: 'POST',
      headers,
      body: formData
    });
    const result = await handleResponse(response);
    return result.data;
  }

  async generateRequirement(
    text: string,
    model?: string
  ): Promise<{ content: string; inputTruncated?: boolean }> {
    const response = await fetch(`${API_BASE_URL}/analysis/generate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text, model })
    });
    const result = await handleResponse(response);
    return {
      content: result.data.content,
      inputTruncated: result.data.inputTruncated === true
    };
  }

  async generateRequirementStream(
    text: string,
    options?: {
      model?: string;
      onProgress?: (event: { phase?: string; current?: number; total?: number; message?: string }) => void;
      signal?: AbortSignal;
    }
  ): Promise<{ content: string; inputTruncated?: boolean }> {
    const response = await fetch(`${API_BASE_URL}/analysis/generate-stream`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text, model: options?.model }),
      signal: options?.signal
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `请求失败: ${response.status}`);
    }
    if (!response.body) {
      return this.generateRequirement(text, options?.model);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let result: { content: string; inputTruncated?: boolean } | null = null;
    let receivedDoneProgress = false;
    const handlePayloadLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let payload: any;
      try {
        payload = JSON.parse(trimmed);
      } catch {
        return;
      }
      if (payload.type === 'progress') {
        if (payload.phase === 'done') {
          receivedDoneProgress = true;
          options?.onProgress?.({
            phase: 'finalizing',
            current: payload.current,
            total: payload.total,
            message: payload.message || '正在整理并输出文档'
          });
          return;
        }
        options?.onProgress?.({
          phase: payload.phase,
          current: payload.current,
          total: payload.total,
          message: payload.message
        });
      } else if (payload.type === 'result' && payload.success) {
        result = {
          content: payload.data?.content || '',
          inputTruncated: payload.data?.inputTruncated === true
        };
        // 某些链路下可能拿到 result 但进度事件未齐全，这里兜底进入“整理输出”阶段
        if (!receivedDoneProgress) {
          options?.onProgress?.({
            phase: 'finalizing',
            message: '正在整理并输出文档'
          });
        }
      } else if (payload.type === 'error') {
        throw new Error(payload.error || '生成失败');
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        handlePayloadLine(line);
      }

      // result 为终态事件，收到后立即返回，避免 keep-alive 连接导致前端一直等待 done
      if (result) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        return result;
      }
    }

    // 兼容最后一行无换行符的场景
    const trailing = decoder.decode();
    if (trailing) {
      buffer += trailing;
    }
    if (buffer.trim()) {
      handlePayloadLine(buffer);
    }

    if (!result) {
      throw new Error('生成失败：未收到结果');
    }
    return result;
  }

  async saveDocument(params: {
    title: string;
    content: string;
    summary?: string;
    sourceFilename?: string;
    projectId?: number;
    projectVersionId?: number;
    system?: string;
    module?: string;
  }): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/analysis/save`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params)
    });
    const result = await handleResponse(response);
    return result.data;
  }
}

export const analysisService = new AnalysisServiceClass();
