import type {
  System,
  SystemsResponse,
  SystemOption,
  CreateSystemInput,
  UpdateSystemInput,
  ProjectVersion,
  CreateVersionInput,
  UpdateVersionInput,
  AccountConfig,
  CreateAccountInput,
  UpdateAccountInput,
  ServerConfig,
  CreateServerInput,
  UpdateServerInput,
  DatabaseConfig,
  CreateDatabaseInput,
  UpdateDatabaseInput
} from '../types/test';

// 🔥 使用统一的 API 配置
import { getApiBaseUrl } from '../config/api';
const API_BASE_URL = getApiBaseUrl('/api/v1/systems');
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
 * 处理 API 响应，统一处理错误
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
    let errorMessage = `请求失败 (${response.status})`;
    try {
      const errorData = await response.json();
      // 后端返回格式：{ error: '错误信息', message: '详细信息' }
      if (errorData.error) {
        errorMessage = errorData.error;
        // 如果有详细信息，追加显示
        if (errorData.message && errorData.message !== errorData.error) {
          errorMessage += `: ${errorData.message}`;
        }
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // JSON 解析失败，使用默认错误信息
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

// 🔥 正在进行的请求缓存（用于去重）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pendingRequests = new Map<string, Promise<any>>();

// 🔥 缓存保留时间（毫秒）- 防止短时间内的重复请求
const CACHE_RETAIN_TIME = 300;

/**
 * 通用请求函数（带去重功能）
 */
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  // 只对 GET 请求进行去重
  const isGet = options.method === 'GET' || !options.method;
  // 生成唯一请求 Key
  const requestKey = isGet ? `${url}` : null;

  // 如果已有相同请求（正在进行或刚完成），直接返回该 Promise
  if (requestKey && pendingRequests.has(requestKey)) {
    console.log('🔄 [systemService] 复用缓存请求:', requestKey.split('?')[0]);
    return pendingRequests.get(requestKey) as Promise<T>;
  }

  console.log('📤 [systemService] 发起新请求:', url.split('?')[0]);

  const promise = (async () => {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...getAuthHeaders(),
          ...options.headers,
        }
      });
      return handleResponse(response);
    } finally {
      // 🔥 延迟清除缓存，确保短时间内的重复请求能复用结果
      if (requestKey) {
        setTimeout(() => {
          pendingRequests.delete(requestKey);
          console.log('🗑️ [systemService] 清除缓存:', requestKey.split('?')[0]);
        }, CACHE_RETAIN_TIME);
      }
    }
  })();

  // 存入缓存
  if (requestKey) {
    pendingRequests.set(requestKey, promise);
  }

  return promise;
}

/**
 * 获取系统列表（支持分页、搜索、筛选）
 */
export async function getSystems(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'active' | 'inactive';
}): Promise<SystemsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString());
  if (params?.search) queryParams.append('search', params.search);
  if (params?.status) queryParams.append('status', params.status);

  // 🔥 确保参数排序，提高去重命中率
  queryParams.sort();

  const url = `${API_BASE_URL}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  return request<SystemsResponse>(url);
}

/**
 * 获取所有启用的系统（用于下拉选择）
 */
export async function getActiveSystems(): Promise<SystemOption[]> {
  return request<SystemOption[]>(`${API_BASE_URL}/active`);
}

/**
 * 根据ID获取系统
 */
export async function getSystemById(id: number): Promise<System> {
  return request<System>(`${API_BASE_URL}/${id}`);
}

/**
 * 创建系统
 */
export async function createSystem(data: CreateSystemInput): Promise<System> {
  return request<System>(API_BASE_URL, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * 更新系统
 */
export async function updateSystem(id: number, data: UpdateSystemInput): Promise<System> {
  return request<System>(`${API_BASE_URL}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

/**
 * 删除系统
 */
export async function deleteSystem(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`${API_BASE_URL}/${id}`, {
    method: 'DELETE'
  });
}

