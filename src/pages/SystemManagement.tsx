import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  FolderKanban, Plus, Edit2, Trash2, X, Save, Search, ArrowLeft, PlusCircle,
  ChevronDown, ChevronRight, GitBranch, Star, Tag, MoreHorizontal,
  User, Server, Database, Minus, Maximize2,
  Play, RefreshCw
} from 'lucide-react';
import { Dropdown, Tooltip, Modal, Input, Switch, DatePicker, Select } from 'antd';
import type { MenuProps } from 'antd';
import dayjs from 'dayjs';
import * as systemService from '../services/systemService';
import type { 
  System, CreateSystemInput, UpdateSystemInput, ProjectVersion, CreateVersionInput, UpdateVersionInput,
  AccountConfig, CreateAccountInput, UpdateAccountInput, AccountType,
  ServerConfig, CreateServerInput, UpdateServerInput,
  DatabaseConfig, CreateDatabaseInput, UpdateDatabaseInput
} from '../types/test';
import { showToast } from '../utils/toast';
import { useTabs } from '../contexts/TabContext';

// 项目表单数据
interface ProjectFormData {
  name: string;
  short_name: string;  // 🆕 项目简称
  description: string;
  status: 'active' | 'inactive';
  sort_order: number;
  // 初始版本（新建项目时）
  initial_version_name: string;
  initial_version_code: string;
  initial_version_desc: string;
}

// 版本表单数据
interface VersionFormData {
  version_name: string;
  version_code: string;
  description: string;
  is_main: boolean;
  status: 'active' | 'inactive';
  release_date: string | null;
}

const INITIAL_PROJECT_FORM: ProjectFormData = {
  name: '',
  short_name: '',  // 🆕 项目简称
  description: '',
  status: 'active',
  sort_order: 0,
  initial_version_name: '',
  initial_version_code: '',
  initial_version_desc: ''
};

const INITIAL_VERSION_FORM: VersionFormData = {
  version_name: '',
  version_code: '',
  description: '',
  is_main: false,
  status: 'active',
  release_date: null
};

// 账号表单数据
interface AccountFormData {
  project_id: number | null;
  account_type: AccountType;
  account_name: string;
  account_password: string;
  account_description: string;
  status: 'active' | 'inactive';
}

const INITIAL_ACCOUNT_FORM: AccountFormData = {
  project_id: null,
  account_type: 'admin',
  account_name: '',
  account_password: '',
  account_description: '',
  status: 'active'
};

// 服务器表单数据
interface ServerFormData {
  project_id: number | null;
  server_type: string;
  server_version: string;
  host_name: string;
  host_port: number;
  username: string;
  password: string;
  description: string;
  status: 'active' | 'inactive';
  parameters: Array<{ key: string; value: string }>;
}

const INITIAL_SERVER_FORM: ServerFormData = {
  project_id: null,
  server_type: '',
  server_version: '',
  host_name: '',
  host_port: 22,
  username: '',
  password: '',
  description: '',
  status: 'active',
  parameters: []
};

// 数据库表单数据
interface DatabaseFormData {
  project_id: number | null;
  database_type: string;
  database_version: string;
  database_driver: string;
  database_name: string;
  database_port: number;
  database_schema: string;
  username: string;
  password: string;
  connection_string: string;
  description: string;
  status: 'active' | 'inactive';
  parameters: Array<{ key: string; value: string }>;
}

const INITIAL_DATABASE_FORM: DatabaseFormData = {
  project_id: null,
  database_type: '',
  database_version: '',
  database_driver: '',
  database_name: '',
  database_port: 3306,
  database_schema: '',
  username: '',
  password: '',
  connection_string: '',
  description: '',
  status: 'active',
  parameters: []
};

