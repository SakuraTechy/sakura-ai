import { PrismaClient, Prisma } from '../../src/generated/prisma/index.js';

const prisma = new PrismaClient();

export interface ServerConfig {
  id: number;
  project_id: number;
  server_type: string;
  server_version: string;
  host_name: string;
  host_port: number;
  username: string;
  password: string;
  description?: string | null;
  status: 'active' | 'inactive';
  is_default: boolean;
  parameters?: Record<string, string> | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateServerInput {
  project_id: number;
  server_type: string;
  server_version: string;
  host_name: string;
  host_port: number;
  username: string;
  password: string;
  description?: string;
  status?: 'active' | 'inactive';
  is_default?: boolean;
  parameters?: Record<string, string> | null;
}

export interface UpdateServerInput {
  server_type?: string;
  server_version?: string;
  host_name?: string;
  host_port?: number;
  username?: string;
  password?: string;
  description?: string;
  status?: 'active' | 'inactive';
  is_default?: boolean;
  parameters?: Record<string, string> | null;
}

/**
 * 获取所有服务器配置
 */
export async function getServers(): Promise<ServerConfig[]> {
  const servers = await prisma.server_configs.findMany({
    orderBy: [
      { created_at: 'desc' }
    ]
  });

  return servers.map(server => ({
    id: server.id,
    project_id: server.project_id,
    server_type: server.server_type,
    server_version: server.server_version,
    host_name: server.host_name,
    host_port: server.host_port,
    username: server.username,
    password: server.password,
    description: server.description,
    status: server.status as 'active' | 'inactive',
    is_default: server.is_default,
    parameters: server.parameters as Record<string, string> | null,
    created_at: server.created_at,
    updated_at: server.updated_at
  }));
}

/**
 * 根据ID获取服务器配置
 */
export async function getServerById(id: number): Promise<ServerConfig | null> {
  const server = await prisma.server_configs.findUnique({
    where: { id }
  });

  if (!server) {
    return null;
  }

  return {
    id: server.id,
    project_id: server.project_id,
    server_type: server.server_type,
    server_version: server.server_version,
    host_name: server.host_name,
    host_port: server.host_port,
    username: server.username,
    password: server.password,
    description: server.description,
    status: server.status as 'active' | 'inactive',
    is_default: server.is_default,
    parameters: server.parameters as Record<string, string> | null,
    created_at: server.created_at,
    updated_at: server.updated_at
  };
}

/**
 * 创建服务器配置
 */
export async function createServer(data: CreateServerInput): Promise<ServerConfig> {
  // 检查该项目下是否已有服务器，如果没有则自动设为默认
  const existingCount = await prisma.server_configs.count({
    where: { project_id: data.project_id }
  });
  const shouldBeDefault = existingCount === 0 ? true : (data.is_default || false);

  // 如果设置默认，先取消同项目内其他默认服务器
  if (shouldBeDefault) {
    await prisma.server_configs.updateMany({
      where: {
        project_id: data.project_id,
        is_default: true
      },
      data: { is_default: false }
    });
  }

  const server = await prisma.server_configs.create({
    data: {
      project_id: data.project_id,
      server_type: data.server_type,
      server_version: data.server_version,
      host_name: data.host_name,
      host_port: data.host_port,
      username: data.username,
      password: data.password,
      description: data.description,
      status: data.status || 'active',
      is_default: shouldBeDefault,
      parameters: data.parameters ? (data.parameters as any) : null
    }
  });

  return {
    id: server.id,
    project_id: server.project_id,
    server_type: server.server_type,
    server_version: server.server_version,
    host_name: server.host_name,
    host_port: server.host_port,
    username: server.username,
    password: server.password,
    description: server.description,
    status: server.status as 'active' | 'inactive',
    is_default: server.is_default,
    parameters: server.parameters as Record<string, string> | null,
    created_at: server.created_at,
    updated_at: server.updated_at
  };
}

/**
 * 更新服务器配置
 */
export async function updateServer(id: number, data: UpdateServerInput): Promise<ServerConfig> {
  // 检查服务器是否存在
  const existing = await prisma.server_configs.findUnique({
    where: { id }
  });

  if (!existing) {
    throw new Error('服务器配置不存在');
  }

  // 如果设置默认，先取消同项目内其他默认服务器
  if (data.is_default) {
    await prisma.server_configs.updateMany({
      where: {
        project_id: existing.project_id,
        is_default: true,
        id: { not: id }
      },
      data: { is_default: false }
    });
  }

  const updateData: Prisma.server_configsUpdateInput = {};
  if (data.server_type !== undefined) updateData.server_type = data.server_type;
  if (data.server_version !== undefined) updateData.server_version = data.server_version;
  if (data.host_name !== undefined) updateData.host_name = data.host_name;
  if (data.host_port !== undefined) updateData.host_port = data.host_port;
  if (data.username !== undefined) updateData.username = data.username;
  if (data.password !== undefined) updateData.password = data.password;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.is_default !== undefined) updateData.is_default = data.is_default;
  if (data.parameters !== undefined) updateData.parameters = data.parameters || null;