/**
 * 批量更新系统排序
 */
export async function updateSystemsOrder(orders: { id: number; sort_order: number }[]): Promise<{ message: string }> {
  return request<{ message: string }>(`${API_BASE_URL}/batch/order`, {
    method: 'PUT',
    body: JSON.stringify({ orders })
  });
}

// ==================== 项目版本相关 API ====================

/**
 * 获取项目的所有版本
 */
export async function getProjectVersions(projectId: number): Promise<ProjectVersion[]> {
  return request<ProjectVersion[]>(`${API_BASE_URL}/${projectId}/versions`);
}

/**
 * 创建项目版本
 */
export async function createProjectVersion(data: CreateVersionInput): Promise<ProjectVersion> {
  return request<ProjectVersion>(`${API_BASE_URL}/${data.project_id}/versions`, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * 更新项目版本
 */
export async function updateProjectVersion(
  projectId: number,
  versionId: number,
  data: UpdateVersionInput
): Promise<ProjectVersion> {
  return request<ProjectVersion>(`${API_BASE_URL}/${projectId}/versions/${versionId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

/**
 * 删除项目版本
 */
export async function deleteProjectVersion(
  projectId: number,
  versionId: number
): Promise<{ message: string }> {
  return request<{ message: string }>(`${API_BASE_URL}/${projectId}/versions/${versionId}`, {
    method: 'DELETE'
  });
}

/**
 * 设置主线版本
 */
export async function setMainVersion(
  projectId: number,
  versionId: number
): Promise<ProjectVersion> {
  return request<ProjectVersion>(`${API_BASE_URL}/${projectId}/versions/${versionId}/set-main`, {
    method: 'PUT'
  });
}

// ==================== 账号配置相关 API ====================

const ACCOUNT_API_BASE_URL = getApiBaseUrl('/api/v1/accounts');

/**
 * 获取账号配置列表
 */
export async function getAccounts(): Promise<AccountConfig[]> {
  return request<AccountConfig[]>(ACCOUNT_API_BASE_URL);
}

/**
 * 获取指定项目的账号配置列表
 */
export async function getProjectAccounts(projectId: number): Promise<AccountConfig[]> {
  return request<AccountConfig[]>(`${API_BASE_URL}/${projectId}/accounts`);
}

/**
 * 根据ID获取账号配置
 */
export async function getAccountById(id: number): Promise<AccountConfig> {
  return request<AccountConfig>(`${ACCOUNT_API_BASE_URL}/${id}`);
}

/**
 * 创建账号配置
 */
export async function createAccount(data: CreateAccountInput): Promise<AccountConfig> {
  return request<AccountConfig>(ACCOUNT_API_BASE_URL, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * 更新账号配置
 */
export async function updateAccount(id: number, data: UpdateAccountInput): Promise<AccountConfig> {
  return request<AccountConfig>(`${ACCOUNT_API_BASE_URL}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

/**
 * 删除账号配置
 */
export async function deleteAccount(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`${ACCOUNT_API_BASE_URL}/${id}`, {
    method: 'DELETE'
  });
}

/**
 * 设置默认账号
 */
export async function setDefaultAccount(projectId: number, accountId: number): Promise<AccountConfig> {
  return request<AccountConfig>(`${ACCOUNT_API_BASE_URL}/${accountId}/set-default`, {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId })
  });
}

// ==================== 服务器配置相关 API ====================

const SERVER_API_BASE_URL = getApiBaseUrl('/api/v1/servers');

/**
 * 获取服务器配置列表
 */
export async function getServers(): Promise<ServerConfig[]> {
  return request<ServerConfig[]>(SERVER_API_BASE_URL);
}

/**
 * 获取指定项目的服务器配置列表
 */
export async function getProjectServers(projectId: number): Promise<ServerConfig[]> {
  return request<ServerConfig[]>(`${API_BASE_URL}/${projectId}/servers`);
}

/**
 * 根据ID获取服务器配置
 */
export async function getServerById(id: number): Promise<ServerConfig> {
  return request<ServerConfig>(`${SERVER_API_BASE_URL}/${id}`);
}

/**
 * 创建服务器配置
 */
export async function createServer(data: CreateServerInput): Promise<ServerConfig> {
  return request<ServerConfig>(SERVER_API_BASE_URL, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * 更新服务器配置
 */
export async function updateServer(id: number, data: UpdateServerInput): Promise<ServerConfig> {
  return request<ServerConfig>(`${SERVER_API_BASE_URL}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

/**
 * 删除服务器配置
 */
export async function deleteServer(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`${SERVER_API_BASE_URL}/${id}`, {
    method: 'DELETE'
  });
}

/**
 * 测试服务器连接
 * @param id 服务器ID（如果提供了config，id可以为null）
 * @param config 可选的服务器配置数据（用于测试未保存的配置）
 */
export async function testServerConnection(
  id: number | null, 
  config?: Partial<CreateServerInput>
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(`${SERVER_API_BASE_URL}/${id || 'test'}/test`, {
    method: 'POST',
    body: config ? JSON.stringify({ config }) : undefined
  });
}

/**
 * 设置默认服务器
 */
export async function setDefaultServer(projectId: number, serverId: number): Promise<ServerConfig> {
  return request<ServerConfig>(`${SERVER_API_BASE_URL}/${serverId}/set-default`, {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId })
  });
}

// ==================== 数据库配置相关 API ====================

const DATABASE_API_BASE_URL = getApiBaseUrl('/api/v1/databases');

/**
 * 获取数据库配置列表
 */
export async function getDatabases(): Promise<DatabaseConfig[]> {
  return request<DatabaseConfig[]>(DATABASE_API_BASE_URL);
}

/**
 * 获取指定项目的数据库配置列表
 */
export async function getProjectDatabases(projectId: number): Promise<DatabaseConfig[]> {
  return request<DatabaseConfig[]>(`${API_BASE_URL}/${projectId}/databases`);
}

/**
 * 根据ID获取数据库配置
 */
export async function getDatabaseById(id: number): Promise<DatabaseConfig> {
  return request<DatabaseConfig>(`${DATABASE_API_BASE_URL}/${id}`);
}

/**
 * 创建数据库配置
 */
export async function createDatabase(data: CreateDatabaseInput): Promise<DatabaseConfig> {
  return request<DatabaseConfig>(DATABASE_API_BASE_URL, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * 更新数据库配置
 */
export async function updateDatabase(id: number, data: UpdateDatabaseInput): Promise<DatabaseConfig> {
  return request<DatabaseConfig>(`${DATABASE_API_BASE_URL}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

/**
 * 删除数据库配置
 */
export async function deleteDatabase(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`${DATABASE_API_BASE_URL}/${id}`, {
    method: 'DELETE'
  });
}

/**
 * 设置默认数据库
 */
export async function setDefaultDatabase(projectId: number, databaseId: number): Promise<DatabaseConfig> {
  return request<DatabaseConfig>(`${DATABASE_API_BASE_URL}/${databaseId}/set-default`, {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId })
  });
}

/**
 * 测试数据库连接
 * @param id 数据库ID（如果提供了config，id可以为null）
 * @param config 可选的数据库配置数据（用于测试未保存的配置）
 */
export async function testDatabaseConnection(
  id: number | null,
  config?: Partial<CreateDatabaseInput>
): Promise<{ success: boolean; message: string }> {
  const endpoint = id !== null ? `${DATABASE_API_BASE_URL}/${id}/test` : `${DATABASE_API_BASE_URL}/test/test`;
  return request<{ success: boolean; message: string }>(endpoint, {
    method: 'POST',
    body: config ? JSON.stringify({ config }) : undefined
  });
}
