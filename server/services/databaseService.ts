import { PrismaClient, Prisma } from '../../src/generated/prisma/index.js';

const prisma = new PrismaClient();

/**
 * DatabaseService - 数据库服务单例类
 * 提供 PrismaClient 的集中管理和访问
 */
export interface DatabaseServiceConfig {
  enableLogging?: boolean;
  logLevel?: 'query' | 'info' | 'warn' | 'error';
  maxConnections?: number;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;
  private config: DatabaseServiceConfig;

  private constructor(config?: DatabaseServiceConfig) {
    this.config = config || {};
    this.prisma = new PrismaClient({
      log: this.config.enableLogging
        ? [
            { level: this.config.logLevel || 'error', emit: 'event' },
          ]
        : undefined,
    });
  }

  static getInstance(config?: DatabaseServiceConfig): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService(config);
    }
    return DatabaseService.instance;
  }

  getClient(): PrismaClient {
    return this.prisma;
  }

  async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export interface DatabaseConfig {
  id: number;
  project_id: number;
  database_type: string;
  database_version: string;
  database_driver: string;
  database_name: string;
  database_port: number;
  database_schema: string;
  username: string;
  password: string;
  connection_string: string;
  description?: string | null;
  status: 'active' | 'inactive';
  is_default: boolean;
  parameters?: Record<string, string> | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDatabaseInput {
  project_id: number;
  database_type: string;
  database_version: string;
  database_driver: string;
  database_name: string;
  database_port: number;
  database_schema: string;
  username: string;
  password: string;
  connection_string: string;
  description?: string;
  status?: 'active' | 'inactive';
  is_default?: boolean;
  parameters?: Record<string, string>;
}

export interface UpdateDatabaseInput {
  database_type?: string;
  database_version?: string;
  database_driver?: string;
  database_name?: string;
  database_port?: number;
  database_schema?: string;
  username?: string;
  password?: string;
  connection_string?: string;
  description?: string;
  status?: 'active' | 'inactive';
  is_default?: boolean;
  parameters?: Record<string, string>;
}

/**
 * 获取所有数据库配置
 */
export async function getDatabases(): Promise<DatabaseConfig[]> {
  const databases = await prisma.database_configs.findMany({
    orderBy: [
      { created_at: 'desc' }
    ]
  });

  return databases.map(db => ({
    id: db.id,
    project_id: db.project_id,
    database_type: db.database_type,
    database_version: db.database_version,
    database_driver: db.database_driver,
    database_name: db.database_name,
    database_port: db.database_port,
    database_schema: db.database_schema,
    username: db.username,
    password: db.password,
    connection_string: db.connection_string,
    description: db.description,
    status: db.status as 'active' | 'inactive',
    is_default: db.is_default,
    parameters: db.parameters as Record<string, string> | null,
    created_at: db.created_at,
    updated_at: db.updated_at
  }));
}

/**
 * 根据ID获取数据库配置
 */
export async function getDatabaseById(id: number): Promise<DatabaseConfig | null> {
  const database = await prisma.database_configs.findUnique({
    where: { id }
  });

  if (!database) {
    return null;
  }

  return {
    id: database.id,
    project_id: database.project_id,
    database_type: database.database_type,
    database_version: database.database_version,
    database_driver: database.database_driver,
    database_name: database.database_name,
    database_port: database.database_port,
    database_schema: database.database_schema,
    username: database.username,
    password: database.password,
    connection_string: database.connection_string,
    description: database.description,
    status: database.status as 'active' | 'inactive',
    is_default: database.is_default,
    parameters: database.parameters as Record<string, string> | null,
    created_at: database.created_at,
    updated_at: database.updated_at
  };
}

/**
 * 创建数据库配置
 */
export async function createDatabase(data: CreateDatabaseInput): Promise<DatabaseConfig> {
  // 如果设置默认，先取消同项目内其他默认数据库
  if (data.is_default) {
    await prisma.database_configs.updateMany({
      where: {
        project_id: data.project_id,
        is_default: true
      },
      data: { is_default: false }
    });
  }

  const database = await prisma.database_configs.create({
    data: {
      project_id: data.project_id,
      database_type: data.database_type,
      database_version: data.database_version,
      database_driver: data.database_driver,
      database_name: data.database_name,
      database_port: data.database_port,
      database_schema: data.database_schema,
      username: data.username,
      password: data.password,
      connection_string: data.connection_string,
      description: data.description,
      status: data.status || 'active',
      is_default: data.is_default || false,
      parameters: data.parameters ? data.parameters as any : null
    }
  });

  return {
    id: database.id,
    project_id: database.project_id,
    database_type: database.database_type,
    database_version: database.database_version,
    database_driver: database.database_driver,
    database_name: database.database_name,
    database_port: database.database_port,
    database_schema: database.database_schema,
    username: database.username,
    password: database.password,
    connection_string: database.connection_string,
    description: database.description,
    status: database.status as 'active' | 'inactive',
    is_default: database.is_default,
    parameters: database.parameters as Record<string, string> | null,
    created_at: database.created_at,
    updated_at: database.updated_at
  };
}

/**
 * 更新数据库配置
 */
export async function updateDatabase(id: number, data: UpdateDatabaseInput): Promise<DatabaseConfig> {
  // 检查数据库是否存在
  const existing = await prisma.database_configs.findUnique({
    where: { id }
  });

  if (!existing) {
    throw new Error('数据库配置不存在');
  }

  // 如果设置默认，先取消同项目内其他默认数据库
  if (data.is_default) {
    await prisma.database_configs.updateMany({
      where: {
        project_id: existing.project_id,
        is_default: true,
        id: { not: id }
      },
      data: { is_default: false }
    });
  }

  const updateData: Prisma.database_configsUpdateInput = {};
  if (data.database_type !== undefined) updateData.database_type = data.database_type;
  if (data.database_version !== undefined) updateData.database_version = data.database_version;
  if (data.database_driver !== undefined) updateData.database_driver = data.database_driver;
  if (data.database_name !== undefined) updateData.database_name = data.database_name;
  if (data.database_port !== undefined) updateData.database_port = data.database_port;
  if (data.database_schema !== undefined) updateData.database_schema = data.database_schema;
  if (data.username !== undefined) updateData.username = data.username;
  if (data.password !== undefined) updateData.password = data.password;
  if (data.connection_string !== undefined) updateData.connection_string = data.connection_string;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.is_default !== undefined) updateData.is_default = data.is_default;
  if (data.parameters !== undefined) updateData.parameters = data.parameters || null;

  const database = await prisma.database_configs.update({
    where: { id },
    data: updateData
  });

  return {
    id: database.id,
    project_id: database.project_id,
    database_type: database.database_type,
    database_version: database.database_version,
    database_driver: database.database_driver,
    database_name: database.database_name,
    database_port: database.database_port,
    database_schema: database.database_schema,
    username: database.username,
    password: database.password,
    connection_string: database.connection_string,
    description: database.description,
    status: database.status as 'active' | 'inactive',
    is_default: database.is_default,
    parameters: database.parameters as Record<string, string> | null,
    created_at: database.created_at,
    updated_at: database.updated_at
  };
}

/**
 * 删除数据库配置
 */
export async function deleteDatabase(id: number): Promise<void> {
  const existing = await prisma.database_configs.findUnique({
    where: { id }
  });

  if (!existing) {
    throw new Error('数据库配置不存在');
  }

  await prisma.database_configs.delete({
    where: { id }
  });
}

/**
 * 使用JDBC连接串测试数据库连接（通用方案，支持所有JDBC兼容的数据库）
 */
