import type {
  AccountConfig,
  ServerConfig,
  DatabaseConfig
} from '../types/test';
import { getApiBaseUrl } from '../config/api';

const API_BASE_URL = getApiBaseUrl('/api/v1/test-config');
const TOKEN_KEY = 'authToken';

/**
 * 获取认证请求头
 */
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 处理 API 响应
 */
async function handleResponse(response: Response) {
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('authUser');
    alert('登录已过期，请重新登录');
    window.location.href = '/login';
    throw new Error('未授权');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || '请求失败');
  }

  return response.json();
}

/**
 * 项目默认配置
 */
export interface ProjectDefaultConfig {
  account: AccountConfig | null;
  server: ServerConfig | null;
  database: DatabaseConfig | null;
}

/**
 * 测试用例配置
 */
export interface TestCaseConfig {
  account: AccountConfig | null;
  server: ServerConfig | null;
  database: DatabaseConfig | null;
  testUrl: string;
  testData?: string;
  preconditions?: string;
}

/**
 * 配置验证结果
 */
export interface ConfigValidation {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * 获取项目默认配置
 */
export async function getProjectDefaultConfig(projectId: number): Promise<ProjectDefaultConfig> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/default-config`,
    { headers: getAuthHeaders() }
  );
  return handleResponse(response);
}

/**
 * 获取测试用例配置
 */
export async function getTestCaseConfig(testCaseId: number): Promise<TestCaseConfig> {
  const response = await fetch(
    `${API_BASE_URL}/test-cases/${testCaseId}/config`,
    { headers: getAuthHeaders() }
  );
  return handleResponse(response);
}

/**
 * 验证项目配置
 */
export async function validateProjectConfig(projectId: number): Promise<ConfigValidation> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/validate-config`,
    { headers: getAuthHeaders() }
  );
  return handleResponse(response);
}

/**
 * 获取项目的所有账号配置
 */
export async function getProjectAccounts(projectId: number): Promise<AccountConfig[]> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/accounts`,
    { headers: getAuthHeaders() }
  );
  return handleResponse(response);
}

/**
 * 获取项目的所有服务器配置
 */
export async function getProjectServers(projectId: number): Promise<ServerConfig[]> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/servers`,
    { headers: getAuthHeaders() }
  );
  return handleResponse(response);
}

/**
 * 获取项目的所有数据库配置
 */
export async function getProjectDatabases(projectId: number): Promise<DatabaseConfig[]> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/databases`,
    { headers: getAuthHeaders() }
  );
  return handleResponse(response);
}

/**
 * 批量验证多个项目的配置
 */
export async function batchValidateProjects(projectIds: number[]): Promise<Array<ConfigValidation & { projectId: number }>> {
  const response = await fetch(
    `${API_BASE_URL}/projects/batch-validate`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ projectIds })
    }
  );
  return handleResponse(response);
}