  const server = await prisma.server_configs.update({
    where: { id },
    data: updateData
  });

  return {
    id: server.id,
    project_id: server.project_id,
    server_type: server.server_type,
    server_version: server.server_version,
    host_name: server.host_name,
    host_port: server.host_port,
    username: server.username,
    password: server.password,
    description: server.description,
    status: server.status as 'active' | 'inactive',
    is_default: server.is_default,
    parameters: server.parameters as Record<string, string> | null,
    created_at: server.created_at,
    updated_at: server.updated_at
  };
}

/**
 * 删除服务器配置
 */
export async function deleteServer(id: number): Promise<void> {
  const existing = await prisma.server_configs.findUnique({
    where: { id }
  });

  if (!existing) {
    throw new Error('服务器配置不存在');
  }

  await prisma.server_configs.delete({
    where: { id }
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
  let server: ServerConfig | null = null;

  // 如果提供了配置数据，使用提供的配置；否则从数据库查询
  if (config && (config.host_name || config.username)) {
    // 使用提供的配置数据创建临时配置对象
    if (id) {
      // 如果有ID，合并现有配置和提供的配置
      const existing = await getServerById(id);
      if (!existing) {
        throw new Error('服务器配置不存在');
      }
      // 🔥 注意：如果config中明确提供了字段（包括空字符串），使用提供的值；否则使用existing的值
      server = {
        ...existing,
        host_name: config.host_name !== undefined ? config.host_name : existing.host_name,
        host_port: config.host_port !== undefined ? config.host_port : existing.host_port,
        username: config.username !== undefined ? config.username : existing.username,
        password: config.password !== undefined ? config.password : existing.password,
        server_type: config.server_type !== undefined ? config.server_type : existing.server_type,
        server_version: config.server_version !== undefined ? config.server_version : existing.server_version,
        parameters: config.parameters !== undefined ? config.parameters : existing.parameters
      };
    } else {
      // 如果没有ID，检查是否提供了完整的配置数据
      if (!config.host_name || !config.username || !config.password || config.host_port === undefined) {
        throw new Error('测试新配置时需要提供完整的配置数据（主机名、用户名、密码、端口）');
      }
      // 创建临时服务器配置对象用于测试
      server = {
        id: 0, // 临时ID
        project_id: config.project_id || 0,
        server_type: config.server_type || 'Linux',
        server_version: config.server_version || '',
        host_name: config.host_name,
        host_port: config.host_port,
        username: config.username,
        password: config.password,
        description: config.description || '',
        status: 'active',
        is_default: false,
        parameters: config.parameters || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }
  } else {
    if (!id) {
      throw new Error('服务器ID不能为空');
    }
    server = await getServerById(id);
    if (!server) {
      throw new Error('服务器配置不存在');
    }
  }

  return new Promise((resolve) => {
    try {
      // 根据服务器类型和端口选择合适的连接测试方法
      const serverType = server.server_type.toLowerCase();
      const port = server.host_port;
      
      // Windows服务器且使用RDP端口(3389)时，进行TCP连接测试
      if (serverType === 'windows' && port === 3389) {
        testTcpConnection(server, resolve);
      } else if (port === 22 || port === 2222 || serverType.includes('linux') || serverType.includes('unix') || serverType.includes('centos') || serverType.includes('ubuntu') || serverType.includes('debian') || serverType.includes('red hat') || serverType.includes('suse') || serverType.includes('macos') || serverType.includes('freebsd') || serverType.includes('aix')) {
        // SSH连接测试（Linux/Unix系统或SSH端口）
        testSshConnection(server, resolve);
      } else {
        // 其他情况使用TCP连接测试
        testTcpConnection(server, resolve);
      }
    } catch (error: any) {
      resolve({
        success: false,
        message: error.message || '连接测试失败'
      });
    }
  });
}

/**
 * TCP连接测试（用于Windows RDP等非SSH服务）
 */
function testTcpConnection(server: ServerConfig, resolve: (value: { success: boolean; message: string }) => void) {
  // 动态导入net模块
  import('net').then((net) => {
    const socket = new net.Socket();
    
    let isResolved = false;
    
    // 设置连接超时（10秒）
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({
          success: false,
          message: '连接超时：无法在10秒内建立连接'
        });
      }
    }, 10000);
    
    socket.setTimeout(10000);
    
    socket.on('connect', () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        socket.destroy();
        resolve({
          success: true,
          message: `TCP连接成功 (${server.host_name}:${server.host_port}) `
        });
      }
    });
    
    socket.on('error', (err: any) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        socket.destroy();
        
        let errorMessage = '连接失败';
        const errCode = err.code || '';
        const errMsg = err.message.toLowerCase();
        
        if (errCode === 'ECONNREFUSED' || errMsg.includes('econnrefused')) {
          errorMessage = '连接被拒绝：请检查主机地址和端口是否正确，或服务是否正在运行';
        } else if (errCode === 'ETIMEDOUT' || errMsg.includes('timeout') || errMsg.includes('timed out')) {
          errorMessage = '连接超时：无法连接到服务器，请检查网络或防火墙设置';
        } else if (errCode === 'ENOTFOUND' || errMsg.includes('enotfound')) {
          errorMessage = '主机名解析失败：请检查主机地址是否正确';
        } else if (errCode === 'ECONNRESET' || errMsg.includes('econnreset')) {
          errorMessage = '连接被重置：服务器主动断开连接，可能是防火墙或服务配置问题';
        } else {
          errorMessage = `连接失败：${err.message || errCode || '未知错误'}`;
        }
        
        resolve({
          success: false,
          message: errorMessage
        });
      }
    });
    
    socket.on('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        socket.destroy();
        resolve({
          success: false,
          message: '连接超时：无法在10秒内建立连接'
        });
      }
    });
    
    // 开始连接
    socket.connect(server.host_port, server.host_name);
  }).catch((err) => {
    resolve({
      success: false,
      message: `网络模块加载失败：${err.message}`
    });
  });
}