async function testJdbcConnection(database: DatabaseConfig): Promise<{ success: boolean; message: string }> {
  console.log('🚀 开始JDBC连接测试...');
  console.log('📋 数据库配置:', {
    type: database.database_type,
    driver: database.database_driver,
    host: database.database_name,
    port: database.database_port,
    schema: database.database_schema,
    username: database.username,
    connection_string: database.connection_string ?? '未提供',
    parameters: database.parameters
  });

  // 检测数据库类型
  const detectedType = detectDatabaseType(
    database.database_type,
    database.connection_string,
    database.database_driver
  );
  console.log('🔍 检测到的数据库类型:', detectedType);

  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const path = await import('path');
  const fs = await import('fs');
  
  try {
    // 检查Java是否可用
    console.log('☕ 检查Java环境...');
    try {
      const { stdout: javaVersion } = await execAsync('java -version');
      console.log('✅ Java环境可用:', javaVersion.split('\n')[0]);
    } catch (javaError: any) {
      console.error('❌ Java环境检查失败:', javaError.message);
      return {
        success: false,
        message: 'JDBC连接测试需要Java运行时环境。请先安装Java（JDK 8或更高版本），然后确保java命令在PATH中可用。'
      };
    }

    // 创建临时Java测试类
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log('📁 创建临时目录:', tempDir);
    }

    // Oracle JDBC 需要 FROM DUAL；为兼容误判再准备一个备用查询
    const testQuery = detectedType === 'oracle' ? 'SELECT 1 FROM DUAL' : 'SELECT 1';
    const fallbackQuery = detectedType === 'oracle' ? 'SELECT 1' : '';
    console.log('📝 测试查询:', testQuery, fallbackQuery ? `(备用: ${fallbackQuery})` : '');

    const testClass = `
import java.sql.*;

public class JdbcTest {
    public static void main(String[] args) {
        if (args.length < 3) {
            System.err.println("ERROR: 参数不足，需要: url user password");
            System.exit(1);
        }
        String url = args[0];
        String user = args[1];
        String password = args[2];
        String primaryQuery = "${testQuery}";
        String backupQuery = "${fallbackQuery}";
        
        System.out.println("JDBC连接测试开始...");
        System.out.println("URL: " + url);
        System.out.println("User: " + user);
        System.out.println("Primary Query: " + primaryQuery);
        
        try {
            // 对于ClickHouse，尝试显式加载驱动（但不强制要求成功）
            if (url.contains("clickhouse")) {
                System.out.println("检测到ClickHouse，尝试加载驱动...");
                try {
                    Class.forName("com.clickhouse.jdbc.ClickHouseDriver");
                    System.out.println("新版ClickHouse驱动加载成功");
                } catch (ClassNotFoundException e1) {
                    try {
                        Class.forName("ru.yandex.clickhouse.ClickHouseDriver");
                        System.out.println("旧版ClickHouse驱动加载成功");
                    } catch (ClassNotFoundException e2) {
                        System.out.println("警告: ClickHouse驱动类未找到，尝试自动发现");
                    }
                } catch (NoClassDefFoundError e) {
                    System.out.println("警告: ClickHouse驱动缺少依赖，尝试自动发现");
                }
            }
            
            System.out.println("正在建立连接...");
            Connection conn = DriverManager.getConnection(url, user, password);
            System.out.println("连接建立成功");
            
            Statement stmt = conn.createStatement();
            try {
                System.out.println("执行主查询: " + primaryQuery);
                ResultSet rs = stmt.executeQuery(primaryQuery);
                if (rs.next()) {
                    System.out.println("SUCCESS");
                    System.out.println("查询结果: " + rs.getString(1));
                }
                rs.close();
                stmt.close();
                conn.close();
                System.out.println("连接已关闭");
                System.exit(0);
            } catch (Exception primaryEx) {
                System.out.println("主查询失败: " + primaryEx.getMessage());
                if (backupQuery != null && !backupQuery.isEmpty()) {
                    try {
                        System.out.println("尝试备用查询: " + backupQuery);
                        ResultSet rs = stmt.executeQuery(backupQuery);
                        if (rs.next()) {
                            System.out.println("SUCCESS");
                            System.out.println("备用查询结果: " + rs.getString(1));
                            rs.close();
                            stmt.close();
                            conn.close();
                            System.out.println("连接已关闭");
                            System.exit(0);
                        }
                    } catch (Exception backupEx) {
                        System.out.println("备用查询也失败: " + backupEx.getMessage());
                    }
                }
                System.err.println("ERROR: " + primaryEx.getMessage());
                stmt.close();
                conn.close();
                System.exit(1);
            }
        } catch (Exception e) {
            System.err.println("ERROR: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
}`;

    const javaFile = path.join(tempDir, 'JdbcTest.java');
    fs.writeFileSync(javaFile, testClass);
    console.log('📄 Java测试类已创建:', javaFile);

    // 编译Java类
    console.log('🔨 编译Java类...');
    try {
      const { stdout: compileOutput, stderr: compileError } = await execAsync(`javac "${javaFile}"`, { timeout: 10000 });
      if (compileOutput) console.log('编译输出:', compileOutput);
      if (compileError) console.log('编译警告:', compileError);
      console.log('✅ Java类编译成功');
    } catch (compileError: any) {
      console.error('❌ Java编译失败:', compileError.message);
      return {
        success: false,
        message: `Java编译失败：${compileError.message}`
      };
    }

    // 构建JDBC连接串（如果提供了完整的连接串，直接使用；否则构建）
    let jdbcUrl = database.connection_string;
    if (!jdbcUrl) {
      console.log('🔧 构建JDBC连接串...');
      // 根据数据库类型构建JDBC连接串
      const dbType = detectDatabaseType(database.database_type, null, database.database_driver);
      if (dbType === 'mysql' || dbType === 'mariadb') {
        jdbcUrl = `jdbc:mysql://${database.database_name}:${database.database_port}/${database.database_schema}`;
      } else if (dbType === 'postgresql') {
        jdbcUrl = `jdbc:postgresql://${database.database_name}:${database.database_port}/${database.database_schema}`;
      } else if (dbType === 'mssql' || dbType === 'sqlserver') {
        jdbcUrl = `jdbc:sqlserver://${database.database_name}:${database.database_port};databaseName=${database.database_schema}`;
      } else if (dbType === 'oracle') {
        jdbcUrl = `jdbc:oracle:thin:@${database.database_name}:${database.database_port}:${database.database_schema}`;
      } else {
        return {
          success: false,
          message: `无法为数据库类型 ${database.database_type} 构建JDBC连接串，请提供完整的JDBC连接串`
        };
      }
      console.log('🔗 构建的JDBC连接串:', jdbcUrl);
    } else {
      console.log('🔗 使用提供的JDBC连接串');
    }

    // 获取JDBC驱动路径（从parameters或环境变量）
    // 支持多个驱动路径：driverPath, driverPath2, driverPath3等
    let driverPath = database.parameters?.driverPath || process.env.JDBC_DRIVER_PATH || '';
    let allDriverPaths: string[] = [];
    
    // 检查是否有多个驱动路径配置
    if (database.parameters) {
      const driverPaths = Object.keys(database.parameters)
        .filter(key => key.startsWith('driverPath'))
        .map(key => database.parameters![key])
        .filter(path => path && typeof path === 'string');
      
      if (driverPaths.length > 0) {
        allDriverPaths = driverPaths;
        console.log('🔍 发现多个驱动路径配置:', driverPaths);
        
        // 检查哪个驱动文件存在，优先使用存在的文件
        for (const testPath of driverPaths) {
          if (fs.existsSync(testPath)) {
            if (!driverPath) {
              driverPath = testPath;
              console.log('✅ 找到可用的驱动文件:', driverPath);
            }
          } else {
            console.log('⚠️ 驱动文件不存在:', testPath);
          }
        }
        
        if (!driverPath && driverPaths.length > 0) {
          driverPath = driverPaths[0]; // 使用第一个作为默认值
          console.log('⚠️ 所有配置的驱动路径都不存在，使用第一个:', driverPath);
        }
      }
    }
    
    console.log('🚛 驱动路径配置:', driverPath || '未配置');
    
    // 如果没有配置驱动路径，尝试从常见位置查找驱动
    let finalDriverPath = driverPath;
    if (!finalDriverPath) {
      console.log('🔍 搜索常见驱动位置...');
      // 根据数据库类型查找对应驱动
      const commonPaths: string[] = [];
      
      if (detectedType === 'oracle') {
        commonPaths.push('./drivers/ojdbc8.jar', './drivers/ojdbc11.jar', './drivers/oracle.jar');
        if (process.env.ORACLE_HOME) {
          commonPaths.push(`${process.env.ORACLE_HOME}/jdbc/lib/ojdbc8.jar`);
        }
      } else if (detectedType === 'mssql' || detectedType === 'sqlserver') {
        commonPaths.push('./drivers/mssql-jdbc-*.jar', './drivers/sqljdbc*.jar');
      } else if (detectedType === 'mysql' || detectedType === 'mariadb') {
        commonPaths.push('./drivers/mysql-connector-*.jar');
      } else if (detectedType === 'postgresql') {
        commonPaths.push('./drivers/postgresql-*.jar');
      } else if (detectedType === 'clickhouse') {
        commonPaths.push('./drivers/*clickhouse*.jar', './drivers/clickhouse-*.jar');
      }
      
      // 检查通用驱动目录
      if (fs.existsSync('./drivers')) {
        const driverFiles = fs.readdirSync('./drivers').filter(f => f.endsWith('.jar'));
        console.log('📦 发现的驱动文件:', driverFiles);
        
        for (const file of driverFiles) {
          const fullPath = `./drivers/${file}`;
          if (detectedType === 'mssql' || detectedType === 'sqlserver') {
            if (file.includes('mssql') || file.includes('sqljdbc')) {
              finalDriverPath = fullPath;
              break;
            }
          } else if (detectedType === 'oracle') {
            if (file.includes('ojdbc') || file.includes('oracle')) {
              finalDriverPath = fullPath;
              break;
            }
          } else if (detectedType === 'mysql' || detectedType === 'mariadb') {
            if (file.includes('mysql') || file.includes('mariadb')) {
              finalDriverPath = fullPath;
              break;
            }
          } else if (detectedType === 'postgresql') {
            if (file.includes('postgresql')) {
              finalDriverPath = fullPath;
              break;
            }
          } else if (detectedType === 'clickhouse') {
            if (file.includes('clickhouse')) {
              finalDriverPath = fullPath;
              break;
            }
          }
        }
      }
      
      if (finalDriverPath) {
        console.log('✅ 自动找到驱动:', finalDriverPath);
      } else {
        console.log('⚠️ 未找到匹配的驱动文件');
      }
    }
    
    // 验证驱动文件是否存在
    if (finalDriverPath && !fs.existsSync(finalDriverPath)) {
      console.error('❌ 驱动文件不存在:', finalDriverPath);
      return {
        success: false,
        message: `JDBC驱动文件不存在：${finalDriverPath}。请检查路径是否正确。`
      };
    }
    
    // 规范化路径：将反斜杠转换为正斜杠（Java classpath支持正斜杠）
    const normalizePath = (p: string) => p.replace(/\\/g, '/');
    const normalizedDriverPath = finalDriverPath ? normalizePath(finalDriverPath) : null;
    const normalizedTempDir = normalizePath(tempDir);
    
    // 构建classpath：需要同时包含驱动jar和编译后的class文件目录
    // Windows使用分号，Linux/Mac使用冒号
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    const classpath = normalizedDriverPath 
      ? `"${normalizedDriverPath}${pathSeparator}${normalizedTempDir}"`
      : `"${normalizedTempDir}"`;

    console.log('📚 Classpath:', classpath);

    // 执行Java测试程序
    const javaCommand = `java -cp ${classpath} JdbcTest "${jdbcUrl}" "${database.username}" "${database.password}"`;
    console.log('🚀 执行Java测试程序...');
    console.log('📝 命令:', javaCommand.replace(database.password, '***'));
    
    try {
      const { stdout, stderr } = await execAsync(javaCommand, { timeout: 15000 });

      console.log('📤 Java程序输出:');
      if (stdout) console.log('STDOUT:', stdout);
      if (stderr) console.log('STDERR:', stderr);

      // 清理临时文件
      try {
        fs.unlinkSync(javaFile);
        const classFile = path.join(tempDir, 'JdbcTest.class');
        if (fs.existsSync(classFile)) {
          fs.unlinkSync(classFile);
        }
        console.log('🧹 临时文件已清理');
      } catch (cleanupError) {
        console.log('⚠️ 清理临时文件失败:', cleanupError);
      }

      if (stdout.includes('SUCCESS')) {
        console.log('✅ JDBC连接测试成功');
        return {
          success: true,
          message: `JDBC连接测试成功 (${database.database_name}:${database.database_port}/${database.database_schema})`
        };
      } else {
        console.log('❌ JDBC连接测试失败');
        return {
          success: false,
          message: `JDBC连接测试失败：${stderr || stdout || '未知错误'}`
        };
      }
    } catch (execError: any) {
      console.error('❌ Java程序执行失败:', execError);
      
      // 清理临时文件
      try {
        fs.unlinkSync(javaFile);
        const classFile = path.join(tempDir, 'JdbcTest.class');
        if (fs.existsSync(classFile)) {
          fs.unlinkSync(classFile);
        }
      } catch {}

      const errorMsg = execError.stderr || execError.stdout || execError.message || '未知错误';
      
      // 检查是否是驱动缺失错误
      if (errorMsg.includes('ClassNotFoundException') || errorMsg.includes('No suitable driver') || errorMsg.includes('NoClassDefFoundError')) {
        // 特殊处理ClickHouse驱动依赖问题
        if (detectedType === 'clickhouse' && (errorMsg.includes('slf4j') || errorMsg.includes('LoggerFactory'))) {
          return {
            success: false,
            message: `ClickHouse JDBC驱动缺少依赖。当前驱动文件缺少slf4j等依赖库。

💡 解决方案：
1. 下载包含所有依赖的完整版本（"fat jar" 或 "all" 版本）
2. 或者手动添加slf4j依赖到classpath

📥 推荐下载：
- ClickHouse JDBC驱动（完整版）: https://github.com/ClickHouse/clickhouse-java/releases
- 查找文件名包含 "all" 或 "shaded" 的版本，如：clickhouse-jdbc-0.9.4-all.jar

🔍 当前驱动问题: 缺少org.slf4j.LoggerFactory类`
          };
        }
        
        const driverDownloadUrls = {
          'mssql': 'https://docs.microsoft.com/en-us/sql/connect/jdbc/download-microsoft-jdbc-driver-for-sql-server',
          'sqlserver': 'https://docs.microsoft.com/en-us/sql/connect/jdbc/download-microsoft-jdbc-driver-for-sql-server',
          'oracle': 'https://www.oracle.com/database/technologies/appdev/jdbc-downloads.html',
          'mysql': 'https://dev.mysql.com/downloads/connector/j/',
          'mariadb': 'https://mariadb.com/downloads/connectors/connectors-data-access/java8-connector/',
          'postgresql': 'https://jdbc.postgresql.org/download.html',
          'clickhouse': 'https://github.com/ClickHouse/clickhouse-java/releases'
        };
        
        const downloadUrl = driverDownloadUrls[detectedType as keyof typeof driverDownloadUrls] || 'https://www.google.com/search?q=' + detectedType + '+jdbc+driver+download';
        
        return {
          success: false,
          message: `JDBC驱动未找到。请下载${detectedType.toUpperCase()}的JDBC驱动jar文件：
          
📥 下载地址: ${downloadUrl}

📁 将驱动文件放到项目的 drivers/ 目录下，或在数据库配置的"参数"中添加 driverPath 参数指向驱动文件路径。

💡 示例配置:
- 参数中添加: driverPath = ./drivers/mssql-jdbc-12.8.1.jre11.jar
- 或设置环境变量: JDBC_DRIVER_PATH=C:\\drivers\\mssql-jdbc-12.8.1.jre11.jar`
        };
      }

      return {
        success: false,
        message: `JDBC连接测试失败：${errorMsg}`
      };
    }
  } catch (error: any) {
    console.error('❌ JDBC连接测试出错:', error);
    return {
      success: false,
      message: `JDBC连接测试出错：${error.message || '未知错误'}`
    };
  }
}

