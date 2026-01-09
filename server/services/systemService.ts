import { PrismaClient, Prisma } from '../../src/generated/prisma/index.js';

const prisma = new PrismaClient();

export interface System {
  id: number;
  name: string;
  short_name?: string | null;  // 🆕 项目简称
  description?: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSystemInput {
  name: string;
  short_name?: string;  // 🆕 项目简称
  description?: string;
  status?: 'active' | 'inactive';
  sort_order?: number;
}

export interface UpdateSystemInput {
  name?: string;
  short_name?: string;  // 🆕 项目简称
  description?: string;
  status?: 'active' | 'inactive';
  sort_order?: number;
}

export interface GetSystemsOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'active' | 'inactive';
}

/**
 * 获取系统列表（支持分页、搜索、筛选）
 */
export async function getSystems(options: GetSystemsOptions = {}) {
  const {
    page = 1,
    pageSize = 50,
    search = '',
    status
  } = options;

  const skip = (page - 1) * pageSize;

  // 构建查询条件
  const where: Prisma.systemsWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } }
    ];
  }

  if (status) {
    where.status = status;
  }

  // 查询数据和总数
  const [systems, total] = await Promise.all([
    prisma.systems.findMany({
      where,
      orderBy: [
        { sort_order: 'asc' },
        { name: 'asc' }
      ],
      skip,
      take: pageSize
    }),
    prisma.systems.count({ where })
  ]);

  return {
    data: systems,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

/**
 * 获取所有启用的系统（不分页，用于下拉选择）
 */
export async function getActiveSystems() {
  const systems = await prisma.systems.findMany({
    where: { status: 'active' },
    orderBy: [
      { sort_order: 'asc' },
      { name: 'asc' }
    ],
    select: {
      id: true,
      name: true,
      short_name: true,  // 🆕 项目简称
      // 🆕 包含版本信息（用于AI生成器选择项目版本）
      versions: {
        where: { status: 'active' },
        orderBy: [
          { is_main: 'desc' },  // 主线版本优先
          { created_at: 'desc' }
        ],
        select: {
          id: true,
          version_name: true,
          version_code: true,
          is_main: true
        }
      }
    }
  });
  
  // 将 versions 字段名映射为 project_versions（前端期望的字段名）
  return systems.map(sys => ({
    ...sys,
    project_versions: sys.versions
  }));
}

/**
 * 根据ID获取系统
 */
export async function getSystemById(id: number) {
  return prisma.systems.findUnique({
    where: { id }
  });
}

/**
 * 创建系统
 */
export async function createSystem(input: CreateSystemInput) {
  // 检查系统名称是否已存在
  const existing = await prisma.systems.findUnique({
    where: { name: input.name }
  });

  if (existing) {
    throw new Error('系统名称已存在');
  }

  return prisma.systems.create({
    data: {
      name: input.name,
      short_name: input.short_name,  // 🆕 项目简称
      description: input.description,
      status: input.status || 'active',
      sort_order: input.sort_order || 0
    }
  });
}

/**
 * 更新系统
 */
export async function updateSystem(id: number, input: UpdateSystemInput) {
  // 如果更新名称，检查是否与其他系统重复
  if (input.name) {
    const existing = await prisma.systems.findFirst({
      where: {
        name: input.name,
        NOT: { id }
      }
    });

    if (existing) {
      throw new Error('系统名称已存在');
    }
  }

  return prisma.systems.update({
    where: { id },
    data: input
  });
}

/**
 * 删除系统（需校验是否被引用）
 */
export async function deleteSystem(id: number) {
  const system = await prisma.systems.findUnique({
    where: { id }
  });

  if (!system) {
    throw new Error('系统不存在');
  }

  // 检查是否被测试用例引用
  const [testCaseCount, functionalTestCaseCount] = await Promise.all([
    prisma.test_cases.count({
      where: { system: system.name }
    }),
    prisma.functional_test_cases.count({
      where: { system: system.name }
    })
  ]);

  const totalReferences = testCaseCount + functionalTestCaseCount;

  if (totalReferences > 0) {
    throw new Error(`该系统正被 ${totalReferences} 个测试用例引用，无法删除`);
  }

  return prisma.systems.delete({
    where: { id }
  });
}

/**
 * 批量更新系统排序
 */
export async function updateSystemsOrder(orders: { id: number; sort_order: number }[]) {
  const updates = orders.map(({ id, sort_order }) =>
    prisma.systems.update({
      where: { id },
      data: { sort_order }
    })
  );

  return Promise.all(updates);
}

// ==================== 项目版本相关 ====================

export interface ProjectVersion {
  id: number;
  project_id: number;
  version_name: string;
  version_code: string;
  description?: string | null;
  is_main: boolean;
  status: 'active' | 'inactive';
  release_date?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateVersionInput {
  project_id: number;
  version_name: string;
  version_code: string;
  description?: string;
  is_main?: boolean;
  status?: 'active' | 'inactive';
  release_date?: string;
}

export interface UpdateVersionInput {
  version_name?: string;
  version_code?: string;
  description?: string;
  status?: 'active' | 'inactive';
  release_date?: string | null;
}

/**
 * 获取项目的所有版本
 */
export async function getProjectVersions(projectId: number): Promise<ProjectVersion[]> {
  const versions = await prisma.project_versions.findMany({
    where: { project_id: projectId },
    orderBy: [
      { is_main: 'desc' },
      { created_at: 'desc' }
    ]
  });

  return versions as ProjectVersion[];
}

/**
 * 创建项目版本
 */
export async function createProjectVersion(input: CreateVersionInput): Promise<ProjectVersion> {
  // 检查项目是否存在
  const project = await prisma.systems.findUnique({
    where: { id: input.project_id }
  });

  if (!project) {
    throw new Error('项目不存在');
  }

  // 检查版本名称是否重复（版本号可以重复，版本名称不能重复）
  const existingVersion = await prisma.project_versions.findFirst({
    where: {
      project_id: input.project_id,
      version_name: input.version_name
    }
  });

  if (existingVersion) {
    throw new Error('该版本名称已存在');
  }

  // 如果设置为主线版本，先取消其他主线版本
  if (input.is_main) {
    await prisma.project_versions.updateMany({
      where: {
        project_id: input.project_id,
        is_main: true
      },
      data: { is_main: false }
    });
  }

  const version = await prisma.project_versions.create({
    data: {
      project_id: input.project_id,
      version_name: input.version_name,
      version_code: input.version_code,
      description: input.description,
      is_main: input.is_main || false,
      status: input.status || 'active',
      release_date: input.release_date ? new Date(input.release_date) : null
    }
  });

  return version as ProjectVersion;
}

/**
 * 更新项目版本
 */
export async function updateProjectVersion(
  projectId: number,
  versionId: number,
  input: UpdateVersionInput
): Promise<ProjectVersion> {
  // 检查版本是否存在
  const existing = await prisma.project_versions.findFirst({
    where: {
      id: versionId,
      project_id: projectId
    }
  });

  if (!existing) {
    throw new Error('版本不存在');
  }

  // 如果更新版本名称，检查是否重复（版本号可以重复，版本名称不能重复）
  if (input.version_name && input.version_name !== existing.version_name) {
    const duplicate = await prisma.project_versions.findFirst({
      where: {
        project_id: projectId,
        version_name: input.version_name,
        NOT: { id: versionId }
      }
    });

    if (duplicate) {
      throw new Error('该版本名称已存在');
    }
  }

  const updateData: any = {};
  if (input.version_name !== undefined) updateData.version_name = input.version_name;
  if (input.version_code !== undefined) updateData.version_code = input.version_code;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.release_date !== undefined) {
    updateData.release_date = input.release_date ? new Date(input.release_date) : null;
  }

  const version = await prisma.project_versions.update({
    where: { id: versionId },
    data: updateData
  });

  return version as ProjectVersion;
}

/**
 * 删除项目版本
 */
export async function deleteProjectVersion(projectId: number, versionId: number): Promise<void> {
  const version = await prisma.project_versions.findFirst({
    where: {
      id: versionId,
      project_id: projectId
    }
  });

  if (!version) {
    throw new Error('版本不存在');
  }

  if (version.is_main) {
    throw new Error('不能删除主线版本，请先设置其他版本为主线');
  }

  await prisma.project_versions.delete({
    where: { id: versionId }
  });
}

/**
 * 设置主线版本
 */
export async function setMainVersion(projectId: number, versionId: number): Promise<ProjectVersion> {
  const version = await prisma.project_versions.findFirst({
    where: {
      id: versionId,
      project_id: projectId
    }
  });

  if (!version) {
    throw new Error('版本不存在');
  }

  // 使用事务确保数据一致性
  const result = await prisma.$transaction(async (tx) => {
    // 取消当前主线版本
    await tx.project_versions.updateMany({
      where: {
        project_id: projectId,
        is_main: true
      },
      data: { is_main: false }
    });

    // 设置新的主线版本
    const updated = await tx.project_versions.update({
      where: { id: versionId },
      data: { is_main: true }
    });

    return updated;
  });

  return result as ProjectVersion;
}

// ==================== 项目账号管理 ====================

/**
 * 获取项目的所有账号配置
 */
export async function getProjectAccounts(projectId: number) {
  const accounts = await prisma.account_configs.findMany({
    where: { project_id: projectId },
    orderBy: [
      { is_default: 'desc' },
      { created_at: 'desc' }
    ]
  });

  return accounts;
}

// ==================== 项目服务器管理 ====================

/**
 * 获取项目的所有服务器配置
 */
export async function getProjectServers(projectId: number) {
  const servers = await prisma.server_configs.findMany({
    where: { project_id: projectId },
    orderBy: [
      { is_default: 'desc' },
      { created_at: 'desc' }
    ]
  });

  return servers;
}

// ==================== 项目数据库管理 ====================

/**
 * 获取项目的所有数据库配置
 */
export async function getProjectDatabases(projectId: number) {
  const databases = await prisma.database_configs.findMany({
    where: { project_id: projectId },
    orderBy: [
      { is_default: 'desc' },
      { created_at: 'desc' }
    ]
  });

  return databases;
}