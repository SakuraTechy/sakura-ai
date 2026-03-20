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
  async uploadDocument(file: File): Promise<{ filename: string; size: number; text: string }> {
    const token = localStorage.getItem(TOKEN_KEY);
    const formData = new FormData();
    formData.append('file', file);

    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/analysis/upload`, {
      method: 'POST',
      headers,
      body: formData
    });
    const result = await handleResponse(response);
    return result.data;
  }

  async generateRequirement(text: string, model?: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/analysis/generate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text, model })
    });
    const result = await handleResponse(response);
    return result.data.content;
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