/**
 * 解析JDBC连接串，提取数据库类型和连接信息
 */
function parseJdbcConnectionString(connectionString: string): {
  dbType: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
} | null {
  // JDBC连接串格式：jdbc:数据库类型://host:port/database?参数
  // 例如：jdbc:mysql://localhost:3306/testdb
  //      jdbc:oracle:thin:@localhost:1521:orcl
  //      jdbc:postgresql://localhost:5432/testdb
  //      jdbc:sqlserver://localhost:1433;databaseName=testdb
  
  if (!connectionString) return null;
  
  const jdbcMatch = connectionString.match(/^jdbc:(\w+):/i);
  if (!jdbcMatch) return null;
  
  const dbType = jdbcMatch[1].toLowerCase();
  const result: any = { dbType };
  
  // 解析不同类型的JDBC连接串
  if (dbType === 'mysql' || dbType === 'mariadb') {
    const mysqlMatch = connectionString.match(/jdbc:mysql:\/\/([^:]+):(\d+)\/([^?]+)/i);
    if (mysqlMatch) {
      result.host = mysqlMatch[1];
      result.port = parseInt(mysqlMatch[2]);
      result.database = mysqlMatch[3];
    }
  } else if (dbType === 'postgresql') {
    const pgMatch = connectionString.match(/jdbc:postgresql:\/\/([^:]+):(\d+)\/([^?]+)/i);
    if (pgMatch) {
      result.host = pgMatch[1];
      result.port = parseInt(pgMatch[2]);
      result.database = pgMatch[3];
    }
  } else if (dbType === 'oracle') {
    // Oracle格式：jdbc:oracle:thin:@host:port:service 或 jdbc:oracle:thin:@//host:port/service
    const oracleMatch = connectionString.match(/jdbc:oracle:thin:@\/\/([^:]+):(\d+)\/([^?]+)/i) ||
                      connectionString.match(/jdbc:oracle:thin:@([^:]+):(\d+):([^?]+)/i);
    if (oracleMatch) {
      result.host = oracleMatch[1];
      result.port = parseInt(oracleMatch[2]);
      result.database = oracleMatch[3];
    }
  } else if (dbType === 'sqlserver' || dbType === 'mssql') {
    // SQL Server格式：jdbc:sqlserver://host:port;databaseName=db
    const sqlMatch = connectionString.match(/jdbc:sqlserver:\/\/([^:;]+):(\d+)/i);
    if (sqlMatch) {
      result.host = sqlMatch[1];
      result.port = parseInt(sqlMatch[2]);
      const dbMatch = connectionString.match(/databaseName=([^;]+)/i);
      if (dbMatch) {
        result.database = dbMatch[1];
      }
    }
  } else if (dbType === 'sqlite') {
    // SQLite格式：jdbc:sqlite:/path/to/database.db
    const sqliteMatch = connectionString.match(/jdbc:sqlite:(.+)/i);
    if (sqliteMatch) {
      result.database = sqliteMatch[1];
    }
  }
  
  return result;
}

