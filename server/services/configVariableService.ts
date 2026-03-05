import { TestConfigService } from './testConfigService.js';

/**
 * 配置变量服务
 * 负责在测试用例中使用配置变量占位符，并在需要时动态替换
 */
export class ConfigVariableService {
  private testConfigService: TestConfigService;

  constructor() {
    this.testConfigService = new TestConfigService();
  }

  /**
   * 配置变量占位符定义
   */
  private readonly PLACEHOLDERS = {
    // 默认账号相关（向后兼容）
    ACCOUNT_USERNAME: '{{CONFIG.ACCOUNT.USERNAME}}',
    ACCOUNT_PASSWORD: '{{CONFIG.ACCOUNT.PASSWORD}}',
    ACCOUNT_TYPE: '{{CONFIG.ACCOUNT.TYPE}}',
    
    // 按类型的账号占位符（新增）
    ACCOUNT_ADMIN_USERNAME: '{{CONFIG.ACCOUNT.ADMIN.USERNAME}}',
    ACCOUNT_ADMIN_PASSWORD: '{{CONFIG.ACCOUNT.ADMIN.PASSWORD}}',
    ACCOUNT_SECURITY_USERNAME: '{{CONFIG.ACCOUNT.SECURITY.USERNAME}}',
    ACCOUNT_SECURITY_PASSWORD: '{{CONFIG.ACCOUNT.SECURITY.PASSWORD}}',
    ACCOUNT_AUDITOR_USERNAME: '{{CONFIG.ACCOUNT.AUDITOR.USERNAME}}',
    ACCOUNT_AUDITOR_PASSWORD: '{{CONFIG.ACCOUNT.AUDITOR.PASSWORD}}',
    
    // 智能账号占位符（根据上下文自动匹配）
    ACCOUNT_AUTO_USERNAME: '{{CONFIG.ACCOUNT.AUTO.USERNAME}}',
    ACCOUNT_AUTO_PASSWORD: '{{CONFIG.ACCOUNT.AUTO.PASSWORD}}',
    
    // 服务器相关
    SERVER_URL: '{{CONFIG.SERVER.URL}}',
    SERVER_HOST: '{{CONFIG.SERVER.HOST}}',
    SERVER_PORT: '{{CONFIG.SERVER.PORT}}',
    
    // 数据库相关
    DATABASE_HOST: '{{CONFIG.DATABASE.HOST}}',
    DATABASE_PORT: '{{CONFIG.DATABASE.PORT}}',
    DATABASE_NAME: '{{CONFIG.DATABASE.NAME}}',
    DATABASE_SCHEMA: '{{CONFIG.DATABASE.SCHEMA}}',
  };