export default function SystemManagement() {
  const location = useLocation();
  const navigate = useNavigate();

  // 🔥 辅助函数：将参数对象转换为有序数组，确保按添加顺序排列
  // 使用 __order 键来保存参数键的顺序，以解决 JSON 序列化/反序列化可能丢失顺序的问题
  const parametersToArray = (params: Record<string, string> | null | undefined): Array<[string, string]> => {
    if (!params) return [];
    
    // 检查是否有保存的顺序信息
    if (params.__order && Array.isArray(params.__order)) {
      // 按照保存的顺序恢复参数
      const order = params.__order as string[];
      const result: Array<[string, string]> = [];
      order.forEach(key => {
        if (key !== '__order' && params[key] !== undefined) {
          result.push([key, params[key]]);
        }
      });
      return result;
    }
    
    // 如果没有顺序信息，使用 Object.entries()（ES2015+ 保持插入顺序）
    const entries = Object.entries(params).filter(([key]) => key !== '__order');
    // 调试：检查参数顺序
    if (process.env.NODE_ENV === 'development') {
      console.log('参数顺序（无__order）:', entries.map(([key]) => key));
    }
    return entries;
  };
  const { addTab } = useTabs();
  
  // 检查是否有返回路径
  const returnPath = (location.state as any)?.returnPath;
  const returnTitle = (location.state as any)?.returnTitle || '返回';
  
  const [projects, setProjects] = useState<System[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // 其它tab搜索
  const [versionSearchTerm, setVersionSearchTerm] = useState('');
  const [accountSearchTerm, setAccountSearchTerm] = useState('');
  const [serverSearchTerm, setServerSearchTerm] = useState('');
  const [databaseSearchTerm, setDatabaseSearchTerm] = useState('');

  // 状态筛选
  const [versionStatusFilter, setVersionStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [accountStatusFilter, setAccountStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [serverStatusFilter, setServerStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [databaseStatusFilter, setDatabaseStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // 展开状态
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());

  // 项目弹窗状态
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState<'create' | 'edit'>('create');
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [projectFormData, setProjectFormData] = useState<ProjectFormData>(INITIAL_PROJECT_FORM);

  // 版本弹窗状态
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionModalMode, setVersionModalMode] = useState<'create' | 'edit'>('create');
  const [editingVersionId, setEditingVersionId] = useState<number | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [versionFormData, setVersionFormData] = useState<VersionFormData>(INITIAL_VERSION_FORM);

  // 提交状态
  const [submitting, setSubmitting] = useState(false);

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  // 🔥 防止重复加载
  const isFirstRenderRef = useRef(true);
  const loadingRef = useRef(false);

  // Tab切换状态
  const [activeTab] = useState<'project' | 'version' | 'account' | 'server' | 'database'>('project');
  
  // 版本配置相关状态
  const [selectedProjectForVersion, setSelectedProjectForVersion] = useState<number | null>(null);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [expandedVersions, setExpandedVersions] = useState<Set<number>>(new Set());

  // 账号配置展开状态
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());

  // 服务器配置展开状态
  const [expandedServers, setExpandedServers] = useState<Set<number>>(new Set());

  // 数据库配置展开状态
  const [expandedDatabases, setExpandedDatabases] = useState<Set<number>>(new Set());
  
  // 账号配置相关状态 - 添加项目选择
  const [selectedProjectForAccount, setSelectedProjectForAccount] = useState<number | null>(null);
  
  // 服务器配置相关状态 - 添加项目选择
  const [selectedProjectForServer, setSelectedProjectForServer] = useState<number | null>(null);
  
  // 数据库配置相关状态 - 添加项目选择
  const [selectedProjectForDatabase, setSelectedProjectForDatabase] = useState<number | null>(null);

  // 账号配置状态
  const [accounts, setAccounts] = useState<AccountConfig[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountModalMode, setAccountModalMode] = useState<'create' | 'edit'>('create');
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [accountFormData, setAccountFormData] = useState<AccountFormData>(INITIAL_ACCOUNT_FORM);

  // 服务器配置状态
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverModalMode, setServerModalMode] = useState<'create' | 'edit'>('create');
  const [editingServerId, setEditingServerId] = useState<number | null>(null);
  const [serverFormData, setServerFormData] = useState<ServerFormData>(INITIAL_SERVER_FORM);
  const [serverModalMaximized, setServerModalMaximized] = useState(false);

  // 支持的服务器类型配置
  const SERVER_TYPE_OPTIONS = [
    {
      label: 'Linux',
      value: 'Linux',
      defaultVersion: 'CentOS 7.9',
      defaultPort: 22,
      defaultUsername: 'root'
    },
    {
      label: 'Ubuntu',
      value: 'Ubuntu',
      defaultVersion: 'Ubuntu 20.04 LTS',
      defaultPort: 22,
      defaultUsername: 'root'
    },
    {
      label: 'Windows',
      value: 'Windows',
      defaultVersion: 'Windows Server 2019',
      defaultPort: 3389,
      defaultUsername: 'Administrator'
    },
    // {
    //   label: 'CentOS',
    //   value: 'CentOS',
    //   defaultVersion: 'CentOS 8',
    //   defaultPort: 22,
    //   defaultUsername: 'root'
    // },
    // {
    //   label: 'Red Hat',
    //   value: 'Red Hat',
    //   defaultVersion: 'RHEL 8',
    //   defaultPort: 22,
    //   defaultUsername: 'root'
    // },
    // {
    //   label: 'Debian',
    //   value: 'Debian',
    //   defaultVersion: 'Debian 11',
    //   defaultPort: 22,
    //   defaultUsername: 'root'
    // },
    // {
    //   label: 'SUSE',
    //   value: 'SUSE',
    //   defaultVersion: 'SLES 15',
    //   defaultPort: 22,
    //   defaultUsername: 'root'
    // },
    // {
    //   label: 'macOS',
    //   value: 'macOS',
    //   defaultVersion: 'macOS Monterey',
    //   defaultPort: 22,
    //   defaultUsername: 'admin'
    // },
    // {
    //   label: 'FreeBSD',
    //   value: 'FreeBSD',
    //   defaultVersion: 'FreeBSD 13',
    //   defaultPort: 22,
    //   defaultUsername: 'root'
    // },
    // {
    //   label: 'AIX',
    //   value: 'AIX',
    //   defaultVersion: 'AIX 7.2',
    //   defaultPort: 22,
    //   defaultUsername: 'root'
    // }
  ] as const;

  // 支持的数据库类型配置
  const DATABASE_TYPE_OPTIONS = [
    {
      label: 'MySQL',
      value: 'MySQL',
      defaultPort: 3306,
      defaultDriver: 'com.mysql.cj.jdbc.Driver',
      defaultVersion: 'MySQL 8',
      defaultHost: 'localhost',
      defaultSchema: 'test',
      connectionTemplate: 'jdbc:mysql://{host}:{port}/{schema}?useSSL=false&serverTimezone=UTC&characterEncoding=utf8'
    },
    {
      label: 'Oracle',
      value: 'Oracle',
      defaultPort: 1521,
      defaultDriver: 'oracle.jdbc.driver.OracleDriver',
      defaultVersion: 'Oracle 12c',
      defaultHost: 'localhost',
      defaultSchema: 'orcl',
      connectionTemplate: 'jdbc:oracle:thin:@{host}:{port}:{schema}'
    },
    // {
    //   label: 'SQLite',
    //   value: 'SQLite',
    //   defaultPort: 0,
    //   defaultDriver: 'org.sqlite.JDBC',
    //   defaultVersion: 'SQLite',
    //   defaultHost: '',
    //   defaultSchema: 'database.db',
    //   connectionTemplate: 'jdbc:sqlite:{schema}'
    // },
    {
      label: 'SQL Server',
      value: 'SQL Server',
      defaultPort: 1433,
      defaultDriver: 'com.microsoft.sqlserver.jdbc.SQLServerDriver',
      defaultVersion: 'SQL Server 2019',
      defaultHost: 'localhost',
      defaultSchema: 'master',
      connectionTemplate: 'jdbc:sqlserver://{host}:{port};databaseName={schema};trustServerCertificate=true'
    },
    {
      label: 'PostgreSQL',
      value: 'PostgreSQL',
      defaultPort: 5432,
      defaultDriver: 'org.postgresql.Driver',
      defaultVersion: 'PostgreSQL 13',
      defaultHost: 'localhost',
      defaultSchema: 'postgres',
      connectionTemplate: 'jdbc:postgresql://{host}:{port}/{schema}'
    },
    {
      label: 'MariaDB',
      value: 'MariaDB',
      defaultPort: 3306,
      defaultDriver: 'org.mariadb.jdbc.Driver',
      defaultVersion: 'MariaDB 10.6',
      defaultHost: 'localhost',
      defaultSchema: 'test',
      connectionTemplate: 'jdbc:mariadb://{host}:{port}/{schema}?useSSL=false&serverTimezone=UTC'
    },
    // {
    //   label: 'H2',
    //   value: 'H2',
    //   defaultPort: 9092,
    //   defaultDriver: 'org.h2.Driver',
    //   defaultVersion: 'H2 2.1',
    //   defaultHost: 'localhost',
    //   defaultSchema: 'test',
    //   connectionTemplate: 'jdbc:h2:tcp://{host}:{port}/{schema}'
    // },
    // {
    //   label: 'Derby',
    //   value: 'Derby',
    //   defaultPort: 1527,
    //   defaultDriver: 'org.apache.derby.jdbc.ClientDriver',
    //   defaultVersion: 'Derby 10.15',
    //   defaultHost: 'localhost',
    //   defaultSchema: 'test',
    //   connectionTemplate: 'jdbc:derby://{host}:{port}/{schema};create=true'
    // },
    // {
    //   label: 'HSQLDB',
    //   value: 'HSQLDB',
    //   defaultPort: 9001,
    //   defaultDriver: 'org.hsqldb.jdbc.JDBCDriver',
    //   defaultVersion: 'HSQLDB 2.6',
    //   defaultHost: 'localhost',
    //   defaultSchema: 'test',
    //   connectionTemplate: 'jdbc:hsqldb:hsql://{host}:{port}/{schema}'
    // },
    // {
    //   label: 'Firebird',
    //   value: 'Firebird',
    //   defaultPort: 3050,
    //   defaultDriver: 'org.firebirdsql.jdbc.FBDriver',
    //   defaultVersion: 'Firebird 4.0',
    //   defaultHost: 'localhost',
    //   defaultSchema: 'test.fdb',
    //   connectionTemplate: 'jdbc:firebirdsql://{host}:{port}/{schema}?encoding=UTF8'
    // },
    // {
    //   label: 'Informix',
    //   value: 'Informix',
    //   defaultPort: 9088,
    //   defaultDriver: 'com.informix.jdbc.IfxDriver',
    //   defaultVersion: 'Informix 14.10',
    //   defaultHost: 'localhost',
    //   defaultSchema: 'test',
    //   connectionTemplate: 'jdbc:informix-sqli://{host}:{port}/{schema}:INFORMIXSERVER=ol_informix1410'
    // },
    // {
    //   label: 'Sybase ASE',
    //   value: 'Sybase ASE',
    //   defaultPort: 5000,
    //   defaultDriver: 'com.sybase.jdbc4.jdbc.SybDriver',
    //   defaultVersion: 'Sybase ASE 16.0',
    //   defaultHost: 'localhost',
    //   defaultSchema: 'master',
    //   connectionTemplate: 'jdbc:sybase:Tds:{host}:{port}/{schema}'
    // },
    // {
    //   label: 'DB2',
    //   value: 'DB2',
    //   defaultPort: 50000,
    //   defaultDriver: 'com.ibm.db2.jcc.DB2Driver',
    //   defaultVersion: 'DB2 11.5',
    //   defaultHost: 'localhost',
    //   defaultSchema: 'sample',
    //   connectionTemplate: 'jdbc:db2://{host}:{port}/{schema}'
    // },
    // {
    //   label: 'ClickHouse',
    //   value: 'ClickHouse',
    //   defaultPort: 8123,
    //   defaultDriver: 'com.clickhouse.jdbc.ClickHouseDriver',
    //   defaultVersion: 'ClickHouse 22.8',
    //   defaultHost: 'localhost',
    //   defaultSchema: 'default',
    //   connectionTemplate: 'jdbc:clickhouse://{host}:{port}/{schema}'
    // },
    // {
    //   label: 'Presto',
    //   value: 'Presto',
    //   defaultPort: 8080,
    //   defaultDriver: 'com.facebook.presto.jdbc.PrestoDriver',
    //   defaultVersion: 'Presto 0.280',
    //   defaultHost: 'localhost',
    //   defaultSchema: 'default',
    //   connectionTemplate: 'jdbc:presto://{host}:{port}/{schema}'
    // },
    // {
    //   label: 'Trino',
    //   value: 'Trino',
    //   defaultPort: 8080,
    //   defaultDriver: 'io.trino.jdbc.TrinoDriver',
    //   defaultVersion: 'Trino 400',
    //   defaultHost: 'localhost',
    //   defaultSchema: 'default',
    //   connectionTemplate: 'jdbc:trino://{host}:{port}/{schema}'
    // }
  ] as const;

  // 数据库配置状态
  const [databases, setDatabases] = useState<DatabaseConfig[]>([]);
  const [databasesLoading, setDatabasesLoading] = useState(false);
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);
  const [databaseModalMode, setDatabaseModalMode] = useState<'create' | 'edit'>('create');
  const [editingDatabaseId, setEditingDatabaseId] = useState<number | null>(null);
  const [databaseFormData, setDatabaseFormData] = useState<DatabaseFormData>(INITIAL_DATABASE_FORM);
  const [databaseModalMaximized, setDatabaseModalMaximized] = useState(false);

  // 测试连接加载状态 - 使用Map来跟踪每个服务器/数据库的测试状态
  const [serverTesting, setServerTesting] = useState<Map<number, boolean>>(new Map());
  const [databaseTesting, setDatabaseTesting] = useState<Map<number, boolean>>(new Map());

  // 🔥 项目展开时的关联数据状态
  const [projectAccounts, setProjectAccounts] = useState<Map<number, AccountConfig[]>>(new Map());
  const [projectServers, setProjectServers] = useState<Map<number, ServerConfig[]>>(new Map());
  const [projectDatabases, setProjectDatabases] = useState<Map<number, DatabaseConfig[]>>(new Map());
  const [projectDataLoading, setProjectDataLoading] = useState<Map<number, boolean>>(new Map());
  const [projectActiveTab, setProjectActiveTab] = useState<Map<number, string>>(new Map());

  // 加载项目列表
  const loadProjects = async () => {
    // 🔥 防止重复加载
    if (loadingRef.current) {
      console.log('⚠️ [SystemManagement] 项目列表正在加载中，跳过');
      return;
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      
      console.log('📤 [SystemManagement] 开始加载项目列表');
      
      const params: any = {
        page: currentPage,
        pageSize,
        search: searchTerm
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const response = await systemService.getSystems(params);
      
      // 为每个项目加载版本
      const projectsWithVersions = await Promise.all(
        response.data.map(async (project) => {
          try {
            const versions = await systemService.getProjectVersions(project.id);
            return { ...project, versions };
          } catch {
            return { ...project, versions: [] };
          }
        })
      );
      
      setProjects(projectsWithVersions);
      setTotalPages(response.totalPages);
      console.log('✅ [SystemManagement] 项目列表加载完成');
    } catch (error: any) {
      showToast.error(error?.message || '加载项目列表失败');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  // 🔥 主加载 effect - 只在分页和状态筛选变化时触发
  useEffect(() => {
    loadProjects();
  }, [currentPage, statusFilter]);

  // 切换到项目配置tab时加载项目数据
  useEffect(() => {
    if (activeTab === 'project') {
      loadProjects();
    }
  }, [activeTab]);

  // 切换到版本/账号/服务器/数据库配置tab时，确保项目列表已加载
  useEffect(() => {
    if (['version', 'account', 'server', 'database'].includes(activeTab) && projects.length === 0) {
      loadProjects();
    }
  }, [activeTab]);

  // 🔥 搜索（防抖）- 跳过首次渲染
  useEffect(() => {
    // 跳过首次渲染，避免与上面的 useEffect 重复
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      if (currentPage === 1) {
        loadProjects();
      } else {
        setCurrentPage(1);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const includesIgnoreCase = (value: unknown, term: string) => {
    if (!term) return true;
    if (value === null || value === undefined) return false;
    return String(value).toLowerCase().includes(term);
  };

  // 🔥 单独加载项目账号数据
  const loadProjectAccounts = async (projectId: number) => {
    try {
      setProjectDataLoading(prev => new Map(prev).set(projectId, true));
      
      // 🔥 使用按项目ID获取的接口
      const projectAccountsData = await systemService.getProjectAccounts(projectId);
      
      // 排序：默认账号排在前面
      projectAccountsData.sort((a, b) => {
        if (a.is_default && !b.is_default) return -1;
        if (!a.is_default && b.is_default) return 1;
        return 0;
      });

      setProjectAccounts(prev => {
        const newMap = new Map(prev);
        newMap.set(projectId, projectAccountsData);
        return newMap;
      });
    } catch (error: any) {
      console.error('加载项目账号数据失败:', error);
      showToast.error('加载账号数据失败');
    } finally {
      setProjectDataLoading(prev => {
        const newMap = new Map(prev);
        newMap.set(projectId, false);
        return newMap;
      });
    }
  };

  // 🔥 单独加载项目版本数据
  const loadProjectVersions = async (projectId: number) => {
    try {
      setLoading(true);
      
      const versions = await systemService.getProjectVersions(projectId);
      
      // 更新项目列表中对应项目的版本数据
      setProjects(prev => prev.map(p => 
        p.id === projectId ? { ...p, versions } : p
      ));
    } catch (error: any) {
      console.error('加载项目版本数据失败:', error);
      showToast.error('加载版本数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 🔥 单独加载项目服务器数据
  const loadProjectServers = async (projectId: number) => {
    try {
      setProjectDataLoading(prev => new Map(prev).set(projectId, true));
      
      // 🔥 使用按项目ID获取的接口
      const projectServersData = await systemService.getProjectServers(projectId);
      
      // 排序：默认服务器排在前面
      projectServersData.sort((a, b) => {
        if (a.is_default && !b.is_default) return -1;
        if (!a.is_default && b.is_default) return 1;
        return 0;
      });

      setProjectServers(prev => {
        const newMap = new Map(prev);
        newMap.set(projectId, projectServersData);
        return newMap;
      });
    } catch (error: any) {
      console.error('加载项目服务器数据失败:', error);
      showToast.error('加载服务器数据失败');
    } finally {
      setProjectDataLoading(prev => {
        const newMap = new Map(prev);
        newMap.set(projectId, false);
        return newMap;
      });
    }
  };

  // 🔥 单独加载项目数据库数据
  const loadProjectDatabases = async (projectId: number) => {
    try {
      setProjectDataLoading(prev => new Map(prev).set(projectId, true));
      
      // 🔥 使用按项目ID获取的接口
      const projectDatabasesData = await systemService.getProjectDatabases(projectId);
      
      // 排序：默认数据库排在前面
      projectDatabasesData.sort((a, b) => {
        if (a.is_default && !b.is_default) return -1;
        if (!a.is_default && b.is_default) return 1;
        return 0;
      });

      setProjectDatabases(prev => {
        const newMap = new Map(prev);
        newMap.set(projectId, projectDatabasesData);
        return newMap;
      });
    } catch (error: any) {
      console.error('加载项目数据库数据失败:', error);
      showToast.error('加载数据库数据失败');
    } finally {
      setProjectDataLoading(prev => {
        const newMap = new Map(prev);
        newMap.set(projectId, false);
        return newMap;
      });
    }
  };

  // 切换展开状态
  const toggleExpand = (projectId: number) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
      // 展开时预加载4个tab的数据
      loadProjectVersions(projectId);
      loadProjectAccounts(projectId);
      loadProjectServers(projectId);
      loadProjectDatabases(projectId);
      // 设置默认标签页为版本
      setProjectActiveTab(prev => new Map(prev).set(projectId, 'versions'));
    }
    setExpandedProjects(newExpanded);
  };

  // ==================== 项目操作 ====================

  const openCreateProjectModal = () => {
    setProjectModalMode('create');
    setProjectFormData({
      ...INITIAL_PROJECT_FORM,
      sort_order: projects.length + 1
    });
    setEditingProjectId(null);
    setShowProjectModal(true);
  };

  const openEditProjectModal = (project: System) => {
    setProjectModalMode('edit');
    setProjectFormData({
      name: project.name,
      short_name: project.short_name || '',  // 🆕 项目简称
      description: project.description || '',
      status: project.status,
      sort_order: project.sort_order,
      initial_version_name: '',
      initial_version_code: '',
      initial_version_desc: ''
    });
    setEditingProjectId(project.id);
    setShowProjectModal(true);
  };

  const closeProjectModal = () => {
    setShowProjectModal(false);
    setProjectFormData(INITIAL_PROJECT_FORM);
    setEditingProjectId(null);
  };

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectFormData.name.trim()) {
      showToast.error('项目名称不能为空');
      return;
    }

    if (!projectFormData.short_name.trim()) {
      showToast.error('项目简称不能为空');
      return;
    }

    // 新建项目时，必须填写初始版本
    if (projectModalMode === 'create') {
      if (!projectFormData.initial_version_name.trim()) {
        showToast.error('请填写初始版本名称');
        return;
      }
      if (!projectFormData.initial_version_code.trim()) {
        showToast.error('请填写初始版本号');
        return;
      }
    }

    setSubmitting(true);

    try {
      if (projectModalMode === 'create') {
        const input: CreateSystemInput = {
          name: projectFormData.name.trim(),
          short_name: projectFormData.short_name.trim() || undefined,  // 🆕 项目简称
          description: projectFormData.description.trim() || '',
          status: projectFormData.status,
          sort_order: projectFormData.sort_order,
          initial_version: {
            version_name: projectFormData.initial_version_name.trim(),
            version_code: projectFormData.initial_version_code.trim(),
            description: projectFormData.initial_version_desc.trim() || '',
            is_main: true // 初始版本默认为主线版本
          }
        };
        await systemService.createSystem(input);
        showToast.success('项目创建成功');
      } else if (editingProjectId !== null) {
        const input: UpdateSystemInput = {
          name: projectFormData.name.trim(),
          short_name: projectFormData.short_name.trim() || undefined,  // 🆕 项目简称
          description: projectFormData.description.trim() || '',
          status: projectFormData.status,
          sort_order: projectFormData.sort_order
        };
        await systemService.updateSystem(editingProjectId, input);
        showToast.success('项目更新成功');
      }

      closeProjectModal();
      loadProjects();
    } catch (error: any) {
      showToast.error(error?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProject = async (project: System) => {
    Modal.confirm({
      title: '删除项目',
      content: (
        <div>
          <p>确定要删除项目 <strong>"{project.name}"</strong> 吗？</p>
          <p className="text-red-500 text-sm mt-2">
            ⚠️ 此操作将同时删除该项目下的所有版本，且无法恢复！
          </p>
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await systemService.deleteSystem(project.id);
          showToast.success('项目删除成功');
          loadProjects();
        } catch (error: any) {
          showToast.error(error?.message || '删除失败');
        }
      }
    });
  };

  // ==================== 版本操作 ====================

  const openCreateVersionModal = (projectId: number) => {
    setVersionModalMode('create');
    setVersionFormData(INITIAL_VERSION_FORM);
    setCurrentProjectId(projectId);
    setEditingVersionId(null);
    setShowVersionModal(true);
  };

  const openEditVersionModal = (projectId: number, version: ProjectVersion) => {
    setVersionModalMode('edit');
    setVersionFormData({
      version_name: version.version_name,
      version_code: version.version_code,
      description: version.description || '',
      is_main: version.is_main,
      status: version.status,
      release_date: version.release_date || null
    });
    setCurrentProjectId(projectId);
    setEditingVersionId(version.id);
    setShowVersionModal(true);
  };

  const closeVersionModal = () => {
    setShowVersionModal(false);
    setVersionFormData(INITIAL_VERSION_FORM);
    setCurrentProjectId(null);
    setEditingVersionId(null);
  };

  const handleVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!versionFormData.version_name.trim()) {
      showToast.error('版本名称不能为空');
      return;
    }
    if (!versionFormData.version_code.trim()) {
      showToast.error('版本号不能为空');
      return;
    }
    if (currentProjectId === null) {
      showToast.error('项目ID无效');
      return;
    }

    setSubmitting(true);

    try {
      if (versionModalMode === 'create') {
        const input: CreateVersionInput = {
          project_id: currentProjectId,
          version_name: versionFormData.version_name.trim(),
          version_code: versionFormData.version_code.trim(),
          description: versionFormData.description.trim() || '',
          is_main: versionFormData.is_main,
          status: versionFormData.status,
          release_date: versionFormData.release_date || undefined
        };
        await systemService.createProjectVersion(input);
        showToast.success('版本创建成功');
        // 新建版本后，自动展开该版本
        if (currentProjectId) {
          const updatedVersions = await systemService.getProjectVersions(currentProjectId);
          setVersions(updatedVersions);
          // 找到新创建的版本并展开
          const createdVersion = updatedVersions.find(v => 
            v.version_name === input.version_name && 
            v.version_code === input.version_code
          );
          if (createdVersion) {
            setExpandedVersions(prev => new Set([...prev, createdVersion.id]));
          }
          // 🔥 刷新项目列表以更新版本数据
          loadProjects();
          // 🔥 清除项目关联数据缓存，下次展开时会重新加载
          setProjectAccounts(prev => {
            const newMap = new Map(prev);
            newMap.delete(currentProjectId);
            return newMap;
          });
        }
      } else if (editingVersionId !== null) {
        const input: UpdateVersionInput = {
          version_name: versionFormData.version_name.trim(),
          version_code: versionFormData.version_code.trim(),
          description: versionFormData.description.trim() || '',
          status: versionFormData.status,
          release_date: versionFormData.release_date || undefined
        };
        await systemService.updateProjectVersion(currentProjectId, editingVersionId, input);
        showToast.success('版本更新成功');
        // 🔥 刷新项目列表以更新版本数据
        loadProjects();
        // 🔥 清除项目关联数据缓存，下次展开时会重新加载
        if (currentProjectId) {
          setProjectAccounts(prev => {
            const newMap = new Map(prev);
            newMap.delete(currentProjectId);
            return newMap;
          });
        }
      }

      closeVersionModal();
      // 编辑版本后，刷新版本列表
      if (versionModalMode === 'edit' && currentProjectId) {
        loadVersions(currentProjectId);
      }
    } catch (error: any) {
      showToast.error(error?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetMainVersion = async (projectId: number, versionId: number) => {
    try {
      await systemService.setMainVersion(projectId, versionId);
      showToast.success('已设为主线版本');
      loadProjects();
      // 如果在版本配置tab中，也刷新版本列表
      if (activeTab === 'version' && selectedProjectForVersion === projectId) {
        loadVersions(projectId);
      }
      // 🔥 清除项目关联数据缓存，下次展开时会重新加载
      setProjectAccounts(prev => {
        const newMap = new Map(prev);
        newMap.delete(projectId);
        return newMap;
      });
    } catch (error: any) {
      showToast.error(error?.message || '设置失败');
    }
  };

  const handleDeleteVersion = async (projectId: number, version: ProjectVersion) => {
    if (version.is_main) {
      showToast.error('不能删除主线版本，请先设置其他版本为主线');
      return;
    }

    Modal.confirm({
      title: '删除版本',
      content: `确定要删除版本 "${version.version_name}" 吗？`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await systemService.deleteProjectVersion(projectId, version.id);
          showToast.success('版本删除成功');
          loadProjects();
          // 🔥 清除项目关联数据缓存，下次展开时会重新加载
          setProjectAccounts(prev => {
            const newMap = new Map(prev);
            newMap.delete(projectId);
            return newMap;
          });
        } catch (error: any) {
          showToast.error(error?.message || '删除失败');
        }
      }
    });
  };

  // 获取版本操作菜单
  const getVersionMenuItems = (projectId: number, version: ProjectVersion): MenuProps['items'] => [
    {
      key: 'setMain',
      label: '设为主线',
      icon: <Star className="w-4 h-4" />,
      disabled: version.is_main,
      onClick: () => handleSetMainVersion(projectId, version.id)
    },
    {
      key: 'edit',
      label: '编辑版本',
      icon: <Edit2 className="w-4 h-4" />,
      onClick: () => openEditVersionModal(projectId, version)
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除版本',
      icon: <Trash2 className="w-4 h-4" />,
      danger: true,
      disabled: version.is_main,
      onClick: () => handleDeleteVersion(projectId, version)
    }
  ];

  // 处理返回按钮点击
  const handleReturn = () => {
    if (returnPath) {
      // 添加返回页面的tab（如果不存在）
      addTab({
        path: returnPath,
        title: returnTitle,
        icon: <PlusCircle className="h-4 w-4" />
      });
      navigate(returnPath);
    } else {
      // 如果没有返回路径，使用浏览器返回
      navigate(-1);
    }
  };

  // ==================== 账号配置操作 ====================

  const loadAccounts = async () => {
    try {
      setAccountsLoading(true);
      const data = await systemService.getAccounts();
      setAccounts(data);
    } catch (error: any) {
      showToast.error(error?.message || '加载账号配置失败');
    } finally {
      setAccountsLoading(false);
    }
  };

  // ==================== 版本配置操作 ====================

  // 加载选中项目的版本列表
  const loadVersions = async (projectId: number) => {
    try {
      setVersionsLoading(true);
      const data = await systemService.getProjectVersions(projectId);
      setVersions(data);
    } catch (error: any) {
      showToast.error(error?.message || '加载版本列表失败');
    } finally {
      setVersionsLoading(false);
    }
  };

  // 切换版本展开状态
  const toggleVersionExpand = (versionId: number) => {
    const newExpanded = new Set(expandedVersions);
    if (newExpanded.has(versionId)) {
      newExpanded.delete(versionId);
    } else {
      newExpanded.add(versionId);
    }
    setExpandedVersions(newExpanded);
  };

  // 切换账号展开状态
  const toggleAccountExpand = (accountId: number) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
    }
    setExpandedAccounts(newExpanded);
  };

  // 切换服务器展开状态
  const toggleServerExpand = (serverId: number) => {
    const newExpanded = new Set(expandedServers);
    if (newExpanded.has(serverId)) {
      newExpanded.delete(serverId);
    } else {
      newExpanded.add(serverId);
    }
    setExpandedServers(newExpanded);
  };

  // 切换数据库展开状态
  const toggleDatabaseExpand = (databaseId: number) => {
    const newExpanded = new Set(expandedDatabases);
    if (newExpanded.has(databaseId)) {
      newExpanded.delete(databaseId);
    } else {
      newExpanded.add(databaseId);
    }
    setExpandedDatabases(newExpanded);
  };

  // 切换到版本配置tab时，如果有选中的项目，加载版本数据
  useEffect(() => {
    if (activeTab === 'version' && selectedProjectForVersion) {
      loadVersions(selectedProjectForVersion);
    }
  }, [activeTab, selectedProjectForVersion]);

  useEffect(() => {
    if (activeTab === 'account') {
      loadAccounts();
    }
  }, [activeTab]);

  const openCreateAccountModal = (projectId?: number) => {
    setAccountModalMode('create');
    setAccountFormData({
      ...INITIAL_ACCOUNT_FORM,
      project_id: projectId || null
    });
    setEditingAccountId(null);
    setShowAccountModal(true);
  };

  const openEditAccountModal = (account: AccountConfig) => {
    setAccountModalMode('edit');
    setAccountFormData({
      project_id: account.project_id || null,
      account_type: account.account_type,
      account_name: account.account_name,
      account_password: account.account_password,
      account_description: account.account_description || '',
      status: account.status
    });
    setEditingAccountId(account.id);
    setShowAccountModal(true);
  };

  const closeAccountModal = () => {
    setShowAccountModal(false);
    setAccountFormData(INITIAL_ACCOUNT_FORM);
    setEditingAccountId(null);
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accountFormData.project_id) {
      showToast.error('请选择所属项目');
      return;
    }
    if (!accountFormData.account_name.trim()) {
      showToast.error('账号名称不能为空');
      return;
    }
    if (!accountFormData.account_password.trim()) {
      showToast.error('账号密码不能为空');
      return;
    }

    setSubmitting(true);

    try {
      if (accountModalMode === 'create') {
        const input: CreateAccountInput = {
          project_id: accountFormData.project_id,
          account_type: accountFormData.account_type,
          account_name: accountFormData.account_name.trim(),
          account_password: accountFormData.account_password,
          account_description: accountFormData.account_description.trim() || '',
          status: accountFormData.status
        };
        await systemService.createAccount(input);
        showToast.success('账号配置创建成功');
      } else if (editingAccountId !== null) {
        const input: UpdateAccountInput = {
          account_type: accountFormData.account_type,
          account_name: accountFormData.account_name.trim(),
          account_password: accountFormData.account_password,
          account_description: accountFormData.account_description.trim() || '',
          status: accountFormData.status
        };
        await systemService.updateAccount(editingAccountId, input);
        showToast.success('账号配置更新成功');
      }

      closeAccountModal();
      loadAccounts();
      // 🔥 清除项目账号数据缓存，下次展开时会重新加载
      if (accountFormData.project_id) {
        setProjectAccounts(prev => {
          const newMap = new Map(prev);
          newMap.delete(accountFormData.project_id!);
          return newMap;
        });
        // 🔥 如果项目已展开，立即强制重新加载账号数据
        if (expandedProjects.has(accountFormData.project_id)) {
          await loadProjectAccounts(accountFormData.project_id);
        }
      }
    } catch (error: any) {
      showToast.error(error?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAccount = async (account: AccountConfig) => {
    Modal.confirm({
      title: '删除账号配置',
      content: `确定要删除账号配置 "${account.account_name}" 吗？`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await systemService.deleteAccount(account.id);
          showToast.success('账号配置删除成功');
          loadAccounts();
          // 🔥 清除项目关联数据缓存，下次展开时会重新加载
          if (account.project_id) {
            setProjectAccounts(prev => {
              const newMap = new Map(prev);
              newMap.delete(account.project_id!);
              return newMap;
            });
            // 🔥 如果项目已展开，立即强制重新加载账号数据
            if (expandedProjects.has(account.project_id)) {
              await loadProjectAccounts(account.project_id);
            }
          }
        } catch (error: any) {
          showToast.error(error?.message || '删除失败');
        }
      }
    });
  };

  // 设置默认账号
  const handleSetDefaultAccount = async (projectId: number, accountId: number) => {
    try {
      await systemService.setDefaultAccount(projectId, accountId);
      showToast.success('已设为默认账号');
      // 🔥 先清除项目关联数据缓存，确保强制重新加载
      setProjectAccounts(prev => {
        const newMap = new Map(prev);
        newMap.delete(projectId);
        return newMap;
      });
      // 重新加载账号列表
      await loadAccounts();
      // 如果项目已展开，立即强制重新加载账号数据
      if (expandedProjects.has(projectId)) {
        await loadProjectAccounts(projectId);
      }
    } catch (error: any) {
      showToast.error(error?.message || '设置失败');
    }
  };

  // ==================== 服务器配置操作 ====================

  const loadServers = async () => {
    try {
      setServersLoading(true);
      const data = await systemService.getServers();
      setServers(data);
    } catch (error: any) {
      showToast.error(error?.message || '加载服务器配置失败');
    } finally {
      setServersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'server') {
      loadServers();
    }
  }, [activeTab]);

  const openCreateServerModal = (projectId?: number) => {
    setServerModalMode('create');
    setServerFormData({
      ...INITIAL_SERVER_FORM,
      project_id: projectId || null
    });
    setEditingServerId(null);
    setShowServerModal(true);
  };

  const openEditServerModal = (server: ServerConfig) => {
    setServerModalMode('edit');
    // 🔥 使用辅助函数确保参数按添加顺序排列
    const parameters = parametersToArray(server.parameters).map(([key, value]) => ({ key, value }));
    setServerFormData({
      project_id: server.project_id || null,
      server_type: server.server_type,
      server_version: server.server_version,
      host_name: server.host_name,
      host_port: server.host_port,
      username: server.username,
      password: server.password,
      description: server.description || '',
      status: server.status,
      parameters
    });
    setEditingServerId(server.id);
    setShowServerModal(true);
  };

  const closeServerModal = () => {
    setShowServerModal(false);
    setServerFormData(INITIAL_SERVER_FORM);
    setEditingServerId(null);
    setServerModalMaximized(false);
  };

  const handleServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!serverFormData.project_id) {
      showToast.error('请选择所属项目');
      return;
    }
    if (!serverFormData.server_type.trim()) {
      showToast.error('服务器类型不能为空');
      return;
    }
    if (!serverFormData.host_name.trim()) {
      showToast.error('主机名称不能为空');
      return;
    }
    if (!serverFormData.host_port || serverFormData.host_port <= 0) {
      showToast.error('主机端口不能为空且必须大于0');
      return;
    }
    if (!serverFormData.username.trim()) {
      showToast.error('用户名不能为空');
      return;
    }
    if (!serverFormData.password.trim()) {
      showToast.error('密码不能为空');
      return;
    }

    setSubmitting(true);

    try {
      // 🔥 使用 Map 确保参数按添加顺序保存，然后转换为对象
      // 同时保存参数键的顺序数组，以解决 JSON 序列化/反序列化可能丢失顺序的问题
      const parametersMap = new Map<string, string>();
      const order: string[] = [];
      serverFormData.parameters.forEach(param => {
        if (param.key.trim() && param.value.trim()) {
          const key = param.key.trim();
          parametersMap.set(key, param.value.trim());
          order.push(key); // 保存顺序
        }
      });
      // 将 Map 转换为对象，并添加顺序信息
      const parameters: Record<string, string> = Object.fromEntries(parametersMap);
      // 添加顺序信息到参数对象中（使用特殊键 __order）
      if (order.length > 0) {
        (parameters as any).__order = order;
      }

      if (serverModalMode === 'create') {
        const input: CreateServerInput = {
          project_id: serverFormData.project_id,
          server_type: serverFormData.server_type.trim(),
          server_version: serverFormData.server_version.trim(),
          host_name: serverFormData.host_name.trim(),
          host_port: serverFormData.host_port,
          username: serverFormData.username.trim(),
          password: serverFormData.password,
          description: serverFormData.description.trim() || '',
          status: serverFormData.status,
          parameters: Object.keys(parameters).length > 0 ? parameters : null
        };
        await systemService.createServer(input);
        showToast.success('服务器配置创建成功');
      } else if (editingServerId !== null) {
        const input: UpdateServerInput = {
          server_type: serverFormData.server_type.trim(),
          server_version: serverFormData.server_version.trim(),
          host_name: serverFormData.host_name.trim(),
          host_port: serverFormData.host_port,
          username: serverFormData.username.trim(),
          password: serverFormData.password,
          description: serverFormData.description.trim() || '',
          status: serverFormData.status,
          parameters: Object.keys(parameters).length > 0 ? parameters : null
        };
        await systemService.updateServer(editingServerId, input);
        showToast.success('服务器配置更新成功');
      }

      closeServerModal();
      loadServers();
      // 🔥 清除项目服务器数据缓存，下次展开时会重新加载
      if (serverFormData.project_id) {
        setProjectServers(prev => {
          const newMap = new Map(prev);
          newMap.delete(serverFormData.project_id!);
          return newMap;
        });
        // 🔥 如果项目已展开，立即强制重新加载服务器数据
        if (expandedProjects.has(serverFormData.project_id)) {
          await loadProjectServers(serverFormData.project_id);
        }
      }
    } catch (error: any) {
      showToast.error(error?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteServer = async (server: ServerConfig) => {
    Modal.confirm({
      title: '删除服务器配置',
      content: `确定要删除服务器配置 "${server.host_name}" 吗？`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await systemService.deleteServer(server.id);
          showToast.success('服务器配置删除成功');
          loadServers();
          // 🔥 清除项目关联数据缓存，下次展开时会重新加载
          if (server.project_id) {
            setProjectServers(prev => {
              const newMap = new Map(prev);
              newMap.delete(server.project_id!);
              return newMap;
            });
            // 🔥 如果项目已展开，立即强制重新加载服务器数据
            if (expandedProjects.has(server.project_id)) {
              await loadProjectServers(server.project_id);
            }
          }
        } catch (error: any) {
          showToast.error(error?.message || '删除失败');
        }
      }
    });
  };

  const handleTestServerConnection = async (serverId: number) => {
    // 防止重复点击
    if (serverTesting.get(serverId)) return;
    
    try {
      setServerTesting(prev => new Map(prev).set(serverId, true));
      
      // 🔥 如果在编辑模式下，使用表单中的当前数据；否则使用数据库中的数据
      let config: Partial<CreateServerInput> | undefined = undefined;
      let actualServerId: number | null = serverId;
      
      if ((serverModalMode === 'edit' && editingServerId === serverId && serverFormData) || 
          (serverModalMode === 'create' && serverId === -1 && serverFormData)) {
        // 将表单数据转换为API格式
        const parametersObj: Record<string, string> = {};
        serverFormData.parameters.forEach(param => {
          if (param.key && param.value) {
            parametersObj[param.key] = param.value;
          }
        });
        
        config = {
          project_id: serverFormData.project_id || 0,
          host_name: serverFormData.host_name,
          host_port: serverFormData.host_port,
          username: serverFormData.username,
          password: serverFormData.password,
          server_type: serverFormData.server_type,
          server_version: serverFormData.server_version,
          description: serverFormData.description,
          parameters: Object.keys(parametersObj).length > 0 ? parametersObj : null
        };
        
        // 对于新增模式，传递null作为ID
        if (serverModalMode === 'create' && serverId === -1) {
          actualServerId = null;
        }
      }
      
      const result = await systemService.testServerConnection(actualServerId, config);
      if (result.success) {
        showToast.success(result.message || '连接测试成功');
      } else {
        showToast.error(result.message || '连接测试失败');
      }
    } catch (error: any) {
      showToast.error(error?.message || '连接测试失败');
    } finally {
      setServerTesting(prev => new Map(prev).set(serverId, false));
    }
  };

  const addServerParameter = () => {
    setServerFormData(prev => ({
      ...prev,
      // 🔥 新添加的参数追加到数组末尾，确保显示在列表最下面
      parameters: [...prev.parameters, { key: '', value: '' }]
    }));
  };

  const removeServerParameter = (index: number) => {
    setServerFormData(prev => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index)
    }));
  };

  const updateServerParameter = (index: number, field: 'key' | 'value', value: string) => {
    setServerFormData(prev => ({
      ...prev,
      parameters: prev.parameters.map((param, i) => 
        i === index ? { ...param, [field]: value } : param
      )
    }));
  };

  // 设置默认服务器
  const handleSetDefaultServer = async (projectId: number, serverId: number) => {
    try {
      await systemService.setDefaultServer(projectId, serverId);
      showToast.success('已设为默认服务器');
      // 🔥 先清除项目关联数据缓存，确保强制重新加载
      setProjectServers(prev => {
        const newMap = new Map(prev);
        newMap.delete(projectId);
        return newMap;
      });
      // 重新加载服务器列表
      await loadServers();
      // 如果项目已展开，立即强制重新加载服务器数据
      if (expandedProjects.has(projectId)) {
        await loadProjectServers(projectId);
      }
    } catch (error: any) {
      showToast.error(error?.message || '设置失败');
    }
  };

  // 设置默认数据库
  const handleSetDefaultDatabase = async (projectId: number, databaseId: number) => {
    try {
      await systemService.setDefaultDatabase(projectId, databaseId);
      showToast.success('已设为默认数据库');
      // 🔥 先清除项目关联数据缓存，确保强制重新加载
      setProjectDatabases(prev => {
        const newMap = new Map(prev);
        newMap.delete(projectId);
        return newMap;
      });
      // 重新加载数据库列表
      await loadDatabases();
      // 如果项目已展开，立即强制重新加载数据库数据
      if (expandedProjects.has(projectId)) {
        await loadProjectDatabases(projectId);
      }
    } catch (error: any) {
      showToast.error(error?.message || '设置失败');
    }
  };

  // ==================== 数据库配置操作 ====================

  const loadDatabases = async () => {
    try {
      setDatabasesLoading(true);
      const data = await systemService.getDatabases();
      setDatabases(data);
    } catch (error: any) {
      showToast.error(error?.message || '加载数据库配置失败');
    } finally {
      setDatabasesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'database') {
      loadDatabases();
    }
  }, [activeTab]);

  const openCreateDatabaseModal = (projectId?: number) => {
    setDatabaseModalMode('create');
    setDatabaseFormData({
      ...INITIAL_DATABASE_FORM,
      project_id: projectId || null
    });
    setEditingDatabaseId(null);
    setShowDatabaseModal(true);
  };

  const openEditDatabaseModal = (database: DatabaseConfig) => {
    setDatabaseModalMode('edit');
    // 🔥 使用辅助函数确保参数按添加顺序排列
    const parameters = parametersToArray(database.parameters).map(([key, value]) => ({ key, value }));
    setDatabaseFormData({
      project_id: database.project_id || null,
      database_type: database.database_type,
      database_version: database.database_version,
      database_driver: database.database_driver,
      database_name: database.database_name,
      database_port: database.database_port,
      database_schema: database.database_schema,
      username: database.username,
      password: database.password,
      connection_string: database.connection_string,
      description: database.description || '',
      status: database.status,
      parameters
    });
    setEditingDatabaseId(database.id);
    setShowDatabaseModal(true);
  };

  const closeDatabaseModal = () => {
    setShowDatabaseModal(false);
    setDatabaseFormData(INITIAL_DATABASE_FORM);
    setEditingDatabaseId(null);
    setDatabaseModalMaximized(false);
  };

  const handleDatabaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!databaseFormData.project_id) {
      showToast.error('请选择所属项目');
      return;
    }
    if (!databaseFormData.database_type.trim()) {
      showToast.error('数据库类型不能为空');
      return;
    }
    if (!databaseFormData.database_name.trim()) {
      showToast.error('数据库名称不能为空');
      return;
    }
    if (!databaseFormData.database_port || databaseFormData.database_port <= 0) {
      showToast.error('数据库端口不能为空且必须大于0');
      return;
    }
    if (!databaseFormData.database_schema.trim()) {
      showToast.error('数据库/模式不能为空');
      return;
    }
    if (!databaseFormData.username.trim()) {
      showToast.error('用户名不能为空');
      return;
    }
    if (!databaseFormData.password.trim()) {
      showToast.error('密码不能为空');
      return;
    }
    if (!databaseFormData.connection_string.trim()) {
      showToast.error('连接串不能为空');
      return;
    }

    setSubmitting(true);

    try {
      // 🔥 使用 Map 确保参数按添加顺序保存，然后转换为对象
      // 同时保存参数键的顺序数组，以解决 JSON 序列化/反序列化可能丢失顺序的问题
      const parametersMap = new Map<string, string>();
      const order: string[] = [];
      databaseFormData.parameters.forEach(param => {
        if (param.key.trim() && param.value.trim()) {
          const key = param.key.trim();
          parametersMap.set(key, param.value.trim());
          order.push(key); // 保存顺序
        }
      });
      // 将 Map 转换为对象，并添加顺序信息
      const parameters: Record<string, string> = Object.fromEntries(parametersMap);
      // 添加顺序信息到参数对象中（使用特殊键 __order）
      if (order.length > 0) {
        (parameters as any).__order = order;
      }

      if (databaseModalMode === 'create') {
        const input: CreateDatabaseInput = {
          project_id: databaseFormData.project_id!,
          database_type: databaseFormData.database_type.trim(),
          database_version: databaseFormData.database_version.trim(),
          database_driver: databaseFormData.database_driver.trim(),
          database_name: databaseFormData.database_name.trim(),
          database_port: databaseFormData.database_port,
          database_schema: databaseFormData.database_schema.trim(),
          username: databaseFormData.username.trim(),
          password: databaseFormData.password,
          connection_string: databaseFormData.connection_string.trim(),
          description: databaseFormData.description.trim() || '',
          status: databaseFormData.status,
          parameters: Object.keys(parameters).length > 0 ? parameters : null
        };
        await systemService.createDatabase(input);
        showToast.success('数据库配置创建成功');
      } else if (editingDatabaseId !== null) {
        const input: UpdateDatabaseInput = {
          database_type: databaseFormData.database_type.trim(),
          database_version: databaseFormData.database_version.trim(),
          database_driver: databaseFormData.database_driver.trim(),
          database_name: databaseFormData.database_name.trim(),
          database_port: databaseFormData.database_port,
          database_schema: databaseFormData.database_schema.trim(),
          username: databaseFormData.username.trim(),
          password: databaseFormData.password,
          connection_string: databaseFormData.connection_string.trim(),
          description: databaseFormData.description.trim() || '',
          status: databaseFormData.status,
          parameters: Object.keys(parameters).length > 0 ? parameters : null
        };
        await systemService.updateDatabase(editingDatabaseId, input);
        showToast.success('数据库配置更新成功');
      }

      closeDatabaseModal();
      loadDatabases();
      // 🔥 清除项目数据库数据缓存，下次展开时会重新加载
      if (databaseFormData.project_id) {
        setProjectDatabases(prev => {
          const newMap = new Map(prev);
          newMap.delete(databaseFormData.project_id!);
          return newMap;
        });
        // 🔥 如果项目已展开，立即强制重新加载数据库数据
        if (expandedProjects.has(databaseFormData.project_id)) {
          await loadProjectDatabases(databaseFormData.project_id);
        }
      }
    } catch (error: any) {
      showToast.error(error?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDatabase = async (database: DatabaseConfig) => {
    Modal.confirm({
      title: '删除数据库配置',
      content: `确定要删除数据库配置 "${database.database_name}" 吗？`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await systemService.deleteDatabase(database.id);
          showToast.success('数据库配置删除成功');
          loadDatabases();
          // 🔥 清除项目关联数据缓存，下次展开时会重新加载
          if (database.project_id) {
            setProjectDatabases(prev => {
              const newMap = new Map(prev);
              newMap.delete(database.project_id!);
              return newMap;
            });
            // 🔥 如果项目已展开，立即强制重新加载数据库数据
            if (expandedProjects.has(database.project_id)) {
              await loadProjectDatabases(database.project_id);
            }
          }
        } catch (error: any) {
          showToast.error(error?.message || '删除失败');
        }
      }
    });
  };

  const handleTestDatabaseConnection = async (databaseId: number) => {
    // 防止重复点击
    if (databaseTesting.get(databaseId)) return;
    
    try {
      setDatabaseTesting(prev => new Map(prev).set(databaseId, true));
      
      // 🔥 如果在编辑模式下，使用表单中的当前数据；否则使用数据库中的数据
      let config: Partial<CreateDatabaseInput> | undefined = undefined;
      if ((databaseModalMode === 'edit' && editingDatabaseId === databaseId && databaseFormData) ||
          (databaseModalMode === 'create' && databaseId === -1 && databaseFormData)) {
        // 将表单数据转换为API格式
        const parametersObj: Record<string, string> = {};
        databaseFormData.parameters.forEach(param => {
          if (param.key && param.value) {
            parametersObj[param.key] = param.value;
          }
        });
        
        config = {
          project_id: databaseFormData.project_id || 0,
          database_name: databaseFormData.database_name,
          database_port: databaseFormData.database_port,
          database_schema: databaseFormData.database_schema,
          username: databaseFormData.username,
          password: databaseFormData.password,
          database_type: databaseFormData.database_type,
          database_version: databaseFormData.database_version,
          database_driver: databaseFormData.database_driver,
          connection_string: databaseFormData.connection_string,
          parameters: Object.keys(parametersObj).length > 0 ? parametersObj : null
        };
      }
      
      // 对于新增模式，传递null作为ID，让后端知道这是测试新配置
      const actualDatabaseId = databaseId === -1 ? null : databaseId;
      const result = await systemService.testDatabaseConnection(actualDatabaseId, config);
      if (result.success) {
        showToast.success(result.message || '连接测试成功');
      } else {
        showToast.error(result.message || '连接测试失败');
      }
    } catch (error: any) {
      showToast.error(error?.message || '连接测试失败');
    } finally {
      setDatabaseTesting(prev => new Map(prev).set(databaseId, false));
    }
  };

  // 根据表单数据自动拼接 JDBC 连接串
  const buildConnectionString = (form: DatabaseFormData): string => {
    const type = (form.database_type || '').toLowerCase();
    const host = form.database_name || '';
    const port = form.database_port;
    const schema = form.database_schema || '';

    if (!host || !schema) {
      return form.connection_string || '';
    }

    if (type.includes('mysql') || type.includes('mariadb')) {
      const p = port || 3306;
      return `jdbc:mysql://${host}:${p}/${schema}`;
    }

    if (type.includes('postgres')) {
      const p = port || 5432;
      return `jdbc:postgresql://${host}:${p}/${schema}`;
    }

    if (type.includes('sql server') || type.includes('sqlserver') || type.includes('mssql')) {
      const p = port || 1433;
      return `jdbc:sqlserver://${host}:${p};databaseName=${schema}`;
    }

    if (type.includes('oracle')) {
      const p = port || 1521;
      return `jdbc:oracle:thin:@${host}:${p}:${schema}`;
    }

    if (type.includes('sqlite')) {
      // SQLite 一般只需要文件路径
      return `jdbc:sqlite:${schema || host}`;
    }

    // 未知类型则保留原值
    return form.connection_string || '';
  };

  // 🆕 根据数据库类型模板构建连接字符串
  const buildConnectionStringFromTemplate = (
    template: string,
    host: string,
    port: number,
    schema: string
  ): string => {
    return template
      .replace(/{host}/g, host || 'localhost')
      .replace(/{port}/g, String(port))
      .replace(/{schema}/g, schema || '');
  };

  const addDatabaseParameter = () => {
    setDatabaseFormData(prev => ({
      ...prev,
      // 🔥 新添加的参数追加到数组末尾，确保显示在列表最下面
      parameters: [...prev.parameters, { key: '', value: '' }]
    }));
  };

  const removeDatabaseParameter = (index: number) => {
    setDatabaseFormData(prev => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index)
    }));
  };

  const updateDatabaseParameter = (index: number, field: 'key' | 'value', value: string) => {
    setDatabaseFormData(prev => ({
      ...prev,
      parameters: prev.parameters.map((param, i) => 
        i === index ? { ...param, [field]: value } : param
      )
    }));
  };

  return (
    <div className="w-full">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {returnPath && (
              <button
                onClick={handleReturn}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title={returnTitle}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <FolderKanban className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-900">项目管理</h1>
          </div>
          
          {/* 右上角操作按钮 */}
          <div className="flex items-center gap-3">
            {/* <Tooltip title="刷新所有数据">
              <button
                onClick={() => {
                  // 刷新项目列表
                  loadProjects();
                  // 刷新所有展开项目的4个tab数据
                  expandedProjects.forEach(projectId => {
                    loadProjectVersions(projectId);
                    loadProjectAccounts(projectId);
                    loadProjectServers(projectId);
                    loadProjectDatabases(projectId);
                  });
                }}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-700"></div>
                ) : (
                  <RefreshCw className="w-5 h-5" />
                )}
                刷新
              </button>
            </Tooltip> */}
            <button
              onClick={openCreateProjectModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              新建项目
            </button>
          </div>
        </div>
        <p className="text-gray-600">管理项目、版本、账号、服务器和数据库配置</p>
      </div>

      {/* Tab切换 */}
      {/* <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('project')}
            className={`flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'project'
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FolderKanban className="h-5 w-5 mr-2" />
            项目配置
          </button>
          <button
            onClick={() => setActiveTab('version')}
            className={`flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'version'
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <GitBranch className="h-5 w-5 mr-2" />
            版本配置
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'account'
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <User className="h-5 w-5 mr-2" />
            账号配置
          </button>
          <button
            onClick={() => setActiveTab('server')}
            className={`flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'server'
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Server className="h-5 w-5 mr-2" />
            服务器配置
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'database'
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Database className="h-5 w-5 mr-2" />
            数据库配置
          </button>
        </div>
      </div> */}

      {/* 项目配置内容 */}
      {activeTab === 'project' && (
        <>
      {/* 工具栏 */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          {/* 搜索框 */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索项目名称或描述..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg 
                focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                transition-all duration-200"
              />
            </div>
          </div>

          {/* 筛选和操作 */}
          <div className="flex gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
                   focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="all">全部状态</option>
              <option value="active">启用</option>
              <option value="inactive">禁用</option>
            </select>

            <button
              onClick={() => {
                // 刷新项目列表
                loadProjects();
                // 刷新所有展开项目的4个tab数据
                expandedProjects.forEach(projectId => {
                  loadProjectVersions(projectId);
                  loadProjectAccounts(projectId);
                  loadProjectServers(projectId);
                  loadProjectDatabases(projectId);
                });
              }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors shadow-sm disabled:opacity-50"
              title="刷新项目列表"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>
      </div>

      {/* 项目列表 */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-500 border border-gray-100">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            加载中...
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
            <FolderKanban className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 mb-4">暂无项目数据</p>
            <button
              onClick={openCreateProjectModal}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              创建第一个项目
            </button>
          </div>
        ) : (
          projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* 项目头部 */}
              <div 
                className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleExpand(project.id)}
              >
                <div className="flex items-center gap-4">
                  {/* 展开/收起图标 */}
                  <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                    {expandedProjects.has(project.id) ? (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-500" />
                    )}
                  </button>

                  {/* 项目图标 */}
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <FolderKanban className="w-5 h-5 text-white" />
                  </div>

                  {/* 项目信息 */}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                      {project.short_name && (
                        <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-mono font-bold">
                          {project.short_name}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        project.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {project.status === 'active' ? '启用' : '禁用'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {project.description || '暂无描述'}
                    </p>
                  </div>
                </div>

                {/* 项目统计与操作 */}
                <div className="flex items-center gap-6" onClick={(e) => e.stopPropagation()}>
                  {/* <div className="text-center">
                    <div className="text-2xl font-bold text-indigo-600">{project.versions?.length || 0}</div>
                    <div className="text-xs text-gray-500">版本</div>
                  </div>
                  <div className="text-center min-w-[80px]">
                    {project.versions?.find(v => v.is_main) ? (
                      <>
                        <div className="text-sm font-semibold text-gray-900">
                          {project.versions.find(v => v.is_main)?.version_code}
                        </div>
                        <div className="text-xs text-gray-500">主线版本</div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-400">无主线版本</div>
                    )}
                  </div> */}

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2">
                    {/* <Tooltip title="添加版本">
                      <button
                        onClick={() => openCreateVersionModal(project.id)}
                        className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <GitBranch className="w-4 h-4" />
                      </button>
                    </Tooltip> */}
                    <Tooltip title="编辑项目">
                      <button
                        onClick={() => openEditProjectModal(project)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip title="删除项目">
                      <button
                        onClick={() => handleDeleteProject(project)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* 🔥 项目关联信息（展开时显示）- 使用标签页展示版本、账号、服务器、数据库 */}
              {expandedProjects.has(project.id) && (
                <div className="border-t border-gray-100 bg-white">
                  {/* 自定义Tab样式，参考顶部导航栏样式 */}
                  <div className="border-gray-200">
                    <div className="m-4 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                      <div className="flex">
                        {[
                          { key: 'versions', label: '版本', icon: GitBranch, count: project.versions?.length || 0 },
                          { key: 'accounts', label: '账号', icon: User, count: (projectAccounts.get(project.id) || []).length },
                          { key: 'servers', label: '服务器', icon: Server, count: (projectServers.get(project.id) || []).length },
                          { key: 'databases', label: '数据库', icon: Database, count: (projectDatabases.get(project.id) || []).length }
                        ].map(({ key, label, icon: Icon, count }) => {
                          const isActive = (projectActiveTab.get(project.id) || 'versions') === key;
                          return (
                            <button
                              key={key}
                              onClick={() => {
                                setProjectActiveTab(prev => new Map(prev).set(project.id, key));
                                // 🔥 切换标签页时，根据标签类型加载对应的数据
                                if (key === 'versions') {
                                  // 加载当前项目的版本数据
                                  loadProjectVersions(project.id);
                                } else if (key === 'accounts') {
                                  loadProjectAccounts(project.id);
                                } else if (key === 'servers') {
                                  loadProjectServers(project.id);
                                } else if (key === 'databases') {
                                  loadProjectDatabases(project.id);
                                }
                              }}
                              className={`flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                                isActive
                                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                              } ${key==='versions' ? 'rounded-l-lg' : ''}`}
                            >
                              <Icon className={`h-5 w-5 mr-2 ${isActive ? 'text-indigo-600' : 'text-gray-500'}`} />
                              {label} ({count})
                            </button>
                          );
                        })}
                      </div>
                      {/* 🔥 添加按钮 - 根据当前tab显示不同的添加功能 */}
                      <div className="pr-4 flex items-center gap-2">
                        {/* 刷新按钮 */}
                        <Tooltip title="刷新数据">
                          <button
                            onClick={() => {
                              const activeTab = projectActiveTab.get(project.id) || 'versions';
                              if (activeTab === 'versions') {
                                // 只刷新当前项目的版本数据
                                loadProjectVersions(project.id);
                              } else if (activeTab === 'accounts') {
                                // 只刷新账号数据
                                loadProjectAccounts(project.id);
                              } else if (activeTab === 'servers') {
                                // 只刷新服务器数据
                                loadProjectServers(project.id);
                              } else if (activeTab === 'databases') {
                                // 只刷新数据库数据
                                loadProjectDatabases(project.id);
                              }
                            }}
                            disabled={projectDataLoading.get(project.id) || loading}
                            className="flex items-center gap-1 px-2 py-2 text-sm text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {(projectDataLoading.get(project.id) || loading) ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </button>
                        </Tooltip>
                        
                        {/* 添加按钮 */}
                        {(() => {
                          const activeTab = projectActiveTab.get(project.id) || 'versions';
                          if (activeTab === 'versions') {
                            return (
                              <Tooltip title="添加版本">
                                <button
                                  onClick={() => openCreateVersionModal(project.id)}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                  添加版本
                                </button>
                              </Tooltip>
                            );
                          } else if (activeTab === 'accounts') {
                            return (
                              <Tooltip title="添加账号配置">
                                <button
                                  onClick={() => openCreateAccountModal(project.id)}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                  添加账号
                                </button>
                              </Tooltip>
                            );
                          } else if (activeTab === 'servers') {
                            return (
                              <Tooltip title="添加服务器配置">
                                <button
                                  onClick={() => openCreateServerModal(project.id)}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                  添加服务器
                                </button>
                              </Tooltip>
                            );
                          } else if (activeTab === 'databases') {
                            return (
                              <Tooltip title="添加数据库配置">
                                <button
                                  onClick={() => openCreateDatabaseModal(project.id)}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                  添加数据库
                                </button>
                              </Tooltip>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                    </div>
                  </div>
                  {/* Tab内容 */}
                  <div className="pr-4 pl-4 pb-4">
                    {(projectActiveTab.get(project.id) || 'versions') === 'versions' && (
                      <div>
                        {project.versions && project.versions.length > 0 ? (
                          <div className="space-y-2">
                            {project.versions.map((version) => (
                              <div 
                                key={version.id}
                                className={`bg-white rounded-lg border overflow-hidden ${
                                  version.is_main ? 'bg-indigo-50/50 border-indigo-200' : 'border-gray-200'
                                }`}
                              >
                                {/* 版本头部 - 可点击展开 */}
                                <div 
                                  className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${
                                    version.is_main ? 'bg-indigo-50/50' : ''
                                  }`}
                                  onClick={() => toggleVersionExpand(version.id)}
                                >
                                  <div className="flex items-center gap-3">
                                    {/* 展开/收起图标 */}
                                    <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                                      {expandedVersions.has(version.id) ? (
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-gray-500" />
                                      )}
                                    </button>
                                    {/* 版本图标 */}
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                      version.is_main 
                                        ? 'bg-indigo-100 text-indigo-600' 
                                        : 'bg-gray-100 text-gray-500'
                                    }`}>
                                      {version.is_main ? (
                                        <Star className="w-4 h-4 fill-current" />
                                      ) : (
                                        <Tag className="w-4 h-4" />
                                      )}
                                    </div>

                                    {/* 版本信息 */}
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-gray-900">{version.version_name}</span>
                                        <code className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600 font-mono">
                                          {version.version_code}
                                        </code>
                                        {version.is_main && (
                                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                                            主线版本
                                          </span>
                                        )}
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                                          version.status === 'active'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-gray-100 text-gray-600'
                                        }`}>
                                          {version.status === 'active' ? '启用' : '禁用'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                        <span>{version.description || '暂无描述'} </span>
                                        {/* {version.release_date && (
                                          <span className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(version.release_date).toLocaleDateString('zh-CN')}
                                          </span>
                                        )} */}
                                      </div>
                                    </div>
                                  </div>

                                  {/* 版本操作 */}
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <Dropdown 
                                      menu={{ items: getVersionMenuItems(project.id, version) }}
                                      trigger={['click']}
                                    >
                                      <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                        <MoreHorizontal className="w-4 h-4" />
                                      </button>
                                    </Dropdown>
                                  </div>
                                </div>

                                {/* 版本详情（展开时显示） */}
                                {expandedVersions.has(version.id) && (
                                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div>
                                        <span className="text-gray-500">版本名称：</span>
                                        <span className="text-gray-900 font-medium ml-2">{version.version_name}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">版本号：</span>
                                        <span className="text-gray-900 font-medium ml-2">{version.version_code}</span>
                                      </div>
                                      {/* {version.description && (
                                        <div className="col-span-2">
                                          <span className="text-gray-500">描述：</span>
                                          <span className="text-gray-900 ml-2">{version.description}</span>
                                        </div>
                                      )} */}
                                      {version.release_date && (
                                        <div>
                                          <span className="text-gray-500">发布日期：</span>
                                          <span className="text-gray-900 font-medium ml-2">{new Date(version.release_date).toLocaleDateString('zh-CN')}</span>
                                        </div>
                                      )}
                                      <div>
                                        <span className="text-gray-500">状态：</span>
                                        <span className={`font-medium ml-2 ${
                                          version.status === 'active' ? 'text-green-600' : 'text-gray-600'
                                        }`}>
                                          {version.status === 'active' ? '启用' : '禁用'}
                                        </span>
                                      </div>
                                      {/* {version.is_main && (
                                        <div className="col-span-2">
                                          <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1 w-fit">
                                            <Star className="w-3 h-3 fill-current" />
                                            主线版本
                                          </span>
                                        </div>
                                      )} */}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-8 text-center text-gray-400">
                            <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">暂无版本</p>
                            <button
                              onClick={() => openCreateVersionModal(project.id)}
                              className="text-indigo-600 hover:text-indigo-700 text-sm mt-2"
                            >
                              添加第一个版本
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {(projectActiveTab.get(project.id) || 'versions') === 'accounts' && (
                      <div>
                        {projectDataLoading.get(project.id) ? (
                          <div className="py-8 text-center text-gray-500">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto mb-2"></div>
                            加载中...
                          </div>
                        ) : (projectAccounts.get(project.id) || []).length > 0 ? (
                          <div className="space-y-2">
                            {(projectAccounts.get(project.id) || []).map((account) => (
                              <div 
                                key={account.id}
                                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                              >
                                {/* 账号头部 - 可点击展开 */}
                                <div 
                                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                                  onClick={() => toggleAccountExpand(account.id)}
                                >
                                  <div className="flex items-center gap-3">
                                    {/* 展开/收起图标 */}
                                    <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                                      {expandedAccounts.has(account.id) ? (
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-gray-500" />
                                      )}
                                    </button>
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                      <User className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-gray-900">{account.account_name}</span>
                                        {/* <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                          {project.name}{project.short_name ? ` (${project.short_name})` : ''}
                                        </span> */}
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                          {account.account_type === 'admin' ? '管理员账号' : account.account_type === 'security' ? '安全员账号' : '审核员账号'}
                                        </span>
                                        {account.is_default && (
                                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1">
                                            <Star className="w-3 h-3 fill-current" />
                                            默认
                                          </span>
                                        )}
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                                          account.status === 'active'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-gray-100 text-gray-600'
                                        }`}>
                                          {account.status === 'active' ? '启用' : '禁用'}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {account.account_description || '暂无描述'}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    {!account.is_default && (
                                      <Tooltip title="设为默认">
                                        <button
                                          onClick={() => handleSetDefaultAccount(account.project_id, account.id)}
                                          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        >
                                          <Star className="w-4 h-4" />
                                        </button>
                                      </Tooltip>
                                    )}
                                    <Tooltip title="编辑">
                                      <button
                                        onClick={() => openEditAccountModal(account)}
                                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                    </Tooltip>
                                    <Tooltip title="删除">
                                      <button
                                        onClick={() => handleDeleteAccount(account)}
                                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </Tooltip>
                                  </div>
                                </div>
                                {/* 账号详情（展开时显示） */}
                                {expandedAccounts.has(account.id) && (
                                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div>
                                        <span className="text-gray-500">所属项目：</span>
                                        <span className="text-gray-900 font-medium ml-2">{project.name}{project.short_name ? ` (${project.short_name})` : ''}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">账号类型：</span>
                                        <span className="text-gray-900 font-medium ml-2">
                                          {account.account_type === 'admin' ? '管理员账号' : account.account_type === 'security' ? '安全员账号' : '审核员账号'}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">账号名称：</span>
                                        <span className="text-gray-900 font-medium ml-2">{account.account_name}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">状态：</span>
                                        <span className={`font-medium ml-2 ${
                                          account.status === 'active' ? 'text-green-600' : 'text-gray-600'
                                        }`}>
                                          {account.status === 'active' ? '启用' : '禁用'}
                                        </span>
                                      </div>
                                      {/* {account.is_default && (
                                        <div className="col-span-2">
                                          <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1 w-fit">
                                            <Star className="w-3 h-3 fill-current" />
                                            默认账号
                                          </span>
                                        </div>
                                      )} */}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-8 text-center text-gray-400">
                            <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">暂无账号配置</p>
                            <button
                              onClick={() => openCreateAccountModal(project.id)}
                              className="text-indigo-600 hover:text-indigo-700 text-sm mt-2"
                            >
                              添加第一个账号
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {(projectActiveTab.get(project.id) || 'versions') === 'servers' && (
                      <div>
                        {projectDataLoading.get(project.id) ? (
                          <div className="py-8 text-center text-gray-500">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto mb-2"></div>
                            加载中...
                          </div>
                        ) : (projectServers.get(project.id) || []).length > 0 ? (
                          <div className="space-y-2">
                            {(projectServers.get(project.id) || []).map((server) => (
                              <div 
                                key={server.id}
                                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                              >
                                {/* 服务器头部 - 可点击展开 */}
                                <div 
                                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                                  onClick={() => toggleServerExpand(server.id)}
                                >
                                  <div className="flex items-center gap-3">
                                    {/* 展开/收起图标 */}
                                    <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                                      {expandedServers.has(server.id) ? (
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-gray-500" />
                                      )}
                                    </button>
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                                      <Server className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-gray-900">{server.host_name}</span>
                                        {/* <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                          {project.name}{project.short_name ? ` (${project.short_name})` : ''}
                                        </span> */}
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                          {server.server_type}
                                        </span>
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                          {server.server_version}
                                        </span>
                                        <code className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                                          {server.host_name}:{server.host_port}
                                        </code>
                                        {server.is_default && (
                                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1">
                                            <Star className="w-3 h-3 fill-current" />
                                            默认
                                          </span>
                                        )}
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                                          server.status === 'active'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-gray-100 text-gray-600'
                                        }`}>
                                          {server.status === 'active' ? '启用' : '禁用'}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {server.description || '暂无描述'}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    {!server.is_default && (
                                      <Tooltip title="设为默认">
                                        <button
                                          onClick={() => handleSetDefaultServer(server.project_id, server.id)}
                                          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        >
                                          <Star className="w-4 h-4" />
                                        </button>
                                      </Tooltip>
                                    )}
                                    <Tooltip title="编辑">
                                      <button
                                        onClick={() => openEditServerModal(server)}
                                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                    </Tooltip>
                                    <Tooltip title="测试">
                                      <button
                                        onClick={() => handleTestServerConnection(server.id)}
                                        className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={serverTesting.get(server.id)}
                                      >
                                        {serverTesting.get(server.id) ? (
                                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
                                        ) : (
                                          <Play className="w-4 h-4" />
                                        )}
                                      </button>
                                    </Tooltip>
                                    <Tooltip title="删除">
                                      <button
                                        onClick={() => handleDeleteServer(server)}
                                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </Tooltip>
                                  </div>
                                </div>
                                {/* 服务器详情（展开时显示） */}
                                {expandedServers.has(server.id) && (
                                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div>
                                        <span className="text-gray-500">所属项目：</span>
                                        <span className="text-gray-900 font-medium ml-2">{project.name}{project.short_name ? ` (${project.short_name})` : ''}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">服务器类型：</span>
                                        <span className="text-gray-900 font-medium ml-2">{server.server_type}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">服务器版本：</span>
                                        <span className="text-gray-900 font-medium ml-2">{server.server_version}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">主机名称：</span>
                                        <span className="text-gray-900 font-medium ml-2">{server.host_name}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">主机端口：</span>
                                        <span className="text-gray-900 font-medium ml-2">{server.host_port}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">用户名：</span>
                                        <span className="text-gray-900 font-medium l-2">{server.username}</span>
                                      </div>
                                      {server.parameters && Object.keys(server.parameters).length > 0 && (
                                        <div className="col-span-1">
                                          <span className="text-gray-500">参数配置：</span>
                                          {/* <div className="mt-2 space-y-1">
                                            {parametersToArray(server.parameters).map(([key, value], index) => (
                                              <div key={`param-${index}`} className="font-medium text-xs bg-white px-2 py-1 rounded border border-gray-200">
                                                <span className="text-gray-700">{key}</span>
                                                <span className="text-gray-500 mx-2">:</span>
                                                <span className="text-gray-900">{value}</span>
                                              </div>
                                            ))}
                                          </div> */}
                                          <div className="flex items-center justify-between gap-2 mt-1">
                                          <div className="w-[20%]">
                                            {parametersToArray(server.parameters).map(([key], index) => (
                                              <span key={`param-key-${index}`} className="flex items-center font-medium text-xs bg-white px-2 py-1 rounded border border-gray-200 mt-1">
                                                {key}
                                              </span>
                                            ))}
                                          </div>
                                          <div className="w-[80%]">
                                            {parametersToArray(server.parameters).map(([, value], index) => (
                                              <span key={`param-value-${index}`} className="flex items-center font-medium text-xs bg-white px-2 py-1 rounded border border-gray-200 mt-1">
                                                {value}
                                              </span>
                                            ))}
                                          </div>
                                          </div>
                                        </div>
                                      )}
                                      {/* {server.description && (
                                        <div className="col-span-2">
                                          <span className="text-gray-500">描述：</span>
                                          <span className="text-gray-900 ml-2">{server.description}</span>
                                        </div>
                                      )} */}
                                      <div>
                                        <span className="text-gray-500">状态：</span>
                                        <span className={`font-medium ml-2 ${
                                          server.status === 'active' ? 'text-green-600' : 'text-gray-600'
                                        }`}>
                                          {server.status === 'active' ? '启用' : '禁用'}
                                        </span>
                                      </div>
                                      {/* {server.is_default && (
                                        <div className="col-span-2">
                                          <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1 w-fit">
                                            <Star className="w-3 h-3 fill-current" />
                                            默认服务器
                                          </span>
                                        </div>
                                      )} */}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-8 text-center text-gray-400">
                            <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">暂无服务器配置</p>
                            <button
                              onClick={() => openCreateServerModal(project.id)}
                              className="text-indigo-600 hover:text-indigo-700 text-sm mt-2"
                            >
                              添加第一个服务器配置
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {(projectActiveTab.get(project.id) || 'versions') === 'databases' && (
                      <div>
                        {projectDataLoading.get(project.id) ? (
                          <div className="py-8 text-center text-gray-500">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto mb-2"></div>
                            加载中...
                          </div>
                        ) : (projectDatabases.get(project.id) || []).length > 0 ? (
                          <div className="space-y-2">
                            {(projectDatabases.get(project.id) || []).map((database) => (
                              <div 
                                key={database.id}
                                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                              >
                                {/* 数据库头部 - 可点击展开 */}
                                <div 
                                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                                  onClick={() => toggleDatabaseExpand(database.id)}
                                >
                                  <div className="flex items-center gap-3">
                                    {/* 展开/收起图标 */}
                                    <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                                      {expandedDatabases.has(database.id) ? (
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-gray-500" />
                                      )}
                                    </button>
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
                                      <Database className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-gray-900">{database.database_name}</span>
                                        {/* <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                          {project.name}{project.short_name ? ` (${project.short_name})` : ''}
                                        </span> */}
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                          {database.database_type}
                                        </span>
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                          {database.database_version}
                                        </span>
                                        <code className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                                          {database.database_name}:{database.database_port}/{database.database_schema}
                                        </code>
                                        {database.is_default && (
                                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1">
                                            <Star className="w-3 h-3 fill-current" />
                                            默认
                                          </span>
                                        )}
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                                          database.status === 'active'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-gray-100 text-gray-600'
                                        }`}>
                                          {database.status === 'active' ? '启用' : '禁用'}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {database.description || '暂无描述'}
                                      </p>
                                    </div>
                                  </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    {!database.is_default && (
                                      <Tooltip title="设为默认">
                                        <button
                                          onClick={() => handleSetDefaultDatabase(database.project_id, database.id)}
                                          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        >
                                          <Star className="w-4 h-4" />
                                        </button>
                                      </Tooltip>
                                    )}
                                    <Tooltip title="编辑">
                                      <button
                                        onClick={() => openEditDatabaseModal(database)}
                                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                    </Tooltip>
                                    <Tooltip title="测试">
                                      <button
                                        onClick={() => handleTestDatabaseConnection(database.id)}
                                        className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={databaseTesting.get(database.id)}
                                      >
                                        {databaseTesting.get(database.id) ? (
                                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
                                        ) : (
                                          <Play className="w-4 h-4" />
                                        )}
                                      </button>
                                    </Tooltip>
                                    <Tooltip title="删除">
                                      <button
                                        onClick={() => handleDeleteDatabase(database)}
                                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </Tooltip>
                                  </div>
                                </div>
                                {/* 数据库详情（展开时显示） */}
                                {expandedDatabases.has(database.id) && (
                                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div>
                                        <span className="text-gray-500">所属项目：</span>
                                        <span className="text-gray-900 font-medium ml-2">{project.name}{project.short_name ? ` (${project.short_name})` : ''}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">数据库类型：</span>
                                        <span className="text-gray-900 font-medium ml-2">{database.database_type}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">数据库版本：</span>
                                        <span className="text-gray-900 font-medium ml-2">{database.database_version}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">数据库驱动：</span>
                                        <span className="text-gray-900 font-medium ml-2">{database.database_driver}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">数据库名称：</span>
                                        <span className="text-gray-900 font-medium ml-2">{database.database_name}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">数据库端口：</span>
                                        <span className="text-gray-900 font-medium ml-2">{database.database_port}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">数据库/模式：</span>
                                        <span className="text-gray-900 font-medium ml-2">{database.database_schema}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">用户名：</span>
                                        <span className="text-gray-900 font-medium ml-2">{database.username}</span>
                                      </div>
                                      {database.connection_string && (
                                        <div className="col-span-1">
                                          <span className="text-gray-500">连接串：</span>
                                          <span className="text-gray-900 font-medium ml-2">{database.connection_string}</span>
                                        </div>
                                      )}
                                      {/* {database.description && (
                                        <div className="col-span-2">
                                          <span className="text-gray-500">描述：</span>
                                          <span className="text-gray-900 ml-2">{database.description}</span>
                                        </div>
                                      )} */}
                                      <div>
                                        <span className="text-gray-500">状态：</span>
                                        <span className={`font-medium ml-2 ${
                                          database.status === 'active' ? 'text-green-600' : 'text-gray-600'
                                        }`}>
                                          {database.status === 'active' ? '启用' : '禁用'}
                                        </span>
                                      </div>
                                      {/* {database.is_default && (
                                        <div className="col-span-2">
                                          <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1 w-fit">
                                            <Star className="w-3 h-3 fill-current" />
                                            默认数据库
                                          </span>
                                        </div>
                                      )} */}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-8 text-center text-gray-400">
                            <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">暂无数据库配置</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 旧版本列表代码（已注释，保留备用） */}
              {/* {expandedProjects.has(project.id) && (
                <div className="border-t border-gray-100 bg-gray-50/50">
                  {project.versions && project.versions.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {project.versions.map((version) => (
                        <div 
                          key={version.id}
                          className={`px-6 py-3 flex items-center justify-between hover:bg-white transition-colors ${
                            version.is_main ? 'bg-indigo-50/50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-4 pl-10">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              version.is_main 
                                ? 'bg-indigo-100 text-indigo-600' 
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {version.is_main ? (
                                <Star className="w-4 h-4 fill-current" />
                              ) : (
                                <Tag className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">{version.version_name}</span>
                                <code className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600 font-mono">
                                  {version.version_code}
                                </code>
                                {version.is_main && (
                                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                                    主线版本
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 rounded-full text-xs ${
                                  version.status === 'active'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {version.status === 'active' ? '启用' : '禁用'}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                {version.description && (
                                  <span>{version.description}</span>
                                )}
                                {version.release_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(version.release_date).toLocaleDateString('zh-CN')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Dropdown 
                            menu={{ items: getVersionMenuItems(project.id, version) }}
                            trigger={['click']}
                          >
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </Dropdown>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-6 py-8 text-center text-gray-400">
                      <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">暂无版本</p>
                      <button
                        onClick={() => openCreateVersionModal(project.id)}
                        className="text-indigo-600 hover:text-indigo-700 text-sm mt-2"
                      >
                        添加第一个版本
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 旧版本列表代码（已注释，保留备用） */}
              {/* {expandedProjects.has(project.id) && (
                <div className="border-t border-gray-100 bg-gray-50/50">
                  {project.versions && project.versions.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {project.versions.map((version) => (
                        <div 
                          key={version.id}
                          className={`px-6 py-3 flex items-center justify-between hover:bg-white transition-colors ${
                            version.is_main ? 'bg-indigo-50/50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-4 pl-10">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              version.is_main 
                                ? 'bg-indigo-100 text-indigo-600' 
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {version.is_main ? (
                                <Star className="w-4 h-4 fill-current" />
                              ) : (
                                <Tag className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">{version.version_name}</span>
                                <code className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600 font-mono">
                                  {version.version_code}
                                </code>
                                {version.is_main && (
                                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                                    主线版本
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 rounded-full text-xs ${
                                  version.status === 'active'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {version.status === 'active' ? '启用' : '禁用'}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                {version.description && (
                                  <span>{version.description}</span>
                                )}
                                {version.release_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(version.release_date).toLocaleDateString('zh-CN')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Dropdown 
                            menu={{ items: getVersionMenuItems(project.id, version) }}
                            trigger={['click']}
                          >
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </Dropdown>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-6 py-8 text-center text-gray-400">
                      <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">暂无版本</p>
                      <button
                        onClick={() => openCreateVersionModal(project.id)}
                        className="text-indigo-600 hover:text-indigo-700 text-sm mt-2"
                      >
                        添加第一个版本
                      </button>
                    </div>
                  )}
                </div>
              )} */}
            </div>
          ))
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            第 {currentPage} 页，共 {totalPages} 页
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              上一页
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              下一页
            </button>
          </div>
        </div>
      )}
        </>)}

      {/* 版本配置内容 */}
      {activeTab === 'version' && (
        <>
          {/* 工具栏 */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-100">
            <div className="flex flex-col md:flex-row gap-4 justify-between">
              {/* 搜索框 */}
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索版本名称/版本号/描述..."
                    value={versionSearchTerm}
                    onChange={(e) => setVersionSearchTerm(e.target.value)}
                    disabled={!selectedProjectForVersion}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg 
                    focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                    transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* 筛选和操作 */}
              <div className="flex gap-3">
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  placeholder="选择项目"
                  value={selectedProjectForVersion}
                  onChange={(value) => {
                    setSelectedProjectForVersion(value);
                    if (value) {
                      loadVersions(value);
                    } else {
                      setVersions([]);
                    }
                  }}
                  className="w-72"
                  showSearch
                  allowClear
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={projects.map(p => ({
                    value: p.id,
                    label: `${p.name}${p.short_name ? ` (${p.short_name})` : ''}`
                  }))}
                  style={{ height: '40px' }}
                  popupMatchSelectWidth={false}
                  listHeight={300}
                />
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  placeholder="全部状态"
                  value={versionStatusFilter}
                  onChange={(value) => setVersionStatusFilter(value)}
                  className="w-32"
                  showSearch
                  allowClear
                  options={[
                    { label: '全部状态', value: 'all' },
                    { label: '启用', value: 'active' },
                    { label: '禁用', value: 'inactive' }
                  ]}
                  style={{ height: '40px' }}
                  popupMatchSelectWidth={false}
                  listHeight={300}
                />

                <button
                  onClick={() => {
                    if (selectedProjectForVersion) {
                      const project = projects.find(p => p.id === selectedProjectForVersion);
                      if (project) {
                        openCreateVersionModal(project.id);
                      }
                    } else {
                      showToast.error('请先选择项目');
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  新建版本
                </button>
              </div>
            </div>
          </div>

          {/* 版本列表 */}
          {!selectedProjectForVersion ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
              <GitBranch className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 mb-4">请先选择项目以查看版本信息</p>
            </div>
          ) : versionsLoading ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-500 border border-gray-100">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              加载中...
            </div>
          ) : versions.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
              <GitBranch className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 mb-4">该项目暂无版本</p>
              <button
                onClick={() => {
                  const project = projects.find(p => p.id === selectedProjectForVersion);
                  if (project) {
                    openCreateVersionModal(project.id);
                  }
                }}
                className="text-indigo-600 hover:text-indigo-700 font-medium"
              >
                创建第一个版本
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {versions
                .filter((version) => {
                  const term = versionSearchTerm.trim().toLowerCase();
                  if (term && !(
                    includesIgnoreCase(version.version_name, term) ||
                    includesIgnoreCase(version.version_code, term) ||
                    includesIgnoreCase(version.description, term)
                  )) {
                    return false;
                  }
                  if (versionStatusFilter !== 'all' && version.status !== versionStatusFilter) {
                    return false;
                  }
                  return true;
                })
                .map((version) => {
                const project = projects.find(p => p.id === selectedProjectForVersion);
                return (
                  <div key={version.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* 版本头部 */}
                    <div 
                      className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleVersionExpand(version.id)}
                    >
                      <div className="flex items-center gap-4">
                        {/* 展开/收起图标 */}
                        <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                          {expandedVersions.has(version.id) ? (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-500" />
                          )}
                        </button>

                        {/* 版本图标 */}
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          version.is_main 
                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600' 
                            : 'bg-gradient-to-br from-gray-400 to-gray-500'
                        }`}>
                          {version.is_main ? (
                            <Star className="w-5 h-5 text-white fill-current" />
                          ) : (
                            <Tag className="w-5 h-5 text-white" />
                          )}
                        </div>

                        {/* 版本信息 */}
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-gray-900">{version.version_name}</h3>
                            <code className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-mono font-bold">
                              {version.version_code}
                            </code>
                            {version.is_main && (
                              <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                                主线版本
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              version.status === 'active'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {version.status === 'active' ? '启用' : '禁用'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {version.description || '暂无描述'}
                          </p>
                        </div>
                      </div>

                      {/* 版本操作 */}
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {version.release_date && (
                          <div className="text-center mr-4">
                            <div className="text-sm font-semibold text-gray-900">
                              {new Date(version.release_date).toLocaleDateString('zh-CN')}
                            </div>
                            <div className="text-xs text-gray-500">发布日期</div>
                          </div>
                        )}
                        {!version.is_main && (
                          <Tooltip title="设为主线版本">
                            <button
                              onClick={() => {
                                if (project) {
                                  handleSetMainVersion(project.id, version.id);
                                }
                              }}
                              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <Star className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip title="编辑版本">
                          <button
                            onClick={() => {
                              if (selectedProjectForVersion) {
                                setCurrentProjectId(selectedProjectForVersion);
                                openEditVersionModal(selectedProjectForVersion, version);
                              }
                            }}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip title="删除版本">
                          <button
                            onClick={() => {
                              if (project) {
                                handleDeleteVersion(project.id, version);
                              }
                            }}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>

                    {/* 版本详情（展开时显示） */}
                    {expandedVersions.has(version.id) && (
                      <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">版本名称：</span>
                            <span className="text-gray-900 font-medium">{version.version_name}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">版本代码：</span>
                            <code className="text-gray-900 font-mono">{version.version_code}</code>
                          </div>
                          {project && (
                            <div>
                              <span className="text-gray-500">所属项目：</span>
                              <span className="text-gray-900">{project.name}{project.short_name ? ` (${project.short_name})` : ''}</span>
                            </div>
                          )}
                          {version.release_date && (
                            <div>
                              <span className="text-gray-500">发布日期：</span>
                              <span className="text-gray-900">{new Date(version.release_date).toLocaleDateString('zh-CN')}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-gray-500">状态：</span>
                            <span className={`font-medium ${
                              version.status === 'active' ? 'text-green-600' : 'text-gray-600'
                            }`}>
                              {version.status === 'active' ? '启用' : '禁用'}
                            </span>
                          </div>
                          {version.is_main && (
                            <div className="col-span-2">
                              <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1 w-fit">
                                <Star className="w-3 h-3 fill-current" />
                                主线版本
                              </span>
                            </div>
                          )}
                          {version.description && (
                            <div className="col-span-2">
                              <span className="text-gray-500">描述：</span>
                              <span className="text-gray-900">{version.description}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 账号配置内容 */}
      {activeTab === 'account' && (
        <>
          {/* 工具栏 */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-100">
            <div className="flex flex-col md:flex-row gap-4 justify-between">
              {/* 搜索框 */}
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索账号名称/描述..."
                    value={accountSearchTerm}
                    onChange={(e) => setAccountSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg 
                    focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                    transition-all duration-200"
                  />
                </div>
              </div>

              {/* 筛选和操作 */}
              <div className="flex gap-3">
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  placeholder="全部项目"
                  value={selectedProjectForAccount}
                  onChange={(value) => {
                    setSelectedProjectForAccount(value);
                    // 这里可以根据项目筛选账号配置
                    loadAccounts();
                  }}
                  className="w-72"
                  showSearch
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  allowClear
                  options={projects.map(p => ({
                    value: p.id,
                    label: `${p.name}${p.short_name ? ` (${p.short_name})` : ''}`
                  }))}
                  style={{ height: '40px' }}
                  popupMatchSelectWidth={false}
                  listHeight={300}
                />
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  placeholder="全部状态"
                  value={accountStatusFilter}
                  onChange={(value) => setAccountStatusFilter(value)}
                  className="w-32"
                  showSearch
                  allowClear
                  options={[
                    { label: '全部状态', value: 'all' },
                    { label: '启用', value: 'active' },
                    { label: '禁用', value: 'inactive' }
                  ]}
                  style={{ height: '40px' }}
                  popupMatchSelectWidth={false}
                  listHeight={300}
                />

                <button
                  onClick={() => openCreateAccountModal()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  新增账号配置
                </button>
              </div>
            </div>
          </div>

          {/* 账号列表 */}
          <div className="space-y-4">
            {accountsLoading ? (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-500 border border-gray-100">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                加载中...
              </div>
            ) : accounts.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
                <User className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500 mb-4">暂无账号配置</p>
                <button
                  onClick={() => openCreateAccountModal()}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  创建第一个账号配置
                </button>
              </div>
            ) : (
              accounts
                .filter(account => !selectedProjectForAccount || account.project_id === selectedProjectForAccount)
                .filter((account) => {
                  const term = accountSearchTerm.trim().toLowerCase();
                  if (term && !(
                    includesIgnoreCase(account.account_name, term) ||
                    includesIgnoreCase(account.account_description, term) ||
                    includesIgnoreCase(account.account_type, term) ||
                    includesIgnoreCase(projects.find(p => p.id === account.project_id)?.name, term) ||
                    includesIgnoreCase(projects.find(p => p.id === account.project_id)?.short_name, term)
                  )) {
                    return false;
                  }
                  if (accountStatusFilter !== 'all' && account.status !== accountStatusFilter) {
                    return false;
                  }
                  return true;
                })
                .sort((a, b) => {
                  // 默认账号排在前面
                  if (a.is_default && !b.is_default) return -1;
                  if (!a.is_default && b.is_default) return 1;
                  return 0;
                })
                .map((account) => {
                  const project = projects.find(p => p.id === account.project_id);
                  return (
                <div key={account.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div 
                    className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleAccountExpand(account.id)}
                  >
                    <div className="flex items-center gap-4">
                      {/* 展开/收起图标 */}
                      <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                        {expandedAccounts.has(account.id) ? (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-500" />
                        )}
                      </button>
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{account.account_name}</h3>
                          {project && (
                            <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                              {project.name}{project.short_name ? ` (${project.short_name})` : ''}
                            </span>
                          )}
                          <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            {account.account_type === 'admin' ? '管理员账号' : account.account_type === 'security' ? '安全员账号' : '审核员账号'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            account.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {account.status === 'active' ? '启用' : '禁用'}
                          </span>
                          {account.is_default && (
                            <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1">
                              <Star className="w-3 h-3 fill-current" />
                              默认
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {account.account_description || '暂无描述'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {!account.is_default && (
                      <Tooltip title="设为默认">
                        <button
                          onClick={() => handleSetDefaultAccount(account.project_id, account.id)}
                          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip title="编辑">
                      <button
                        onClick={() => openEditAccountModal(account)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip title="删除">
                      <button
                        onClick={() => handleDeleteAccount(account)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  </div>
                </div>

                  {/* 账号详情（展开时显示） */}
                  {expandedAccounts.has(account.id) && (
                    <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">账号名称：</span>
                          <span className="text-gray-900 font-medium">{account.account_name}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">账号类型：</span>
                          <span className="text-gray-900">
                            {account.account_type === 'admin' ? '管理员账号' : account.account_type === 'security' ? '安全员账号' : '审核员账号'}
                          </span>
                        </div>
                        {project && (
                          <div>
                            <span className="text-gray-500">所属项目：</span>
                            <span className="text-gray-900">{project.name}{project.short_name ? ` (${project.short_name})` : ''}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">状态：</span>
                          <span className={`font-medium ${
                            account.status === 'active' ? 'text-green-600' : 'text-gray-600'
                          }`}>
                            {account.status === 'active' ? '启用' : '禁用'}
                          </span>
                        </div>
                        {account.account_description && (
                          <div className="col-span-2">
                            <span className="text-gray-500">描述：</span>
                            <span className="text-gray-900">{account.account_description}</span>
                          </div>
                        )}
                        {account.is_default && (
                          <div className="col-span-2">
                            <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1 w-fit">
                              <Star className="w-3 h-3 fill-current" />
                              默认账号
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                  );
                })
            )}
          </div>
        </>
      )}

      {/* 服务器配置内容 */}
      {activeTab === 'server' && (
        <>
          {/* 工具栏 */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-100">
            <div className="flex flex-col md:flex-row gap-4 justify-between">
              {/* 搜索框 */}
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索主机/类型/描述..."
                    value={serverSearchTerm}
                    onChange={(e) => setServerSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg 
                    focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                    transition-all duration-200"
                  />
                </div>
              </div>

              {/* 筛选和操作 */}
              <div className="flex gap-3">
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  placeholder="全部项目"
                  value={selectedProjectForServer}
                  onChange={(value) => {
                    setSelectedProjectForServer(value);
                    // 这里可以根据项目筛选服务器配置
                    loadServers();
                  }}
                  className="w-72"
                  showSearch
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  allowClear
                  options={projects.map(p => ({
                    value: p.id,
                    label: `${p.name}${p.short_name ? ` (${p.short_name})` : ''}`
                  }))}
                  style={{ height: '40px' }}
                  popupMatchSelectWidth={false}
                  listHeight={300}
                />
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  placeholder="全部状态"
                  value={serverStatusFilter}
                  onChange={(value) => setServerStatusFilter(value)}
                  className="w-32"
                  showSearch
                  allowClear
                  options={[
                    { label: '全部状态', value: 'all' },
                    { label: '启用', value: 'active' },
                    { label: '禁用', value: 'inactive' }
                  ]}
                  style={{ height: '40px' }}
                  popupMatchSelectWidth={false}
                  listHeight={300}
                />

                <button
                  onClick={() => openCreateServerModal()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  新增服务器配置
                </button>
              </div>
            </div>
          </div>

          {/* 服务器列表 */}
          <div className="space-y-4">
            {serversLoading ? (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-500 border border-gray-100">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                加载中...
              </div>
            ) : servers.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
                <Server className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500 mb-4">暂无服务器配置</p>
                <button
                  onClick={() => openCreateServerModal()}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  创建第一个服务器配置
                </button>
              </div>
            ) : (
              servers
                .filter(server => !selectedProjectForServer || server.project_id === selectedProjectForServer)
                .filter((server) => {
                  const term = serverSearchTerm.trim().toLowerCase();
                  if (term && !(
                    includesIgnoreCase(server.host_name, term) ||
                    includesIgnoreCase(server.host_port, term) ||
                    includesIgnoreCase(server.server_type, term) ||
                    includesIgnoreCase(server.server_version, term) ||
                    includesIgnoreCase(server.description, term) ||
                    includesIgnoreCase(projects.find(p => p.id === server.project_id)?.name, term) ||
                    includesIgnoreCase(projects.find(p => p.id === server.project_id)?.short_name, term)
                  )) {
                    return false;
                  }
                  if (serverStatusFilter !== 'all' && server.status !== serverStatusFilter) {
                    return false;
                  }
                  return true;
                })
                .sort((a, b) => {
                  // 默认服务器排在前面
                  if (a.is_default && !b.is_default) return -1;
                  if (!a.is_default && b.is_default) return 1;
                  return 0;
                })
                .map((server) => {
                  const project = projects.find(p => p.id === server.project_id);
                  return (
                <div key={server.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div 
                    className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleServerExpand(server.id)}
                  >
                    <div className="flex items-center gap-4">
                      {/* 展开/收起图标 */}
                      <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                        {expandedServers.has(server.id) ? (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-500" />
                        )}
                      </button>
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                        <Server className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{server.host_name}</h3>
                          {project && (
                            <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                              {project.name}{project.short_name ? ` (${project.short_name})` : ''}
                            </span>
                          )}
                          <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            {server.server_type} {server.server_version}
                          </span>
                          <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                            {server.host_name}:{server.host_port}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            server.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {server.status === 'active' ? '启用' : '禁用'}
                          </span>
                          {server.is_default && (
                            <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1">
                              <Star className="w-3 h-3 fill-current" />
                              默认
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {server.description || '暂无描述'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {!server.is_default && (
                        <Tooltip title="设为默认">
                          <button
                            onClick={() => handleSetDefaultServer(server.project_id, server.id)}
                            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      )}
                      <Tooltip title="编辑">
                        <button
                          onClick={() => openEditServerModal(server)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </Tooltip>
                      <Tooltip title="删除">
                        <button
                          onClick={() => handleDeleteServer(server)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {/* 服务器详情（展开时显示） */}
                  {expandedServers.has(server.id) && (
                    <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">主机名称：</span>
                          <span className="text-gray-900 font-medium">{server.host_name}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">主机端口：</span>
                          <span className="text-gray-900 font-mono">{server.host_port}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">服务器类型：</span>
                          <span className="text-gray-900">{server.server_type}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">服务器版本：</span>
                          <span className="text-gray-900">{server.server_version}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">用户名：</span>
                          <span className="text-gray-900">{server.username}</span>
                        </div>
                        {project && (
                          <div>
                            <span className="text-gray-500">所属项目：</span>
                            <span className="text-gray-900">{project.name}{project.short_name ? ` (${project.short_name})` : ''}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">状态：</span>
                          <span className={`font-medium ${
                            server.status === 'active' ? 'text-green-600' : 'text-gray-600'
                          }`}>
                            {server.status === 'active' ? '启用' : '禁用'}
                          </span>
                        </div>
                        {server.description && (
                          <div className="col-span-2">
                            <span className="text-gray-500">描述：</span>
                            <span className="text-gray-900">{server.description}</span>
                          </div>
                        )}
                        {server.parameters && Object.keys(server.parameters).length > 0 && (
                          <div className="col-span-2">
                            <span className="text-gray-500">参数配置：</span>
                            <div className="mt-2 space-y-1">
                              {parametersToArray(server.parameters).map(([key, value], index) => (
                                <div key={`server-param-${index}`} className="text-xs bg-white px-2 py-1 rounded border border-gray-200">
                                  <span className="font-mono text-gray-700">{key}</span>
                                  <span className="text-gray-500 mx-2">:</span>
                                  <span className="text-gray-900">{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {server.is_default && (
                          <div className="col-span-2">
                            <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1 w-fit">
                              <Star className="w-3 h-3 fill-current" />
                              默认服务器
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                  );
                })
            )}
          </div>
        </>
      )}

      {/* 数据库配置内容 */}
      {activeTab === 'database' && (
        <>
          {/* 工具栏 */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-100">
            <div className="flex flex-col md:flex-row gap-4 justify-between">
              {/* 搜索框 */}
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索库名/类型/描述..."
                    value={databaseSearchTerm}
                    onChange={(e) => setDatabaseSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg 
                    focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                    transition-all duration-200"
                  />
                </div>
              </div>

              {/* 筛选和操作 */}
              <div className="flex gap-3">
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  placeholder="全部项目"
                  value={selectedProjectForDatabase}
                  onChange={(value) => {
                    setSelectedProjectForDatabase(value);
                    // 这里可以根据项目筛选数据库配置
                    loadDatabases();
                  }}
                  className="w-72"
                  showSearch
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  allowClear
                  options={projects.map(p => ({
                    value: p.id,
                    label: `${p.name}${p.short_name ? ` (${p.short_name})` : ''}`
                  }))}
                  style={{ height: '40px' }}
                  popupMatchSelectWidth={false}
                  listHeight={300}
                />
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  placeholder="全部状态"
                  value={databaseStatusFilter}
                  onChange={(value) => setDatabaseStatusFilter(value)}
                  className="w-32"
                  showSearch
                  allowClear
                  options={[
                    { label: '全部状态', value: 'all' },
                    { label: '启用', value: 'active' },
                    { label: '禁用', value: 'inactive' }
                  ]}
                  style={{ height: '40px' }}
                  popupMatchSelectWidth={false}
                  listHeight={300}
                />

                <button
                  onClick={() => openCreateDatabaseModal()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  新增数据库配置
                </button>
              </div>
            </div>
          </div>

          {/* 数据库列表 */}
          <div className="space-y-4">
            {databasesLoading ? (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-500 border border-gray-100">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                加载中...
              </div>
            ) : databases.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
                <Database className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500 mb-4">暂无数据库配置</p>
                <button
                  onClick={() => openCreateDatabaseModal()}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  创建第一个数据库配置
                </button>
              </div>
            ) : (
              databases
                .filter(database => !selectedProjectForDatabase || database.project_id === selectedProjectForDatabase)
                .filter((database) => {
                  const term = databaseSearchTerm.trim().toLowerCase();
                  if (term && !(
                    includesIgnoreCase(database.database_name, term) ||
                    includesIgnoreCase(database.database_type, term) ||
                    includesIgnoreCase(database.database_version, term) ||
                    includesIgnoreCase(database.database_driver, term) ||
                    includesIgnoreCase(database.database_schema, term) ||
                    includesIgnoreCase(database.database_port, term) ||
                    includesIgnoreCase(database.description, term) ||
                    includesIgnoreCase(projects.find(p => p.id === database.project_id)?.name, term) ||
                    includesIgnoreCase(projects.find(p => p.id === database.project_id)?.short_name, term)
                  )) {
                    return false;
                  }
                  if (databaseStatusFilter !== 'all' && database.status !== databaseStatusFilter) {
                    return false;
                  }
                  return true;
                })
                .sort((a, b) => {
                  // 默认数据库排在前面
                  if (a.is_default && !b.is_default) return -1;
                  if (!a.is_default && b.is_default) return 1;
                  return 0;
                })
                .map((database) => {
                  const project = projects.find(p => p.id === database.project_id);
                  return (
                <div key={database.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div 
                    className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleDatabaseExpand(database.id)}
                  >
                    <div className="flex items-center gap-4">
                      {/* 展开/收起图标 */}
                      <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                        {expandedDatabases.has(database.id) ? (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-500" />
                        )}
                      </button>
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
                        <Database className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{database.database_name}</h3>
                          {project && (
                            <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                              {project.name}{project.short_name ? ` (${project.short_name})` : ''}
                            </span>
                          )}
                          <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            {database.database_type} {database.database_version}
                          </span>
                          <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                            {database.database_name}:{database.database_port}/{database.database_schema}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            database.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {database.status === 'active' ? '启用' : '禁用'}
                          </span>
                          {database.is_default && (
                            <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1">
                              <Star className="w-3 h-3 fill-current" />
                              默认
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {database.description || '暂无描述'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {!database.is_default && (
                        <Tooltip title="设为默认">
                          <button
                            onClick={() => handleSetDefaultDatabase(database.project_id, database.id)}
                            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      )}
                      <Tooltip title="测试连接">
                        <button
                          onClick={() => handleTestDatabaseConnection(database.id)}
                          className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={databaseTesting.get(database.id)}
                        >
                          {databaseTesting.get(database.id) ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
                          ) : (
                            <Server className="w-4 h-4" />
                          )}
                        </button>
                      </Tooltip>
                      <Tooltip title="编辑">
                        <button
                          onClick={() => openEditDatabaseModal(database)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </Tooltip><Tooltip title="测试连接">
                        <button
                          onClick={() => handleTestDatabaseConnection(database.id)}
                          className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={databaseTesting.get(database.id)}
                        >
                          {databaseTesting.get(database.id) ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
                          ) : (
                            <Server className="w-4 h-4" />
                          )}
                        </button>
                      </Tooltip>
                      <Tooltip title="删除">
                        <button
                          onClick={() => handleDeleteDatabase(database)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {/* 数据库详情（展开时显示） */}
                  {expandedDatabases.has(database.id) && (
                    <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {project && (
                          <div>
                            <span className="text-gray-500">所属项目：</span>
                            <span className="text-gray-900 font-medium">{project.name}{project.short_name ? ` (${project.short_name})` : ''}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">数据库类型：</span>
                          <span className="text-gray-900 font-medium">{database.database_type}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">数据库版本：</span>
                          <span className="text-gray-900 font-medium">{database.database_version}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">数据库驱动：</span>
                          <span className="text-gray-900 font-mono text-xs">{database.database_driver}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">数据库名称：</span>
                          <span className="text-gray-900 font-medium">{database.database_name}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">数据库端口：</span>
                          <span className="text-gray-900 font-medium">{database.database_port}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">数据库/模式：</span>
                          <span className="text-gray-900 font-medium">{database.database_schema}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">用户名：</span>
                          <span className="text-gray-900 font-medium">{database.username}</span>
                        </div>
                        {database.connection_string && (
                          <div className="col-span-2">
                            <span className="text-gray-500">连接串：</span>
                            <code className="text-gray-900 font-medium text-xs break-all">{database.connection_string}</code>
                          </div>
                        )}
                        {/* {database.description && (
                          <div className="col-span-2">
                            <span className="text-gray-500">描述：</span>
                            <span className="text-gray-900 font-medium">{database.description || '暂无描述'}</span>
                          </div>
                        )} */}
                        <div>
                          <span className="text-gray-500">状态：</span>
                          <span className={`font-medium ${
                            database.status === 'active' ? 'text-green-600' : 'text-gray-600'
                          }`}>
                            {database.status === 'active' ? '启用' : '禁用'}
                          </span>
                        </div>
                        {database.parameters && Object.keys(database.parameters).length > 0 && (
                          <div className="col-span-2">
                            <span className="text-gray-500">参数配置：</span>
                            <div className="mt-2 space-y-1">
                              {parametersToArray(database.parameters).map(([key, value], index) => (
                                <div key={`database-param-${index}`} className="text-xs bg-white px-2 py-1 rounded border border-gray-200">
                                  <span className="font-mono text-gray-700">{key}</span>
                                  <span className="text-gray-500 mx-2">:</span>
                                  <span className="text-gray-900">{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* {database.is_default && (
                          <div className="col-span-2">
                            <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium flex items-center gap-1 w-fit">
                              <Star className="w-3 h-3 fill-current" />
                              默认数据库
                            </span>
                          </div>
                        )} */}
                      </div>
                    </div>
                  )}
                </div>
                  );
                })
            )}
          </div>
        </>
      )}

      {/* 创建/编辑项目弹窗 */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  {projectModalMode === 'create' ? '新建项目' : '编辑项目'}
                </h2>
              </div>
              <button
                onClick={closeProjectModal}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProjectSubmit} className="p-6 space-y-5 overflow-y-auto">
              {/* 项目名称和简称 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    项目名称 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={projectFormData.name}
                    onChange={(e) => setProjectFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="如：电商系统"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    项目简称 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={projectFormData.short_name}
                    onChange={(e) => setProjectFormData(prev => ({ 
                      ...prev, 
                      short_name: e.target.value.toUpperCase()  // 自动转大写
                    }))}
                    placeholder="如：AAS（大写字母）"
                    size="large"
                    maxLength={20}
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  项目描述
                </label>
                <Input.TextArea
                  value={projectFormData.description || ''}
                  onChange={(e) => setProjectFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="项目的详细描述（选填）"
                  rows={2}
                  style={{ fontSize: '14px' }}
                />
              </div>

              {/* 状态和排序 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    状态
                  </label>
                  <Select
                    suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                    value={projectFormData.status}
                    onChange={(value) => setProjectFormData(prev => ({ ...prev, status: value as any }))}
                    className="w-full"
                    size="large"
                    placeholder="请选择状态"
                    showSearch
                    allowClear
                    options={[
                      { label: '启用', value: 'active' },
                      { label: '禁用', value: 'inactive' }
                    ]}
                    style={{ fontSize: '14px' }}
                    popupMatchSelectWidth={false}
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    排序号
                  </label>
                  <Input
                    type="number"
                    value={projectFormData.sort_order}
                    onChange={(e) => setProjectFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                    placeholder="数字越小越靠前"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
              </div>

              {/* 初始版本（仅新建时显示） */}
              {projectModalMode === 'create' && (
                <div className="border-t border-gray-100 pt-4 mt-5">
                  <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-indigo-600" />
                    初始版本（主线版本）
                  </h3>
                  <div className="space-y-4 bg-gray-50 rounded-xl p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-base font-medium text-gray-700 mb-2">
                          版本名称 <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={projectFormData.initial_version_name}
                          onChange={(e) => setProjectFormData(prev => ({ ...prev, initial_version_name: e.target.value }))}
                          placeholder="如：主线版本"
                          size="large"
                          style={{ fontSize: '14px', height: '40px' }}
                        />
                      </div>
                      <div>
                        <label className="block text-base font-medium text-gray-700 mb-2">
                          版本号 <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={projectFormData.initial_version_code}
                          onChange={(e) => setProjectFormData(prev => ({ ...prev, initial_version_code: e.target.value }))}
                          placeholder="如：v1.0.0"
                          size="large"
                          style={{ fontSize: '14px', height: '40px' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-base font-medium text-gray-700 mb-2">
                        版本描述
                      </label>
                      <Input.TextArea
                        value={projectFormData.initial_version_desc}
                        onChange={(e) => setProjectFormData(prev => ({ ...prev, initial_version_desc: e.target.value }))}
                        placeholder="版本描述（选填）"
                        rows={2}
                        style={{ fontSize: '14px' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 提交按钮 */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeProjectModal}
                  className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {submitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 创建/编辑版本弹窗 */}
      {showVersionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="rounded-t-2xl px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-green-50 to-teal-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center">
                  <GitBranch className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  {versionModalMode === 'create' ? '添加版本' : '编辑版本'}
                </h2>
              </div>
              <button
                onClick={closeVersionModal}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVersionSubmit} className="p-6 space-y-5">
              {/* 所属项目（仅创建时显示） */}
              {versionModalMode === 'create' && (
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    所属项目 <span className="text-red-500">*</span>
                  </label>
                  <Select
                    suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                    value={currentProjectId}
                    onChange={(value) => setCurrentProjectId(value)}
                    className="w-full"
                    size="large"
                    placeholder="请选择项目"
                    showSearch
                    allowClear
                    optionFilterProp="children"
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={projects.map(p => ({
                      value: p.id,
                      label: `${p.name}${p.short_name ? ` (${p.short_name})` : ''}`
                    }))}
                    style={{ fontSize: '14px' }}
                    popupMatchSelectWidth={false}
                  />
                </div>
              )}

              {/* 版本名称和版本号 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    版本名称 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={versionFormData.version_name}
                    onChange={(e) => setVersionFormData(prev => ({ ...prev, version_name: e.target.value }))}
                    placeholder="如：需求迭代v2"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    版本号 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={versionFormData.version_code}
                    onChange={(e) => setVersionFormData(prev => ({ ...prev, version_code: e.target.value }))}
                    placeholder="如：v2.0.0"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  版本描述
                </label>
                <Input.TextArea
                  value={versionFormData.description || ''}
                  onChange={(e) => setVersionFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="版本的详细描述（选填）"
                  rows={2}
                  style={{ fontSize: '14px' }}
                />
              </div>

              {/* 发布日期和状态 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    发布日期
                  </label>
                  <DatePicker
                    value={versionFormData.release_date ? dayjs(versionFormData.release_date) : null}
                    onChange={(date) => setVersionFormData(prev => ({ 
                      ...prev, 
                      release_date: date ? date.format('YYYY-MM-DD') : null 
                    }))}
                    placeholder="选择日期"
                    className="w-full"
                    style={{ fontSize: '14px', height: '40px' }}
                    size="large"
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    状态
                  </label>
                  <Select
                    suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                    value={versionFormData.status}
                    onChange={(value) => setVersionFormData(prev => ({ ...prev, status: value as any }))}
                    className="w-full"
                    size="large"
                    placeholder="请选择状态"
                    showSearch
                    allowClear
                    options={[
                      { label: '启用', value: 'active' },
                      { label: '禁用', value: 'inactive' }
                    ]}
                    style={{ fontSize: '14px' }}
                    popupMatchSelectWidth={false}
                  />
                </div>
              </div>

              {/* 主线版本开关 */}
              {versionModalMode === 'create' && (
                <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl">
                  <div>
                    <div className="font-medium text-gray-900">设为主线版本</div>
                    <div className="text-sm text-gray-500">每个项目只能有一个主线版本</div>
                  </div>
                  <Switch
                    checked={versionFormData.is_main}
                    onChange={(checked) => setVersionFormData(prev => ({ ...prev, is_main: checked }))}
                  />
                </div>
              )}

              {/* 提交按钮 */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeVersionModal}
                  className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {submitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 创建/编辑账号配置弹窗 */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="rounded-t-2xl px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  {accountModalMode === 'create' ? '新增账号配置' : '修改账号配置'}
                </h2>
              </div>
              <button
                onClick={closeAccountModal}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAccountSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  所属项目 <span className="text-red-500">*</span>
                </label>
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  value={accountFormData.project_id}
                  onChange={(value) => setAccountFormData(prev => ({ ...prev, project_id: value }))}
                  className="w-full"
                  size="large"
                  placeholder="请选择项目"
                  showSearch
                  allowClear
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  disabled={accountModalMode === 'edit'}
                  options={projects.map(p => ({
                    value: p.id,
                    label: `${p.name}${p.short_name ? ` (${p.short_name})` : ''}`
                  }))}
                  style={{ fontSize: '14px' }}
                  popupMatchSelectWidth={false}
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  账号类型 <span className="text-red-500">*</span>
                </label>
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  value={accountFormData.account_type}
                  onChange={(value) => setAccountFormData(prev => ({ ...prev, account_type: value }))}
                  className="w-full"
                  size="large"
                  placeholder="请选择账号类型"
                  showSearch
                  allowClear
                  options={[
                    { label: '管理员账号', value: 'admin' },
                    { label: '安全员账号', value: 'security' },
                    { label: '审核员账号', value: 'auditor' }
                  ]}
                  style={{ fontSize: '14px' }}
                  popupMatchSelectWidth={false}
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  账号名称 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={accountFormData.account_name}
                  onChange={(e) => setAccountFormData(prev => ({ ...prev, account_name: e.target.value }))}
                  placeholder="请输入账号名称"
                  size="large"
                  style={{ fontSize: '14px', height: '40px' }}
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  账号密码 <span className="text-red-500">*</span>
                </label>
                <Input.Password
                  value={accountFormData.account_password}
                  onChange={(e) => setAccountFormData(prev => ({ ...prev, account_password: e.target.value }))}
                  placeholder="请输入账号密码"
                  size="large"
                  style={{ fontSize: '14px', height: '40px' }}
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  账号描述
                </label>
                <Input.TextArea
                  value={accountFormData.account_description || ''}
                  onChange={(e) => setAccountFormData(prev => ({ ...prev, account_description: e.target.value }))}
                  placeholder="请输入"
                  rows={2}
                  style={{ fontSize: '14px' }}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="font-medium text-gray-900">启用状态</div>
                </div>
                <Switch
                  checked={accountFormData.status === 'active'}
                  onChange={(checked) => setAccountFormData(prev => ({ ...prev, status: checked ? 'active' : 'inactive' }))}
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeAccountModal}
                  className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {submitting ? '保存中...' : accountModalMode === 'create' ? '立即创建' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 创建/编辑服务器配置弹窗 */}
      {showServerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`bg-white rounded-2xl shadow-2xl ${serverModalMaximized ? 'w-full h-full max-w-full max-h-full' : 'max-w-4xl w-full max-h-[90vh]'} overflow-hidden`}>
            <div className="rounded-t-2xl px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center">
                  <Server className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  {serverModalMode === 'create' ? '新增服务器配置' : '修改服务器配置'}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setServerModalMaximized(!serverModalMaximized)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
                >
                  {serverModalMaximized ? <Minus className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
                <button
                  onClick={closeServerModal}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleServerSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  所属项目 <span className="text-red-500">*</span>
                </label>
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  value={serverFormData.project_id}
                  onChange={(value) => setServerFormData(prev => ({ ...prev, project_id: value }))}
                  className="w-full"
                  size="large"
                  placeholder="请选择项目"
                  showSearch
                  allowClear
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  disabled={serverModalMode === 'edit'}
                  options={projects.map(p => ({
                    value: p.id,
                    label: `${p.name}${p.short_name ? ` (${p.short_name})` : ''}`
                  }))}
                  style={{ fontSize: '14px' }}
                  popupMatchSelectWidth={false}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    服务器类型 <span className="text-red-500">*</span>
                  </label>
                  <Select
                    suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                    value={serverFormData.server_type || undefined}
                    onChange={(value) => {
                      const option = SERVER_TYPE_OPTIONS.find(o => o.value === value);
                      setServerFormData(prev => {
                        const next = { ...prev, server_type: value };
                        if (option) {
                          // 自动填充默认值（只在字段为空时填充）
                          next.server_version = option.defaultVersion || '';
                          next.host_port = option.defaultPort || prev.host_port;
                          next.username = option.defaultUsername || '';
                        }
                        return next;
                      });
                    }}
                    placeholder="请选择服务器类型"
                    size="large"
                    className="w-full"
                    showSearch
                    allowClear
                    options={SERVER_TYPE_OPTIONS.map(opt => ({
                      label: opt.label,
                      value: opt.value
                    }))}
                    style={{ fontSize: '14px' }}
                    popupMatchSelectWidth={false}
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    服务器版本 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={serverFormData.server_version}
                    onChange={(e) => setServerFormData(prev => ({ ...prev, server_version: e.target.value }))}
                    placeholder="如：CentOS 7.9.2009"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    主机名称 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={serverFormData.host_name}
                    onChange={(e) => setServerFormData(prev => ({ ...prev, host_name: e.target.value }))}
                    placeholder="如：172.19.5.45"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    主机端口 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    value={serverFormData.host_port}
                    onChange={(e) => setServerFormData(prev => ({ ...prev, host_port: parseInt(e.target.value) || 22 }))}
                    placeholder="如：22"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    用户名 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={serverFormData.username}
                    onChange={(e) => setServerFormData(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="如：root"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    密码 <span className="text-red-500">*</span>
                  </label>
                  <Input.Password
                    value={serverFormData.password}
                    onChange={(e) => setServerFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="请输入密码"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  描述
                </label>
                <Input.TextArea
                  value={serverFormData.description || ''}
                  onChange={(e) => setServerFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="服务器的详细描述（选填）"
                  rows={2}
                  style={{ fontSize: '14px' }}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="font-medium text-gray-900">启用状态</div>
                </div>
                <Switch
                  checked={serverFormData.status === 'active'}
                  onChange={(checked) => setServerFormData(prev => ({ ...prev, status: checked ? 'active' : 'inactive' }))}
                />
              </div>

              {/* 参数配置 */}
              <div className="border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-900">参数配置</h3>
                  <button
                    type="button"
                    onClick={addServerParameter}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    添加参数
                  </button>
                </div>
                <div className="space-y-3">
                  {/* 🔥 按数组顺序显示参数，新添加的在最下面 */}
                  {serverFormData.parameters.map((param, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={param.key}
                        onChange={(e) => updateServerParameter(index, 'key', e.target.value)}
                        placeholder="请输入参数名"
                        className="w-[20%]"
                        size="large"
                        style={{ fontSize: '14px', height: '40px' }}
                      />
                      <Input
                        value={param.value}
                        onChange={(e) => updateServerParameter(index, 'value', e.target.value)}
                        placeholder="请输入参数值"
                        className="w-[80%]"
                        size="large"
                        style={{ fontSize: '14px', height: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => removeServerParameter(index)}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {serverFormData.parameters.length === 0 && (
                    <div className="text-sm text-gray-400 text-center py-4">
                      暂无参数，点击"添加参数"按钮添加
                    </div>
                  )}
                </div>
              </div>
              
              {/* 连接测试说明 */}
              <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg mb-4">
                <div className="font-medium text-blue-700 mb-1">💡 连接测试说明：</div>
                <div className="space-y-1">
                  <div>• <strong>Windows (端口3389)</strong>: 测试RDP端口连通性</div>
                  <div>• <strong>Linux/Unix (端口22)</strong>: 测试SSH连接和认证</div>
                  <div>• <strong>其他端口</strong>: 测试TCP端口连通性</div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeServerModal}
                  className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  取消
                </button>
                {serverModalMode === 'create' && serverFormData.host_name && serverFormData.username && serverFormData.password && (
                  <button
                    type="button"
                    onClick={() => {
                      // 创建临时ID用于测试
                      const tempId = -1;
                      handleTestServerConnection(tempId);
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={submitting || serverTesting.get(-1)}
                  >
                    {serverTesting.get(-1) ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
                        测试中...
                      </>
                    ) : (
                      '测试连接'
                    )}
                  </button>
                )}
                {serverModalMode === 'edit' && editingServerId && (
                  <button
                    type="button"
                    onClick={() => handleTestServerConnection(editingServerId)}
                    className="flex items-center gap-2 px-6 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={submitting || serverTesting.get(editingServerId)}
                  >
                    {serverTesting.get(editingServerId) ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
                        测试中...
                      </>
                    ) : (
                      '测试连接'
                    )}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {submitting ? '保存中...' : '确定'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 创建/编辑数据库配置弹窗 */}
      {showDatabaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`bg-white rounded-2xl shadow-2xl ${databaseModalMaximized ? 'w-full h-full max-w-full max-h-full' : 'max-w-4xl w-full max-h-[90vh]'} overflow-hidden`}>
            <div className="rounded-t-2xl px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-teal-50 to-cyan-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center">
                  <Database className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  {databaseModalMode === 'create' ? '新增数据库配置' : '修改数据库配置'}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDatabaseModalMaximized(!databaseModalMaximized)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
                >
                  {databaseModalMaximized ? <Minus className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
                <button
                  onClick={closeDatabaseModal}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleDatabaseSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  所属项目 <span className="text-red-500">*</span>
                </label>
                <Select
                  suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                  value={databaseFormData.project_id}
                  onChange={(value) => setDatabaseFormData(prev => ({ ...prev, project_id: value }))}
                  className="w-full"
                  size="large"
                  placeholder="请选择项目"
                  showSearch
                  allowClear
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  disabled={databaseModalMode === 'edit'}
                  options={projects.map(p => ({
                    value: p.id,
                    label: `${p.name}${p.short_name ? ` (${p.short_name})` : ''}`
                  }))}
                  style={{ fontSize: '14px' }}
                  popupMatchSelectWidth={false}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    数据库类型 <span className="text-red-500">*</span>
                  </label>
                  <Select
                    suffixIcon={<ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-all" style={{ marginTop: '-0px' }} />}
                    value={databaseFormData.database_type || undefined}
                    onChange={(value) => {
                      const option = DATABASE_TYPE_OPTIONS.find(o => o.value === value);
                      setDatabaseFormData(prev => {
                        const next = { ...prev, database_type: value };
                        if (option) {
                          // 🆕 自动填充所有默认值（只在字段为空时填充）
                          const isEmptyPort = !prev.database_port || prev.database_port === INITIAL_DATABASE_FORM.database_port;
                          const isEmptyDriver = !prev.database_driver || prev.database_driver === '';
                          const isEmptyVersion = !prev.database_version || prev.database_version === '';
                          const isEmptyName = !prev.database_name || prev.database_name === '';
                          const isEmptySchema = !prev.database_schema || prev.database_schema === '';
                          
                          // if (isEmptyPort) {
                          //   next.database_port = option.defaultPort || prev.database_port;
                          // }
                          // if (isEmptyDriver) {
                          //   next.database_driver = option.defaultDriver || '';
                          // }
                          // if (isEmptyVersion) {
                          //   next.database_version = option.defaultVersion || '';
                          // }
                          // if (isEmptyName) {
                          //   next.database_name = option.defaultHost || '';
                          // }
                          // if (isEmptySchema) {
                          //   next.database_schema = option.defaultSchema || '';
                          // }
                          next.database_version = option.defaultVersion || '';
                          next.database_driver = option.defaultDriver || '';
                          next.database_port = option.defaultPort || prev.database_port;
                          next.database_name = option.defaultHost || '';
                          next.database_schema = option.defaultSchema || '';

                          // 🆕 使用模板自动生成连接字符串
                          if (option.connectionTemplate) {
                            const host = next.database_name || option.defaultHost || 'localhost';
                            const port = next.database_port || option.defaultPort || 0;
                            const schema = next.database_schema || option.defaultSchema || '';
                            next.connection_string = buildConnectionStringFromTemplate(
                              option.connectionTemplate,
                              host,
                              port,
                              schema
                            );
                          }
                        }
                        return next;
                      });
                    }}
                    placeholder="请选择数据库类型"
                    size="large"
                    className="w-full"
                    showSearch
                    allowClear
                    options={DATABASE_TYPE_OPTIONS.map(opt => ({
                      label: opt.label,
                      value: opt.value
                    }))}
                    style={{ fontSize: '14px' }}
                    popupMatchSelectWidth={false}
                  />
                  {/* <div className="text-xs text-gray-500 mt-1">
                    💡 选择数据库类型后将自动填充默认配置和连接字符串
                  </div> */}
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    数据库版本 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={databaseFormData.database_version}
                    onChange={(e) => setDatabaseFormData(prev => {
                      const next = { ...prev, database_version: e.target.value };
                      // 🆕 使用模板重新生成连接字符串
                      const option = DATABASE_TYPE_OPTIONS.find(o => o.value === prev.database_type);
                      if (option?.connectionTemplate) {
                        const host = prev.database_name || option.defaultHost || 'localhost';
                        const port = prev.database_port || option.defaultPort || 0;
                        const schema = prev.database_schema || option.defaultSchema || '';
                        next.connection_string = buildConnectionStringFromTemplate(
                          option.connectionTemplate,
                          host,
                          port,
                          schema
                        );
                      } else {
                        // 回退到原有逻辑
                        next.connection_string = buildConnectionString(next);
                      }
                      return next;
                    })}
                    placeholder="如：MySQL 5.7.38"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
              </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    数据库驱动 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={databaseFormData.database_driver}
                    onChange={(e) => setDatabaseFormData(prev => {
                      const next = { ...prev, database_driver: e.target.value };
                      // 🆕 使用模板重新生成连接字符串
                      const option = DATABASE_TYPE_OPTIONS.find(o => o.value === prev.database_type);
                      if (option?.connectionTemplate) {
                        const host = prev.database_name || option.defaultHost || 'localhost';
                        const port = prev.database_port || option.defaultPort || 0;
                        const schema = prev.database_schema || option.defaultSchema || '';
                        next.connection_string = buildConnectionStringFromTemplate(
                          option.connectionTemplate,
                          host,
                          port,
                          schema
                        );
                      } else {
                        // 回退到原有逻辑
                        next.connection_string = buildConnectionString(next);
                      }
                      return next;
                    })}
                    placeholder="如：com.mysql.cj.jdbc.Driver"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    数据库名称 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={databaseFormData.database_name}
                    onChange={(e) => setDatabaseFormData(prev => {
                      const next = { ...prev, database_name: e.target.value };
                      // 🆕 使用模板重新生成连接字符串
                      const option = DATABASE_TYPE_OPTIONS.find(o => o.value === prev.database_type);
                      if (option?.connectionTemplate) {
                        const host = e.target.value || option.defaultHost || 'localhost';
                        const port = prev.database_port || option.defaultPort || 0;
                        const schema = prev.database_schema || option.defaultSchema || '';
                        next.connection_string = buildConnectionStringFromTemplate(
                          option.connectionTemplate,
                          host,
                          port,
                          schema
                        );
                      } else {
                        // 回退到原有逻辑
                        next.connection_string = buildConnectionString(next);
                      }
                      return next;
                    })}
                    placeholder="如：172.19.5.45"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    数据库端口 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    value={databaseFormData.database_port}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      setDatabaseFormData(prev => {
                        const next = { ...prev, database_port: Number.isNaN(value) ? prev.database_port : value };
                        // 🆕 使用模板重新生成连接字符串
                        const option = DATABASE_TYPE_OPTIONS.find(o => o.value === prev.database_type);
                        if (option?.connectionTemplate) {
                          const host = prev.database_name || option.defaultHost || 'localhost';
                          const port = Number.isNaN(value) ? prev.database_port : value;
                          const schema = prev.database_schema || option.defaultSchema || '';
                          next.connection_string = buildConnectionStringFromTemplate(
                            option.connectionTemplate,
                            host,
                            port,
                            schema
                          );
                        } else {
                          // 回退到原有逻辑
                          next.connection_string = buildConnectionString(next);
                        }
                        return next;
                      });
                    }}
                    placeholder="如：3306"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  数据库/模式 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={databaseFormData.database_schema}
                  onChange={(e) => setDatabaseFormData(prev => {
                    const next = { ...prev, database_schema: e.target.value };
                    // 🆕 使用模板重新生成连接字符串
                    const option = DATABASE_TYPE_OPTIONS.find(o => o.value === prev.database_type);
                    if (option?.connectionTemplate) {
                      const host = prev.database_name || option.defaultHost || 'localhost';
                      const port = prev.database_port || option.defaultPort || 0;
                      const schema = e.target.value || option.defaultSchema || '';
                      next.connection_string = buildConnectionStringFromTemplate(
                        option.connectionTemplate,
                        host,
                        port,
                        schema
                      );
                    } else {
                      // 回退到原有逻辑
                      next.connection_string = buildConnectionString(next);
                    }
                    return next;
                  })}
                  placeholder="如：bs_audit"
                  size="large"
                  style={{ fontSize: '14px', height: '40px' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    用户名 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={databaseFormData.username}
                    onChange={(e) => setDatabaseFormData(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="如：root"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    密码 <span className="text-red-500">*</span>
                  </label>
                  <Input.Password
                    value={databaseFormData.password}
                    onChange={(e) => setDatabaseFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="请输入密码"
                    size="large"
                    style={{ fontSize: '14px', height: '40px' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  数据库连接串 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={databaseFormData.connection_string}
                  onChange={(e) => setDatabaseFormData(prev => ({ ...prev, connection_string: e.target.value }))}
                  placeholder="如：jdbc:mysql://172.19.5.45:3306/bs_audit"
                  size="large"
                  style={{ fontSize: '14px', height: '40px' }}
                />
                <div className="text-xs text-gray-500 mt-1">
                  💡 修改主机名、端口或数据库/模式时会自动更新连接字符串
                </div>
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  数据库描述
                </label>
                <Input.TextArea
                  value={databaseFormData.description || ''}
                  onChange={(e) => setDatabaseFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="数据库的详细描述（选填）"
                  rows={2}
                  style={{ fontSize: '14px' }}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="font-medium text-gray-900">启用状态</div>
                </div>
                <Switch
                  checked={databaseFormData.status === 'active'}
                  onChange={(checked) => setDatabaseFormData(prev => ({ ...prev, status: checked ? 'active' : 'inactive' }))}
                />
              </div>

              {/* 参数配置 */}
              <div className="border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-900">参数配置</h3>
                  <button
                    type="button"
                    onClick={addDatabaseParameter}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    添加参数
                  </button>
                </div>
                <div className="space-y-3">
                  {/* 🔥 按数组顺序显示参数，新添加的在最下面 */}
                  {databaseFormData.parameters.map((param, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={param.key}
                        onChange={(e) => updateDatabaseParameter(index, 'key', e.target.value)}
                        placeholder="请输入参数名"
                        className="w-[20%]"
                        size="large"
                        style={{ fontSize: '14px', height: '40px' }}
                      />
                      <Input
                        value={param.value}
                        onChange={(e) => updateDatabaseParameter(index, 'value', e.target.value)}
                        placeholder="请输入参数值"
                        className="w-[80%]"
                        size="large"
                        style={{ fontSize: '14px', height: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => removeDatabaseParameter(index)}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {databaseFormData.parameters.length === 0 && (
                    <div className="text-sm text-gray-400 text-center py-4">
                      暂无参数，点击"添加参数"按钮添加
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeDatabaseModal}
                  className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  取消
                </button>
                {databaseModalMode === 'create' && databaseFormData.database_name && databaseFormData.username && databaseFormData.password && (
                  <button
                    type="button"
                    onClick={() => {
                      // 创建临时ID用于测试
                      const tempId = -1;
                      handleTestDatabaseConnection(tempId);
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={submitting || databaseTesting.get(-1)}
                  >
                    {databaseTesting.get(-1) ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
                        测试中...
                      </>
                    ) : (
                      '测试连接'
                    )}
                  </button>
                )}
                {databaseModalMode === 'edit' && editingDatabaseId && (
                  <button
                    type="button"
                    onClick={() => handleTestDatabaseConnection(editingDatabaseId)}
                    className="flex items-center gap-2 px-6 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={submitting || databaseTesting.get(editingDatabaseId)}
                  >
                    {databaseTesting.get(editingDatabaseId) ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
                        测试中...
                      </>
                    ) : (
                      '测试连接'
                    )}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {submitting ? '保存中...' : '确定'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
