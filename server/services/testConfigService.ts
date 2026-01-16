import { PrismaClient } from '../../src/generated/prisma/index.js';
import { DatabaseService } from './databaseService.js';

/**
 * 测试配置服务
 * 负责获取和管理测试用例的配置数据
 */
export class TestConfigService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = DatabaseService.getInstance().getClient();
  }

  /**
   * 获取项目的默认测试配置
   */
  async getProjectDefaultConfig(projectId: number) {
    console.log(`📋 获取项目 ${projectId} 的默认配置`);

    // 获取默认账号
    const defaultAccount = await this.prisma.account_configs.findFirst({
      where: { 
        project_id: projectId, 
        is_default: true, 
        status: 'active' 
      }
    });

    // 获取默认服务器
    const defaultServer = await this.prisma.server_configs.findFirst({
      where: { 
        project_id: projectId, 
        is_default: true, 
        status: 'active' 
      }
    });

    // 获取默认数据库
    const defaultDatabase = await this.prisma.database_configs.findFirst({
      where: { 
        project_id: projectId, 
        is_default: true, 
        status: 'active' 
      }
    });

    console.log(`✅ 默认配置获取完成:`, {
      hasAccount: !!defaultAccount,
      hasServer: !!defaultServer,
      hasDatabase: !!defaultDatabase
    });

    return {
      account: defaultAccount,
      server: defaultServer,
      database: defaultDatabase
    };
  }

  /**
   * 获取测试用例的完整配置
   * 优先级：用例配置 > 项目默认配置
   */
  async getTestCaseConfig(testCaseId: number) {
    console.log(`📋 获取测试用例 ${testCaseId} 的配置`);

    const testCase = await this.prisma.functional_test_cases.findUnique({
      where: { id: testCaseId },
      select: {
        id: true,
        project_version_id: true,
        test_data: true,
        preconditions: true,
        project_version: {
          select: {
            project_id: true
          }
        }
      }
    });

    if (!testCase) {
      throw new Error('测试用例不存在');
    }

    if (!testCase.project_version?.project_id) {
      throw new Error('测试用例未关联项目');
    }

    // 获取项目默认配置
    const projectConfig = await this.getProjectDefaultConfig(testCase.project_version.project_id);

    // 构建测试URL
    const testUrl = this.buildTestUrl(projectConfig.server);

    console.log(`✅ 测试用例配置获取完成`);

    return {
      account: projectConfig.account,
      server: projectConfig.server,
      database: projectConfig.database,
      testUrl,
      testData: testCase.test_data,
      preconditions: testCase.preconditions
    };
  }

  /**
   * 验证项目配置完整性
   */
  async validateProjectConfig(projectId: number): Promise<{
    valid: boolean;
    missing: string[];
    warnings: string[];
  }> {
    console.log(`🔍 验证项目 ${projectId} 的配置完整性`);

    const config = await this.getProjectDefaultConfig(projectId);
    const missing: string[] = [];
    const warnings: string[] = [];

    // 必需配置检查
    if (!config.account) {
      missing.push('默认测试账号');
    } else {
      // 账号配置完整性检查
      if (!config.account.account_name) warnings.push('测试账号缺少用户名');
      if (!config.account.account_password) warnings.push('测试账号缺少密码');
    }

    if (!config.server) {
      missing.push('默认测试服务器');
    } else {
      // 服务器配置完整性检查
      if (!config.server.host_name) warnings.push('服务器缺少主机地址');
      if (!config.server.host_port) warnings.push('服务器缺少端口号');
    }

    // 数据库配置为可选
    if (!config.database) {
      warnings.push('未配置默认数据库（如需数据库测试请配置）');
    }

    const valid = missing.length === 0;

    console.log(`${valid ? '✅' : '❌'} 配置验证完成:`, {
      valid,
      missing,
      warnings
    });

    return {
      valid,
      missing,
      warnings
    };
  }

  /**
   * 构建测试访问地址
   * 优先使用 parameters.url，如果没有则从 host_name 和 host_port 构建
   */
  private buildTestUrl(server: any): string {
    if (!server) return '';
    
    // 🔥 优先使用 parameters.url（如果存在）
    if (server.parameters && typeof server.parameters === 'object') {
      const params = server.parameters as Record<string, any>;
      if (params.url && typeof params.url === 'string') {
        return params.url;
      }
    }
    
    // 如果没有 parameters.url，从 host_name 和 host_port 构建
    if (!server.host_name) return '';
    
    const protocol = server.host_port === 443 ? 'https' : 'http';
    const port = (server.host_port === 80 || server.host_port === 443) 
      ? '' 
      : `:${server.host_port}`;
    
    return `${protocol}://${server.host_name}${port}`;
  }

  /**
   * 获取项目的所有账号配置（包括非默认）
   */
  async getProjectAccounts(projectId: number) {
    return await this.prisma.account_configs.findMany({
      where: { 
        project_id: projectId, 
        status: 'active' 
      },
      orderBy: [
        { is_default: 'desc' },
        { created_at: 'desc' }
      ]
    });
  }

  /**
   * 获取项目的所有服务器配置（包括非默认）
   */
  async getProjectServers(projectId: number) {
    return await this.prisma.server_configs.findMany({
      where: { 
        project_id: projectId, 
        status: 'active' 
      },
      orderBy: [
        { is_default: 'desc' },
        { created_at: 'desc' }
      ]
    });
  }

  /**
   * 获取项目的所有数据库配置（包括非默认）
   */
  async getProjectDatabases(projectId: number) {
    return await this.prisma.database_configs.findMany({
      where: { 
        project_id: projectId, 
        status: 'active' 
      },
      orderBy: [
        { is_default: 'desc' },
        { created_at: 'desc' }
      ]
    });
  }

  /**
   * 获取项目指定类型的账号配置
   */
  async getProjectAccountByType(projectId: number, accountType: string) {
    console.log(`📋 获取项目 ${projectId} 的 ${accountType} 类型账号`);

    const account = await this.prisma.account_configs.findFirst({
      where: { 
        project_id: projectId, 
        account_type: accountType,
        status: 'active' 
      },
      orderBy: [
        { is_default: 'desc' },
        { created_at: 'desc' }
      ]
    });

    if (account) {
      console.log(`✅ 找到 ${accountType} 账号: ${account.account_name}`);
    } else {
      console.log(`⚠️ 未找到 ${accountType} 类型账号`);
    }

    return account;
  }

  /**
   * 获取项目所有账号配置的映射表
   */
  async getProjectAccountsMap(projectId: number): Promise<Record<string, any>> {
    const accounts = await this.getProjectAccounts(projectId);
    const accountsMap: Record<string, any> = {};

    accounts.forEach(account => {
      accountsMap[account.account_type] = account;
    });

    console.log(`📋 项目 ${projectId} 账号映射表:`, Object.keys(accountsMap));
    return accountsMap;
  }

  /**
   * 批量验证多个项目的配置
   */
  async batchValidateProjects(projectIds: number[]) {
    const results = await Promise.all(
      projectIds.map(async (projectId) => {
        const validation = await this.validateProjectConfig(projectId);
        return {
          projectId,
          ...validation
        };
      })
    );

    return results;
  }
}