/**
 * 根据数据库类型提供支持建议
 */
function getSupportSuggestions(databaseType: string, detectedType: string): string {
  const lowerType = databaseType?.toLowerCase() || '';
  const lowerDetected = detectedType?.toLowerCase() || '';
  
  // 常见数据库的JDBC驱动下载建议
  const driverSuggestions: Record<string, string> = {
    'db2': '💡 IBM DB2支持：请下载DB2 JDBC驱动，在参数中添加 driverPath 指向驱动文件路径，并提供JDBC连接串：jdbc:db2://host:port/database',
    'h2': '💡 H2数据库支持：请下载H2 JDBC驱动，在参数中添加 driverPath 指向驱动文件路径，并提供JDBC连接串：jdbc:h2:~/test 或 jdbc:h2:tcp://localhost/~/test',
    'derby': '💡 Apache Derby支持：请下载Derby JDBC驱动，在参数中添加 driverPath 指向驱动文件路径，并提供JDBC连接串：jdbc:derby://host:port/database',
    'firebird': '💡 Firebird支持：请下载Firebird JDBC驱动，在参数中添加 driverPath 指向驱动文件路径，并提供JDBC连接串：jdbc:firebirdsql://host:port/database',
    'informix': '💡 IBM Informix支持：请下载Informix JDBC驱动，在参数中添加 driverPath 指向驱动文件路径，并提供JDBC连接串：jdbc:informix-sqli://host:port/database',
    'sybase': '💡 Sybase支持：请下载Sybase JDBC驱动，在参数中添加 driverPath 指向驱动文件路径，并提供JDBC连接串：jdbc:sybase:Tds:host:port/database',
    'access': '💡 Microsoft Access支持：请下载UCanAccess JDBC驱动，在参数中添加 driverPath 指向驱动文件路径，并提供JDBC连接串：jdbc:ucanaccess://path/to/database.accdb',
    'cassandra': '💡 Apache Cassandra支持：请下载Cassandra JDBC驱动，在参数中添加 driverPath 指向驱动文件路径，并提供JDBC连接串：jdbc:cassandra://host:port/keyspace',
    'clickhouse': '💡 ClickHouse支持：请下载ClickHouse JDBC驱动，在参数中添加 driverPath 指向驱动文件路径，并提供JDBC连接串：jdbc:clickhouse://host:port/database',
    'mongodb': '⚠️ MongoDB不支持JDBC连接，建议使用MongoDB专用的Node.js驱动或REST API',
    'redis': '⚠️ Redis不支持JDBC连接，建议使用Redis专用的Node.js驱动',
    'elasticsearch': '⚠️ Elasticsearch不支持标准JDBC连接，建议使用Elasticsearch专用的REST API'
  };
  
  // 检查是否有针对性建议
  for (const [dbType, suggestion] of Object.entries(driverSuggestions)) {
    if (lowerType.includes(dbType) || lowerDetected.includes(dbType)) {
      return suggestion;
    }
  }
  
  // 通用建议
  return `当前支持：MySQL、MariaDB、PostgreSQL、SQL Server、Oracle、SQLite。
  
💡 如需支持其他数据库类型，请：
1. 下载对应的JDBC驱动jar文件
2. 在参数中添加 driverPath 指向驱动文件路径
3. 提供JDBC格式的连接串：jdbc:数据库类型://host:port/database

📚 常见JDBC连接串格式：
- DB2: jdbc:db2://host:port/database
- H2: jdbc:h2:~/test 或 jdbc:h2:tcp://localhost/~/test  
- Derby: jdbc:derby://host:port/database
- Firebird: jdbc:firebirdsql://host:port/database`;
}
function detectDatabaseType(
  dbType: string,
  connectionString?: string | null,
  driver?: string | null
): string {
  const lowerType = dbType?.toLowerCase() || '';
  const lowerDriver = driver?.toLowerCase() || '';
  const lowerConnStr = connectionString?.toLowerCase() || '';
  
  // 如果连接串是JDBC格式，解析它
  if (lowerConnStr.startsWith('jdbc:')) {
    const parsed = parseJdbcConnectionString(connectionString!);
    if (parsed) {
      return parsed.dbType;
    }
  }
  
  // 从数据库类型字段推断
  if (lowerType.includes('mysql') || lowerType.includes('mariadb')) return 'mysql';
  if (lowerType.includes('postgres') || lowerType.includes('postgresql')) return 'postgresql';
  if (lowerType.includes('sql server') || lowerType.includes('mssql') || lowerType.includes('sqlserver')) return 'mssql';
  if (lowerType.includes('oracle')) return 'oracle';
  if (lowerType.includes('sqlite')) return 'sqlite';
  if (lowerType.includes('clickhouse')) return 'clickhouse';
  if (lowerType.includes('db2')) return 'db2';
  if (lowerType.includes('h2')) return 'h2';
  
  // 从驱动名称推断
  if (lowerDriver.includes('mysql') || lowerDriver.includes('mariadb')) return 'mysql';
  if (lowerDriver.includes('postgresql') || lowerDriver.includes('postgres')) return 'postgresql';
  if (lowerDriver.includes('sqlserver') || lowerDriver.includes('mssql')) return 'mssql';
  if (lowerDriver.includes('oracle')) return 'oracle';
  if (lowerDriver.includes('sqlite')) return 'sqlite';
  if (lowerDriver.includes('clickhouse')) return 'clickhouse';
  if (lowerDriver.includes('db2')) return 'db2';
  if (lowerDriver.includes('h2')) return 'h2';
  
  return lowerType;
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
  let database: DatabaseConfig | null = null;

  // 如果提供了配置数据，使用提供的配置；否则从数据库查询
  if (config && (config.database_name || config.username)) {
    if (id) {
      // 如果有ID，合并现有配置和提供的配置
      const existing = await getDatabaseById(id);
      if (!existing) {
        throw new Error('数据库配置不存在');
      }
      // 合并现有配置和提供的配置
      // 🔥 注意：如果config中明确提供了字段（包括空字符串），使用提供的值；否则使用existing的值
      database = {
        ...existing,
        database_name: config.database_name !== undefined ? config.database_name : existing.database_name,
        database_port: config.database_port !== undefined ? config.database_port : existing.database_port,
        database_schema: config.database_schema !== undefined ? config.database_schema : existing.database_schema,
        username: config.username !== undefined ? config.username : existing.username,
        password: config.password !== undefined ? config.password : existing.password,
        database_type: config.database_type !== undefined ? config.database_type : existing.database_type,
        database_version: config.database_version !== undefined ? config.database_version : existing.database_version,
        database_driver: config.database_driver !== undefined ? config.database_driver : existing.database_driver,
        connection_string: config.connection_string !== undefined ? config.connection_string : existing.connection_string,
        parameters: config.parameters !== undefined ? config.parameters : existing.parameters
      };
    } else {
      // 如果没有ID，直接使用提供的配置创建临时数据库配置对象
      database = {
        id: 0, // 临时ID
        project_id: config.project_id || 1, // 默认项目ID
        database_name: config.database_name || '',
        database_port: config.database_port || 0,
        database_schema: config.database_schema || '',
        username: config.username || '',
        password: config.password || '',
        database_type: config.database_type || '',
        database_version: config.database_version || '',
        database_driver: config.database_driver || '',
        connection_string: config.connection_string || '',
        description: config.description || null,
        status: config.status || 'active',
        is_default: config.is_default || false,
        parameters: config.parameters || null,
        created_at: new Date(),
        updated_at: new Date()
      };
    }
  } else {
    if (!id) {
      throw new Error('数据库ID不能为空');
    }
    database = await getDatabaseById(id);
    if (!database) {
      throw new Error('数据库配置不存在');
    }
  }

  // 🔥 智能检测数据库类型（从database_type、driver、connection_string推断）
  const detectedType = detectDatabaseType(
    database.database_type,
    database.connection_string,
    database.database_driver
  );
  
  let connection: any = null;

  try {
    // 根据检测到的数据库类型使用不同的驱动进行连接测试
    if (detectedType === 'mysql' || detectedType === 'mariadb') {
      // MySQL连接测试
      console.log('🔍 开始MySQL/MariaDB连接测试...');
      console.log('📋 连接配置:', {
        host: database.database_name,
        port: database.database_port,
        database: database.database_schema,
        username: database.username,
        connection_string: database.connection_string ?? '未提供',
        parameters: database.parameters
      });

      // 🎯 根据driverPath参数决定连接模式
      const driverPath = database.parameters?.driverPath;
      if (driverPath) {
        console.log('🚛 检测到driverPath参数，强制使用JDBC连接模式');
        console.log('📁 驱动路径:', driverPath);
        return await testJdbcConnection(database);
      }

      console.log('🔧 未提供driverPath，使用Node.js mysql2包连接');

      try {
        // 动态导入mysql2模块
        const mysql2Module = await import('mysql2/promise');
        console.log('✅ mysql2模块导入成功');
        
        // 处理不同的导出方式
        const mysql2 = mysql2Module.default || mysql2Module;
        console.log('📦 mysql2模块结构:', {
          hasDefault: !!mysql2Module.default,
          hasCreateConnection: typeof mysql2.createConnection === 'function',
          availableMethods: Object.keys(mysql2).filter(key => typeof mysql2[key] === 'function')
        });

        if (!mysql2.createConnection || typeof mysql2.createConnection !== 'function') {
          console.error('❌ mysql2模块缺少createConnection方法');
          return {
            success: false,
            message: 'mysql2模块导入异常：缺少createConnection方法。请尝试重新安装：npm install mysql2@latest，或在参数中添加driverPath使用JDBC连接'
          };
        }

        // 🔄 如果连接串是JDBC格式但没有driverPath，转换为mysql2格式
        let connectionConfig: any;
        if (database.connection_string && database.connection_string.toLowerCase().startsWith('jdbc:mysql://')) {
          console.log('🔄 检测到JDBC连接串，转换为mysql2格式...');
          // 转换 jdbc:mysql://host:port/database 为 mysql2配置对象
          const jdbcMatch = database.connection_string.match(/jdbc:mysql:\/\/([^:]+):(\d+)\/([^?]+)/i);
          if (jdbcMatch) {
            const [, host, port, dbName] = jdbcMatch;
            connectionConfig = {
              host,
              port: parseInt(port),
              database: dbName,
              user: database.username,
              password: database.password,
              connectTimeout: 10000,
            };
            console.log('✅ 连接串转换完成');
          } else {
            // 如果解析失败，使用原始配置
            connectionConfig = {
              host: database.database_name,
              port: database.database_port,
              database: database.database_schema,
              user: database.username,
              password: database.password,
              connectTimeout: 10000,
            };
          }
        } else if (database.connection_string && !database.connection_string.toLowerCase().startsWith('jdbc:')) {
          console.log('🔗 使用提供的MySQL连接串...');
          try {
            // 尝试直接使用连接串
            connection = await mysql2.createConnection(database.connection_string);
          } catch (err: any) {
            console.log('⚠️ 连接串连接失败，尝试配置对象:', err.message);
            connectionConfig = {
              host: database.database_name,
              port: database.database_port,
              database: database.database_schema,
              user: database.username,
              password: database.password,
              connectTimeout: 10000,
            };
          }
        } else {
          console.log('🔧 使用配置对象...');
          connectionConfig = {
            host: database.database_name,
            port: database.database_port,
            database: database.database_schema,
            user: database.username,
            password: database.password,
            connectTimeout: 10000,
          };
        }

        console.log('📡 使用Node.js mysql2包连接...');
        if (!connection && connectionConfig) {
          connection = await mysql2.createConnection(connectionConfig);
        }
        console.log('✅ mysql2连接成功');
        
        // 执行简单查询测试连接和认证
        await connection.execute('SELECT 1 as test');
        console.log('✅ 查询测试成功');
        
        await connection.end();
        console.log('✅ 连接已关闭');

        return {
          success: true,
          message: `${detectedType === 'mariadb' ? 'MariaDB' : 'MySQL'}连接成功 (Node.js mysql2) (${database.database_name}:${database.database_port}/${database.database_schema})`
        };
      } catch (importError: any) {
        console.error('❌ MySQL/MariaDB Node.js连接失败:', importError);
        
        if (importError.code === 'MODULE_NOT_FOUND') {
          return {
            success: false,
            message: 'mysql2驱动未安装。请运行: npm install mysql2@latest，或在参数中添加driverPath使用JDBC连接'
          };
        }
        
        // 如果Node.js连接失败，提示用户可以尝试JDBC方式
        const errorMessage = `Node.js mysql2连接失败：${importError.message}。💡 提示：可以在参数中添加 driverPath 来使用JDBC连接方式`;
        return {
          success: false,
          message: errorMessage
        };
      }
    } else if (detectedType === 'postgresql' || detectedType === 'postgres') {
      // PostgreSQL连接测试
      console.log('🔍 开始PostgreSQL连接测试...');
      console.log('📋 连接配置:', {
        host: database.database_name,
        port: database.database_port,
        database: database.database_schema,
        username: database.username,
        connection_string: database.connection_string ?? '未提供',
        parameters: database.parameters
      });

      // 🎯 根据driverPath参数决定连接模式
      const driverPath = database.parameters?.driverPath;
      if (driverPath) {
        console.log('🚛 检测到driverPath参数，强制使用JDBC连接模式');
        console.log('📁 驱动路径:', driverPath);
        return await testJdbcConnection(database);
      }

      console.log('🔧 未提供driverPath，使用Node.js pg包连接');

      try {
        // 动态导入pg模块
        const pgModule = await import('pg');
        console.log('✅ pg模块导入成功');
        
        // 处理不同的导出方式
        const { Client } = pgModule.default || pgModule;
        console.log('📦 pg模块结构:', {
          hasDefault: !!pgModule.default,
          hasClient: !!Client,
          hasClientConstructor: typeof Client === 'function',
          availableExports: Object.keys(pgModule.default || pgModule)
        });

        if (!Client || typeof Client !== 'function') {
          console.error('❌ pg模块缺少Client构造函数');
          return {
            success: false,
            message: 'pg模块导入异常：缺少Client构造函数。请尝试重新安装：npm install pg@latest，或在参数中添加driverPath使用JDBC连接'
          };
        }

        // 🔄 如果连接串是JDBC格式但没有driverPath，转换为pg格式
        let connectionConfig: any;
        if (database.connection_string && database.connection_string.toLowerCase().startsWith('jdbc:postgresql://')) {
          console.log('🔄 检测到JDBC连接串，转换为pg格式...');
          // 转换 jdbc:postgresql://host:port/database 为 pg配置对象
          const jdbcMatch = database.connection_string.match(/jdbc:postgresql:\/\/([^:]+):(\d+)\/([^?]+)/i);
          if (jdbcMatch) {
            const [, host, port, dbName] = jdbcMatch;
            connectionConfig = {
              host,
              port: parseInt(port),
              database: dbName,
              user: database.username,
              password: database.password,
              connectionTimeoutMillis: 10000,
            };
            console.log('✅ 连接串转换完成');
          } else {
            // 如果解析失败，使用原始配置
            connectionConfig = {
              host: database.database_name,
              port: database.database_port,
              database: database.database_schema,
              user: database.username,
              password: database.password,
              connectionTimeoutMillis: 10000,
            };
          }
        } else if (database.connection_string && !database.connection_string.toLowerCase().startsWith('jdbc:')) {
          console.log('🔗 使用提供的PostgreSQL连接串...');
          connectionConfig = { connectionString: database.connection_string };
        } else {
          console.log('🔧 使用配置对象...');
          connectionConfig = {
            host: database.database_name,
            port: database.database_port,
            database: database.database_schema,
            user: database.username,
            password: database.password,
            connectionTimeoutMillis: 10000,
          };
        }

        console.log('📡 使用Node.js pg包连接...');
        connection = new Client(connectionConfig);
        
        // connect() 会验证认证信息，如果认证失败会抛出错误
        await connection.connect();
        console.log('✅ pg连接成功');
        
        // 执行查询进一步验证连接可用性
        await connection.query('SELECT 1 as test');
        console.log('✅ 查询测试成功');
        
        await connection.end();
        console.log('✅ 连接已关闭');

        return {
          success: true,
          message: `PostgreSQL连接成功 (Node.js pg) (${database.database_name}:${database.database_port}/${database.database_schema})`
        };
      } catch (importError: any) {
        console.error('❌ PostgreSQL Node.js连接失败:', importError);
        
        if (importError.code === 'MODULE_NOT_FOUND') {
          return {
            success: false,
            message: 'pg驱动未安装。请运行: npm install pg@latest，或在参数中添加driverPath使用JDBC连接'
          };
        }
        
        // 如果Node.js连接失败，提示用户可以尝试JDBC方式
        const errorMessage = `Node.js pg连接失败：${importError.message}。💡 提示：可以在参数中添加 driverPath 来使用JDBC连接方式`;
        return {
          success: false,
          message: errorMessage
        };
      }
    } else if (detectedType === 'mssql' || detectedType === 'sqlserver') {
      // SQL Server连接测试
      console.log('🔍 开始SQL Server连接测试...');
      console.log('📋 连接配置:', {
        server: database.database_name,
        port: database.database_port,
        database: database.database_schema,
        username: database.username,
        connection_string: database.connection_string ?? '未提供',
        parameters: database.parameters
      });

      // 🎯 根据driverPath参数决定连接模式
      const driverPath = database.parameters?.driverPath;
      if (driverPath) {
        console.log('🚛 检测到driverPath参数，强制使用JDBC连接模式');
        console.log('📁 驱动路径:', driverPath);
        return await testJdbcConnection(database);
      }

      console.log('� 未提供driverPath，使用Node.js mssql包连接');

      try {
        // 动态导入mssql模块
        const mssqlModule = await import('mssql');
        console.log('✅ mssql模块导入成功');
        
        // 处理不同的导出方式
        const sql = mssqlModule.default || mssqlModule;
        console.log('📦 mssql模块结构:', {
          hasDefault: !!mssqlModule.default,
          hasConnect: typeof sql.connect === 'function',
          hasConnectionPool: typeof sql.ConnectionPool === 'function',
          // availableMethods: Object.keys(sql).filter(key => typeof sql[key] === 'function')
        });

        if (typeof sql.connect !== 'function' && typeof sql.ConnectionPool !== 'function') {
          console.error('❌ mssql模块缺少connect方法和ConnectionPool类');
          return {
            success: false,
            message: 'mssql模块导入异常：缺少必要的连接方法。请尝试重新安装：npm install mssql@latest，或在参数中添加driverPath使用JDBC连接'
          };
        }

        // 🔄 如果连接串是JDBC格式但没有driverPath，转换为mssql格式
        let connectionString = database.connection_string;
        if (connectionString && connectionString.toLowerCase().startsWith('jdbc:sqlserver://')) {
          console.log('� 检测到JDBC连接串，转换为mssql格式...');
          // 转换 jdbc:sqlserver://host:port;databaseName=db 为 Server=host,port;Database=db;...
          const jdbcMatch = connectionString.match(/jdbc:sqlserver:\/\/([^:;]+):(\d+);databaseName=([^;]+)/i);
          if (jdbcMatch) {
            const [, host, port, dbName] = jdbcMatch;
            connectionString = `Server=${host},${port};Database=${dbName};User Id=${database.username};Password=${database.password};TrustServerCertificate=true;Encrypt=false`;
            console.log('✅ 连接串转换完成');
          }
        }

        const config: any = {
          server: database.database_name,
          port: database.database_port,
          user: database.username,
          password: database.password,
          database: database.database_schema,
          options: {
            encrypt: false, // 根据实际情况设置
            trustServerCertificate: true,
            connectTimeout: 10000, // 10秒超时
          }
        };

        console.log('🔧 使用Node.js mssql包连接...');

        // 优先使用ConnectionPool方式（更稳定）
        if (typeof sql.ConnectionPool === 'function') {
          console.log('📡 使用ConnectionPool方式连接...');
          
          let pool;
          if (connectionString && !connectionString.toLowerCase().startsWith('jdbc:')) {
            console.log('🔗 使用转换后的连接串...');
            pool = new sql.ConnectionPool(connectionString);
          } else {
            console.log('🔧 使用配置对象...');
            pool = new sql.ConnectionPool(config);
          }
          
          connection = await pool.connect();
          console.log('✅ ConnectionPool连接成功');
          
          // 执行查询测试
          const request = pool.request();
          await request.query('SELECT 1 as test');
          console.log('✅ 查询测试成功');
          
          await pool.close();
          console.log('✅ 连接已关闭');
        } else if (typeof sql.connect === 'function') {
          console.log('📡 使用sql.connect方式连接...');
          
          // 如果提供了连接串，优先使用连接串
          if (connectionString && !connectionString.toLowerCase().startsWith('jdbc:')) {
            console.log('🔗 使用连接串...');
            try {
              connection = await sql.connect(connectionString);
              console.log('✅ 连接串连接成功');
            } catch (err: any) {
              console.log('⚠️ 连接串连接失败，尝试配置对象:', err.message);
              connection = await sql.connect(config);
              console.log('✅ 配置对象连接成功');
            }
          } else {
            connection = await sql.connect(config);
            console.log('✅ 配置对象连接成功');
          }

          // 执行查询进一步验证连接可用性
          await connection.request().query('SELECT 1 as test');
          console.log('✅ 查询测试成功');
          await connection.close();
          console.log('✅ 连接已关闭');
        }

        return {
          success: true,
          message: `SQL Server连接成功 (Node.js mssql) (${database.database_name}:${database.database_port}/${database.database_schema})`
        };
      } catch (importError: any) {
        console.error('❌ SQL Server Node.js连接失败:', importError);
        
        if (importError.code === 'MODULE_NOT_FOUND') {
          return {
            success: false,
            message: 'mssql驱动未安装。请运行: npm install mssql@latest，或在参数中添加driverPath使用JDBC连接'
          };
        }
        
        // 如果Node.js连接失败，提示用户可以尝试JDBC方式
        const errorMessage = `Node.js mssql连接失败：${importError.message}。💡 提示：可以在参数中添加 driverPath 来使用JDBC连接方式`;
        return {
          success: false,
          message: errorMessage
        };
      }
    } else if (detectedType === 'oracle') {
      // Oracle连接测试
      console.log('🔍 开始Oracle连接测试...');
      console.log('� 连接配置:', {
        host: database.database_name,
        port: database.database_port,
        service: database.database_schema,
        username: database.username,
        connection_string: database.connection_string ?? '未提供',
        parameters: database.parameters
      });

      // 🎯 根据driverPath参数决定连接模式
      const driverPath = database.parameters?.driverPath;
      if (driverPath || (database.connection_string && database.connection_string.toLowerCase().startsWith('jdbc:'))) {
        console.log('🚛 检测到driverPath参数或JDBC连接串，使用JDBC连接模式');
        if (driverPath) console.log('📁 驱动路径:', driverPath);
        return await testJdbcConnection(database);
      }

      console.log('🔧 未提供driverPath，尝试使用Node.js oracledb包连接');
      
      // 否则尝试使用Node.js的oracledb驱动
      try {
        // @ts-ignore - oracledb是可选的，可能未安装
        const oracledbModule = await import('oracledb');
        // oracledb可能是default导出或命名导出
        const oracledb = oracledbModule.default || oracledbModule;
        
        if (!oracledb || typeof oracledb.getConnection !== 'function') {
          console.log('⚠️ oracledb模块未正确加载，回退到JDBC方案');
          return await testJdbcConnection(database);
        }
        
        const config: any = {
          user: database.username,
          password: database.password,
          connectString: database.connection_string || 
            `${database.database_name}:${database.database_port}/${database.database_schema}`,
        };

        console.log('📡 使用Node.js oracledb连接...');
        connection = await oracledb.getConnection(config);
        console.log('✅ oracledb连接成功');
        
        await connection.execute('SELECT 1 FROM DUAL');
        console.log('✅ 查询测试成功');
        
        await connection.close();
        console.log('✅ 连接已关闭');

        return {
          success: true,
          message: `Oracle连接成功 (Node.js oracledb) (${database.database_name}:${database.database_port}/${database.database_schema})`
        };
      } catch (importError: any) {
        console.error('❌ Oracle Node.js连接失败:', importError);
        
        // 如果oracledb未安装或出错，回退到JDBC方案
        if (importError.code === 'MODULE_NOT_FOUND' || importError.message?.includes('is not a function')) {
          console.log('🔄 oracledb未安装，回退到JDBC连接方式...');
          return await testJdbcConnection(database);
        }
        
        // 其他错误也尝试JDBC方案
        try {
          console.log('🔄 oracledb连接失败，尝试JDBC连接方式...');
          return await testJdbcConnection(database);
        } catch (jdbcError: any) {
          return {
            success: false,
            message: `Oracle连接失败：Node.js方式: ${importError.message}，JDBC方式: ${jdbcError.message}。💡 提示：可以在参数中添加 driverPath 来明确使用JDBC连接`
          };
        }
      }
    } else if (detectedType === 'sqlite') {
      // SQLite连接测试
      console.log('🔍 开始SQLite连接测试...');
      console.log('📋 连接配置:', {
        dbPath: database.connection_string || database.database_name || database.database_schema,
        parameters: database.parameters
      });

      // 🎯 根据driverPath参数决定连接模式
      const driverPath = database.parameters?.driverPath;
      if (driverPath) {
        console.log('🚛 检测到driverPath参数，强制使用JDBC连接模式');
        console.log('📁 驱动路径:', driverPath);
        return await testJdbcConnection(database);
      }

      console.log('🔧 未提供driverPath，使用Node.js SQLite包连接');

      try {
        // 优先尝试better-sqlite3
        console.log('📡 尝试使用better-sqlite3包...');
        const sqlite3Module = await import('better-sqlite3');
        console.log('✅ better-sqlite3模块导入成功');
        
        const Database = sqlite3Module.default || sqlite3Module;
        console.log('📦 better-sqlite3模块结构:', {
          hasDefault: !!sqlite3Module.default,
          hasDatabase: !!Database,
          isDatabaseConstructor: typeof Database === 'function'
        });

        if (!Database || typeof Database !== 'function') {
          console.error('❌ better-sqlite3模块缺少Database构造函数');
          throw new Error('better-sqlite3模块导入异常');
        }
        
        // SQLite使用文件路径作为database_name
        const dbPath = database.connection_string || database.database_name || database.database_schema;
        console.log('📁 数据库文件路径:', dbPath);
        
        connection = Database(dbPath, { timeout: 10000 });
        console.log('✅ better-sqlite3连接成功');
        
        connection.prepare('SELECT 1').get();
        console.log('✅ 查询测试成功');
        
        connection.close();
        console.log('✅ 连接已关闭');

        return {
          success: true,
          message: `SQLite连接成功 (Node.js better-sqlite3) (${dbPath})`
        };
      } catch (importError: any) {
        console.error('❌ better-sqlite3连接失败:', importError);
        
        if (importError.code === 'MODULE_NOT_FOUND') {
          console.log('⚠️ better-sqlite3未安装，尝试sqlite3包...');
          
          // 回退到sqlite3
          try {
            const sqlite3Module = await import('sqlite3');
            console.log('✅ sqlite3模块导入成功');
            
            const sqlite3 = sqlite3Module.default || sqlite3Module;
            console.log('📦 sqlite3模块结构:', {
              hasDefault: !!sqlite3Module.default,
              hasDatabase: !!sqlite3.Database,
              isDatabaseConstructor: typeof sqlite3.Database === 'function'
            });

            if (!sqlite3.Database || typeof sqlite3.Database !== 'function') {
              console.error('❌ sqlite3模块缺少Database构造函数');
              return {
                success: false,
                message: 'SQLite驱动未安装。请运行: npm install better-sqlite3 或 npm install sqlite3，或在参数中添加driverPath使用JDBC连接'
              };
            }

            const dbPath = database.connection_string || database.database_name || database.database_schema;
            console.log('📁 数据库文件路径:', dbPath);
            
            return new Promise((resolve) => {
              const db = new sqlite3.Database(dbPath, (err: Error | null) => {
                if (err) {
                  console.error('❌ sqlite3连接失败:', err.message);
                  db.close();
                  resolve({
                    success: false,
                    message: `SQLite连接失败：${err.message}`
                  });
                } else {
                  console.log('✅ sqlite3连接成功');
                  
                  // 执行测试查询
                  db.get('SELECT 1 as test', (queryErr: Error | null) => {
                    if (queryErr) {
                      console.error('❌ 查询测试失败:', queryErr.message);
                      db.close();
                      resolve({
                        success: false,
                        message: `SQLite查询失败：${queryErr.message}`
                      });
                    } else {
                      console.log('✅ 查询测试成功');
                      db.close();
                      console.log('✅ 连接已关闭');
                      resolve({
                        success: true,
                        message: `SQLite连接成功 (Node.js sqlite3) (${dbPath})`
                      });
                    }
                  });
                }
              });
            });
          } catch (sqlite3Error: any) {
            console.error('❌ sqlite3也不可用:', sqlite3Error);
            return {
              success: false,
              message: 'SQLite驱动未安装。请运行: npm install better-sqlite3 或 npm install sqlite3，或在参数中添加driverPath使用JDBC连接'
            };
          }
        }
        
        // 如果Node.js连接失败，提示用户可以尝试JDBC方式
        const errorMessage = `Node.js SQLite连接失败：${importError.message}。💡 提示：可以在参数中添加 driverPath 来使用JDBC连接方式`;
        return {
          success: false,
          message: errorMessage
        };
      }
    } else {
      // 不支持的数据库类型或其他数据库
      console.log('🔍 开始通用数据库连接测试...');
      console.log('📋 数据库信息:', {
        type: database.database_type,
        driver: database.database_driver,
        host: database.database_name,
        port: database.database_port,
        schema: database.database_schema,
        username: database.username,
        connection_string: database.connection_string ??  '未提供',
        parameters: database.parameters
      });

      // 🎯 根据driverPath参数或JDBC连接串决定连接模式
      const driverPath = database.parameters?.driverPath;
      const hasJdbcConnectionString = database.connection_string && database.connection_string.toLowerCase().startsWith('jdbc:');
      
      if (driverPath || hasJdbcConnectionString) {
        console.log('🚛 检测到driverPath参数或JDBC连接串，使用JDBC连接模式');
        if (driverPath) console.log('📁 驱动路径:', driverPath);
        if (hasJdbcConnectionString) console.log('🔗 JDBC连接串已提供');
        
        // 使用JDBC通用连接测试（通过Java）
        return await testJdbcConnection(database);
      } else {
        console.log('❌ 不支持的数据库类型，且未提供JDBC连接方式');
        
        // 根据数据库类型提供具体的建议
        const suggestions = getSupportSuggestions(database.database_type, detectedType);
        
        return {
          success: false,
          message: `不支持的数据库类型：${database.database_type}。${suggestions}`
        };
      }
    }
  } catch (error: any) {
    // 确保连接被关闭
    try {
      if (connection) {
        if (typeof connection.end === 'function') {
          await connection.end();
        } else if (typeof connection.close === 'function') {
          await connection.close();
        }
      }
    } catch (closeError) {
      // 忽略关闭错误
    }

    // 格式化错误信息
    let errorMessage = '连接失败';
    const errCode = error.code || '';
    const errMsg = (error.message || '').toLowerCase();
    
    if (errCode === 'ECONNREFUSED') {
      errorMessage = '连接被拒绝：请检查主机地址和端口是否正确';
    } else if (errCode === 'ETIMEDOUT' || errCode === 'ETIMEOUT') {
      errorMessage = '连接超时：无法连接到数据库服务器，请检查网络或防火墙设置';
    } else if (errCode === 'ENOTFOUND') {
      errorMessage = '主机名解析失败：请检查主机地址是否正确';
    } else if (
      errCode === 'ER_ACCESS_DENIED_ERROR' || 
      errCode === '28P01' || 
      errCode === '28000' ||
      errCode === 'EAUTH' ||
      errMsg.includes('authentication') ||
      errMsg.includes('access denied') ||
      errMsg.includes('password') ||
      errMsg.includes('login failed') ||
      errMsg.includes('invalid credentials')
    ) {
      errorMessage = '认证失败：请检查用户名和密码是否正确';
    } else if (errCode === 'ER_BAD_DB_ERROR' || errCode === '3D000' || errMsg.includes('database') && errMsg.includes('not exist')) {
      errorMessage = '数据库不存在：请检查数据库名称是否正确';
    } else if (error.message) {
      errorMessage = `连接失败：${error.message}`;
    }
    
    return {
      success: false,
      message: errorMessage
    };
  }
}

