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
  is_active?: boolean;
}

export interface ReportListParams {
  page?: number;
  pageSize?: number;
  taskId?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  search?: string;
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

  async executeTask(id: number) {
    const response = await fetch(`${API_BASE_URL}/market-insights/tasks/${id}/execute`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
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
    if (params.search) queryParams.append('search', params.search);

    const response = await fetch(`${API_BASE_URL}/market-insights/reports?${queryParams}`, { headers: getAuthHeaders() });
    return handleResponse(response);
  }

  async getReportById(id: number) {
    const response = await fetch(`${API_BASE_URL}/market-insights/reports/${id}`, { headers: getAuthHeaders() });
    const result = await handleResponse(response);
    return result.data as MarketInsightReport;
  }

  async importReport(file: File, taskId?: number) {
    const token = localStorage.getItem(TOKEN_KEY);
    const formData = new FormData();
    formData.append('file', file);
    if (taskId) formData.append('taskId', String(taskId));

    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/market-insights/reports/import`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return handleResponse(response);
  }

  async deleteReport(id: number) {
    const response = await fetch(`${API_BASE_URL}/market-insights/reports/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
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
