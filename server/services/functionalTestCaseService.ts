import { PrismaClient, Prisma } from '../../src/generated/prisma/index.js';
import { DatabaseService } from './databaseService.js';
import { getNow } from '../utils/timezone.js';
import { ConfigVariableService } from './configVariableService.js';

/**
 * 🔧 从【操作】【预期】格式中分离纯操作步骤和预期结果
 * 输入格式：
 * 1. 【操作】打开登录页面
 *    【预期】页面正常加载
 * 2. 【操作】输入用户名
 *    【预期】输入框接收输入
 * 
 * 输出：
 * - steps: "1. 打开登录页面\n2. 输入用户名"
 * - expectedResult: "1. 页面正常加载\n2. 输入框接收输入"
 */
function separateStepsAndExpectedResult(combinedSteps: string): { steps: string; expectedResult: string } {
  if (!combinedSteps || !combinedSteps.trim()) {
    return { steps: '', expectedResult: '' };
  }

  // 如果不包含【操作】【预期】格式，直接返回原样
  if (!combinedSteps.includes('【操作】')) {
    return { steps: combinedSteps, expectedResult: '' };
  }

  const stepsList: string[] = [];
  const expectedList: string[] = [];

  // 🔧 改进：按步骤分割（匹配 "数字. 【操作】" 开头的模式）
  // 使用更精确的分割方式，避免丢失步骤
  const stepBlocks = combinedSteps.split(/(?=\d+\.\s*【操作】)/);
  
  stepBlocks.forEach((block) => {
    if (!block.trim()) return;
    
    // 🔧 改进：提取步骤编号和操作内容
    // 使用更宽松的匹配，直到遇到【预期】或下一个步骤
    const operationMatch = block.match(/(\d+)\.\s*【操作】([\s\S]*?)(?=【预期】|$)/);
    if (operationMatch) {
      const stepNum = operationMatch[1];
      // 🔧 清理操作内容：移除多余的换行和空格，但保留有意义的内容
      const operation = operationMatch[2]
        .split('\n')
        .map(line => line.trim())
        // .filter(line => line && !line.startsWith('密码：') && !line.startsWith('{{CONFIG'))  // 🔥 过滤掉配置变量相关的行
        .join(' ')
        .trim();
      
      if (operation) {
        stepsList.push(`${stepNum}. ${operation}`);
      }
      
      // 🔧 改进：提取预期结果
      const expectedMatch = block.match(/【预期】([\s\S]*?)(?=\d+\.\s*【操作】|$)/);
      if (expectedMatch) {
        // 🔧 清理预期结果：移除多余的换行和空格
        const expected = expectedMatch[1]
          .split('\n')
          .map(line => line.trim())
          // .filter(line => line && !line.startsWith('密码：') && !line.startsWith('{{CONFIG'))  // 🔥 过滤掉配置变量相关的行
          .join(' ')
          .trim();
        
        if (expected) {
          expectedList.push(`${stepNum}. ${expected}`);
        }
      }
    }
  });

  return {
    steps: stepsList.join('\n'),
    expectedResult: expectedList.join('\n')
  };
}

/**
 * 列表查询参数
 */
export interface ListParams {
  page: number;
  pageSize: number;
  search?: string;
  tag?: string;
  priority?: string;
  status?: string;
  system?: string;
  module?: string;
  source?: string;
  sectionName?: string;
  createdBy?: string;
  startDate?: string;
  endDate?: string;
  riskLevel?: string;
  projectVersion?: string;  // 🆕 项目版本筛选
  caseType?: string;  // 🆕 用例类型筛选
  executionStatus?: string;  // 🆕 执行结果筛选
  userDepartment?: string;
  isSuperAdmin?: boolean;
}

/**
 * 批量保存参数
 */
export interface BatchSaveParams {
  testCases: any[];
  aiSessionId: string;
  userId: number;
}

/**
 * 功能测试用例服务
 * 提供功能测试用例的CRUD操作
 */
export class FunctionalTestCaseService {
  private prisma: PrismaClient;
  private configVariableService: ConfigVariableService;

  constructor() {
    this.prisma = DatabaseService.getInstance().getClient();
    this.configVariableService = new ConfigVariableService();
  }

