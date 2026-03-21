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

export interface InsightsArticle {
  id: number;
  title: string;
  category: string;
  url: string;
  content?: string;
  summary?: string;
  source?: string;
  published_at: string;
  created_at: string;
}

export interface CreateInsightsArticleParams {
  title: string;
  url: string;
  content: string;
  category?: string;
  summary?: string;
  source?: string;
  published_at?: string;
}

export interface ArticleListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  source?: string;
}

export interface DeepReadDetail {
  title: string;
  summary: string;
  contentText: string;
  contentMarkdown: string;
  contentHtml: string;
  contentRawHtml: string;
  images: string[];
  sourceUrl: string;
  extractionMeta: {
    strategy: 'readable' | 'fallback_text';
    durationMs: number;
    fallbackReason?: string;
    errorCode?: string;
    errorMessage?: string;
  };
  /** 仅 deepReadByUrl：文章库中存在同 URL 记录时的 id，用于一键生成需求 */
  matchedArticleId?: number | null;
}

class InsightsServiceClass {
  async getArticles(params: ArticleListParams = {}) {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.category) queryParams.append('category', params.category);
    if (params.source) queryParams.append('source', params.source);

    const response = await fetch(
      `${API_BASE_URL}/insights/articles?${queryParams.toString()}`,
      { headers: getAuthHeaders() }
    );
    const result = await handleResponse(response);
    return { data: result.data as InsightsArticle[], pagination: result.pagination };
  }

  async getArticleDetail(id: number): Promise<InsightsArticle> {
    const response = await fetch(
      `${API_BASE_URL}/insights/articles/${id}`,
      { headers: getAuthHeaders() }
    );
    const result = await handleResponse(response);
    return result.data;
  }

  async createArticle(params: CreateInsightsArticleParams): Promise<InsightsArticle> {
    const response = await fetch(`${API_BASE_URL}/insights/articles`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    const result = await handleResponse(response);
    return result.data;
  }

  async getCategories(): Promise<string[]> {
    const response = await fetch(
      `${API_BASE_URL}/insights/articles/categories`,
      { headers: getAuthHeaders() }
    );
    const result = await handleResponse(response);
    return result.data;
  }

  async batchImportArticles(file: File): Promise<{ count: number; message: string }> {
    const token = localStorage.getItem(TOKEN_KEY);
    const formData = new FormData();
    formData.append('file', file);

    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/insights/articles/batch-import`, {
      method: 'POST',
      headers,
      body: formData
    });
    return handleResponse(response);
  }

  async deleteArticle(id: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/insights/articles/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    await handleResponse(response);
  }

  async batchDeleteArticles(ids: number[]): Promise<{ message?: string; data?: { deletedCount: number } }> {
    const response = await fetch(`${API_BASE_URL}/insights/articles/batch-delete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });
    return handleResponse(response);
  }

  async deepReadArticle(id: number): Promise<DeepReadDetail> {
    const response = await fetch(`${API_BASE_URL}/insights/articles/${id}/deep-read`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const result = await handleResponse(response);
    return result.data;
  }

  async deepReadByUrl(url: string, fallbackTitle?: string): Promise<DeepReadDetail> {
    const response = await fetch(`${API_BASE_URL}/insights/deep-read-by-url`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, fallbackTitle }),
    });
    const result = await handleResponse(response);
    return result.data;
  }

  async generateRequirementFromArticle(
    id: number,
    params: { title: string; projectId?: number; projectVersionId?: number }
  ) {
    const response = await fetch(`${API_BASE_URL}/insights/articles/${id}/generate-requirement`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params)
    });
    return handleResponse(response);
  }

  async correctArticleCategory(id: number, category: string) {
    const response = await fetch(`${API_BASE_URL}/insights/articles/${id}/category`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ category })
    });
    return handleResponse(response);
  }
}

export const insightsService = new InsightsServiceClass();