/**
 * SSH连接测试（用于Linux/Unix系统）
 */
function testSshConnection(server: ServerConfig, resolve: (value: { success: boolean; message: string }) => void) {
  // 动态导入ssh2模块
  import('ssh2').then((ssh2) => {
    const { Client } = ssh2;
    const conn = new Client();
    
    let isResolved = false; // 防止重复resolve
    
    // 设置连接超时（10秒）
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        conn.end();
        resolve({
          success: false,
          message: '连接超时：无法在10秒内建立连接'
        });
      }
    }, 10000);

    // ready事件只有在认证成功后才触发
    conn.on('ready', () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        // 执行一个简单的命令来验证连接确实可用
        conn.exec('echo "test"', (err: Error | undefined, stream: any) => {
          conn.end();
          if (err) {
            resolve({
              success: false,
              message: `连接建立但验证失败：${err.message}`
            });
          } else {
            resolve({
              success: true,
              message: `SSH连接成功 (${server.host_name}:${server.host_port})`
            });
          }
        });
      }
    });

    // 处理所有错误，包括认证失败
    conn.on('error', (err: Error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        let errorMessage = '连接失败';
        
        const errMsg = err.message.toLowerCase();
        const errCode = (err as any).code || '';
        
        if (errCode === 'ECONNREFUSED' || errMsg.includes('econnrefused')) {
          errorMessage = '连接被拒绝：请检查主机地址和端口是否正确';
        } else if (errCode === 'ETIMEDOUT' || errMsg.includes('timeout') || errMsg.includes('timed out')) {
          errorMessage = '连接超时：无法连接到服务器，请检查网络或防火墙设置';
        } else if (errCode === 'ENOTFOUND' || errMsg.includes('enotfound')) {
          errorMessage = '主机名解析失败：请检查主机地址是否正确';
        } else if (errMsg.includes('authentication') || errMsg.includes('auth') || errCode === 'AUTH_FAILED') {
          errorMessage = '认证失败：请检查用户名和密码是否正确';
        } else if (errMsg.includes('password') || errMsg.includes('permission denied')) {
          errorMessage = '认证失败：请检查用户名和密码是否正确';
        } else if (errCode === 'ECONNRESET' || errMsg.includes('econnreset')) {
          errorMessage = '连接被重置：可能是SSH服务未启用或端口配置错误';
        } else {
          errorMessage = `连接失败：${err.message || errCode || '未知错误'}`;
        }
        
        resolve({
          success: false,
          message: errorMessage
        });
      }
    });

    // 构建SSH连接配置
    const sshConfig: any = {
      host: server.host_name,
      port: server.host_port,
      username: server.username,
      password: server.password,
      readyTimeout: 10000, // 10秒超时
      tryKeyboard: false,
      // 禁用自动重试，确保认证失败立即返回错误
      retries: 0
    };

    // 如果服务器参数中有私钥路径，使用私钥认证
    if (server.parameters) {
      const privateKey = server.parameters['privateKey'] || server.parameters['private_key'];
      if (privateKey) {
        sshConfig.privateKey = privateKey;
        delete sshConfig.password; // 使用私钥时不需要密码
      }
      
      // 支持其他SSH参数
      if (server.parameters['passphrase']) {
        sshConfig.passphrase = server.parameters['passphrase'];
      }
    }

    // 开始连接
    conn.connect(sshConfig);
  }).catch((err) => {
    resolve({
      success: false,
      message: `SSH模块加载失败：${err.message}。请确保已安装ssh2依赖包`
    });
  });
}

/**
 * 设置默认服务器
 */
export async function setDefaultServer(projectId: number, serverId: number): Promise<ServerConfig> {
  const server = await prisma.server_configs.findFirst({
    where: {
      id: serverId,
      project_id: projectId
    }
  });

  if (!server) {
    throw new Error('服务器配置不存在');
  }

  // 使用事务确保数据一致性
  const result = await prisma.$transaction(async (tx) => {
    // 取消当前默认服务器
    await tx.server_configs.updateMany({
      where: {
        project_id: projectId,
        is_default: true
      },
      data: { is_default: false }
    });

    // 设置新的默认服务器
    const updated = await tx.server_configs.update({
      where: { id: serverId },
      data: { is_default: true }
    });

    return updated;
  });

  return {
    id: result.id,
    project_id: result.project_id,
    server_type: result.server_type,
    server_version: result.server_version,
    host_name: result.host_name,
    host_port: result.host_port,
    username: result.username,
    password: result.password,
    description: result.description,
    status: result.status as 'active' | 'inactive',
    is_default: result.is_default,
    parameters: result.parameters as Record<string, string> | null,
    created_at: result.created_at,
    updated_at: result.updated_at
  };
}

