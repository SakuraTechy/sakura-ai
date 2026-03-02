import { PrismaClient, Prisma } from '../../src/generated/prisma/index.js';

const prisma = new PrismaClient();

export interface AccountConfig {
  id: number;
  project_id: number;
  account_type: string;
  account_name: string;
  account_password: string;
  account_description?: string | null;
  status: 'active' | 'inactive';
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAccountInput {
  project_id: number;
  account_type: 'admin' | 'security' | 'auditor';
  account_name: string;
  account_password: string;
  account_description?: string;
  status?: 'active' | 'inactive';
  is_default?: boolean;
}

export interface UpdateAccountInput {
  account_type?: 'admin' | 'security' | 'auditor';
  account_name?: string;
  account_password?: string;
  account_description?: string;
  status?: 'active' | 'inactive';
  is_default?: boolean;
}

/**
 * 获取所有账号配置
 */
export async function getAccounts(): Promise<AccountConfig[]> {
  const accounts = await prisma.account_configs.findMany({
    orderBy: [
      { created_at: 'desc' }
    ]
  });

  return accounts.map(account => ({
    id: account.id,
    project_id: account.project_id,
    account_type: account.account_type,
    account_name: account.account_name,
    account_password: account.account_password,
    account_description: account.account_description,
    status: account.status as 'active' | 'inactive',
    is_default: account.is_default,
    created_at: account.created_at,
    updated_at: account.updated_at
  }));
}

/**
 * 根据ID获取账号配置
 */
export async function getAccountById(id: number): Promise<AccountConfig | null> {
  const account = await prisma.account_configs.findUnique({
    where: { id }
  });

  if (!account) {
    return null;
  }

  return {
    id: account.id,
    project_id: account.project_id,
    account_type: account.account_type,
    account_name: account.account_name,
    account_password: account.account_password,
    account_description: account.account_description,
    status: account.status as 'active' | 'inactive',
    is_default: account.is_default,
    created_at: account.created_at,
    updated_at: account.updated_at
  };
}

/**
 * 创建账号配置
 */
export async function createAccount(data: CreateAccountInput): Promise<AccountConfig> {
  // 检查账号名称是否已存在（在同一项目内）
  const existing = await prisma.account_configs.findFirst({
    where: { 
      account_name: data.account_name,
      project_id: data.project_id
    }
  });

  if (existing) {
    throw new Error('账号名称已存在');
  }

  // 检查该项目下是否已有账号，如果没有则自动设为默认
  const existingCount = await prisma.account_configs.count({
    where: { project_id: data.project_id }
  });
  const shouldBeDefault = existingCount === 0 ? true : (data.is_default || false);

  // 如果设置默认，先取消同项目内其他默认账号
  if (shouldBeDefault) {
    await prisma.account_configs.updateMany({
      where: {
        project_id: data.project_id,
        is_default: true
      },
      data: { is_default: false }
    });
  }

  const account = await prisma.account_configs.create({
    data: {
      project_id: data.project_id,
      account_type: data.account_type,
      account_name: data.account_name,
      account_password: data.account_password,
      account_description: data.account_description,
      status: data.status || 'active',
      is_default: shouldBeDefault
    }
  });

  return {
    id: account.id,
    project_id: account.project_id,
    account_type: account.account_type,
    account_name: account.account_name,
    account_password: account.account_password,
    account_description: account.account_description,
    status: account.status as 'active' | 'inactive',
    is_default: account.is_default,
    created_at: account.created_at,
    updated_at: account.updated_at
  };
}

/**
 * 更新账号配置
 */
export async function updateAccount(id: number, data: UpdateAccountInput): Promise<AccountConfig> {
  // 检查账号是否存在
  const existing = await prisma.account_configs.findUnique({
    where: { id }
  });

  if (!existing) {
    throw new Error('账号配置不存在');
  }

  // 如果更新账号名称，检查是否与其他账号冲突（在同一项目内）
  if (data.account_name && data.account_name !== existing.account_name) {
    const duplicate = await prisma.account_configs.findFirst({
      where: {
        account_name: data.account_name,
        project_id: existing.project_id,
        id: { not: id }
      }
    });

    if (duplicate) {
      throw new Error('账号名称已存在');
    }
  }

  // 如果设置默认，先取消同项目内其他默认账号
  if (data.is_default) {
    await prisma.account_configs.updateMany({
      where: {
        project_id: existing.project_id,
        is_default: true,
        id: { not: id }
      },
      data: { is_default: false }
    });
  }

  const updateData: Prisma.account_configsUpdateInput = {};
  if (data.account_type !== undefined) updateData.account_type = data.account_type;
  if (data.account_name !== undefined) updateData.account_name = data.account_name;
  if (data.account_password !== undefined) updateData.account_password = data.account_password;
  if (data.account_description !== undefined) updateData.account_description = data.account_description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.is_default !== undefined) updateData.is_default = data.is_default;

  const account = await prisma.account_configs.update({
    where: { id },
    data: updateData
  });

  return {
    id: account.id,
    project_id: account.project_id,
    account_type: account.account_type,
    account_name: account.account_name,
    account_password: account.account_password,
    account_description: account.account_description,
    status: account.status as 'active' | 'inactive',
    is_default: account.is_default,
    created_at: account.created_at,
    updated_at: account.updated_at
  };
}

/**
 * 删除账号配置
 */
export async function deleteAccount(id: number): Promise<void> {
  const existing = await prisma.account_configs.findUnique({
    where: { id }
  });

  if (!existing) {
    throw new Error('账号配置不存在');
  }

  await prisma.account_configs.delete({
    where: { id }
  });
}

/**
 * 设置默认账号
 */
export async function setDefaultAccount(projectId: number, accountId: number): Promise<AccountConfig> {
  const account = await prisma.account_configs.findFirst({
    where: {
      id: accountId,
      project_id: projectId
    }
  });

  if (!account) {
    throw new Error('账号配置不存在');
  }

  // 使用事务确保数据一致性
  const result = await prisma.$transaction(async (tx) => {
    // 取消当前默认账号
    await tx.account_configs.updateMany({
      where: {
        project_id: projectId,
        is_default: true
      },
      data: { is_default: false }
    });

    // 设置新的默认账号
    const updated = await tx.account_configs.update({
      where: { id: accountId },
      data: { is_default: true }
    });

    return updated;
  });

  return {
    id: result.id,
    project_id: result.project_id,
    account_type: result.account_type,
    account_name: result.account_name,
    account_password: result.account_password,
    account_description: result.account_description,
    status: result.status as 'active' | 'inactive',
    is_default: result.is_default,
    created_at: result.created_at,
    updated_at: result.updated_at
  };
}