  /**
   * 智能账号匹配服务
   * 根据测试步骤内容自动匹配合适的账号类型
   */
  /**
   * 根据文本上下文智能匹配账号类型
   * 
   * 🔥 动态匹配：根据项目实际配置的账号类型进行匹配
   * 
   * @param text 要分析的文本
   * @param allAccounts 项目所有账号配置列表
   * @returns 匹配到的账号类型（account_type）
   */
  private matchAccountTypeByContext(text: string, allAccounts: any[]): string {
    if (!text || !allAccounts || allAccounts.length === 0) {
      return allAccounts?.[0]?.account_type || 'admin'; // 默认使用第一个账号类型
    }

    const lowerText = text.toLowerCase();

    // 🔥 动态构建账号类型关键词映射
    // 从账号描述中提取关键词，支持中文描述
    const accountTypeKeywords: Record<string, string[]> = {};
    
    allAccounts.forEach(account => {
      const accountType = account.account_type;
      const description = account.account_description || '';
      
      // 初始化关键词列表
      if (!accountTypeKeywords[accountType]) {
        accountTypeKeywords[accountType] = [];
      }
      
      // 添加账号类型本身作为关键词
      accountTypeKeywords[accountType].push(accountType.toLowerCase());
      
      // 从描述中提取关键词（去除标点符号，按空格和常见分隔符分割）
      if (description) {
        const descWords = description
          .toLowerCase()
          .replace(/[，。！？；：、""''（）《》【】]/g, ' ')
          .split(/[\s,，.。]+/)
          .filter(word => word.length >= 2); // 至少2个字符
        
        accountTypeKeywords[accountType].push(...descWords);
      }
      
      // 🔥 添加常见的账号类型别名
      const typeAliases: Record<string, string[]> = {
        'admin': ['管理员', '系统管理员', 'administrator', '管理', 'sysadmin'],
        'security': ['安全员', '安全管理员', '安全', 'secadmin'],
        'auditor': ['审计员', '审核员', '审计管理员', '审核管理员', '审计', '审核', 'auditadmin'],
        'operator': ['操作员', '运维员', '运维', 'operator'],
        'viewer': ['查看员', '浏览员', '访客', 'viewer', 'guest'],
        'user': ['普通用户', '用户', 'user'],
      };
      
      // 如果账号类型在别名映射中，添加对应的别名
      if (typeAliases[accountType]) {
        accountTypeKeywords[accountType].push(...typeAliases[accountType]);
      }
    });

    // 优先级1：明确的账号类型关键词（如"管理员账号"、"安全员密码"）
    for (const [accountType, keywords] of Object.entries(accountTypeKeywords)) {
      for (const keyword of keywords) {
        if (lowerText.includes(`${keyword}账号`) || 
            lowerText.includes(`${keyword}密码`) ||
            lowerText.includes(`${keyword}用户名`) ||
            lowerText.includes(`${keyword}登录`)) {
          console.log(`🎯 [智能匹配] 检测到明确的账号类型关键词 "${keyword}"，匹配类型: ${accountType}`);
          return accountType;
        }
      }
    }

    // 优先级2：功能场景关键词匹配
    for (const [accountType, keywords] of Object.entries(accountTypeKeywords)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          console.log(`🎯 [智能匹配] 检测到场景关键词 "${keyword}"，匹配类型: ${accountType}`);
          return accountType;
        }
      }
    }

    // 优先级3：使用默认账号（is_default = true）
    const defaultAccount = allAccounts.find(acc => acc.is_default);
    if (defaultAccount) {
      console.log(`🎯 [智能匹配] 未匹配到特定关键词，使用默认账号类型: ${defaultAccount.account_type}`);
      return defaultAccount.account_type;
    }

    // 优先级4：使用第一个账号
    console.log(`🎯 [智能匹配] 未匹配到特定关键词，使用第一个账号类型: ${allAccounts[0].account_type}`);
    return allAccounts[0].account_type;
  }

  /**
   * 获取项目指定类型的账号配置
   */
  private async getAccountByType(projectId: number, accountType: string): Promise<any> {
    try {
      const account = await this.testConfigService.getProjectAccountByType(projectId, accountType);
      if (account) {
        return account;
      }

      // 如果指定类型的账号不存在，回退到默认账号
      console.log(`⚠️ [ConfigVariable] 项目 ${projectId} 未找到 ${accountType} 类型账号，使用默认账号`);
      const defaultConfig = await this.testConfigService.getProjectDefaultConfig(projectId);
      return defaultConfig.account;
    } catch (error) {
      console.error(`❌ [ConfigVariable] 获取账号失败:`, error);
      return null;
    }
  }

  /**
   * 替换硬编码数据为配置变量占位符
   * 
   * @param testCaseData 测试用例数据
   * @param projectId 项目ID
   * @returns 替换后的测试用例数据
   */
  async replaceHardcodedWithPlaceholders(testCaseData: any, projectId: number): Promise<any> {
    console.log(`🔄 [ConfigVariable] 开始替换硬编码数据为配置变量占位符 (项目ID: ${projectId})...`);
    console.log(`📋 [ConfigVariable] 输入数据字段:`, Object.keys(testCaseData));

    try {
      // 获取项目所有账号配置
      const allAccounts = await this.testConfigService.getProjectAccounts(projectId);
      const config = await this.testConfigService.getProjectDefaultConfig(projectId);

      if (!allAccounts || allAccounts.length === 0) {
        console.log(`⚠️ [ConfigVariable] 项目 ${projectId} 未配置任何账号，跳过替换`);
        return testCaseData;
      }

      console.log(`🔑 [ConfigVariable] 项目共有 ${allAccounts.length} 个账号配置`);
      allAccounts.forEach(account => {
        console.log(`  - ${account.account_type}: ${account.account_name} (默认: ${account.is_default})`);
      });

      // 获取服务器URL（如果有）
      let serverUrl = '';
      if (config.server) {
        serverUrl = this.buildServerUrl(config.server);
        console.log(`🌐 [ConfigVariable] 项目配置服务器: ${serverUrl}`);
      }

      // 执行智能替换
      let replacedCount = 0;
      const replacedData = this.deepReplaceHardcodedSmart(
        testCaseData, 
        allAccounts,
        serverUrl,
        (count) => {
          replacedCount += count;
        }
      );

      if (replacedCount > 0) {
        console.log(`✅ [ConfigVariable] 成功替换 ${replacedCount} 处硬编码数据为配置变量`);
        console.log(`📋 [ConfigVariable] 替换后的testData:`, replacedData.testData?.substring?.(0, 100));
        console.log(`📋 [ConfigVariable] 替换后的steps:`, replacedData.steps?.substring?.(0, 100));
        console.log(`📋 [ConfigVariable] 替换后的testPoints[0].steps:`, replacedData.testPoints?.[0]?.steps?.substring?.(0, 100));
      } else {
        console.log(`ℹ️ [ConfigVariable] 未发现需要替换的硬编码数据`);
      }

      return replacedData;
    } catch (error: any) {
      console.error(`❌ [ConfigVariable] 替换失败:`, error);
      // 替换失败不应该阻塞流程，返回原数据
      return testCaseData;
    }
  }

  /**
   * 深度替换硬编码数据为配置变量
   * 
   * 策略：
   * 1. 只在特定字段中替换（preconditions, test_data, steps, expected_result）
   * 2. 精确替换项目配置中的账号密码值
   * 3. 识别语义上的账号密码字段
   * 4. 替换服务器URL
   * 
   * 关键原则：
   * - 已经是占位符的内容不再替换
   * - 使用严格的词边界，避免误替换
   * - 只在测试相关字段中替换，不影响名称、标签等
   */
  private deepReplaceHardcoded(
    obj: any,
    accountName: string,
    accountPassword: string,
    serverUrl: string,
    onReplace: (count: number) => void,
    fieldName: string = '',
    parentFieldName: string = ''
  ): any {
    if (typeof obj === 'string') {
      // 如果已经包含占位符，直接返回，避免重复替换
      if (obj.includes('{{CONFIG.')) {
        return obj;
      }

      let result = obj;
      let localCount = 0;

      // 1. 替换服务器URL（优先级最高）
      if (serverUrl && result.includes(serverUrl)) {
        const regex = new RegExp(this.escapeRegex(serverUrl), 'g');
        const matches = result.match(regex);
        if (matches) {
          result = result.replace(regex, this.PLACEHOLDERS.SERVER_URL);
          localCount += matches.length;
          console.log(`  🔄 [${fieldName || parentFieldName}] 替换服务器URL: ${serverUrl} -> ${this.PLACEHOLDERS.SERVER_URL}`);
        }
      }

      // 2. 精确替换项目配置中的账号密码值
      if (accountName && accountName.length >= 2) {
        const accountRegex = new RegExp(
          `(?<![a-zA-Z0-9_])${this.escapeRegex(accountName)}(?![a-zA-Z0-9_])`,
          'g'
        );
        
        const accountMatches = result.match(accountRegex);
        if (accountMatches) {
          result = result.replace(accountRegex, this.PLACEHOLDERS.ACCOUNT_USERNAME);
          localCount += accountMatches.length;
          console.log(`  🔄 [${fieldName || parentFieldName}] 替换账号名: ${accountName} -> ${this.PLACEHOLDERS.ACCOUNT_USERNAME}`);
        }
      }

      if (accountPassword && accountPassword.length >= 2) {
        const passwordRegex = new RegExp(
          `(?<![a-zA-Z0-9_])${this.escapeRegex(accountPassword)}(?![a-zA-Z0-9_])`,
          'g'
        );
        
        const passwordMatches = result.match(passwordRegex);
        if (passwordMatches) {
          result = result.replace(passwordRegex, this.PLACEHOLDERS.ACCOUNT_PASSWORD);
          localCount += passwordMatches.length;
          console.log(`  🔄 [${fieldName || parentFieldName}] 替换密码: ${accountPassword} -> ${this.PLACEHOLDERS.ACCOUNT_PASSWORD}`);
        }
      }

      if (localCount > 0) {
        onReplace(localCount);
      }

      return result;
    }

    if (Array.isArray(obj)) {
      return obj.map((item, index) => 
        this.deepReplaceHardcoded(item, accountName, accountPassword, serverUrl, onReplace, `${fieldName}[${index}]`, parentFieldName || fieldName)
      );
    }

    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        // 只在特定字段中进行替换
        const shouldReplace = this.shouldReplaceField(key);
        
        if (shouldReplace) {
          console.log(`  📝 处理字段: ${key} (需要替换)`);
          result[key] = this.deepReplaceHardcoded(obj[key], accountName, accountPassword, serverUrl, onReplace, key, parentFieldName);
        } else {
          // 不替换的字段，但如果是testPoints数组，需要递归处理其中的可替换字段
          if (key === 'testPoints' && Array.isArray(obj[key])) {
            console.log(`  📝 处理testPoints数组 (共${obj[key].length}个元素)`);
            result[key] = obj[key].map((item: any, idx: number) => {
              if (item && typeof item === 'object') {
                const itemResult: any = {};
                for (const itemKey in item) {
                  if (this.shouldReplaceField(itemKey)) {
                    itemResult[itemKey] = this.deepReplaceHardcoded(item[itemKey], accountName, accountPassword, serverUrl, onReplace, itemKey, 'testPoints');
                  } else {
                    itemResult[itemKey] = item[itemKey];
                  }
                }
                return itemResult;
              }
              return item;
            });
          } else {
            result[key] = obj[key];
          }
        }
      }
      return result;
    }

    return obj;
  }

  /**
   * 判断字段是否应该进行配置变量替换
   * 
   * 只在以下字段中替换：
   * - preconditions: 前置条件
   * - test_data: 测试数据
   * - testData: 测试数据（兼容）
   * - steps: 测试步骤
   * - test_point_steps: 测试点步骤
   * - expected_result: 预期结果
   * - test_point_expected_result: 测试点预期结果
   * - expectedResult: 预期结果（兼容）
   * - assertions: 断言（兼容）
   */
  private shouldReplaceField(fieldName: string): boolean {
    const replaceableFields = [
      'preconditions',      // 前置条件
      'test_data',          // 测试数据
      'testData',           // 测试数据（兼容）
      'steps',              // 测试步骤
      'test_point_steps',   // 测试点步骤
      'expected_result',    // 预期结果
      'test_point_expected_result',  // 测试点预期结果
      'expectedResult',     // 预期结果（兼容）
      'assertions'          // 断言（兼容）
    ];
    
    return replaceableFields.includes(fieldName);
  }

  /**
   * 批量替换测试用例数据中的占位符为实际值
   * 
   * @param testCases 测试用例数组
   * @param projectId 项目ID
   * @returns 替换后的测试用例数组（占位符已替换为实际值）
   */
  async batchReplacePlaceholders(testCases: any[], projectId: number): Promise<any[]> {
    if (!testCases || testCases.length === 0) {
      return testCases;
    }

    console.log(`🔄 [ConfigVariable] 批量替换 ${testCases.length} 个测试用例的配置变量为实际值...`);

    try {
      // 获取项目配置
      const config = await this.testConfigService.getProjectDefaultConfig(projectId);
      
      // 获取所有账号并构建映射表
      const allAccounts = await this.testConfigService.getProjectAccounts(projectId);
      const accountsMap: Record<string, any> = {};
      allAccounts.forEach(account => {
        accountsMap[account.account_type] = account;
      });
      
      // 批量替换
      const replacedCases = testCases.map(testCase => {
        return this.replaceObjectPlaceholders(testCase, config, accountsMap);
      });

      console.log(`✅ [ConfigVariable] 批量替换完成`);
      return replacedCases;
    } catch (error: any) {
      console.error(`❌ [ConfigVariable] 批量替换失败:`, error);
      return testCases;
    }
  }

  /**
   * 替换单个测试用例的占位符为实际值（用于前端显示）
   * 
   * @param testCase 测试用例数据
   * @param projectId 项目ID
   * @returns 替换后的测试用例数据
   */
  async replacePlaceholdersWithActualValues(testCase: any, projectId: number): Promise<any> {
    if (!testCase) {
      return testCase;
    }

    console.log(`🔄 [ConfigVariable] 替换测试用例占位符为实际值 (项目ID: ${projectId})...`);

    try {
      // 获取项目配置
      const config = await this.testConfigService.getProjectDefaultConfig(projectId);
      
      // 获取所有账号并构建映射表
      const allAccounts = await this.testConfigService.getProjectAccounts(projectId);
      const accountsMap: Record<string, any> = {};
      allAccounts.forEach(account => {
        accountsMap[account.account_type] = account;
      });
      
      // 替换占位符
      const replacedCase = this.replaceObjectPlaceholders(testCase, config, accountsMap);

      console.log(`✅ [ConfigVariable] 占位符替换完成`);
      return replacedCase;
    } catch (error: any) {
      console.error(`❌ [ConfigVariable] 占位符替换失败:`, error);
      return testCase;
    }
  }

  /**
   * 替换对象中的占位符为实际值
   */
  private replaceObjectPlaceholders(obj: any, config: any, accountsMap?: Record<string, any>): any {
    if (typeof obj === 'string') {
      return this.replacePlaceholdersInString(obj, config, accountsMap);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.replaceObjectPlaceholders(item, config, accountsMap));
    }

    // 🔥 修复：保留 Date 对象，不要将其转换为普通对象
    if (obj instanceof Date) {
      return obj;
    }

    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        result[key] = this.replaceObjectPlaceholders(obj[key], config, accountsMap);
      }
      return result;
    }

    return obj;
  }

  /**
   * 替换字符串中的占位符为实际值（支持多账号类型）
   */
  private replacePlaceholdersInString(text: string, config: any, accountsMap?: Record<string, any>): string {
    if (!text || !text.includes('{{CONFIG.')) {
      return text;
    }

    let result = text;

    // 替换默认账号占位符
    if (config.account) {
      result = result.replace(
        new RegExp(this.escapeRegex(this.PLACEHOLDERS.ACCOUNT_USERNAME), 'g'),
        config.account.account_name || ''
      );
      result = result.replace(
        new RegExp(this.escapeRegex(this.PLACEHOLDERS.ACCOUNT_PASSWORD), 'g'),
        config.account.account_password || ''
      );
    }

    // 替换多账号类型占位符
    if (accountsMap) {
      // Admin 账号
      if (accountsMap['admin']) {
        result = result.replace(
          new RegExp(this.escapeRegex(this.PLACEHOLDERS.ACCOUNT_ADMIN_USERNAME), 'g'),
          accountsMap['admin'].account_name || ''
        );
        result = result.replace(
          new RegExp(this.escapeRegex(this.PLACEHOLDERS.ACCOUNT_ADMIN_PASSWORD), 'g'),
          accountsMap['admin'].account_password || ''
        );
      }
      
      // Security 账号
      if (accountsMap['security']) {
        result = result.replace(
          new RegExp(this.escapeRegex(this.PLACEHOLDERS.ACCOUNT_SECURITY_USERNAME), 'g'),
          accountsMap['security'].account_name || ''
        );
        result = result.replace(
          new RegExp(this.escapeRegex(this.PLACEHOLDERS.ACCOUNT_SECURITY_PASSWORD), 'g'),
          accountsMap['security'].account_password || ''
        );
      }
      
      // Auditor 账号
      if (accountsMap['auditor']) {
        result = result.replace(
          new RegExp(this.escapeRegex(this.PLACEHOLDERS.ACCOUNT_AUDITOR_USERNAME), 'g'),
          accountsMap['auditor'].account_name || ''
        );
        result = result.replace(
          new RegExp(this.escapeRegex(this.PLACEHOLDERS.ACCOUNT_AUDITOR_PASSWORD), 'g'),
          accountsMap['auditor'].account_password || ''
        );
      }
    }

    // 替换服务器相关占位符
    if (config.server) {
      const serverUrl = this.buildServerUrl(config.server);
      result = result.replace(
        new RegExp(this.escapeRegex(this.PLACEHOLDERS.SERVER_URL), 'g'),
        serverUrl
      );
    }

    return result;
  }

  /**
   * 智能替换硬编码数据为配置变量（支持多账号类型）
   * 
   * 核心策略：
   * 1. 先替换服务器URL
   * 2. 使用智能语义匹配确定当前文本应该使用的账号类型
   * 3. 根据智能匹配的类型，替换所有账号值为该类型的占位符
   * 4. 语义化模式替换（带标签的账号密码）
   * 
   * 关键：智能匹配决定占位符类型，而不是根据账号值决定
   */
  private deepReplaceHardcodedSmart(
    obj: any,
    allAccounts: any[],
    serverUrl: string,
    onReplace: (count: number) => void,
    fieldName: string = '',
    parentFieldName: string = ''
  ): any {
    if (typeof obj === 'string') {
      let result = obj;
      let localCount = 0;

      // 1. 替换服务器URL
      // 🔥 优先替换配置中的完整URL
      if (serverUrl && serverUrl.length >= 10 && /^https?:\/\//.test(serverUrl) && result.includes(serverUrl)) {
        const regex = new RegExp(this.escapeRegex(serverUrl), 'g');
        const matches = result.match(regex);
        if (matches) {
          result = result.replace(regex, this.PLACEHOLDERS.SERVER_URL);
          localCount += matches.length;
          console.log(`  🔄 [${fieldName || parentFieldName}] 替换服务器URL: ${serverUrl} -> ${this.PLACEHOLDERS.SERVER_URL}`);
        }
      }
      
      // 🔥 新增：智能检测并替换任何URL格式的内容（如果还没有被替换）
      if (!result.includes(this.PLACEHOLDERS.SERVER_URL)) {
        // 匹配 http:// 或 https:// 开头的URL（包括端口、路径等）
        const urlPattern = /https?:\/\/[^\s\u4e00-\u9fa5，。！？；：""''（）《》【】]+/g;
        const urlMatches = result.match(urlPattern);
        
        if (urlMatches && urlMatches.length > 0) {
          urlMatches.forEach(url => {
            // 移除末尾可能的标点符号
            const cleanUrl = url.replace(/[,，.。!！?？;；:：)）]$/, '');
            if (cleanUrl.length >= 10) {
              const urlRegex = new RegExp(this.escapeRegex(cleanUrl), 'g');
              if (result.includes(cleanUrl)) {
                result = result.replace(urlRegex, this.PLACEHOLDERS.SERVER_URL);
                localCount++;
                console.log(`  🔄 [${fieldName || parentFieldName}] 智能替换URL: ${cleanUrl} -> ${this.PLACEHOLDERS.SERVER_URL}`);
              }
            }
          });
        }
      }

      // 2. 智能语义匹配确定账号类型
      const smartAccountType = this.matchAccountTypeByContext(result, allAccounts);
      const usernamePlaceholder = this.getAccountPlaceholderByType(smartAccountType, 'username');
      const passwordPlaceholder = this.getAccountPlaceholderByType(smartAccountType, 'password');
      
      // 🔥 新增：字段语义分析，确定应该使用用户名还是密码占位符
      const fieldSemantic = this.analyzeFieldSemantic(result, fieldName);
      console.log(`  🔍 [${fieldName || parentFieldName}] 字段语义分析: ${fieldSemantic}`);
      
      // 🔥 新增：智能输入值替换
      // 如果字段语义明确是用户名或密码，尝试提取并替换输入值
      // 🔥 修复：支持 both 语义，逐行分析和替换
      if (fieldSemantic === 'username' || fieldSemantic === 'password' || fieldSemantic === 'both') {
        // 如果是 both，需要逐行处理
        if (fieldSemantic === 'both') {
          const lines = result.split('\n');
          let hasReplacement = false;
          
          const processedLines = lines.map(line => {
            // 分析每一行的语义
            const lineSemantic = this.analyzeFieldSemantic(line, fieldName);
            
            if (lineSemantic === 'username' || lineSemantic === 'password') {
              const inputValue = this.extractInputValue(line);
              if (inputValue) {
                const targetPlaceholder = lineSemantic === 'username' ? usernamePlaceholder : passwordPlaceholder;
                
                // 检查是否已经包含对应的占位符
                if (line.includes(targetPlaceholder)) {
                  return line;
                }
                
                // 构建精确匹配的正则表达式（匹配冒号后面的值）
                const inputValueRegex = new RegExp(
                  `([：:])\\s*${this.escapeRegex(inputValue)}(?=\\s|$|\\n|\\r|，|,|。|\\.)`,
                  'g'
                );
                
                if (inputValueRegex.test(line)) {
                  hasReplacement = true;
                  localCount++;
                  const replacedLine = line.replace(inputValueRegex, `$1${targetPlaceholder}`);
                  console.log(`  🔄 [${fieldName || parentFieldName}] 智能替换输入值 "${inputValue}" -> ${targetPlaceholder} (行语义: ${lineSemantic})`);
                  return replacedLine;
                }
              }
            }
            return line;
          });
          
          if (hasReplacement) {
            result = processedLines.join('\n');
          }
        } else {
          // 单一语义，直接处理
          const inputValue = this.extractInputValue(result);
          if (inputValue) {
            console.log(`  🔍 [${fieldName || parentFieldName}] 提取到输入值: "${inputValue}"`);
            
            // 根据字段语义选择占位符
            const targetPlaceholder = fieldSemantic === 'username' ? usernamePlaceholder : passwordPlaceholder;
            
            // 检查是否已经包含对应的占位符
            if (result.includes(targetPlaceholder)) {
              console.log(`  ⏭️ [${fieldName || parentFieldName}] 已包含占位符 ${targetPlaceholder}，跳过智能替换`);
            } else {
              // 构建精确匹配的正则表达式（匹配冒号后面的值）
              const inputValueRegex = new RegExp(
                `([：:])\\s*${this.escapeRegex(inputValue)}(?=\\s|$|\\n|\\r|，|,|。|\\.)`,
                'g'
              );
              
              const inputMatches = result.match(inputValueRegex);
              if (inputMatches) {
                // 替换为占位符，保留冒号
                result = result.replace(inputValueRegex, `$1${targetPlaceholder}`);
                localCount += inputMatches.length;
                console.log(`  🔄 [${fieldName || parentFieldName}] 智能替换输入值 "${inputValue}" -> ${targetPlaceholder} (字段语义: ${fieldSemantic})`);
              }
            }
          }
        }
      }
      
      // 3. 替换所有已知账号的密码（按长度降序，避免子串误匹配）
      // 仅当字段语义允许时才替换密码
      if (fieldSemantic === 'password' || fieldSemantic === 'both' || fieldSemantic === 'none') {
        // 检查是否已经包含密码占位符
        if (result.includes(passwordPlaceholder)) {
          console.log(`  ⏭️ [${fieldName || parentFieldName}] 已包含密码占位符，跳过密码替换`);
        } else {
          const accountsByPasswordLength = [...allAccounts]
            .filter(acc => acc.account_password && acc.account_password.length >= 2)
            .sort((a, b) => (b.account_password?.length || 0) - (a.account_password?.length || 0));

          accountsByPasswordLength.forEach(account => {
            const passwordRegex = new RegExp(
              `(?<![a-zA-Z0-9_$])${this.escapeRegex(account.account_password)}(?![a-zA-Z0-9_])`,
              'g'
            );
            const passwordMatches = result.match(passwordRegex);
            if (passwordMatches) {
              result = result.replace(passwordRegex, passwordPlaceholder);
              localCount += passwordMatches.length;
              console.log(`  🔄 [${fieldName || parentFieldName}] 替换密码 ${account.account_password} -> ${passwordPlaceholder} (智能匹配: ${smartAccountType})`);
            }
          });
        }
      } else {
        console.log(`  ⏭️ [${fieldName || parentFieldName}] 字段语义为 ${fieldSemantic}，跳过密码替换`);
      }

      // 4. 替换所有已知账号的用户名（按长度降序）
      // 仅当字段语义允许时才替换用户名
      if (fieldSemantic === 'username' || fieldSemantic === 'both' || fieldSemantic === 'none') {
        // 检查是否已经包含用户名占位符
        if (result.includes(usernamePlaceholder)) {
          console.log(`  ⏭️ [${fieldName || parentFieldName}] 已包含用户名占位符，跳过用户名替换`);
        } else {
          const accountsByNameLength = [...allAccounts]
            .filter(acc => acc.account_name && acc.account_name.length >= 2)
            .sort((a, b) => (b.account_name?.length || 0) - (a.account_name?.length || 0));

          accountsByNameLength.forEach(account => {
            const accountRegex = new RegExp(
              `(?<![a-zA-Z0-9_])${this.escapeRegex(account.account_name)}(?![a-zA-Z0-9_])`,
              'g'
            );
            const accountMatches = result.match(accountRegex);
            if (accountMatches) {
              result = result.replace(accountRegex, usernamePlaceholder);
              localCount += accountMatches.length;
              console.log(`  🔄 [${fieldName || parentFieldName}] 替换用户名 ${account.account_name} -> ${usernamePlaceholder} (智能匹配: ${smartAccountType})`);
            }
          });
        }
      } else {
        console.log(`  ⏭️ [${fieldName || parentFieldName}] 字段语义为 ${fieldSemantic}，跳过用户名替换`);
      }

      // 5. 语义化替换（带标签的账号密码，使用智能匹配的占位符）
      if (!result.includes('{{CONFIG.')) {
        result = this.replaceSemanticPatternsSmart(result, smartAccountType, fieldName, parentFieldName, (count) => {
          localCount += count;
        });
      }

      if (localCount > 0) {
        onReplace(localCount);
        
        // ✅ 验证替换结果
        const validation = this.validateReplacement(obj, result, fieldName);
        if (!validation.valid) {
          console.warn(`  ⚠️ [${fieldName || parentFieldName}] 替换结果可能有问题:`, validation.warnings);
        }
      }

      return result;
    }

    if (Array.isArray(obj)) {
      return obj.map((item, index) => 
        this.deepReplaceHardcodedSmart(item, allAccounts, serverUrl, onReplace, `${fieldName}[${index}]`, parentFieldName || fieldName)
      );
    }

    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        const shouldReplace = this.shouldReplaceField(key);
        
        if (shouldReplace) {
          console.log(`  📝 处理字段: ${key} (需要替换)`);
          result[key] = this.deepReplaceHardcodedSmart(obj[key], allAccounts, serverUrl, onReplace, key, parentFieldName);
        } else {
          if (key === 'testPoints' && Array.isArray(obj[key])) {
            console.log(`  📝 处理testPoints数组 (共${obj[key].length}个元素)`);
            result[key] = obj[key].map((item: any, idx: number) => {
              if (item && typeof item === 'object') {
                const itemResult: any = {};
                for (const itemKey in item) {
                  if (this.shouldReplaceField(itemKey)) {
                    itemResult[itemKey] = this.deepReplaceHardcodedSmart(item[itemKey], allAccounts, serverUrl, onReplace, itemKey, 'testPoints');
                  } else {
                    itemResult[itemKey] = item[itemKey];
                  }
                }
                return itemResult;
              }
              return item;
            });
          } else {
            result[key] = obj[key];
          }
        }
      }
      return result;
    }

    return obj;
  }

  /**
   * 根据账号类型获取对应的占位符
   */
  private getAccountPlaceholderByType(accountType: string, field: 'username' | 'password'): string {
    const typeMap: Record<string, { username: string; password: string }> = {
      'admin': {
        username: this.PLACEHOLDERS.ACCOUNT_ADMIN_USERNAME,
        password: this.PLACEHOLDERS.ACCOUNT_ADMIN_PASSWORD
      },
      'security': {
        username: this.PLACEHOLDERS.ACCOUNT_SECURITY_USERNAME,
        password: this.PLACEHOLDERS.ACCOUNT_SECURITY_PASSWORD
      },
      'auditor': {
        username: this.PLACEHOLDERS.ACCOUNT_AUDITOR_USERNAME,
        password: this.PLACEHOLDERS.ACCOUNT_AUDITOR_PASSWORD
      }
    };

    // 如果找到对应类型，返回对应占位符，否则返回默认占位符
    if (typeMap[accountType]) {
      return typeMap[accountType][field];
    }

    return field === 'username' 
      ? this.PLACEHOLDERS.ACCOUNT_USERNAME 
      : this.PLACEHOLDERS.ACCOUNT_PASSWORD;
  }

  /**
   * 语义化模式替换
   * 用于替换带标签的账号密码（如 "账号：xxx"），使用默认占位符
   */
  private replaceSemanticPatterns(
    text: string, 
    fieldName: string, 
    parentFieldName: string, 
    onReplace: (count: number) => void
  ): string {
    // 使用默认的 admin 类型
    return this.replaceSemanticPatternsSmart(text, 'admin', fieldName, parentFieldName, onReplace);
  }

  /**
   * 智能语义化模式替换
   * 用于替换带标签的账号密码（如 "账号：xxx"），使用指定类型的占位符
   * 
   * 注意：只匹配明确带有冒号的格式，避免误匹配
   */
  private replaceSemanticPatternsSmart(
    text: string, 
    accountType: string,
    fieldName: string, 
    parentFieldName: string, 
    onReplace: (count: number) => void
  ): string {
    let result = text;
    let localCount = 0;

    const usernamePlaceholder = this.getAccountPlaceholderByType(accountType, 'username');
    const passwordPlaceholder = this.getAccountPlaceholderByType(accountType, 'password');

    // 访问URL模式 - 必须有冒号或明确的URL
    // 格式：访问登录页面：https://xxx 或 访问登录页面: https://xxx
    const urlAccessPattern = /(?:访问|打开|进入|浏览)(?:登录页面|页面|网址|地址|URL)?[:：]\s*(https?:\/\/[^\s'"，,\n]+)/gi;
    result = result.replace(urlAccessPattern, (match, url) => {
      // 如果已经是占位符，跳过
      if (url.includes('{{CONFIG.')) {
        return match;
      }
      localCount++;
      console.log(`  🔄 [${fieldName || parentFieldName}] 替换访问URL: ${url} -> 占位符`);
      return match.replace(url, this.PLACEHOLDERS.SERVER_URL);
    });

    // 带标签的账号模式 - 必须有冒号（中文或英文），避免误匹配
    // 格式：账号：xxx 或 账号: xxx
    const chineseAccountPattern = /(?:账号|用户名|用户|账户|登录名)[:：]\s*([^\s:：,，'"。\n]{2,20})/g;
    result = result.replace(chineseAccountPattern, (match, value) => {
      if (match.includes('{{CONFIG.') || value.includes('{{CONFIG.')) {
        return match;
      }
      // 跳过纯数字、包含路径分隔符的值
      if (/^\d+$/.test(value) || value.includes('/') || value.includes('.')) {
        return match;
      }
      localCount++;
      console.log(`  🔄 [${fieldName || parentFieldName}] 替换带标签的账号: ${value} -> ${usernamePlaceholder}`);
      return match.replace(value, usernamePlaceholder);
    });

    // 带标签的密码模式 - 必须有冒号（中文或英文），避免误匹配
    // 格式：密码：xxx 或 密码: xxx
    const chinesePasswordPattern = /(?:密码|口令|登录密码)[:：]\s*([^\s:：,，'"。\n]{2,20})/g;
    result = result.replace(chinesePasswordPattern, (match, value) => {
      if (match.includes('{{CONFIG.') || value.includes('{{CONFIG.')) {
        return match;
      }
      // 跳过纯数字
      if (/^\d+$/.test(value)) {
        return match;
      }
      localCount++;
      console.log(`  🔄 [${fieldName || parentFieldName}] 替换带标签的密码: ${value} -> ${passwordPlaceholder}`);
      return match.replace(value, passwordPlaceholder);
    });

    if (localCount > 0) {
      onReplace(localCount);
    }

    return result;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 构建服务器URL
   * 优先使用 parameters.url，如果没有则从 host_name 和 host_port 构建
   * 返回的URL必须是有效的格式（以 http:// 或 https:// 开头）
   */
  private buildServerUrl(server: any): string {
    if (!server) return '';
    
    // 优先使用 parameters.url（如果存在且是有效URL）
    if (server.parameters && typeof server.parameters === 'object') {
      const params = server.parameters as Record<string, any>;
      if (params.url && typeof params.url === 'string') {
        const url = params.url.trim();
        // 验证是否是有效的URL格式
        if (/^https?:\/\/.+/.test(url)) {
          console.log(`  🌐 使用 parameters.url: ${url}`);
          return url;
        } else {
          console.log(`  ⚠️ parameters.url 格式无效，跳过: ${url}`);
        }
      }
    }
    
    // 如果没有 parameters.url，从 host_name 和 host_port 构建
    if (!server.host_name || typeof server.host_name !== 'string' || server.host_name.trim().length < 2) {
      return '';
    }
    
    const protocol = server.host_port === 443 ? 'https' : 'http';
    const port = (server.host_port === 80 || server.host_port === 443) 
      ? '' 
      : `:${server.host_port}`;
    
    const constructedUrl = `${protocol}://${server.host_name.trim()}${port}`;
    console.log(`  🌐 从 host_name 和 host_port 构建 URL: ${constructedUrl}`);
    return constructedUrl;
  }

  /**
   * 检查文本中是否包含配置变量占位符
   */
  hasPlaceholders(text: string): boolean {
    return Boolean(text && text.includes('{{CONFIG.'));
  }

  /**
   * 获取所有占位符定义
   */
  getPlaceholders() {
    return { ...this.PLACEHOLDERS };
  }

  /**
   * 分析字段语义，确定应该替换用户名还是密码
   * 
   * @param text 字段内容
   * @param fieldName 字段名称
   * @returns 'username' | 'password' | 'both' | 'none'
   */
  private analyzeFieldSemantic(text: string, fieldName: string): 'username' | 'password' | 'both' | 'none' {
    const lowerText = text.toLowerCase();
    const lowerFieldName = fieldName.toLowerCase();
    
    // 密码相关关键词
    const passwordKeywords = [
      '密码', 'password', 'pwd', '口令',
      '密码输入框', '密码框', '输入密码', '填写密码',
      'password input', 'password field', 'enter password',
      '密码输入', '密码字段'
    ];
    
    // 用户名相关关键词
    const usernameKeywords = [
      '用户名', 'username', 'user', '账号', 'account',
      '用户名输入框', '账号输入框', '输入用户名', '输入账号',
      'username input', 'account input', 'user field',
      '用户名输入', '账号输入', '用户名字段', '账号字段'
    ];
    
    // 检查是否包含密码关键词
    const hasPasswordKeyword = passwordKeywords.some(kw => 
      lowerText.includes(kw) || lowerFieldName.includes(kw)
    );
    
    // 检查是否包含用户名关键词
    const hasUsernameKeyword = usernameKeywords.some(kw => 
      lowerText.includes(kw) || lowerFieldName.includes(kw)
    );
    
    // 如果明确是密码字段，只替换密码
    if (hasPasswordKeyword && !hasUsernameKeyword) {
      return 'password';
    }
    
    // 如果明确是用户名字段，只替换用户名
    if (hasUsernameKeyword && !hasPasswordKeyword) {
      return 'username';
    }
    
    // 如果两者都有（不太可能），返回 both
    if (hasUsernameKeyword && hasPasswordKeyword) {
      return 'both';
    }
    
    // 默认：只替换已知的账号密码值（原有逻辑）
    return 'none';
  }

  /**
   * 从文本中提取输入值
   * 例如："2. 输入用户名：ddd" -> "ddd"
   *      "3. 在密码输入框输入：3edc" -> "3edc"
   *      "2. 在用户名输入框输入管理员账号：xxx" -> "xxx"
   */
  private extractInputValue(text: string): string | null {
    // 查找最后一个冒号（中文或英文）
    // 这样可以处理 "在用户名输入框输入管理员账号：xxx" 这种多个冒号的情况
    const lastColonMatch = text.match(/[：:](?=[^：:]*$)/);
    if (lastColonMatch) {
      const lastColonIndex = lastColonMatch.index!;
      const afterColon = text.substring(lastColonIndex + 1).trim();
      
      // 提取冒号后面的值（去掉末尾的空格、换行、标点等）
      const value = afterColon.split(/[\n\r,，。.]/)[0].trim();
      
      // 验证提取的值是否有效
      if (value && 
          value.length > 0 && 
          value.length < 100 &&  // 输入值不应该太长
          !value.includes('{{CONFIG.')) {  // 已经是占位符的不处理
        console.log(`  📝 [extractInputValue] 从 "${text.substring(0, 50)}..." 中提取到值: "${value}"`);
        return value;
      }
    }
    
    console.log(`  ⚠️ [extractInputValue] 无法从 "${text.substring(0, 50)}..." 中提取输入值`);
    return null;
  }

  /**
   * 验证替换结果的正确性
   * 
   * @param original 原始字符串
   * @param replaced 替换后的字符串
   * @param fieldName 字段名称
   * @returns 验证结果
   */
  private validateReplacement(
    original: string,
    replaced: string,
    fieldName: string
  ): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    // 检查1：占位符格式是否正确
    const placeholderPattern = /\{\{CONFIG\.[A-Z_.]+\}\}/g;
    const placeholders = replaced.match(placeholderPattern) || [];
    
    placeholders.forEach(placeholder => {
      const validPlaceholders = Object.values(this.PLACEHOLDERS);
      if (!validPlaceholders.includes(placeholder)) {
        warnings.push(`未知的占位符格式: ${placeholder}`);
      }
    });
    
    // 检查2：密码字段是否使用了密码占位符
    const lowerOriginal = original.toLowerCase();
    const lowerFieldName = fieldName.toLowerCase();
    
    if (lowerOriginal.includes('密码') || 
        lowerOriginal.includes('password') ||
        lowerFieldName.includes('password') ||
        lowerFieldName.includes('pwd')) {
      const hasPasswordPlaceholder = replaced.includes('.PASSWORD}}');
      const hasUsernamePlaceholder = replaced.includes('.USERNAME}}');
      
      if (hasUsernamePlaceholder && !hasPasswordPlaceholder) {
        warnings.push(`密码字段使用了用户名占位符: "${replaced.substring(0, 50)}..."`);
      }
    }
    
    // 检查3：用户名字段是否使用了用户名占位符
    if (lowerOriginal.includes('用户名') || 
        lowerOriginal.includes('账号') ||
        lowerOriginal.includes('username') ||
        lowerOriginal.includes('account') ||
        lowerFieldName.includes('username') ||
        lowerFieldName.includes('account')) {
      const hasPasswordPlaceholder = replaced.includes('.PASSWORD}}');
      const hasUsernamePlaceholder = replaced.includes('.USERNAME}}');
      
      if (hasPasswordPlaceholder && !hasUsernamePlaceholder) {
        warnings.push(`用户名字段使用了密码占位符: "${replaced.substring(0, 50)}..."`);
      }
    }
    
    return {
      valid: warnings.length === 0,
      warnings
    };
  }
}