import { getApiBaseUrl } from '../config/api';
import { readFileContent } from '../utils/fileReader';

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

// ======================== Types ========================

export interface MarketInsightTask {
  id: number;
  title: string;
  description?: string;
  trigger_type: string;
  trigger_time: string;
  trigger_day?: number;
  data_sources?: string;
  is_active: boolean;
  last_executed_at?: string;
  created_at: string;
  updated_at: string;
  _count?: { reports: number };
}

export interface MarketSourceConfig {
  id: string;
  name: string;
  type: 'rss' | 'api' | 'web' | 'manual';
  enabled: boolean;
  url: string;
  /** 报告分类提示（漏洞预警 / 攻防技术 等） */
  categoryHint?: string;
  /** 内置源一级领域（用于下拉分组展示） */
  domainL1?: string;
  /** 内置源二级领域 */
  domainL2?: string;
  timeoutMs?: number;
  maxItems?: number;
}

export interface MarketInsightReport {
  id: number;
  task_id?: number;
  title: string;
  summary?: string;
  content: string;
  stats_json?: string;
  category: string;
  status: string;
  executed_at: string;
  created_at: string;
  task?: { id: number; title: string };
}

export interface CreateTaskParams {
  title: string;
  description?: string;
  trigger_type: string;
  trigger_time: string;
  trigger_day?: number;
  data_sources?: string[];
  source_configs?: MarketSourceConfig[];
  is_active?: boolean;
}

export interface ReportListParams {
  page?: number;
  pageSize?: number;
  taskId?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  category?: string;
  search?: string;
}

export interface QuickCreateAndExecuteByIndustryParams {
  industry: string;
  displayName?: string;
  maxItems?: number;
  timeWindow?: string;
  executeNow?: boolean;
  fetchMode?: 'pure_ai' | 'sources_plus_ai';
  /** default | angkai 昂楷体 | sample 固定返回项目根目录示例 MD */
  reportOutputStyle?: 'default' | 'angkai' | 'sample';
}

// ======================== Service ========================

class MarketInsightServiceClass {

  // ========== Tasks ==========

  async getTaskList(page = 1, pageSize = 20) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const response = await fetch(`${API_BASE_URL}/market-insights/tasks?${params}`, { headers: getAuthHeaders() });
    return handleResponse(response);
  }

  async getTaskById(id: number) {
    const response = await fetch(`${API_BASE_URL}/market-insights/tasks/${id}`, { headers: getAuthHeaders() });
    const result = await handleResponse(response);
    return result.data as MarketInsightTask;
  }

  async createTask(params: CreateTaskParams) {
    const response = await fetch(`${API_BASE_URL}/market-insights/tasks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    const result = await handleResponse(response);
    return result.data as MarketInsightTask;
  }

  async updateTask(id: number, params: Partial<CreateTaskParams>) {
    const response = await fetch(`${API_BASE_URL}/market-insights/tasks/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    const result = await handleResponse(response);
    return result.data as MarketInsightTask;
  }

  async deleteTask(id: number) {
    const response = await fetch(`${API_BASE_URL}/market-insights/tasks/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  }

  async batchDeleteTasks(ids: number[]) {
    const response = await fetch(`${API_BASE_URL}/market-insights/tasks/batch-delete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });
    return handleResponse(response);
  }

  async executeTask(id: number): Promise<{ reportId: number }> {
    const response = await fetch(`${API_BASE_URL}/market-insights/tasks/${id}/execute`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const result = await handleResponse(response);
    return result.data as { reportId: number };
  }

  async quickCreateAndExecuteByIndustry(
    params: QuickCreateAndExecuteByIndustryParams
  ): Promise<{ taskId: number; reportId: number | null; status: 'created' | 'running' }> {
    const response = await fetch(`${API_BASE_URL}/market-insights/tasks/quick-create-and-execute`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    const result = await handleResponse(response);
    return result.data as { taskId: number; reportId: number | null; status: 'created' | 'running' };
  }

  // ========== Reports ==========

  async getReportList(params: ReportListParams = {}) {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', String(params.page));
    if (params.pageSize) queryParams.append('pageSize', String(params.pageSize));
    if (params.taskId) queryParams.append('taskId', String(params.taskId));
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.status) queryParams.append('status', params.status);
    if (params.category) queryParams.append('category', params.category);
    if (params.search) queryParams.append('search', params.search);

    const response = await fetch(`${API_BASE_URL}/market-insights/reports?${queryParams}`, { headers: getAuthHeaders() });
    return handleResponse(response);
  }

  async getReportById(id: number) {
    const response = await fetch(`${API_BASE_URL}/market-insights/reports/${id}`, { headers: getAuthHeaders() });
    const result = await handleResponse(response);
    return result.data as MarketInsightReport;
  }

  /**
   * 与「需求分析」页一致：使用 `readFileContent`（浏览器端 mammoth/pdf.js 等）解析文件；
   * 正文原样入库，详情页用 `normalizeReportMarkdownBody` + `marked` 与需求分析预览格式一致。
   */
  async importReport(file: File, taskId?: number) {
    const result = await readFileContent(file, { minContentLength: 1 });
    if (!result.success) {
      throw new Error(result.error || '文件解析失败');
    }
    const content = result.content.trim();
    if (!content) {
      throw new Error('解析后没有可保存的正文');
    }
    const response = await fetch(`${API_BASE_URL}/market-insights/reports/import-from-text`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        content,
        filename: result.fileName || file.name,
        ...(taskId != null ? { taskId } : {}),
      }),
    });
    const json = (await handleResponse(response)) as Record<string, unknown>;
    if (result.formatWarnings?.length) {
      return { ...json, parseWarnings: result.formatWarnings };
    }
    return json;
  }

  async deleteReport(id: number) {
    const response = await fetch(`${API_BASE_URL}/market-insights/reports/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  }

  async batchDeleteReports(ids: number[]) {
    const response = await fetch(`${API_BASE_URL}/market-insights/reports/batch-delete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });
    return handleResponse(response);
  }

  async convertToRequirement(reportId: number, params: { title: string; projectId?: number; projectVersionId?: number }) {
    const response = await fetch(`${API_BASE_URL}/market-insights/reports/${reportId}/convert`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return handleResponse(response);
  }
}

export const marketInsightService = new MarketInsightServiceClass();
