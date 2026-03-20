// 🔥 使用全局配置的 axios 实例（自动添加认证头）
import apiClient from '../utils/axios';
// 🔥 使用统一的 API 配置
import { getApiBaseUrl } from '../config/api';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || getApiBaseUrl('/api');

export interface User {
  id: number;
  email: string;
  username: string;
  accountName?: string;
  project?: string;
  department?: string;
  isSuperAdmin: boolean;
  createdAt: string;
}

export interface CreateUserDto {
  email: string;
  username: string;
  password: string;
  accountName?: string;
  project?: string;
  department?: string;
  isSuperAdmin: boolean;
}

export interface UpdateUserDto {
  email: string;
  username: string;
  accountName?: string;
  project?: string;
  department?: string;
  isSuperAdmin: boolean;
}

class UserService {
  private baseUrl = `${API_BASE_URL}/users`;

  // 获取所有用户
  async getAllUsers(): Promise<User[]> {
    try {
      console.log('🔍 API URL:', this.baseUrl);

      const response = await apiClient.get<User[]>(this.baseUrl);

      console.log('✅ 获取用户列表成功:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ 获取用户列表失败:', error);
      if (error.response) {
        console.error('响应状态:', error.response.status);
        console.error('响应数据:', error.response.data);
      }
      throw error;
    }
  }

  // 获取单个用户
  async getUserById(id: number): Promise<User> {
    const response = await apiClient.get<User>(`${this.baseUrl}/${id}`);
    return response.data;
  }

  // 创建用户
  async createUser(data: CreateUserDto): Promise<User> {
    const response = await apiClient.post<User>(this.baseUrl, data);
    return response.data;
  }

  // 更新用户
  async updateUser(id: number, data: UpdateUserDto): Promise<User> {
    const response = await apiClient.put<User>(`${this.baseUrl}/${id}`, data);
    return response.data;
  }

  // 删除用户
  async deleteUser(id: number): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/${id}`);
  }

  // 修改密码
  async changePassword(id: number, newPassword: string): Promise<void> {
    await apiClient.put(`${this.baseUrl}/${id}/password`, { newPassword });
  }
}

export const userService = new UserService();