  /**
   * 获取功能测试用例列表（分页）
   */
  async getList(params: ListParams) {
    const {
      page,
      pageSize,
      search,
      tag,
      priority,
      status,
      system,
      module,
      source,
      userDepartment,
      isSuperAdmin
    } = params;

    // 构建查询条件
    const where: any = {
      deleted_at: null  // 🆕 软删除过滤：只查询未删除的记录
    };

    // 搜索条件
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } }
      ];
    }

    // 筛选条件
    if (system) where.system = system;
    if (module) where.module = module;
    if (priority) where.priority = priority;
    if (status) where.status = status;
    if (source) where.source = source;

    // 标签筛选
    if (tag) {
      where.tags = { contains: tag };
    }

    // 数据隔离：非超级管理员只能看到本项目数据
    if (!isSuperAdmin && userDepartment) {
      where.users = { project: userDepartment }; // 🔥 修复：使用 project 字段
    }

    try {
      console.log('📊 查询条件:', JSON.stringify(where, null, 2));
      console.log('👤 用户信息 - 部门:', userDepartment, '超级管理员:', isSuperAdmin);

      // 分页查询
      const [data, total] = await Promise.all([
        this.prisma.functional_test_cases.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { created_at: 'desc' },
          include: {
            users: {
              select: {
                username: true,
                project: true, // 🔥 修复：使用 project 字段
                account_name: true
              }
            },
            project_version: {
              select: {
                id: true,
                version_name: true,
                version_code: true,
                is_main: true
              }
            }
          }
        }),
        this.prisma.functional_test_cases.count({ where })
      ]);

      console.log(`✅ 查询结果: 找到 ${total} 条记录，返回 ${data.length} 条`);
      return { data, total };
    } catch (error: any) {
      console.error('❌ 查询功能测试用例失败:', error);
      throw new Error(`查询功能测试用例失败: ${error.message}`);
    }
  }

  /**
   * 获取功能测试用例平铺列表（以测试点为维度展示）
   * 每个测试点占据一行，一个测试用例如果有12个测试点就会展示12行
   * 新版：直接从 functional_test_points 表查询
   */
  async getFlatList(params: ListParams) {
    const {
      page,
      pageSize,
      search,
      tag,
      priority,
      status,
      system,
      module,
      source,
      sectionName,
      createdBy,
      startDate,
      endDate,
      riskLevel,
      projectVersion,  // 🆕 项目版本筛选
      caseType,  // 🆕 用例类型筛选
      executionStatus,  // 🆕 执行结果筛选
      userDepartment,
      isSuperAdmin
    } = params;

    // 构建测试用例查询条件
    const caseWhere: any = {
      deleted_at: null  // 🆕 软删除过滤：只查询未删除的记录
    };

    // 🆕 搜索条件：支持所有列的模糊搜索
    if (search) {
      const searchConditions: any[] = [
        { name: { contains: search } },              // 用例名称
        { description: { contains: search } },       // 描述
        { test_point_name: { contains: search } },   // 测试点名称
        { test_purpose: { contains: search } },      // 测试目的
        { scenario_name: { contains: search } },     // 🔧 测试场景名称
        { section_name: { contains: search } },      // 需求章节名称（兼容）
        { system: { contains: search } },            // 系统
        { module: { contains: search } },            // 模块
        { tags: { contains: search } },              // 标签
        { steps: { contains: search } },             // 测试步骤
        { expected_result: { contains: search } },   // 预期结果
        { users: { username: { contains: search } } } // 创建人
      ];

      // 🆕 支持搜索用例ID（支持 TC_00001、00001、1 等格式）
      let searchId: number | null = null;
      const searchTrimmed = search.trim().toUpperCase();
      
      // 处理 TC_00001 格式
      if (searchTrimmed.startsWith('TC_')) {
        const idPart = searchTrimmed.replace('TC_', '');
        searchId = parseInt(idPart, 10);
      } else {
        // 尝试直接解析为数字
        searchId = parseInt(search, 10);
      }
      
      if (!isNaN(searchId!) && searchId! > 0) {
        searchConditions.push({ id: searchId });
      }

      caseWhere.OR = searchConditions;
    }

    // 精确筛选条件
    if (system) caseWhere.system = system;
    if (module) caseWhere.module = module;
    if (priority) caseWhere.priority = priority;
    if (status) caseWhere.status = status;
    if (source) caseWhere.source = source;
    if (sectionName) {
      // 🔧 同时搜索scenario_name和section_name（兼容新旧数据）
      caseWhere.OR = [
        ...(caseWhere.OR || []),
        { scenario_name: { contains: sectionName } },
        { section_name: { contains: sectionName } }
      ];
    }
    if (riskLevel) caseWhere.risk_level = riskLevel;
    
    // 🆕 项目版本筛选
    if (projectVersion) {
      caseWhere.project_version = {
        version_code: projectVersion
      };
    }

    // 🆕 用例类型筛选
    if (caseType) {
      caseWhere.case_type = caseType;
    }

    // 🔔 执行结果筛选 - 注意：这个条件将在查询后通过最新执行记录进行过滤
    // 因为 execution_status 需要从关联的 executions 表中的最新记录获取

    if (tag) {
      caseWhere.tags = { contains: tag };
    }

    // 创建人筛选
    if (createdBy) {
      // 如果已有 OR 条件（搜索），需要用 AND 组合
      if (caseWhere.OR) {
        caseWhere.AND = [
          { OR: caseWhere.OR },
          { users: { username: { contains: createdBy } } }
        ];
        delete caseWhere.OR;
      } else {
        caseWhere.users = { username: { contains: createdBy } };
      }
    }

    // 创建时间范围筛选
    if (startDate || endDate) {
      caseWhere.created_at = {};
      if (startDate) {
        caseWhere.created_at.gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        caseWhere.created_at.lte = endDateTime;
      }
    }

    // 数据隔离
    if (!isSuperAdmin && userDepartment) {
      if (caseWhere.users) {
        caseWhere.users.project = userDepartment;
      } else {
        caseWhere.users = { project: userDepartment }; // 🔥 修复：使用 project 字段
      }
    }

    try {
      console.log('📊 查询条件:', JSON.stringify(caseWhere, null, 2));

      // 🆕 直接查询测试用例表（测试点信息已合并到用例表中）
      const testCases = await this.prisma.functional_test_cases.findMany({
        where: caseWhere,
        orderBy: { created_at: 'desc' },
        include: {
          users: {
            select: {
              username: true,
              project: true, // 🔥 修复：使用 project 字段
              account_name: true
            }
          },
          project_version: {
            select: {
              id: true,
              version_name: true,
              version_code: true,
              is_main: true,
              project_id: true  // 🆕 需要project_id来替换配置变量
            }
          },
          // 🆕 获取最新的执行记录
          executions: {
            orderBy: {
              executed_at: 'desc'
            },
            take: 1,
            select: {
              id: true,
              final_result: true,
              executed_at: true,
              executor: {
                select: {
                  username: true
                }
              }
            }
          }
        }
      });

      // 转换为平铺行格式（兼容前端）
      let flatRows = testCases.map(tc => {
        // 🆕 获取最新执行状态
        const latestExecution = (tc as any).executions?.[0];
        const execution_status = latestExecution?.final_result || null;
        const last_executed_at = latestExecution?.executed_at || null;
        const last_executor = latestExecution?.executor?.username || null;

        return {
          // 使用用例ID作为唯一标识（不再有独立的测试点ID）
          test_point_id: tc.id,

          // 测试用例信息
          id: tc.id,
          case_id: tc.case_id,  // 🆕 格式化的用例编号
          name: tc.name,
          description: tc.description,
          system: tc.system,
          module: tc.module,
          priority: tc.priority,
          status: tc.status,
          section_id: tc.section_id,
          section_name: tc.section_name,
          section_description: tc.section_description,
          scenario_name: tc.scenario_name,  // 🆕 测试场景名称
          scenario_description: tc.scenario_description,  // 🆕 测试场景描述
          tags: tc.tags,
          created_at: tc.created_at,
          updated_at: tc.updated_at,
          users: tc.users,
          source: tc.source,
          case_type: tc.case_type || 'FULL',
          project_version_id: tc.project_version_id,
          project_version: tc.project_version,
          requirement_source: tc.requirement_source,
          requirement_doc_id: tc.requirement_doc_id,  // 🆕 需求文档ID

          // 🔥 前置条件和测试数据
          preconditions: tc.preconditions || '',
          testData: tc.test_data || '',
          // test_data: tc.test_data || '',

          // 🆕 执行状态信息
          execution_status,  // pass, fail, block, null
          last_executed_at,  // 最后执行时间
          last_executor,     // 最后执行人

          // 🆕 测试点信息（现在直接从用例表读取）
          test_point_index: 1,  // 每个用例只有一个测试点
          test_purpose: tc.test_purpose,
          test_point_name: tc.test_point_name || tc.name,  // 如果没有测试点名称，使用用例名称
          test_point_steps: tc.steps,
          test_point_expected_result: tc.expected_result,
          test_point_risk_level: tc.risk_level || 'medium',

          // 总测试点数固定为1
          total_test_points: 1
        };
      });

      // 🆕 执行结果筛选 - 根据最新执行记录的状态过滤
      if (executionStatus) {
        // 🔄 映射前端值到数据库枚举值
        const statusMap: Record<string, string> = {
          'passed': 'pass',
          'failed': 'fail',
          'blocked': 'block',
          'pending': 'pending'
        };
        const dbStatus = statusMap[executionStatus] || executionStatus;

        flatRows = flatRows.filter(row => {
          // 处理特殊情况：如果筛选"待执行"(pending)，应该包括没有执行记录的用例
          if (executionStatus === 'pending') {
            return row.execution_status === null || row.execution_status === 'pending';
          }
          // 其他状态：精确匹配（使用映射后的数据库值）
          return row.execution_status === dbStatus;
        });
      }

      // 对平铺后的数据进行分页
      const total = flatRows.length;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedRows = flatRows.slice(startIndex, endIndex);

      console.log(`✅ 查询结果: 找到 ${total} 条测试用例，返回第 ${page} 页 ${paginatedRows.length} 行`);

      // 🆕 动态替换配置变量占位符为实际值
      // 按项目ID分组，批量替换
      const projectGroups = new Map<number, any[]>();
      paginatedRows.forEach(row => {
        if (row.project_version?.project_id) {
          const projectId = row.project_version.project_id;
          if (!projectGroups.has(projectId)) {
            projectGroups.set(projectId, []);
          }
          projectGroups.get(projectId)!.push(row);
        }
      });

      // 批量替换每个项目的测试用例
      for (const [projectId, rows] of projectGroups.entries()) {
        const replacedRows = await this.configVariableService.batchReplacePlaceholders(rows, projectId);
        // 更新原数组中的数据
        replacedRows.forEach((replacedRow, index) => {
          const originalIndex = paginatedRows.indexOf(rows[index]);
          if (originalIndex !== -1) {
            paginatedRows[originalIndex] = replacedRow;
          }
        });
      }

      return {
        data: paginatedRows,
        total,
        pagination: {
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
          total
        }
      };
    } catch (error: any) {
      console.error('❌ 查询功能测试用例失败:', error);
      throw new Error(`查询功能测试用例失败: ${error.message}`);
    }
  }

  /**
   * 手动创建测试用例（🆕 测试点信息直接保存在用例表中）
   */
  async create(data: any, userId: number) {
    console.log(`✨ 创建功能测试用例: ${data.name}, 用户ID: ${userId}`);

    try {
      // 🆕 如果有项目版本ID，先替换硬编码为配置变量占位符
      let processedData = data;
      if (data.projectVersionId) {
        // 获取项目ID
        const projectVersion = await this.prisma.project_versions.findUnique({
          where: { id: data.projectVersionId },
          select: { project_id: true }
        });
        
        if (projectVersion?.project_id) {
          console.log(`🔄 [ConfigVariable] 替换手动创建测试用例中的硬编码数据...`);
          processedData = await this.configVariableService.replaceHardcodedWithPlaceholders(
            data,
            projectVersion.project_id
          );
        }
      }

      // 🆕 从 testPoints 数组中提取第一个测试点信息（如果有）
      const firstPoint = processedData.testPoints?.[0] || {};
      const testPointName = firstPoint.testPoint || firstPoint.testPointName || processedData.testPointName || '';
      
      // 🔧 统一处理场景名称字段（兼容 testScenario 和 scenarioName）
      const scenarioName = processedData.testScenario || processedData.scenarioName || '';
      
      // 🔧 优先使用外层的steps和assertions（用例级别），如果没有则使用测试点级别的
      const rawSteps = processedData.steps || firstPoint.steps || '';
      const rawExpectedResult = processedData.assertions || processedData.expectedResult || firstPoint.expectedResult || '';
      
      // 🔧 从【操作】【预期】格式中分离纯操作步骤和预期结果
      let finalSteps = rawSteps;
      let finalExpectedResult = rawExpectedResult;
      
      // 🔥 只有当包含【操作】【预期】格式时才分离，否则直接使用原数据
      if (typeof rawSteps === 'string' && rawSteps.includes('【操作】')) {
        const separated = separateStepsAndExpectedResult(rawSteps);
        // 如果分离成功，使用分离后的数据
        if (separated.steps) {
          finalSteps = separated.steps;
        }
        if (separated.expectedResult) {
          finalExpectedResult = separated.expectedResult;
        }
      }
      
      // 创建测试用例（测试点信息直接保存在用例表中）
      const testCase = await this.prisma.functional_test_cases.create({
        data: {
          case_id: processedData.caseId || null,  // 用例编号
          name: processedData.name,
          description: processedData.description || '',
          system: processedData.system || '',
          module: processedData.module || '',
          priority: processedData.priority || 'medium',
          status: processedData.status || 'DRAFT',
          tags: processedData.tags || '',
          source: 'MANUAL',
          creator_id: userId,
          test_type: processedData.testType || '',
          case_type: processedData.caseType || 'FULL',  // 用例类型枚举
          preconditions: processedData.preconditions || '',
          test_data: processedData.testData || '',
          section_name: processedData.sectionName || '',
          coverage_areas: processedData.coverageAreas || '',
          scenario_name: scenarioName,  // 场景名称（兼容多种字段名）
          scenario_description: processedData.scenarioDescription || '',  // 场景描述
          project_version_id: processedData.projectVersionId || null,  // 项目版本ID
          // 🆕 测试点信息（直接保存在用例表中）
          test_point_name: testPointName,
          test_purpose: firstPoint.testPurpose || processedData.testPurpose || '',
          // 🔧 使用分离后的纯操作步骤
          steps: finalSteps,
          // 🔧 使用分离后的预期结果
          expected_result: finalExpectedResult,
          risk_level: firstPoint.riskLevel || processedData.riskLevel || 'medium'
        },
        include: {
          users: {
            select: {
              username: true,
              account_name: true,
              project: true // 🔥 修复：使用 project 字段
            }
          }
        }
      });

      console.log(`✅ 测试用例创建完成: ${testCase.id}`);
      return testCase;
    } catch (error: any) {
      console.error('❌ 创建测试用例失败:', error);
      throw new Error(`创建测试用例失败: ${error.message}`);
    }
  }

  /**
   * 根据系统获取测试场景和测试点列表
   * @param system 系统名称
   * @returns 场景列表，每个场景包含测试点列表
   */
  async getScenariosBySystem(system: string) {
    try {
      console.log(`📋 获取系统 "${system}" 的测试场景列表`);

      // 按场景分组，获取每个场景下的测试点
      const scenarioMap = new Map<string, Set<string>>();
      
      // 先收集所有场景和测试点的映射关系
      const allCases = await this.prisma.functional_test_cases.findMany({
        where: {
          system: system,
          scenario_name: { not: null },
          test_point_name: { not: null },
          deleted_at: null  // 🆕 软删除过滤
        },
        select: {
          scenario_name: true,
          test_point_name: true
        }
      });

      // 构建场景-测试点映射
      allCases.forEach(caseItem => {
        const scenarioName = caseItem.scenario_name;
        const testPointName = caseItem.test_point_name;
        
        if (scenarioName && testPointName) {
          if (!scenarioMap.has(scenarioName)) {
            scenarioMap.set(scenarioName, new Set());
          }
          scenarioMap.get(scenarioName)!.add(testPointName);
        }
      });

      // 转换为前端需要的格式
      const result = Array.from(scenarioMap.entries()).map(([scenarioName, testPoints]) => ({
        value: scenarioName,
        label: scenarioName,
        testPoints: Array.from(testPoints).map(tp => ({
          value: tp,
          label: tp
        }))
      }));

      console.log(`✅ 找到 ${result.length} 个测试场景`);
      return result;
    } catch (error: any) {
      console.error('❌ 获取测试场景失败:', error);
      throw new Error(`获取测试场景失败: ${error.message}`);
    }
  }

  /**
   * 根据系统获取模块列表
   * @param system 系统名称
   * @returns 模块名称列表
   */
  async getModulesBySystem(system: string) {
    try {
      console.log(`📋 获取系统 "${system}" 的模块列表`);

      // 查询该系统的所有测试用例，获取不重复的模块名称
      const modules = await this.prisma.functional_test_cases.findMany({
        where: {
          system: system,
          module: { not: null },
          deleted_at: null  // 🆕 软删除过滤
        },
        select: {
          module: true
        },
        distinct: ['module']
      });

      // 转换为前端需要的格式
      const result = modules
        .map(m => m.module)
        .filter((m): m is string => m !== null)
        .sort()
        .map(module => ({
          value: module,
          label: module
        }));

      console.log(`✅ 找到 ${result.length} 个模块`);
      return result;
    } catch (error: any) {
      console.error('❌ 获取模块列表失败:', error);
      throw new Error(`获取模块列表失败: ${error.message}`);
    }
  }

  /**
   * 批量保存测试用例（🆕 测试点信息直接保存在用例表中）
   */
  async batchSave(params: BatchSaveParams) {
    const { testCases, aiSessionId, userId } = params;

    console.log(`📦 开始批量保存 ${testCases.length} 个功能测试用例`);
    console.log(`📝 会话ID: ${aiSessionId}, 用户ID: ${userId}`);
    console.log(`📄 第一个用例示例:`, JSON.stringify(testCases[0], null, 2));
    console.log(`🔍 第一个用例的关键字段:`, {
      name: testCases[0]?.name,
      system: testCases[0]?.system,
      module: testCases[0]?.module,
      sectionId: testCases[0]?.sectionId,
      sectionName: testCases[0]?.sectionName,
      sectionDescription: testCases[0]?.sectionDescription,
      scenarioName: testCases[0]?.scenarioName,  // 🔧 新增
      scenarioDescription: testCases[0]?.scenarioDescription,  // 🔧 新增
      requirementDocId: testCases[0]?.requirementDocId,
      projectId: testCases[0]?.projectId  // 🆕 项目ID
    });

    try {
      // 🆕 在保存前，替换硬编码的账号密码为配置变量
      let processedTestCases = testCases;
      if (testCases.length > 0 && testCases[0].projectId) {
        console.log(`🔄 [ConfigVariable] 开始替换测试用例中的硬编码数据...`);
        console.log(`📋 [ConfigVariable] 替换前第一个用例:`, JSON.stringify(testCases[0], null, 2));
        processedTestCases = await Promise.all(
          testCases.map(tc => 
            this.configVariableService.replaceHardcodedWithPlaceholders(tc, tc.projectId)
          )
        );
        console.log(`✅ [ConfigVariable] 硬编码数据替换完成`);
        console.log(`📋 [ConfigVariable] 替换后第一个用例:`, JSON.stringify(processedTestCases[0], null, 2));
      }

      // 使用事务确保数据一致性
      const result = await this.prisma.$transaction(async (tx) => {
        let savedCount = 0;

        // 逐个保存测试用例
        for (const tc of processedTestCases) {
          // 🆕 从 testPoints 数组中提取第一个测试点信息
          const firstPoint = tc.testPoints?.[0] || {};
          const testPointName = firstPoint.testPoint || firstPoint.testPointName || tc.testPointName || '';
          
          // 🔧 获取原始的 steps 和 expectedResult
          // 🔥 优先使用用例级别的数据（用户可能已编辑），而不是测试点级别的数据
          let rawSteps = tc.steps || firstPoint.steps || '';
          let rawExpectedResult = tc.assertions || tc.expectedResult || firstPoint.expectedResult || '';
          
          console.log(`📋 [保存前] 用例级别 tc.steps:`, tc.steps?.substring(0, 100));
          console.log(`📋 [保存前] 测试点级别 firstPoint.steps:`, firstPoint.steps?.substring(0, 100));
          console.log(`📋 [保存前] 最终使用 rawSteps:`, rawSteps?.substring(0, 100));
          
          console.log(`📋 [保存前] rawSteps类型: ${typeof rawSteps}, 值:`, rawSteps?.substring?.(0, 100));
          console.log(`📋 [保存前] rawExpectedResult类型: ${typeof rawExpectedResult}, 是数组: ${Array.isArray(rawExpectedResult)}`);
          
          // 🔥 处理 expectedResult 是数组的情况
          if (Array.isArray(rawExpectedResult)) {
            console.log(`🔄 [数组转换] expectedResult 是数组，包含 ${rawExpectedResult.length} 个元素`);
            rawExpectedResult = rawExpectedResult.map((item, index) => `${index + 1}. ${item}`).join('\n');
            console.log(`✅ [数组转换] 转换后:`, rawExpectedResult.substring(0, 100));
          }
          
          // 🔧 从【操作】【预期】格式中分离纯操作步骤和预期结果
          let finalSteps = rawSteps;
          let finalExpectedResult = rawExpectedResult;
          
          // 🔥 关键修复：只有当包含【操作】【预期】格式时才分离，否则直接使用原数据
          if (typeof rawSteps === 'string' && rawSteps.includes('【操作】')) {
            console.log(`🔄 [分离步骤] 检测到【操作】【预期】格式，开始分离...`);
            const separated = separateStepsAndExpectedResult(rawSteps);
            // 如果分离成功，使用分离后的数据
            if (separated.steps) {
              finalSteps = separated.steps;
              console.log(`✅ [分离步骤] 分离后的steps:`, finalSteps.substring(0, 100));
            }
            if (separated.expectedResult) {
              finalExpectedResult = separated.expectedResult;
              console.log(`✅ [分离步骤] 分离后的expectedResult:`, finalExpectedResult.substring(0, 100));
            }
          } else {
            console.log(`ℹ️ [分离步骤] 未检测到【操作】【预期】格式，直接使用原数据`);
          }
          
          console.log(`📋 [最终保存] finalSteps:`, finalSteps.substring(0, 100));
          console.log(`📋 [最终保存] finalExpectedResult:`, finalExpectedResult.substring(0, 100));
          
          // 保存测试用例（测试点信息直接保存在用例表中）
          await tx.functional_test_cases.create({
            data: {
              case_id: tc.caseId || tc.case_id || null,  // 🆕 格式化的用例编号
              name: tc.name,
              description: tc.testPurpose || tc.description || '',
              system: tc.system,
              module: tc.module,
              priority: tc.priority || 'medium',
              tags: Array.isArray(tc.tags) ? tc.tags.join(',') : tc.tags || '',
              status: 'DRAFT',
              source: 'AI_GENERATED',
              ai_session_id: aiSessionId,
              creator_id: userId,
              test_type: tc.testType,
              preconditions: tc.preconditions,
              test_data: tc.testData,
              section_id: tc.sectionId,
              section_name: tc.sectionName,
              section_description: tc.sectionDescription || null,
              scenario_name: tc.scenarioName || null,  // 🆕 测试场景名称
              scenario_description: tc.scenarioDescription || null,  // 🆕 测试场景描述
              batch_number: tc.batchNumber || 0,
              coverage_areas: tc.coverageAreas,
              // 项目版本相关
              project_version_id: tc.projectVersionId || null,
              case_type: tc.caseType || 'FULL',
              requirement_source: tc.requirementSource || null,
              // 🆕 关联需求文档
              requirement_doc_id: tc.requirementDocId || null,
              // 🆕 测试点信息（直接保存在用例表中）
              test_point_name: testPointName,
              test_purpose: firstPoint.testPurpose || tc.testPurpose || '',
              // 🔧 使用分离后的纯操作步骤
              steps: finalSteps,
              // 🔧 使用分离后的预期结果
              expected_result: finalExpectedResult,
              risk_level: firstPoint.riskLevel || tc.riskLevel || 'medium'
            }
          });

          savedCount++;
          console.log(`  ✓ 用例 "${tc.name}" 已保存`);
        }

        // 更新会话统计（如果会话存在）
        const sessionExists = await tx.ai_generation_sessions.findUnique({
          where: { id: aiSessionId }
        });
        
        if (sessionExists) {
          await tx.ai_generation_sessions.update({
            where: { id: aiSessionId },
            data: { total_saved: savedCount }
          });
        } else {
          console.log(`⚠️  会话 ${aiSessionId} 不存在，跳过会话统计更新`);
        }

        console.log(`✅ 成功保存 ${savedCount} 个测试用例`);
        return { count: savedCount };
      });

      return result;
    } catch (error: any) {
      console.error('❌ 批量保存失败:', error);
      throw new Error(`批量保存失败: ${error.message}`);
    }
  }

  /**
   * 获取测试用例详情（🆕 测试点信息直接从用例表读取）
   */
  async getById(id: number) {
    try {
      const testCase = await this.prisma.functional_test_cases.findFirst({
        where: { 
          id,
          deleted_at: null  // 🆕 软删除过滤：不返回已删除的记录
        },
        include: {
          users: {
            select: {
              username: true,
              account_name: true,
              project: true // 🔥 修复：使用 project 字段
            }
          },
          project_version: {
            select: {
              id: true,
              version_name: true,
              version_code: true,
              is_main: true,
              project_id: true  // 🆕 需要project_id来替换配置变量
            }
          }
        }
      });

      if (!testCase) {
        return null;
      }

      // 🆕 构建兼容格式的测试点数组（只有一个元素）
      const testPoints = [{
        id: testCase.id,
        test_point_index: 1,
        testPoint: testCase.test_point_name || testCase.name,
        testPointName: testCase.test_point_name || testCase.name,
        testPurpose: testCase.test_purpose,
        steps: testCase.steps,
        expectedResult: testCase.expected_result,
        riskLevel: testCase.risk_level
      }];

      let result: any = {
        ...testCase,
        testPoints
      };

      // 🆕 动态替换配置变量占位符为实际值
      if (testCase.project_version?.project_id) {
        const projectId = testCase.project_version.project_id;
        result = await this.configVariableService.batchReplacePlaceholders([result], projectId);
        result = result[0];  // batchReplacePlaceholders返回数组，取第一个元素
      }

      return result;
    } catch (error: any) {
      console.error('❌ 查询测试用例详情失败:', error);
      throw new Error(`查询测试用例详情失败: ${error.message}`);
    }
  }

  /**
   * 更新测试用例（🆕 测试点信息直接保存在用例表中）
   */
  async update(id: number, data: any) {
    console.log(`📝 更新功能测试用例 ID: ${id}`);
    console.log(`📊 更新数据:`, {
      caseId: data.caseId,
      testScenario: data.testScenario,
      scenarioName: data.scenarioName
    });

    try {
      // 🆕 如果有项目版本ID，先替换硬编码为配置变量占位符
      let processedData = data;
      if (data.projectVersionId) {
        // 获取项目ID
        const projectVersion = await this.prisma.project_versions.findUnique({
          where: { id: data.projectVersionId },
          select: { project_id: true }
        });
        
        if (projectVersion?.project_id) {
          console.log(`🔄 [ConfigVariable] 替换更新测试用例中的硬编码数据...`);
          processedData = await this.configVariableService.replaceHardcodedWithPlaceholders(
            data,
            projectVersion.project_id
          );
        }
      }

      // 🆕 从 testPoints 数组中提取第一个测试点信息（如果有）
      const firstPoint = processedData.testPoints?.[0] || {};
      
      // 🔧 获取原始的 steps 和 expectedResult
      // 🔥 优先使用用例级别的数据，与其他方法保持一致
      const rawSteps = processedData.steps || firstPoint.steps || '';
      const rawExpectedResult = processedData.assertions || processedData.expectedResult || firstPoint.expectedResult || '';
      
      // 🔧 从【操作】【预期】格式中分离纯操作步骤和预期结果
      let finalSteps = rawSteps;
      let finalExpectedResult = rawExpectedResult;
      
      // 🔥 只有当包含【操作】【预期】格式时才分离，否则直接使用原数据
      if (typeof rawSteps === 'string' && rawSteps.includes('【操作】')) {
        const separated = separateStepsAndExpectedResult(rawSteps);
        // 如果分离成功，使用分离后的数据
        if (separated.steps) {
          finalSteps = separated.steps;
        }
        if (separated.expectedResult) {
          finalExpectedResult = separated.expectedResult;
        }
      }
      
      // 构建更新数据对象
      const updateData: any = {
        name: processedData.name,
        description: processedData.description,
        system: processedData.system,
        module: processedData.module,
        priority: processedData.priority,
        tags: processedData.tags,
        test_type: processedData.testType,
        preconditions: processedData.preconditions,
        test_data: processedData.testData,
        updated_at: getNow(),
        // 🆕 测试点信息（直接保存在用例表中）
        test_point_name: firstPoint.testPoint || firstPoint.testPointName || processedData.testPointName,
        test_purpose: firstPoint.testPurpose || processedData.testPurpose,
        // 🔧 使用分离后的纯操作步骤
        steps: finalSteps,
        // 🔧 使用分离后的预期结果
        expected_result: finalExpectedResult,
        risk_level: firstPoint.riskLevel || processedData.riskLevel
      };

      // 🔧 更新用例ID
      if (processedData.caseId !== undefined) updateData.case_id = processedData.caseId;
      
      // 🔧 更新测试场景信息
      if (processedData.testScenario !== undefined) updateData.scenario_name = processedData.testScenario;
      if (processedData.scenarioName !== undefined) updateData.scenario_name = processedData.scenarioName;
      if (processedData.scenarioDescription !== undefined) updateData.scenario_description = processedData.scenarioDescription;

      if (processedData.sectionId !== undefined) updateData.section_id = processedData.sectionId;
      if (processedData.sectionName !== undefined) updateData.section_name = processedData.sectionName;
      if (processedData.batchNumber !== undefined) updateData.batch_number = processedData.batchNumber;
      if (processedData.coverageAreas !== undefined) updateData.coverage_areas = processedData.coverageAreas;
      if (processedData.caseType !== undefined) updateData.case_type = processedData.caseType;
      
      // 🔧 更新项目版本ID
      if (processedData.projectVersionId !== undefined) {
        updateData.project_version_id = processedData.projectVersionId !== null && processedData.projectVersionId !== '' 
          ? Number(processedData.projectVersionId) 
          : null;
      }

      console.log(`✅ 最终更新数据:`, updateData);

      return await this.prisma.functional_test_cases.update({
        where: { id },
        data: updateData
      });
    } catch (error: any) {
      console.error('❌ 更新测试用例失败:', error);
      throw new Error(`更新测试用例失败: ${error.message}`);
    }
  }

  /**
   * 删除测试用例（软删除）
   * 不会真正从数据库中删除，而是设置 deleted_at 字段
   */
  async delete(id: number) {
    console.log(`🗑️  软删除功能测试用例 ID: ${id}`);

    try {
      return await this.prisma.functional_test_cases.update({
        where: { id },
        data: {
          deleted_at: getNow()
        }
      });
    } catch (error: any) {
      console.error('❌ 删除测试用例失败:', error);
      throw new Error(`删除测试用例失败: ${error.message}`);
    }
  }

  /**
   * 🆕 批量删除测试用例（软删除，替代原来的批量删除测试点）
   * 不会真正从数据库中删除，而是设置 deleted_at 字段
   */
  async batchDeleteTestCases(testCaseIds: number[]) {
    console.log(`🗑️  批量软删除测试用例，数量: ${testCaseIds.length}`);

    try {
      const result = await this.prisma.functional_test_cases.updateMany({
        where: {
          id: {
            in: testCaseIds
          }
        },
        data: {
          deleted_at: getNow()
        }
      });

      console.log(`✅ 成功软删除 ${result.count} 个测试用例`);

      return {
        deletedCount: result.count
      };
    } catch (error: any) {
      console.error('❌ 批量删除测试用例失败:', error);
      throw new Error(`批量删除测试用例失败: ${error.message}`);
    }
  }

  /**
   * 🆕 向后兼容：批量删除测试点 -> 批量删除测试用例
   * @deprecated 请使用 batchDeleteTestCases
   */
  async batchDeleteTestPoints(testPointIds: number[]) {
    return this.batchDeleteTestCases(testPointIds);
  }

  /**
   * 🆕 复制测试用例
   * 创建一个新的测试用例，复制原用例的所有内容，名称添加"(副本)"后缀
   */
  async copy(id: number, userId: number) {
    console.log(`📋 复制功能测试用例 ID: ${id}, 用户ID: ${userId}`);

    try {
      // 获取原用例
      const original = await this.prisma.functional_test_cases.findFirst({
        where: { 
          id,
          deleted_at: null
        }
      });

      if (!original) {
        throw new Error('原测试用例不存在或已被删除');
      }

      // 创建副本，复制所有字段（除了 id、created_at、updated_at）
      const copiedCase = await this.prisma.functional_test_cases.create({
        data: {
          case_id: null,  // 新用例不复制编号
          name: `${original.name}（副本）`,
          description: original.description,
          system: original.system,
          module: original.module,
          priority: original.priority,
          status: 'DRAFT',  // 副本状态重置为草稿
          tags: original.tags,
          source: original.source,
          creator_id: userId,  // 使用当前用户作为创建者
          test_type: original.test_type,
          case_type: original.case_type,
          preconditions: original.preconditions,
          test_data: original.test_data,
          section_id: original.section_id,
          section_name: original.section_name,
          section_description: original.section_description,
          scenario_name: original.scenario_name,
          scenario_description: original.scenario_description,
          batch_number: original.batch_number,
          coverage_areas: original.coverage_areas,
          project_version_id: original.project_version_id,
          requirement_source: original.requirement_source,
          requirement_doc_id: original.requirement_doc_id,
          // 测试点信息
          test_point_name: original.test_point_name,
          test_purpose: original.test_purpose,
          steps: original.steps,
          expected_result: original.expected_result,
          risk_level: original.risk_level
        },
        include: {
          users: {
            select: {
              username: true,
              account_name: true,
              project: true
            }
          },
          project_version: {
            select: {
              id: true,
              version_name: true,
              version_code: true,
              is_main: true
            }
          }
        }
      });

      console.log(`✅ 测试用例复制成功: ${original.id} -> ${copiedCase.id}`);
      return copiedCase;
    } catch (error: any) {
      console.error('❌ 复制测试用例失败:', error);
      throw new Error(`复制测试用例失败: ${error.message}`);
    }
  }

  /**
   * 🆕 获取测试用例详情（替代原来的获取测试点详情）
   * @deprecated 请使用 getById
   */
  async getTestPointById(id: number) {
    return this.getById(id);
  }

  /**
   * 🆕 向后兼容：更新测试点 -> 更新测试用例
   * @deprecated 请使用 update
   */
  async updateTestPoint(id: number, data: any) {
    return this.update(id, data);
  }
  /**
   * 🆕 阶段1：智能测试场景拆分（新接口）
   */
  async analyzeTestScenarios(requirementDoc: string) {
    const { FunctionalTestCaseAIService } = await import('./functionalTestCaseAIService.js');
    const aiService = new FunctionalTestCaseAIService();
    return await aiService.analyzeTestScenarios(requirementDoc);
  }

  /**
   * 🆕 阶段1：智能测试模块拆分（兼容性接口）
   * @deprecated 使用 analyzeTestScenarios 代替
   */
  async analyzeTestModules(requirementDoc: string) {
    const { FunctionalTestCaseAIService } = await import('./functionalTestCaseAIService.js');
    const aiService = new FunctionalTestCaseAIService();
    return await aiService.analyzeTestModules(requirementDoc);
  }

  /**
   * 🆕 阶段2：为测试场景生成测试点（新接口）
   */
  async generateTestPointsForScenario(
    scenarioId: string,
    scenarioName: string,
    scenarioDescription: string,
    requirementDoc: string,
    relatedSections: string[]
  ) {
    const { FunctionalTestCaseAIService } = await import('./functionalTestCaseAIService.js');
    const aiService = new FunctionalTestCaseAIService();
    return await aiService.generateTestPointsForScenario(
      scenarioId,
      scenarioName,
      scenarioDescription,
      requirementDoc,
      relatedSections
    );
  }

  /**
   * 🆕 阶段2：生成测试目的（兼容性接口）
   * @deprecated 使用 generateTestPointsForScenario 代替
   */
  async generateTestPurposes(
    moduleId: string,
    moduleName: string,
    moduleDescription: string,
    requirementDoc: string,
    relatedSections: string[]
  ) {
    const { FunctionalTestCaseAIService } = await import('./functionalTestCaseAIService.js');
    const aiService = new FunctionalTestCaseAIService();
    return await aiService.generateTestPurposes(
      moduleId,
      moduleName,
      moduleDescription,
      requirementDoc,
      relatedSections
    );
  }

  /**
   * 🆕 阶段3：为单个测试点生成测试用例（新接口）
   * @param projectId 项目ID，用于获取项目配置（访问地址、账号密码等）
   */
  async generateTestCaseForTestPoint(
    testPoint: any,
    scenarioId: string,
    scenarioName: string,
    scenarioDescription: string,
    requirementDoc: string,
    systemName: string,
    moduleName: string,
    relatedSections: string[],
    projectId?: number | null
  ) {
    const { FunctionalTestCaseAIService } = await import('./functionalTestCaseAIService.js');
    const aiService = new FunctionalTestCaseAIService();
    return await aiService.generateTestCaseForTestPoint(
      testPoint,
      scenarioId,
      scenarioName,
      scenarioDescription,
      requirementDoc,
      systemName,
      moduleName,
      relatedSections,
      projectId  // 🆕 传递项目ID
    );
  }

  /**
   * 🆕 阶段3：生成测试用例（兼容性接口）
   * @deprecated 使用 generateTestCaseForTestPoint 代替
   */
  async generateTestCase(
    scenarioId: string,
    scenarioName: string,
    scenarioDescription: string,
    testPoints: any[],
    requirementDoc: string,
    systemName: string,
    moduleName: string,
    relatedSections: string[]
  ) {
    const { FunctionalTestCaseAIService } = await import('./functionalTestCaseAIService.js');
    const aiService = new FunctionalTestCaseAIService();
    return await aiService.generateTestCase(
      scenarioId,
      scenarioName,
      scenarioDescription,
      testPoints,
      requirementDoc,
      systemName,
      moduleName,
      relatedSections
    );
  }

  /**
   * 🆕 阶段3：生成测试点（兼容性接口）
   * @deprecated 使用 generateTestCase 代替
   */
  async generateTestPoints(
    purposeId: string,
    purposeName: string,
    purposeDescription: string,
    requirementDoc: string,
    systemName: string,
    moduleName: string,
    relatedSections: string[]
  ) {
    const { FunctionalTestCaseAIService } = await import('./functionalTestCaseAIService.js');
    const aiService = new FunctionalTestCaseAIService();
    return await aiService.generateTestPoints(
      purposeId,
      purposeName,
      purposeDescription,
      requirementDoc,
      systemName,
      moduleName,
      relatedSections
    );
  }

  /**
   * 🆕 获取筛选选项（动态生成）
   */
  async getFilterOptions() {
    try {
      // 获取所有唯一的系统、模块、场景等选项
      const allCases = await this.prisma.functional_test_cases.findMany({
        where: {
          deleted_at: null  // 🆕 软删除过滤
        },
        select: {
          system: true,
          module: true,
          scenario_name: true,  // 🔧 改为测试场景名称
          section_name: true,  // 🔧 保留section_name作为fallback
          creator_id: true,
          users: {
            select: { id: true, username: true }
          }
        }
      });

      // 使用 Set 去重
      const systemSet = new Set<string>();
      const moduleSet = new Set<string>();
      const scenarioSet = new Set<string>();
      const creatorMap = new Map<number, { id: number; username: string }>();

      allCases.forEach(c => {
        if (c.system) systemSet.add(c.system);
        if (c.module) moduleSet.add(c.module);
        // 🔧 优先使用scenario_name，fallback到section_name
        if (c.scenario_name) scenarioSet.add(c.scenario_name);
        else if (c.section_name) scenarioSet.add(c.section_name);
        if (c.users && c.creator_id) {
          creatorMap.set(c.creator_id, c.users);
        }
      });

      const result = {
        systems: Array.from(systemSet).sort(),
        modules: Array.from(moduleSet).sort(),
        scenarios: Array.from(scenarioSet).sort(),
        creators: Array.from(creatorMap.values()).sort((a, b) => a.username.localeCompare(b.username))
      };

      console.log('📋 筛选选项:', result);
      return result;
    } catch (error: any) {
      console.error('❌ 获取筛选选项失败:', error);
      throw new Error(`获取筛选选项失败: ${error.message}`);
    }
  }

  /**
   * 🆕 根据系统获取项目版本列表
   */
  async getProjectVersionsBySystem(systemName: string) {
    try {
      console.log('📋 获取系统版本列表:', systemName);
      
      // 查询该系统下的所有用例的版本信息
      const cases = await this.prisma.functional_test_cases.findMany({
        where: {
          system: systemName,
          deleted_at: null  // 🆕 软删除过滤
        },
        select: {
          project_version: {
            select: {
              id: true,
              version_code: true,
              version_name: true,
              is_main: true
            }
          }
        },
        distinct: ['project_version_id']
      });

      // 去重并排序（主版本在前）
      const versionMap = new Map<number, any>();
      cases.forEach(c => {
        if (c.project_version && c.project_version.id) {
          versionMap.set(c.project_version.id, c.project_version);
        }
      });

      const versions = Array.from(versionMap.values()).sort((a, b) => {
        // 主版本排在前面
        if (a.is_main && !b.is_main) return -1;
        if (!a.is_main && b.is_main) return 1;
        // 其他按版本代码排序
        return a.version_code.localeCompare(b.version_code);
      });

      console.log(`✅ 找到 ${versions.length} 个版本`);
      return versions;
    } catch (error: any) {
      console.error('❌ 获取系统版本列表失败:', error);
      throw new Error(`获取系统版本列表失败: ${error.message}`);
    }
  }

  /**
   * 🆕 保存功能测试用例执行结果
   */
  async saveExecutionResult(data: {
    testCaseId: number;
    testCaseName: string;
    finalResult: 'pass' | 'fail' | 'block';
    actualResult: string;
    comments?: string;
    durationMs: number;
    executorId: number;
    executorDepartment?: string;
    stepResults?: any[];
    totalSteps?: number;
    completedSteps?: number;
    passedSteps?: number;
    failedSteps?: number;
    blockedSteps?: number;
    screenshots?: any[];
    attachments?: any[];
    metadata?: any;
  }) {
    try {
      console.log(`💾 保存功能测试用例执行结果 - 用例ID: ${data.testCaseId}, 结果: ${data.finalResult}`);

      // 验证测试用例是否存在
      const testCase = await this.prisma.functional_test_cases.findUnique({
        where: { id: data.testCaseId }
      });

      if (!testCase) {
        throw new Error(`测试用例不存在: ${data.testCaseId}`);
      }

      // 创建执行记录
      const execution = await this.prisma.functional_test_executions.create({
        data: {
          test_case_id: data.testCaseId,
          test_case_name: data.testCaseName,
          final_result: data.finalResult,
          actual_result: data.actualResult,
          comments: data.comments || null,
          duration_ms: data.durationMs,
          executor_id: data.executorId,
          executor_project: data.executorDepartment || null,
          step_results: data.stepResults ? data.stepResults : undefined,
          total_steps: data.totalSteps || 0,
          completed_steps: data.completedSteps || 0,
          passed_steps: data.passedSteps || 0,
          failed_steps: data.failedSteps || 0,
          blocked_steps: data.blockedSteps || 0,
          screenshots: data.screenshots ? data.screenshots : undefined,
          attachments: data.attachments ? data.attachments : undefined,
          metadata: data.metadata ? data.metadata : undefined,
          executed_at: getNow()
        }
      });

      console.log(`✅ 执行结果已保存 - 执行记录ID: ${execution.id}`);

      // 🔥 新增：创建 test_run_results 记录（用于报告系统）
      try {
        await this.createTestRunResultForFunctionalTest(
          data.testCaseId,
          data.finalResult,
          data.durationMs,
          execution.executed_at,
          data.executorId
        );
      } catch (error: any) {
        // 静默失败，避免影响主流程
        console.error('⚠️ 创建 test_run_results 记录失败:', error);
      }

      return {
        executionId: execution.id,
        testCaseId: execution.test_case_id,
        executedAt: execution.executed_at
      };
    } catch (error: any) {
      console.error('❌ 保存执行结果失败:', error);
      throw new Error(`保存执行结果失败: ${error.message}`);
    }
  }

  /**
   * 🔥 新增：为功能测试创建 test_run_results 记录
   */
  private async createTestRunResultForFunctionalTest(
    functionalTestCaseId: number,
    finalResult: 'pass' | 'fail' | 'block',
    durationMs: number,
    executedAt: Date,
    executorId: number
  ): Promise<void> {
    try {
      // 1. 查找或创建对应的 test_cases 记录
      const functionalCase = await this.prisma.functional_test_cases.findUnique({
        where: { id: functionalTestCaseId },
        select: {
          id: true,
          name: true,
          system: true,
          module: true,
          users: {
            select: {
              project: true // 🔥 修复：通过关联的 users 表获取 project
            }
          }
        }
      });

      if (!functionalCase) {
        throw new Error(`功能测试用例不存在: ${functionalTestCaseId}`);
      }

      // 查找或创建对应的 test_cases 记录
      // 使用 functional_test_cases 的 name 作为 test_cases 的 title
      let testCase = await this.prisma.test_cases.findFirst({
        where: {
          title: functionalCase.name,
          system: functionalCase.system || undefined,
          module: functionalCase.module || undefined
        }
      });

      if (!testCase) {
        // 创建新的 test_cases 记录
        testCase = await this.prisma.test_cases.create({
          data: {
            title: functionalCase.name,
            system: functionalCase.system || null,
            module: functionalCase.module || null,
            project: functionalCase.users?.project || null, // 🔥 修复：从关联的 users 表获取 project
            steps: Prisma.JsonNull,
            tags: Prisma.JsonNull
          }
        });
        console.log(`✅ 为功能测试用例创建对应的 test_cases 记录 (id: ${testCase.id})`);
      }

      // 2. 查找或创建 test_runs 记录
      const testRunRecord = await this.findOrCreateTestRunForFunctionalTest(
        executorId,
        executedAt
      );

      // 3. 映射状态
      const resultStatus = finalResult === 'pass' ? 'PASSED' : 
                          finalResult === 'fail' ? 'FAILED' : 
                          'SKIPPED';

      // 4. 检查是否已存在 test_run_results 记录（避免重复创建）
      const existingResult = await this.prisma.test_run_results.findFirst({
        where: {
          run_id: testRunRecord.id,
          case_id: testCase.id,
          executed_at: {
            gte: new Date(executedAt.getTime() - 1000), // 允许1秒误差
            lte: new Date(executedAt.getTime() + 1000)
          }
        }
      });

      if (existingResult) {
        console.log(`ℹ️ 功能测试用例 ${functionalTestCaseId} 的 test_run_results 记录已存在，跳过创建`);
        return;
      }

      // 5. 创建 test_run_results 记录
      await this.prisma.test_run_results.create({
        data: {
          run_id: testRunRecord.id,
          case_id: testCase.id,
          status: resultStatus,
          duration_ms: durationMs,
          screenshot_url: null,
          executed_at: executedAt
        }
      });

      console.log(`✅ 为功能测试用例创建 test_run_results 记录成功 (functional_case_id: ${functionalTestCaseId}, test_case_id: ${testCase.id}, run_id: ${testRunRecord.id})`);
    } catch (error: any) {
      console.error(`❌ 为功能测试用例创建 test_run_results 记录失败:`, error);
      throw error;
    }
  }

  /**
   * 🔥 新增：查找或创建 test_runs 记录（用于功能测试）
   */
  private async findOrCreateTestRunForFunctionalTest(
    executorId: number,
    executedAt: Date
  ): Promise<any> {
    try {
      // 获取或创建默认测试套件
      const executor = await this.prisma.users.findUnique({
        where: { id: executorId },
        select: { project: true } // 🔥 修复：使用 project 字段
      });

      let defaultSuite = await this.prisma.test_suites.findFirst({
        where: { name: '功能测试套件' }
      });

      if (!defaultSuite) {
        const defaultUser = await this.prisma.users.findFirst({ select: { id: true } });
        if (!defaultUser) {
          throw new Error('系统中没有可用的用户账号');
        }

        defaultSuite = await this.prisma.test_suites.create({
          data: {
            name: '功能测试套件',
            owner_id: defaultUser.id,
            project: executor?.project || null
          }
        });
      }

      // 查找最近创建的 test_runs 记录（同一天、同一套件）
      const startOfDay = new Date(executedAt);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(executedAt);
      endOfDay.setHours(23, 59, 59, 999);

      const existingRun = await this.prisma.test_runs.findFirst({
        where: {
          suite_id: defaultSuite.id,
          trigger_user_id: executorId,
          started_at: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        orderBy: {
          started_at: 'desc'
        }
      });

      if (existingRun) {
        // 更新结束时间
        await this.prisma.test_runs.update({
          where: { id: existingRun.id },
          data: {
            finished_at: executedAt
          }
        });
        return existingRun;
      }

      // 创建新的 test_runs 记录
      const newTestRun = await this.prisma.test_runs.create({
        data: {
          suite_id: defaultSuite.id,
          trigger_user_id: executorId,
          status: 'PASSED', // 默认状态，会根据实际结果更新
          started_at: executedAt,
          finished_at: executedAt
        }
      });

      console.log(`✅ 为功能测试创建新的 test_runs 记录 (id: ${newTestRun.id})`);
      return newTestRun;
    } catch (error: any) {
      console.error(`❌ 查找或创建 test_runs 记录失败:`, error);
      throw error;
    }
  }

  /**
   * 🆕 获取测试用例的执行历史
   */
  async getExecutionHistory(testCaseId: number, limit = 10) {
    try {
      console.log(`📋 获取测试用例执行历史 - 用例ID: ${testCaseId}`);

      const executions = await this.prisma.functional_test_executions.findMany({
        where: {
          test_case_id: testCaseId
        },
        include: {
          test_case: {
            select: {
              id: true,
              name: true,
              case_id: true
            }
          },
          executor: {
            select: {
              id: true,
              username: true,
              account_name: true,
              project: true // 🔥 修复：使用 project 字段
            }
          }
        },
        orderBy: {
          executed_at: 'desc'
        },
        take: limit
      });

      console.log(`✅ 找到 ${executions.length} 条执行记录`);

      return executions.map(exec => ({
        executionId: exec.id,
        testCaseId: exec.test_case_id,
        testCaseName: exec.test_case_name,
        finalResult: exec.final_result,
        actualResult: exec.actual_result,
        comments: exec.comments,
        durationMs: exec.duration_ms,
        executedAt: exec.executed_at,
        executor: exec.executor,
        stepResults: exec.step_results,
        totalSteps: exec.total_steps,
        completedSteps: exec.completed_steps,
        passedSteps: exec.passed_steps,
        failedSteps: exec.failed_steps,
        blockedSteps: exec.blocked_steps,
        screenshots: exec.screenshots,
        attachments: exec.attachments
      }));
    } catch (error: any) {
      console.error('❌ 获取执行历史失败:', error);
      throw new Error(`获取执行历史失败: ${error.message}`);
    }
  }

  /**
   * 🆕 获取单个执行记录详情
   */
  async getExecutionById(executionId: string) {
    try {
      console.log(`📋 获取执行记录详情 - ID: ${executionId}`);

      const execution = await this.prisma.functional_test_executions.findUnique({
        where: {
          id: executionId
        },
        include: {
          test_case: {
            select: {
              id: true,
              name: true,
              case_id: true,
              system: true,
              module: true,
              priority: true
            }
          },
          executor: {
            select: {
              id: true,
              username: true,
              account_name: true,
              project: true // 🔥 修复：使用 project 字段
            }
          }
        }
      });

      if (!execution) {
        return null;
      }

      return {
        executionId: execution.id,
        testCaseId: execution.test_case_id,
        testCaseName: execution.test_case_name,
        testCase: execution.test_case,
        finalResult: execution.final_result,
        actualResult: execution.actual_result,
        comments: execution.comments,
        durationMs: execution.duration_ms,
        executedAt: execution.executed_at,
        executor: execution.executor,
        stepResults: execution.step_results,
        totalSteps: execution.total_steps,
        completedSteps: execution.completed_steps,
        passedSteps: execution.passed_steps,
        failedSteps: execution.failed_steps,
        blockedSteps: execution.blocked_steps,
        screenshots: execution.screenshots,
        attachments: execution.attachments,
        metadata: execution.metadata
      };
    } catch (error: any) {
      console.error('❌ 获取执行记录详情失败:', error);
      throw new Error(`获取执行记录详情失败: ${error.message}`);
    }
  }
}