/**
 * 设置默认数据库
 */
export async function setDefaultDatabase(projectId: number, databaseId: number): Promise<DatabaseConfig> {
  const database = await prisma.database_configs.findFirst({
    where: {
      id: databaseId,
      project_id: projectId
    }
  });

  if (!database) {
    throw new Error('数据库配置不存在');
  }

  // 使用事务确保数据一致性
  const result = await prisma.$transaction(async (tx) => {
    // 取消当前默认数据库
    await tx.database_configs.updateMany({
      where: {
        project_id: projectId,
        is_default: true
      },
      data: { is_default: false }
    });

    // 设置新的默认数据库
    const updated = await tx.database_configs.update({
      where: { id: databaseId },
      data: { is_default: true }
    });

    return updated;
  });

  return {
    id: result.id,
    project_id: result.project_id,
    database_type: result.database_type,
    database_version: result.database_version,
    database_driver: result.database_driver,
    database_name: result.database_name,
    database_port: result.database_port,
    database_schema: result.database_schema,
    username: result.username,
    password: result.password,
    connection_string: result.connection_string,
    description: result.description,
    status: result.status as 'active' | 'inactive',
    is_default: result.is_default,
    parameters: result.parameters as Record<string, string> | null,
    created_at: result.created_at,
    updated_at: result.updated_at
  };
}
