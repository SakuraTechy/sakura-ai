import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { DatabaseService } from './databaseService.js';
import { llmConfigManager } from '../../src/services/llmConfigManager.js';
import { AnalysisService } from './analysisService.js';
import { MARKET_INSIGHT_REQUIREMENT_DOC_SYSTEM_PROMPT } from './aiParser1.js';
import { MARKET_INSIGHT_BUILTIN_SOURCES } from '../../src/constants/marketInsightBuiltinSources.js';
import {
  getMarketInsightCategoryPromptEnum,
  mapRssChannelCategoriesToCanonical,
  normalizeMarketInsightCategory,
} from '../../src/constants/marketInsightCategories.js';
import { buildStatsForImportedReport, extractReportArticleLinks } from '../../src/utils/marketInsightReportArticles.js';

// ======================== Types ========================

export interface TaskListParams {
  page?: number;
  pageSize?: number;
}

export interface CreateTaskParams {
  title: string;
  description?: string;
  trigger_type: string;
  trigger_time: string;
  trigger_day?: number;
  data_sources?: string[];
  source_configs?: MarketSourceConfig[];
  is_active?: boolean;
}

export interface UpdateTaskParams extends Partial<CreateTaskParams> {}

export interface ReportListParams {
  page?: number;
  pageSize?: number;
  taskId?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  category?: string;
  search?: string;
}

export interface ConvertToRequirementParams {
  reportId: number;
  title: string;
  projectId?: number;
  projectVersionId?: number;
  userId: number;
}

export interface ConvertArticleToRequirementParams {
  articleId: number;
  title: string;
  projectId?: number;
  projectVersionId?: number;
  userId: number;
}

/** 一键行业资讯报告版式：default=当前提示词体例；angkai=昂楷团队资讯体；sample=固定样本 MD + 模拟耗时，不调 AI、不抓取 */
export type MarketInsightReportOutputStyle = 'default' | 'angkai' | 'sample';

/** 样本示例：模拟执行时长（毫秒），不调任何 AI 接口 */
const MARKET_INSIGHT_SAMPLE_SIMULATED_DELAY_MS = 10_000;

/** 市场洞察「样本示例」Markdown 候选路径（相对 process.cwd()，依次尝试） */
const MARKET_INSIGHT_SAMPLE_REPORT_CANDIDATES = [
  'docs/2026年数据安全领域最新资讯（昂楷科技团队专用）.md',
  '2026年数据安全领域最新资讯（昂楷科技团队专用）.md',
] as const;

export interface QuickCreateAndExecuteParams {
  industry: string;
  displayName?: string;
  maxItems?: number;
  timeWindow?: string;
  executeNow?: boolean;
  fetchMode?: 'pure_ai' | 'sources_plus_ai';
  reportOutputStyle?: MarketInsightReportOutputStyle;
}

export type MarketSourceType = 'rss' | 'api' | 'web' | 'manual';

export interface MarketSourceConfig {
  id: string;
  name: string;
  type: MarketSourceType;
  enabled: boolean;
  url: string;
  categoryHint?: string;
  /** 内置源一级领域（与前端下拉分组一致，可选） */
  domainL1?: string;
  domainL2?: string;
  timeoutMs?: number;
  maxItems?: number;
  crawlSelector?: string;
}

interface DeepReadFallback {
  fallbackTitle?: string;
  fallbackSummary?: string;
  fallbackContent?: string;
}

interface DeepReadExtractionMeta {
  strategy: 'readable' | 'fallback_text';
  durationMs: number;
  fallbackReason?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface DeepReadResult {
  title: string;
  summary: string;
  contentText: string;
  contentMarkdown: string;
  contentHtml: string;
  contentRawHtml: string;
  images: string[];
  sourceUrl: string;
  extractionMeta: DeepReadExtractionMeta;
}

/** 写入任务 description，用于识别「AI 一键行业资讯」任务并走专用报告模板 */
const MI_QUICK_INSIGHT_MARKER = '__MI_QUICK_INSIGHT__';

type CategoryId = 'ai-ml' | 'security' | 'engineering' | 'tools' | 'opinion' | 'other';

const CATEGORY_META: Record<CategoryId, { emoji: string; label: string }> = {
  'ai-ml':       { emoji: '🤖', label: '人工智能' },
  'security':    { emoji: '🔒', label: '数据安全' },
  'engineering': { emoji: '⚙️', label: '工程技术' },
  'tools':       { emoji: '🛠', label: '工具开源' },
  'opinion':     { emoji: '💡', label: '观点评论' },
  'other':       { emoji: '📝', label: '其他' },
};

const DEFAULT_SOURCE_CONFIGS: MarketSourceConfig[] = [...MARKET_INSIGHT_BUILTIN_SOURCES];

/** 纯 AI 行业报告：长文结构参考业界资讯汇编（政策法规/趋势/合规/厂商/建议），无实时抓取 */
const MARKET_INSIGHT_SYSTEM_PURE_AI = `你是「行业资讯与情报分析」助手，负责生成结构化、可读性强的行业洞察长文。

【能力边界】
- 仅基于模型知识与用户给定的行业、时间窗进行归纳与推演；当前为纯 AI 模式，无实时网页/RSS/API 抓取。
- 不得声称已访问互联网或已读取具体站点。

【诚实性约束】
- 文首必须有一段 Markdown 引用块（以 > 开头），说明：本节为基于模型知识与用户给定行业的一般性分析，非实时抓取结果。
- 禁止编造可验证的假新闻标题、假 URL、假「今日刚发生」细节；若举例须标注「典型场景」「行业常见现象」或「推断」。
- 涉及法规/政策时，可写「近年/常见立法方向」类表述，避免捏造精确生效日与条文编号，除非属于广泛公认的公开信息。

【输出结构】（Markdown，章节标题用 ## / ###，内容尽量充实，避免空泛）
1. 开篇用 2-4 句总述（可含对目标行业的针对性视角）。
2. ## 政策法规动态（分点，每点可含：要点、影响、合规提示；无则写暂无）
3. ## 行业趋势分析（宏观趋势、技术演进、市场与需求变化等）
4. ## 企业合规要点（数据处理、出境、审计留痕、供应链等可落地关注点）
5. ## 国内外厂商动态与新技术（产品、报告、技术方向；无则写暂无）
6. ## 洞察与建议（分「机会 / 风险 / 产品或业务建议」等小节，条目具体可执行）
文末可加简短「信息说明」：建议切换「数据源+AI」以获取可引用原文链接的资讯。`;

/** 一键行业资讯（数据源+AI）：基于抓取条目重组为资讯汇编体例 */
const MARKET_INSIGHT_SYSTEM_RICH_QUICK_SOURCES = `你是资深行业情报编辑。用户将提供一批已抓取的资讯条目（标题、链接、摘要、来源、时间等）。

【能力边界】
- 正文中的事实性表述必须能对应到用户提供的某条条目；禁止编造用户列表中不存在的 URL 或文章标题。
- 归纳、趋势判断、建议可以基于多条材料综合，但若超出材料支撑，须标注「（推断）」。
- 用户未提供的具体数据（如精确市场份额数字）不要捏造；可写「材料中提及」或省略。

【输出】
- 全文 Markdown，结构参考专业资讯汇编，章节如下（无内容则写「暂无」并说明依据不足）：
  - 开头 2-4 句总述（可带行业名）
  - ## 政策法规动态
  - ## 行业趋势分析
  - ## 企业合规要点
  - ## 国内外厂商动态与新技术
  - ## 洞察与建议（机会、竞争与差异化、产品/研发方向建议等）
- **覆盖面**：在材料条数较多时，每个大节应拆成 **多条** 独立编号要点（3～8 条/节为宜），优先「一条材料或一个独立 URL 对应至少一处正文呈现」；禁止因篇幅把多条材料笼统合并成一句而丢失厂商名、报告名、数据与链接。
- **写法**：每点使用 \`1. **具体短标题**\`；标题下先用 1～3 行叙述（可含列表项 \`- 要点：\`），**最后单独一行** \`- 来源链接：https://...\`（URL 必须来自材料；一条多链接可写在一行内用顿号或「、」分隔多个 URL）。
- **「国内外厂商动态与新技术」** 须优先写清：市场份额/排名类、第三方评测或报告类（如 IDC 等）、厂商产品与方案、技术实践；报告类示例如下（结构仿写，勿抄虚构内容）：
  \`\`\`
  2. **IDC数据安全管理平台报告**
     覆盖360数字安全、阿里、安恒、安华金和、绿盟、美创、奇安信、启明星辰等；功能评估分为：完全支持/部分支持/合作伙伴支持/规划中/不支持
     - 来源链接：https://cloud.tencent.com.cn/developer/article/2636437
  \`\`\`
- 不要输出「Skills」章节。`;

/** 数据源+AI + 昂楷范例体：固定「一、」～「五、」章节、编号+粗体小节、字段化短横线、节间 --- */
const MARKET_INSIGHT_SYSTEM_RICH_QUICK_ANGKAI = `你是资深行业情报编辑。用户将提供一批已抓取的资讯条目（标题、链接、摘要、来源、时间等）。

【能力边界】（与默认体相同）
- 正文中的事实性表述必须能对应到用户提供的某条条目；禁止编造用户列表中不存在的 URL 或文章标题。
- 归纳、趋势判断、建议可综合多条材料；超出材料支撑须标注「（推断）」。
- 不得捏造列表未出现的精确数据。

【版式强制要求】必须严格遵守下列 Markdown 结构（章节名与层级不得改；**要点要写得饱满**，避免只写标题一句话）：
1. 第一行必须是一级标题，格式示例：# 2026年数据安全领域最新资讯（团队专用）
   - 年份用用户给定时间窗或当前报告语境下的合理年份；行业取自用户材料中的目标行业；括号内为受众说明（可从任务标题提炼，如「某某团队专用」）。
2. 二级标题必须依次为（全角顿号）：
   ## 一、政策法规动态
   （每个要点：\`1. **加粗短标题**\`；其下用 \`- 字段名：内容\` 多行展开——政策类常用：生效时间、核心内容、影响、来源链接等；**每条最后必须单独一行** \`- 来源链接：URL\`，URL 仅来自用户材料。材料充足时本节至少 3～6 条编号要点。）
   然后单独一行只写：---
   ## 二、行业趋势分析
   （同上；每条尽量含解读句 + \`- 来源链接：\`；材料充足时至少 3～6 条。）
   ---
   ## 三、企业合规要点
   （同上；材料充足时至少 2～5 条。）
   ---
   ## 四、国内外厂商动态与新技术
   （**本节必须写细**：市场份额/排名、第三方报告与评测（如 IDC、Gartner 等）、厂商产品与方案、云安全/数据安全产品动态须 **分条** 展开；每条均为 \`N. **具体标题**\`，标题下先写 1～4 行正文（可含 \`- 子点：\`），**最后单独一行** \`- 来源链接：\`；一条材料多个 URL 可写在一行内用顿号分隔。）
   **结构范例（仿写格式，内容须来自用户材料）：**
   \`\`\`
   2. **IDC数据安全管理平台报告**
      覆盖360数字安全、阿里、安恒、安华金和、绿盟、美创、奇安信、启明星辰等；功能评估分为：完全支持/部分支持/合作伙伴支持/规划中/不支持
      - 来源链接：https://cloud.tencent.com.cn/developer/article/2636437
   \`\`\`
   材料条数 ≥10 时，本节至少 4 条独立编号要点（在材料可支撑前提下）；**不得**把多条互不相关的材料挤成一条而省略链接。
   ---
   ## 五、给{与一级标题受众一致的简称}的洞察与建议
   其下必须包含且仅包含三个三级标题（顺序固定）：
   ### 市场机会
   ### 竞争分析
   ### 产品研发方向建议
   （每节下用编号列表 1. 2. …，**每条条目至少 2～4 句**，可结合材料；推断须标注「（推断）」。）
3. 每个「一」～「四」大节结束后必须有单独一行的 --- 分隔（第五节前也要有 ---）。
4. **材料覆盖**：用户提供的每条资讯（尤其不同 URL）原则上应在「一」～「四」中至少一处体现；同一主题多条材料可合并为一条但须列出全部相关链接。
5. 不要输出「今日看点」「Skills」「参考来源」等额外章节（参考来源由系统附录）。`;

/** 纯 AI + 昂楷范例体：同上骨架 + 诚实性约束 */
const MARKET_INSIGHT_SYSTEM_PURE_AI_ANGKAI = `你是「行业资讯与情报分析」助手，输出「昂楷团队资讯」固定版式的长文。

【能力边界】
- 纯 AI 模式：无实时抓取；不得声称已访问互联网。

【诚实性约束】
- 文首在一级标题之前，先输出一段 Markdown 引用块（> 开头），说明：基于模型知识与给定行业的一般性分析，非实时抓取；不得编造假 URL；若举例标注「典型场景」或「推断」。

【版式强制要求】与「数据源模式」成品一致：
- 第一行一级标题：# {合理年份}年{行业}领域最新资讯（受众后缀）
- 依次输出 ## 一、政策法规动态 … ## 五、给{受众简称}的洞察与建议，大节之间用 --- 分隔。
- 每节内用 1. **标题** + 多行子项 \`- 字段：内容\`；**第四节「国内外厂商…」至少 4 条**独立编号要点，每条正文充实（勿仅一行标题），无链接时写 \`- 来源：暂无可引用来源（推断）\`。
- 第五节下必须有 ### 市场机会 / ### 竞争分析 / ### 产品研发方向建议；每小节下 **至少 3 条** 有实质内容的句子或编号项，避免空泛口号。
- 禁止伪造 http(s) 链接；可描述「典型第三方报告评测框架」「常见厂商格局」等并标注推断。`;

/** 数据源+AI「今日看点」：仅基于给定列表归纳，禁止幻觉 */
const MARKET_INSIGHT_SYSTEM_HIGHLIGHTS = `你是「今日看点」撰稿助手。

【能力边界】
- 你只能依据用户提供的文章编号列表做宏观归纳，不得补充列表中未出现的具体新闻事件、公司名或漏洞编号。
- 若列表信息不足，如实说明「条目较少或信息有限」，不要编造。

【输出】
- 3-5 句中文，风格像新闻导语；提炼 2-3 个主要趋势或话题，不要逐篇列举。
- 直接返回纯文本，不要 JSON，不要使用 markdown 标记。`;

/** LLM 分类：仅 JSON，减少跑题 */
const MARKET_INSIGHT_SYSTEM_CLASSIFIER = `你是信息分类器。仅根据用户给出的标题、摘要、链接，从给定枚举中选一个最匹配的类别。
必须逐字使用用户指定的中文类别名；不要输出解释性文字；仅返回一行合法 JSON：{"category":"...","confidence":0到1之间的小数}。`;

/** 关闭所有市场洞察 LLM 提示词日志：MARKET_INSIGHT_LOG_PROMPTS=0 或 false */
function marketInsightPromptLoggingEnabled(): boolean {
  const v = process.env.MARKET_INSIGHT_LOG_PROMPTS?.trim().toLowerCase();
  return v !== '0' && v !== 'false';
}

/** 单条 message 最大输出长度，超出截断（默认 12000） */
function marketInsightPromptMaxChars(): number {
  const n = parseInt(process.env.MARKET_INSIGHT_LOG_PROMPT_MAX_CHARS || '12000', 10);
  return Number.isFinite(n) && n >= 200 ? n : 12000;
}

/** 是否输出「文章分类」完整提示词（默认否，避免一篇报告触发大量相同 system）设为 1 开启 */
function marketInsightClassifyPromptLoggingEnabled(): boolean {
  return process.env.MARKET_INSIGHT_LOG_CLASSIFY_PROMPTS === '1';
}

function clipForLog(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

function logMarketInsightLLMPrompts(
  scene: string,
  model: string | undefined,
  messages: Array<{ role: string; content: string }>
): void {
  if (!marketInsightPromptLoggingEnabled()) return;
  const maxChars = marketInsightPromptMaxChars();
  console.log(`[MarketInsight][LLM Prompt][${scene}] model=${model ?? '(default)'} messages=${messages.length}`);
  for (const m of messages) {
    const role = m.role || 'unknown';
    const body = clipForLog(String(m.content ?? ''), maxChars);
    console.log(`[MarketInsight][LLM Prompt][${scene}] ---------- ${role} ----------`);
    console.log(body);
  }
}

// ======================== Service ========================

export class MarketInsightService {
  private prisma: PrismaClient;
  private analysisService: AnalysisService;

  constructor() {
    this.prisma = DatabaseService.getInstance().getClient();
    this.analysisService = new AnalysisService();
  }

  // ========== Task CRUD ==========

  async getTaskList(params: TaskListParams = {}) {
    const { page = 1, pageSize = 20 } = params;

    const [tasks, total] = await Promise.all([
      this.prisma.market_insight_tasks.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          reports: {
            select: { id: true },
            take: 0,
          },
          _count: { select: { reports: true } }
        }
      }),
      this.prisma.market_insight_tasks.count()
    ]);

    return {
      data: tasks,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };
  }

  async getTaskById(id: number) {
    return this.prisma.market_insight_tasks.findUnique({
      where: { id },
      include: { _count: { select: { reports: true } } }
    });
  }

  async createTask(params: CreateTaskParams) {
    const normalizedSources = this.normalizeTaskSources(params.data_sources, params.source_configs);
    return this.prisma.market_insight_tasks.create({
      data: {
        title: params.title,
        description: params.description || null,
        trigger_type: params.trigger_type,
        trigger_time: params.trigger_time,
        trigger_day: params.trigger_day || null,
        data_sources: JSON.stringify(normalizedSources),
        is_active: params.is_active !== undefined ? params.is_active : true,
      }
    });
  }

  async updateTask(id: number, params: UpdateTaskParams) {
    const data: any = {};
    if (params.title !== undefined) data.title = params.title;
    if (params.description !== undefined) data.description = params.description;
    if (params.trigger_type !== undefined) data.trigger_type = params.trigger_type;
    if (params.trigger_time !== undefined) data.trigger_time = params.trigger_time;
    if (params.trigger_day !== undefined) data.trigger_day = params.trigger_day;
    if (params.data_sources !== undefined || params.source_configs !== undefined) {
      data.data_sources = JSON.stringify(
        this.normalizeTaskSources(params.data_sources, params.source_configs)
      );
    }
    if (params.is_active !== undefined) data.is_active = params.is_active;

    return this.prisma.market_insight_tasks.update({ where: { id }, data });
  }

  async deleteTask(id: number) {
    await this.prisma.market_insight_reports.deleteMany({ where: { task_id: id } });
    return this.prisma.market_insight_tasks.delete({ where: { id } });
  }

  async batchDeleteTasks(ids: number[]) {
    if (!ids.length) return { deletedCount: 0 };
    const uniqueIds = Array.from(new Set(ids));
    await this.prisma.market_insight_reports.deleteMany({
      where: { task_id: { in: uniqueIds } },
    });
    const result = await this.prisma.market_insight_tasks.deleteMany({
      where: { id: { in: uniqueIds } },
    });
    return { deletedCount: result.count };
  }

  // ========== Report CRUD ==========

  async getReportList(params: ReportListParams = {}) {
    const { page = 1, pageSize = 10, taskId, startDate, endDate, status, category, search } = params;
    const where: any = {};

    if (taskId) where.task_id = taskId;
    if (status) where.status = status;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { summary: { contains: search } }
      ];
    }
    if (startDate || endDate) {
      where.executed_at = {};
      if (startDate) where.executed_at.gte = new Date(startDate);
      if (endDate) where.executed_at.lte = new Date(endDate);
    }

    const [reports, total] = await Promise.all([
      this.prisma.market_insight_reports.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { executed_at: 'desc' },
        include: {
          task: { select: { id: true, title: true } }
        }
      }),
      this.prisma.market_insight_reports.count({ where })
    ]);

    return {
      data: reports,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };
  }

  async getReportById(id: number) {
    return this.prisma.market_insight_reports.findUnique({
      where: { id },
      include: { task: { select: { id: true, title: true } } }
    });
  }

  async deleteReport(id: number) {
    return this.prisma.market_insight_reports.delete({ where: { id } });
  }

  async batchDeleteReports(ids: number[]) {
    if (!ids.length) return { deletedCount: 0 };
    const uniqueIds = Array.from(new Set(ids));
    const result = await this.prisma.market_insight_reports.deleteMany({
      where: { id: { in: uniqueIds } },
    });
    return { deletedCount: result.count };
  }

  // ========== Execute Task ==========

  async executeTask(taskId: number): Promise<number> {
    const task = await this.prisma.market_insight_tasks.findUnique({ where: { id: taskId } });
    if (!task) throw new Error('任务不存在');

    const report = await this.prisma.market_insight_reports.create({
      data: {
        task_id: taskId,
        title: `${task.title} - ${new Date().toISOString().slice(0, 10)}`,
        content: '',
        category: '其他',
        status: 'running',
        executed_at: new Date(),
      }
    });

    this.runTaskInBackground(task, report.id).catch(err => {
      console.error(`[MarketInsight] 任务 ${taskId} 执行失败:`, err.message);
    });

    return report.id;
  }

  async quickCreateAndExecuteByIndustry(params: QuickCreateAndExecuteParams): Promise<{ taskId: number; reportId: number | null; status: 'created' | 'running' }> {
    const industry = (params.industry || '').trim();
    if (!industry) {
      throw new Error('行业不能为空');
    }
    const fetchMode = params.fetchMode === 'pure_ai' ? 'pure_ai' : 'sources_plus_ai';
    const reportOutputStyle: MarketInsightReportOutputStyle =
      params.reportOutputStyle === 'angkai'
        ? 'angkai'
        : params.reportOutputStyle === 'sample'
          ? 'sample'
          : 'default';

    const sourceConfigs = fetchMode === 'pure_ai'
      ? []
      : this.buildSourcesByIndustry(industry, params.maxItems);
    if (fetchMode !== 'pure_ai' && sourceConfigs.length === 0) {
      throw new Error('该行业暂无可用数据源，请更换行业关键词或手动配置');
    }

    const safeIndustry = industry.replace(/\s+/g, ' ').slice(0, 80);
    const now = new Date();
    const ymd = now.toISOString().slice(0, 10);
    const triggerTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const title = (params.displayName || `${safeIndustry}`).slice(0, 255);
    const description = [
      `自动创建于 ${ymd}，用于行业资讯一键分析。`,
      `行业：${safeIndustry}`,
      `时间窗：${params.timeWindow || '24h'}`,
      `执行模式：${fetchMode === 'pure_ai' ? '纯 AI' : '数据源 + AI'}`,
      `报告样式：${reportOutputStyle}`,
      MI_QUICK_INSIGHT_MARKER,
    ].join('\n');

    const task = await this.createTask({
      title,
      description,
      trigger_type: 'daily',
      trigger_time: triggerTime,
      is_active: false,
      source_configs: sourceConfigs,
    });

    const executeNow = params.executeNow !== false;
    if (!executeNow) {
      return { taskId: task.id, reportId: null, status: 'created' };
    }

    const reportId = fetchMode === 'pure_ai'
      ? await this.executePureAITask(task, params, safeIndustry)
      : await this.executeTask(task.id);
    await this.prisma.market_insight_reports.update({
      where: { id: reportId },
      data: {
        summary:
          reportOutputStyle === 'sample'
            ? `样本示例：模拟处理中（约 ${MARKET_INSIGHT_SAMPLE_SIMULATED_DELAY_MS / 1000} 秒，不调用 AI）…`
            : `行业：${safeIndustry}，正在抓取与分析中...`,
        stats_json: JSON.stringify({
          quickMode: true,
          requestedIndustry: safeIndustry,
          generatedAt: new Date().toISOString(),
          fetchMode,
          reportOutputStyle,
          fetchErrors: [],
          ...(reportOutputStyle === 'sample'
            ? { sampleSimulatedDelayMs: MARKET_INSIGHT_SAMPLE_SIMULATED_DELAY_MS }
            : {}),
        }),
      },
    });
    return { taskId: task.id, reportId, status: 'running' };
  }

  private async executePureAITask(task: any, params: QuickCreateAndExecuteParams, safeIndustry: string): Promise<number> {
    const report = await this.prisma.market_insight_reports.create({
      data: {
        task_id: task.id,
        title: `${task.title} - ${new Date().toISOString().slice(0, 10)}`,
        content: '',
        category: normalizeMarketInsightCategory('行业报告'),
        status: 'running',
        executed_at: new Date(),
      },
    });

    this.runPureAITaskInBackground(task, report.id, params, safeIndustry).catch((err) => {
      console.error(`[MarketInsight] 纯AI任务 ${task.id} 执行失败:`, err.message);
    });

    return report.id;
  }

  private async runPureAITaskInBackground(task: any, reportId: number, params: QuickCreateAndExecuteParams, safeIndustry: string) {
    try {
      const outputStyle = this.parseReportOutputStyleFromDescription(String(task.description || ''));
      if (outputStyle === 'sample') {
        const sample = await this.buildSampleTemplateReportPayload();
        const syncedCount = await this.syncReportLinksToInsights(sample.content);
        await this.prisma.market_insight_reports.update({
          where: { id: reportId },
          data: {
            title: `${task.title} - ${new Date().toISOString().slice(0, 10)}`,
            content: sample.content,
            summary: sample.summary,
            stats_json: JSON.stringify({
              ...(sample.stats as Record<string, unknown>),
              syncedToInsightsCount: syncedCount,
            }),
            category: normalizeMarketInsightCategory('行业报告'),
            status: 'success',
          },
        });
        await this.prisma.market_insight_tasks.update({
          where: { id: task.id },
          data: { last_executed_at: new Date() },
        });
        console.log(`[MarketInsight] 纯AI任务 ${task.id} 样本示例完成（无 AI），报告 ${reportId}`);
        return;
      }

      const aiReport = await this.generatePureAIIndustryReport(
        safeIndustry,
        params.timeWindow || '24h',
        outputStyle
      );
      await this.prisma.market_insight_reports.update({
        where: { id: reportId },
        data: {
          title: `${task.title} - ${new Date().toISOString().slice(0, 10)}`,
          content: aiReport.content,
          summary: aiReport.summary,
          stats_json: JSON.stringify(aiReport.stats),
          category: normalizeMarketInsightCategory('行业报告'),
          status: 'success',
        },
      });
      await this.prisma.market_insight_tasks.update({
        where: { id: task.id },
        data: { last_executed_at: new Date() },
      });
    } catch (error: any) {
      await this.prisma.market_insight_reports.update({
        where: { id: reportId },
        data: {
          status: 'failed',
          content: `纯AI执行失败: ${error.message}`,
          summary: `纯AI执行失败: ${error.message}`,
        },
      });
    }
  }

  private async runTaskInBackground(task: any, reportId: number) {
    try {
      const outputStyle = this.parseReportOutputStyleFromDescription(String(task.description || ''));
      if (outputStyle === 'sample') {
        const sample = await this.buildSampleTemplateReportPayload();
        const syncedCount = await this.syncReportLinksToInsights(sample.content);
        await this.prisma.market_insight_reports.update({
          where: { id: reportId },
          data: {
            title: `${task.title} - ${new Date().toISOString().slice(0, 10)}`,
            content: sample.content,
            summary: sample.summary,
            stats_json: JSON.stringify({
              ...(sample.stats as Record<string, unknown>),
              syncedToInsightsCount: syncedCount,
            }),
            category: normalizeMarketInsightCategory('行业报告'),
            status: 'success',
          },
        });
        await this.prisma.market_insight_tasks.update({
          where: { id: task.id },
          data: { last_executed_at: new Date() },
        });
        console.log(`[MarketInsight] 任务 ${task.id} 样本示例完成（无抓取无 AI），报告 ${reportId}`);
        return;
      }

      const sourceConfigs = this.parseTaskSourceConfigs(task.data_sources);

      const fetchedArticles = await this.fetchArticlesFromSources(sourceConfigs);
      const allArticles = await this.classifyArticles(fetchedArticles);

      if (fetchedArticles.length === 0) {
        const diagLines: string[] = [
          '## 执行诊断',
          '',
          `- 本次从配置数据源抓取到的文章：0 篇`,
          `- 已配置数据源数量：${sourceConfigs.length}`,
        ];
        if (this.rssErrors.length > 0) {
          diagLines.push('', '### RSS 抓取错误详情', '');
          for (const e of this.rssErrors) {
            diagLines.push(`- \`${e.url}\` → **${e.error}**`);
          }
        }
        if (sourceConfigs.length === 0) {
          diagLines.push('', '> 未配置任何数据源，建议在任务设置中添加内置源或自定义源。');
        }
        await this.prisma.market_insight_reports.update({
          where: { id: reportId },
          data: {
            status: 'failed',
            content: diagLines.join('\n'),
            summary: '执行失败：无可用数据'
          }
        });
        return;
      }

      const { content, summary, stats } = await this.generateReportContent(
        allArticles,
        task.title,
        String(task.description || '')
      );
      const topCategory = normalizeMarketInsightCategory(stats.categories?.[0]?.name || '其他');

      let savedCount = 0;
      if (allArticles.length > 0) {
        savedCount = await this.syncArticlesToInsights(allArticles);
        console.log(`[MarketInsight] 同步 ${savedCount} 篇新文章到 insights_articles`);
      }

      await this.prisma.market_insight_reports.update({
        where: { id: reportId },
        data: {
          title: `${task.title} - ${new Date().toISOString().slice(0, 10)}`,
          content,
          summary,
          stats_json: JSON.stringify({
            ...(stats as Record<string, unknown>),
            syncedToInsightsCount: savedCount,
          }),
          category: topCategory,
          status: 'success',
        }
      });

      await this.prisma.market_insight_tasks.update({
        where: { id: task.id },
        data: { last_executed_at: new Date() }
      });

      console.log(`[MarketInsight] 任务 ${task.id} 执行成功，报告 ${reportId}（本次抓取 ${fetchedArticles.length} 篇）`);
    } catch (error: any) {
      console.error(`[MarketInsight] 报告生成失败:`, error.message);
      await this.prisma.market_insight_reports.update({
        where: { id: reportId },
        data: {
          status: 'failed',
          content: `执行失败: ${error.message}`,
          summary: `执行失败: ${error.message}`
        }
      });
    }
  }

  private async syncArticlesToInsights(articles: any[]): Promise<number> {
    let savedCount = 0;

    const urls = articles.map(a => a.url).filter(Boolean);
    const existing = await this.prisma.insights_articles.findMany({
      where: { url: { in: urls } },
      select: { url: true }
    });
    const existingUrls = new Set(existing.map(e => e.url));

    const newArticles = articles.filter(a => a.url && !existingUrls.has(a.url));

    for (const article of newArticles) {
      try {
        await this.prisma.insights_articles.create({
          data: {
            title: article.title,
            category: normalizeMarketInsightCategory(article.category || '其他'),
            url: article.url,
            content: article.content || `# ${article.title}\n\n> ${article.summary || ''}\n\n原文链接: ${article.url}`,
            summary: article.summary || article.title,
            source: article.source || 'market_insight',
            published_at: article.published_at instanceof Date ? article.published_at : new Date(article.published_at || Date.now()),
          }
        });
        savedCount++;
      } catch (err: any) {
        console.warn(`[MarketInsight] 同步文章失败 "${article.title}": ${err.message}`);
      }
    }

    return savedCount;
  }

  // ========== RSS Feed Fetching (复用 digest.ts 核心逻辑) ==========

  private rssErrors: Array<{ url: string; error: string }> = [];

  private normalizeTaskSources(urls?: string[], sourceConfigs?: MarketSourceConfig[]): MarketSourceConfig[] {
    const builtins = sourceConfigs && sourceConfigs.length > 0 ? sourceConfigs : DEFAULT_SOURCE_CONFIGS;
    const customRss = (urls || []).map((url, idx) => ({
      id: `custom-rss-${idx + 1}`,
      name: `自定义 RSS ${idx + 1}`,
      type: 'rss' as const,
      enabled: true,
      url,
      maxItems: 15,
    }));
    return [...builtins, ...customRss];
  }

  buildSourcesByIndustry(industry: string, maxItems?: number): MarketSourceConfig[] {
    const q = industry.toLowerCase();
    const domainHints: string[] = [];
    if (/(安全|security|secops|漏洞|攻防|威胁|零信任|cve|apt)/i.test(q)) domainHints.push('数据安全', '漏洞与情报数据');
    if (/(ai|llm|机器学习|大模型|人工智能)/i.test(q)) domainHints.push('AI 与机器学习');
    if (/(云|cloud|devops|研发|工程|前端|后端|开源|技术)/i.test(q)) domainHints.push('技术生态');
    if (/(web3|区块链|加密|crypto)/i.test(q)) domainHints.push('区块链与 Web3');
    if (/(竞品|厂商|市场|商业)/i.test(q)) domainHints.push('竞品情报');
    if (domainHints.length === 0) {
      domainHints.push('数据安全', 'AI 与机器学习', '技术生态');
    }

    const matched = DEFAULT_SOURCE_CONFIGS
      .filter((src) => src.enabled !== false)
      .filter((src) => {
        const dom = `${src.domainL1 || ''} ${src.domainL2 || ''} ${src.categoryHint || ''} ${src.name}`.toLowerCase();
        if (domainHints.some((hint) => dom.includes(hint.toLowerCase()))) return true;
        return q.split(/\s+/).filter(Boolean).some((token) => dom.includes(token));
      })
      .slice(0, 18)
      .map((src) => ({
        ...src,
        maxItems: Math.min(Math.max(maxItems ?? src.maxItems ?? 12, 5), 50),
      }));

    const fallback = DEFAULT_SOURCE_CONFIGS
      .filter((src) => src.enabled !== false)
      .slice(0, 8)
      .map((src) => ({
        ...src,
        maxItems: Math.min(Math.max(maxItems ?? src.maxItems ?? 10, 5), 50),
      }));

    const selected = matched.length > 0 ? matched : fallback;
    return [...selected].sort((a, b) => {
      const score = (s: MarketSourceConfig) => {
        let v = 0;
        if (s.type === 'api') v += 3;
        if (s.type === 'rss') v += 2;
        if (s.type === 'web') v += 1;
        if (s.domainL1 === '数据安全' || s.domainL1 === 'AI 与机器学习') v += 1;
        return v;
      };
      return score(b) - score(a);
    });
  }

  private parseTaskSourceConfigs(raw: string | null): MarketSourceConfig[] {
    if (!raw) return [...DEFAULT_SOURCE_CONFIGS];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
        return this.normalizeTaskSources(parsed as string[], undefined);
      }
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map((item: any, idx: number) => ({
          id: item.id || `source-${idx + 1}`,
          name: item.name || `数据源${idx + 1}`,
          type: item.type || 'rss',
          enabled: item.enabled !== false,
          url: item.url,
          categoryHint: item.categoryHint || item.category_hint,
          domainL1: item.domainL1 || item.domain_l1,
          domainL2: item.domainL2 || item.domain_l2,
          timeoutMs: item.timeoutMs,
          maxItems: item.maxItems,
          crawlSelector: item.crawlSelector,
        }));
      }
    } catch {
      return [...DEFAULT_SOURCE_CONFIGS];
    }
    return [...DEFAULT_SOURCE_CONFIGS];
  }

  private async fetchArticlesFromSources(sourceConfigs: MarketSourceConfig[]): Promise<any[]> {
    const enabled = sourceConfigs.filter(s => s.enabled && s.url);
    const all: any[] = [];
    for (const source of enabled) {
      if (source.type === 'rss' || source.type === 'api') {
        const items = await this.fetchSingleFeed(source.url, source.timeoutMs || 20000);
        all.push(
          ...items.slice(0, source.maxItems || 15).map((i) => ({
            ...i,
            source: source.name,
            sourceType: source.type,
            category: normalizeMarketInsightCategory(source.categoryHint || i.category),
          }))
        );
      } else if (source.type === 'web') {
        const items = await this.fetchArticlesFromWeb(source);
        all.push(...items);
      }
    }
    return this.deduplicateArticles(all);
  }

  private deduplicateArticles(articles: any[]): any[] {
    const seen = new Set<string>();
    return articles.filter(article => {
      const key = `${article.url || ''}::${article.title || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async fetchArticlesFromWeb(source: MarketSourceConfig): Promise<any[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), source.timeoutMs || 15000);
      const response = await fetch(source.url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 SakuraAI MarketInsights Bot' },
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const links = Array.from(html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
        .map(m => ({ url: m[1], title: m[2].replace(/<[^>]*>/g, '').trim() }))
        .filter(i => i.title.length >= 8)
        .slice(0, source.maxItems || 15);
      return links.map(link => ({
        title: link.title,
        url: link.url,
        summary: `${source.name} 自动抓取`,
        content: `# ${link.title}\n\n来源: ${source.name}\n\n原文链接: ${link.url}`,
        category: normalizeMarketInsightCategory(source.categoryHint || '其他'),
        source: source.name,
        sourceType: 'web',
        published_at: new Date(),
      }));
    } catch (error: any) {
      this.rssErrors.push({ url: source.url, error: error.message });
      return [];
    }
  }

  private async fetchArticlesFromRSS(rssUrls: string[]): Promise<any[]> {
    const allArticles: any[] = [];
    this.rssErrors = [];
    const TIMEOUT_MS = 20000;
    const CONCURRENCY = 5;

    for (let i = 0; i < rssUrls.length; i += CONCURRENCY) {
      const batch = rssUrls.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(url => this.fetchSingleFeed(url, TIMEOUT_MS))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') allArticles.push(...r.value);
      }
    }

    return allArticles;
  }

  private async fetchSingleFeed(xmlUrl: string, timeoutMs: number): Promise<any[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(xmlUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/atom+xml,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errMsg = `HTTP ${response.status} ${response.statusText}`;
        this.rssErrors.push({ url: xmlUrl, error: errMsg });
        console.warn(`[MarketInsight] RSS 抓取失败 ${xmlUrl}: ${errMsg}`);
        return [];
      }
      const xml = await response.text();
      const articles = this.parseRSSToArticles(xml, xmlUrl);
      console.log(`[MarketInsight] RSS 源 ${xmlUrl} 解析到 ${articles.length} 篇文章`);
      return articles;
    } catch (error: any) {
      const errMsg = error.name === 'AbortError' ? `超时 (${timeoutMs}ms)` : error.message;
      this.rssErrors.push({ url: xmlUrl, error: errMsg });
      console.warn(`[MarketInsight] RSS 抓取失败 ${xmlUrl}: ${errMsg}`);
      return [];
    }
  }

  private parseRSSToArticles(xml: string, sourceUrl: string): any[] {
    const articles: any[] = [];
    const isAtom = xml.includes('<feed') && (xml.includes('xmlns="http://www.w3.org/2005/Atom"') || xml.includes('<feed '));

    const stripHtml = (html: string) =>
      html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ').trim();

    const extractCDATA = (text: string) => {
      const m = text.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
      return m ? m[1] : text;
    };

    const getTag = (src: string, tag: string) => {
      const m = src.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      return m?.[1] ? extractCDATA(m[1]).trim() : '';
    };

    const getAttr = (src: string, tag: string, attr: string) => {
      const m = src.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)["'][^>]*/?>`, 'i'));
      return m?.[1] || '';
    };

    const extractRssItemCategories = (chunk: string): string[] => {
      const out: string[] = [];
      for (const m of chunk.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)) {
        const inner = m[1].trim();
        const cdata = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
        const raw = cdata ? cdata[1] : inner;
        const text = stripHtml(raw);
        if (text) out.push(text);
      }
      return out;
    };

    const itemPattern = isAtom
      ? /<entry[\s>]([\s\S]*?)<\/entry>/gi
      : /<item[\s>]([\s\S]*?)<\/item>/gi;

    let match;
    while ((match = itemPattern.exec(xml)) !== null) {
      const chunk = match[1];
      const title = stripHtml(getTag(chunk, 'title'));

      let link: string;
      if (isAtom) {
        link = getAttr(chunk, 'link', 'href');
      } else {
        link = getTag(chunk, 'link') || getTag(chunk, 'guid');
      }

      const pubDateStr = isAtom
        ? (getTag(chunk, 'published') || getTag(chunk, 'updated'))
        : (getTag(chunk, 'pubDate') || getTag(chunk, 'dc:date'));
      const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

      const desc = stripHtml(
        getTag(chunk, isAtom ? 'summary' : 'description') || getTag(chunk, 'content:encoded') || getTag(chunk, 'content')
      ).slice(0, 500);

      if (title && title.length >= 3) {
        const rssCats = extractRssItemCategories(chunk);
        const rssMapped = mapRssChannelCategoriesToCanonical(rssCats);
        const rule = this.ruleClassifyArticle(title, desc, link || sourceUrl);
        const category = normalizeMarketInsightCategory(rssMapped || rule.category);
        articles.push({
          title,
          url: link || sourceUrl,
          category,
          rssCategoryApplied: Boolean(rssMapped),
          summary: desc || title,
          content: `# ${title}\n\n> ${desc}\n\n原文链接: ${link}`,
          published_at: isNaN(pubDate.getTime()) ? new Date() : pubDate,
          classification_source: 'rule',
          classification_confidence: rssMapped ? 0.88 : 0.72,
        });
      }
    }

    return articles;
  }

  private parseQuickIndustryFromDescription(description: string): string {
    const m = description.match(/行业：\s*([^\n]+)/);
    return m ? m[1].trim() : '';
  }

  private parseQuickTimeWindowFromDescription(description: string): string {
    const m = description.match(/时间窗：\s*([^\n]+)/);
    return m ? m[1].trim() : '24h';
  }

  private parseReportOutputStyleFromDescription(description: string): MarketInsightReportOutputStyle {
    const m = description.match(/报告样式：\s*(\S+)/);
    if (!m) return 'default';
    const v = m[1].trim().toLowerCase();
    if (v === 'angkai') return 'angkai';
    if (v === 'sample') return 'sample';
    return 'default';
  }

  /** 读取一键资讯「样本示例」固定 Markdown（用于 reportOutputStyle=sample） */
  private loadMarketInsightSampleReportBody(): string {
    const cwd = process.cwd();
    for (const rel of MARKET_INSIGHT_SAMPLE_REPORT_CANDIDATES) {
      const abs = path.join(cwd, rel);
      try {
        const raw = fs.readFileSync(abs, 'utf-8');
        return raw.replace(/^\uFEFF/, '').trimEnd();
      } catch {
        /* try next */
      }
    }
    const hint = MARKET_INSIGHT_SAMPLE_REPORT_CANDIDATES.join(' 或 ');
    console.warn('[MarketInsight] 样本报告文件均未找到，cwd=', cwd);
    return `# 样本示例\n\n> 未找到示例文件（请任选其一置于项目运行目录）：\` ${hint} \`\n`;
  }

  private sleepMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 样本模式：等待固定时长后返回固定正文与 stats（不调用 AI） */
  private async buildSampleTemplateReportPayload(): Promise<{
    content: string;
    summary: string;
    stats: Record<string, unknown>;
  }> {
    await this.sleepMs(MARKET_INSIGHT_SAMPLE_SIMULATED_DELAY_MS);
    const content = this.loadMarketInsightSampleReportBody();
    const titleLine =
      content
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('#')) || '';
    const summary = titleLine.replace(/^#+\s*/, '').trim() || '样本示例（固定模版）';
    const now = new Date().toISOString();
    const stats: Record<string, unknown> = {
      quickMode: true,
      quickInsight: true,
      analysisMode: 'sample_fixed_template',
      reportOutputStyle: 'sample',
      totalArticles: 0,
      simulatedDelayMs: MARKET_INSIGHT_SAMPLE_SIMULATED_DELAY_MS,
      noAiCalls: true,
      noFetch: true,
      sourceBreakdown: [],
      classification: { ruleCount: 0, llmCount: 0 },
      categories: [],
      generatedAt: now,
      fetchErrors: [],
    };
    return { content, summary, stats };
  }

  /**
   * 样本示例模式：把报告中的外链也同步到行业资讯列表，
   * 避免“报告成功但资讯列表无数据”的体验问题。
   */
  private async syncReportLinksToInsights(reportContent: string): Promise<number> {
    const links = extractReportArticleLinks(reportContent || '');
    if (!links.length) return 0;
    const urls = links.map((x) => x.url).filter(Boolean);
    const existing = await this.prisma.insights_articles.findMany({
      where: { url: { in: urls } },
      select: { url: true },
    });
    const existingSet = new Set(existing.map((x) => x.url));
    let savedCount = 0;

    for (const item of links) {
      if (!item.url || existingSet.has(item.url)) continue;
      try {
        await this.prisma.insights_articles.create({
          data: {
            title: item.title || '样本资讯',
            category: normalizeMarketInsightCategory('行业报告'),
            url: item.url,
            content: `# ${item.title || '样本资讯'}\n\n原文链接: ${item.url}`,
            summary: item.title || '样本示例报告外链',
            source: 'market_insight',
            published_at: new Date(),
          }
        });
        existingSet.add(item.url);
        savedCount += 1;
      } catch (err: any) {
        console.warn(`[MarketInsight] 样本外链同步失败 "${item.url}": ${err.message}`);
      }
    }

    return savedCount;
  }

  private buildReferenceSourcesAppendix(articles: any[], maxItems = 40): string {
    const lines: string[] = ['', '---', '', '## 参考来源', ''];
    const slice = articles.slice(0, maxItems);
    for (const a of slice) {
      const url = a.url ? String(a.url) : '';
      const title = a.title ? String(a.title) : '未命名';
      if (url) {
        lines.push(`- [${title}](${url}) · ${a.source || a.sourceType || '来源未知'} · ${new Date(a.published_at).toLocaleString('zh-CN')}`);
      } else {
        lines.push(`- ${title}`);
      }
    }
    if (articles.length > maxItems) {
      lines.push('', `> 共 ${articles.length} 条，此处列出前 ${maxItems} 条链接。`);
    }
    return lines.join('\n');
  }

  private async generateRichQuickInsightFromArticles(
    articles: any[],
    taskTitle: string,
    taskDescription: string
  ): Promise<string> {
    const config = await this.getSafeLLMConfig();
    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    const baseUrl = config.baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const model = config.model || 'openai/gpt-4o';
    if (!apiKey) {
      throw new Error('AI API密钥未配置');
    }

    const outputStyle = this.parseReportOutputStyleFromDescription(taskDescription);
    const industry = this.parseQuickIndustryFromDescription(taskDescription) || taskTitle;
    const timeWindow = this.parseQuickTimeWindowFromDescription(taskDescription);
    const lines = articles.slice(0, 55).map((a, i) => {
      const sum = String(a.summary || '').replace(/\s+/g, ' ').slice(0, 550);
      const url = a.url ? String(a.url) : '';
      const src = a.source || a.sourceType || '';
      const cat = a.category || '';
      const when = new Date(a.published_at).toISOString();
      return `${i + 1}. [${cat}] ${a.title}\n   来源：${src}\n   时间：${when}\n   链接：${url}\n   摘要：${sum}`;
    });

    const userContent = `任务标题：${taskTitle}
目标行业（供行文聚焦）：${industry}
观察时间窗（语义）：${timeWindow}
材料条数：${articles.length}（下列至多 55 条）

【撰写硬性要求】
- 逐条利用下方材料：不同 URL 的条目原则上都要在前四大节中落到至少一处（默认版式对应：政策法规动态、行业趋势分析、企业合规要点、国内外厂商动态与新技术；昂楷版式对应「一、」～「四、」）；勿因省字数合并成空洞概括。
- 正文须从摘要中抽取：机构/厂商名、报告名、数据与结论关键词；**厂商/报告/市场份额类**条目须在「国内外厂商动态与新技术」一节（昂楷体为「四、」）采用「**加粗标题** + 多行说明 + 单独一行 - 来源链接：URL」格式。
- 若某条材料主题独立（如某篇 IDC/评测/厂商发布），必须单独占一条编号要点，勿与其它条目混写丢失链接。

【资讯条目】
${lines.join('\n\n')}

请按 System 要求输出完整 Markdown 正文（不要重复输出本「资讯条目」区块）。`;

    const systemRich =
      outputStyle === 'angkai'
        ? MARKET_INSIGHT_SYSTEM_RICH_QUICK_ANGKAI
        : MARKET_INSIGHT_SYSTEM_RICH_QUICK_SOURCES;
    const logScene =
      outputStyle === 'angkai'
        ? 'generateRichQuickInsightFromArticles_angkai'
        : 'generateRichQuickInsightFromArticles';

    const messagesRich = [
      { role: 'system' as const, content: systemRich },
      { role: 'user' as const, content: userContent },
    ];
    logMarketInsightLLMPrompts(logScene, model, messagesRich);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 8192,
        messages: messagesRich,
      }),
    });
    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }
    const data = await response.json() as any;
    return String(data?.choices?.[0]?.message?.content || '').trim();
  }

  private async generateReportContent(
    articles: any[],
    taskTitle: string,
    taskDescription = ''
  ): Promise<{ content: string; summary: string; stats: any }> {
    const isQuickInsight = taskDescription.includes(MI_QUICK_INSIGHT_MARKER);
    const reportOutputStyle = this.parseReportOutputStyleFromDescription(taskDescription);
    const categoryGroups = new Map<string, any[]>();
    for (const a of articles) {
      const cat = normalizeMarketInsightCategory(a.category || '其他');
      if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
      categoryGroups.get(cat)!.push(a);
    }

    const stats: Record<string, unknown> = {
      totalArticles: articles.length,
      sourceBreakdown: this.buildSourceBreakdown(articles),
      classification: {
        ruleCount: articles.filter(a => a.classification_source === 'rule').length,
        llmCount: articles.filter(a => a.classification_source === 'llm').length,
      },
      categories: Array.from(categoryGroups.entries()).map(([cat, arts]) => ({
        name: cat,
        count: arts.length
      })),
      generatedAt: new Date().toISOString(),
      fetchErrors: this.rssErrors,
    };
    if (!isQuickInsight) {
      stats.skills = this.buildSkillsSectionStats(articles);
    } else {
      stats.quickInsight = true;
      stats.analysisMode = 'ai_structured_quick';
      stats.reportOutputStyle = reportOutputStyle;
    }

    let highlightsSummary = '';
    try {
      highlightsSummary = await this.generateAIHighlights(articles);
    } catch (err: any) {
      console.warn('[MarketInsight] AI 摘要生成失败，使用默认摘要:', err.message);
      highlightsSummary = `共收录 ${articles.length} 篇文章，涵盖 ${categoryGroups.size} 个分类。`;
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    if (isQuickInsight) {
      let richBody = '';
      try {
        richBody = await this.generateRichQuickInsightFromArticles(articles, taskTitle, taskDescription);
      } catch (err: any) {
        console.warn('[MarketInsight] AI 结构化长文生成失败，回退模板:', err.message);
      }

      if (richBody) {
        const isAngkai = reportOutputStyle === 'angkai';
        const head = isAngkai ? '' : `# 📰 ${taskTitle} — ${dateStr}\n\n`;
        const lead =
          isAngkai || !highlightsSummary
            ? ''
            : `## 📝 今日看点\n\n${highlightsSummary}\n\n---\n\n`;
        const appendix = this.buildReferenceSourcesAppendix(articles);
        const footer = `\n\n*生成于 ${dateStr} ${now.toISOString().split('T')[1]?.slice(0, 5) || ''} | 共 ${articles.length} 篇参考条目 | AI 结构化整理*\n`;
        const content = `${head}${lead}${richBody}${appendix}${footer}`;
        return { content, summary: highlightsSummary, stats };
      }
    }

    let report = `# 📰 ${taskTitle} — ${dateStr}\n\n`;
    report += `> 自动聚合洞察报告，共收录 ${articles.length} 篇文章\n\n`;

    if (highlightsSummary) {
      report += `## 📝 今日看点\n\n${highlightsSummary}\n\n---\n\n`;
    }

    report += `## 📊 执行摘要\n\n`;
    report += `- 采集文章总数：**${articles.length}**\n`;
    report += `- 涉及分类数：**${categoryGroups.size}**\n`;
    report += `- 数据源数量：**${(stats.sourceBreakdown as any[]).length}**\n`;
    report += `- 抓取异常：**${this.rssErrors.length}**\n\n`;

    report += `## 📈 数据概览\n\n`;
    report += `| 分类 | 文章数 |\n|:---:|:---:|\n`;
    for (const [cat, arts] of categoryGroups) {
      report += `| ${cat} | ${arts.length} |\n`;
    }
    report += `\n---\n\n`;

    const sortedCategories = Array.from(categoryGroups.entries())
      .sort((a, b) => b[1].length - a[1].length);

    for (const [cat, catArticles] of sortedCategories) {
      report += `## ${cat}\n\n`;
      for (const a of catArticles.slice(0, 10)) {
        report += `### ${a.title}\n\n`;
        report += `[${a.title}](${a.url}) · ${new Date(a.published_at).toLocaleString('zh-CN')}\n\n`;
        if (a.summary) {
          report += `> ${a.summary}\n\n`;
        }
        report += `---\n\n`;
      }
    }

    if (!isQuickInsight) {
      report += this.generateSkillsSection(articles);
    }

    report += `*生成于 ${dateStr} ${now.toISOString().split('T')[1]?.slice(0, 5) || ''} | 共 ${articles.length} 篇文章*\n`;

    return { content: report, summary: highlightsSummary, stats };
  }

  private async generateAIHighlights(articles: any[]): Promise<string> {
    const config = await this.getSafeLLMConfig();
    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    const baseUrl = config.baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const model = config.model || 'openai/gpt-4o';

    if (!apiKey) {
      return `共收录 ${articles.length} 篇文章。`;
    }

    const articleList = articles.slice(0, 15).map((a, i) =>
      `${i + 1}. [${a.category}] ${a.title}${a.url ? ` — ${a.url}` : ''}`
    ).join('\n');

    const userContent = `【数据源+AI 模式】下列条目为已抓取材料，请仅基于此归纳「今日看点」：

文章列表（共 ${articles.length} 篇，下列至多 15 条）：
${articleList}`;

    const messagesHighlights = [
      { role: 'system' as const, content: MARKET_INSIGHT_SYSTEM_HIGHLIGHTS },
      { role: 'user' as const, content: userContent },
    ];
    logMarketInsightLLMPrompts('generateAIHighlights', model, messagesHighlights);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messagesHighlights,
          temperature: 0.3,
          max_tokens: 500
        }),
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`AI API error: ${response.status}`);

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content?.trim() || '';
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildSourceBreakdown(articles: any[]) {
    const map = new Map<string, number>();
    for (const article of articles) {
      const key = article.source || article.sourceType || 'unknown';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).map(([source, count]) => ({ source, count }));
  }

  private buildSkillsSectionStats(articles: any[]) {
    const byType = articles.reduce((acc: Record<string, number>, article) => {
      const sourceType = String(article.sourceType || 'unknown');
      acc[sourceType] = (acc[sourceType] || 0) + 1;
      return acc;
    }, {});
    const total = Math.max(articles.length, 1);
    const skillsHits = (byType.api || 0) + (byType.rss || 0);
    return {
      sourceTypeBreakdown: byType,
      strategy: ['skills_source', 'builtin_sources', 'generic_web_fallback'],
      skillsHitRate: Number((skillsHits / total).toFixed(4)),
      webFallbackRate: Number(((byType.web || 0) / total).toFixed(4)),
    };
  }

  private generateSkillsSection(articles: any[]): string {
    const skillsStats = this.buildSkillsSectionStats(articles);
    const byType = skillsStats.sourceTypeBreakdown as Record<string, number>;
    const lines: string[] = [];
    lines.push('## 🧠 Skills');
    lines.push('');
    lines.push('### 数据获取策略');
    lines.push('');
    lines.push(`- 执行链路：\`${skillsStats.strategy.join(' > ')}\``);
    lines.push(`- Skills 命中率：**${Math.round(skillsStats.skillsHitRate * 100)}%**`);
    lines.push(`- Web 回退占比：**${Math.round(skillsStats.webFallbackRate * 100)}%**`);
    lines.push('');
    lines.push('### 命中情况');
    lines.push('');
    lines.push(`- RSS: ${byType.rss || 0}`);
    lines.push(`- API: ${byType.api || 0}`);
    lines.push(`- Web: ${byType.web || 0}`);
    lines.push('');
    lines.push('### 建议后续 Skills');
    lines.push('');
    lines.push('- 增加行业专属源白名单与优先级。');
    lines.push('- 对高价值来源做定向深读与实体抽取。');
    lines.push('- 针对低质量源建立自动降权规则。');
    lines.push('');
    return `${lines.join('\n')}\n`;
  }

  private ruleClassifyArticle(title = '', summary = '', url = ''): { category: string; confidence: number } {
    const text = `${title} ${summary} ${url}`.toLowerCase();
    const rules: Array<{ category: string; keywords: string[] }> = [
      {
        category: '漏洞预警',
        keywords: [
          'cve-',
          'cve ',
          '漏洞',
          'vulnerability',
          'exploit',
          'rce',
          'sql注入',
          'sql injection',
          'xss',
          '注入漏洞',
          '高危漏洞',
          '漏洞预警',
        ],
      },
      {
        category: '威胁情报',
        keywords: [
          'apt',
          'malware',
          'ransomware',
          '勒索',
          '恶意软件',
          'trojan',
          'botnet',
          'ioc',
          '威胁组织',
          'threat actor',
          '后门',
          'c2',
          'threat intelligence',
        ],
      },
      { category: '合规政策', keywords: ['合规', '政策', '法规', '监管', 'compliance', 'gdpr', 'nist'] },
      {
        category: '产品动态',
        keywords: ['changelog', 'release notes', '版本更新', '新功能', '产品发布', "what's new", '更新日志'],
      },
      { category: '竞品情报', keywords: ['发布', '官网', '新品', '产品更新', 'release', 'launch'] },
      { category: '行业报告', keywords: ['报告', '白皮书', 'research', 'trend', '预测', 'forecast'] },
      { category: '攻防技术', keywords: ['红队', '蓝队', '攻防', '渗透', '检测', 'red team', 'blue team'] },
    ];
    for (const rule of rules) {
      if (rule.keywords.some(kw => text.includes(kw))) {
        return { category: normalizeMarketInsightCategory(rule.category), confidence: 0.82 };
      }
    }
    return { category: '其他', confidence: 0.35 };
  }

  private async classifyArticles(articles: any[]): Promise<any[]> {
    const result: any[] = [];
    for (const article of articles) {
      if (article.rssCategoryApplied && normalizeMarketInsightCategory(article.category || '其他') !== '其他') {
        result.push({
          ...article,
          category: normalizeMarketInsightCategory(article.category),
          classification_source: 'rule',
          classification_confidence: Math.max(article.classification_confidence ?? 0, 0.88),
        });
        continue;
      }
      const rule = this.ruleClassifyArticle(article.title, article.summary, article.url);
      if (rule.confidence >= 0.65) {
        const cat = normalizeMarketInsightCategory(
          article.category && article.category !== '其他' ? article.category : rule.category
        );
        result.push({
          ...article,
          category: cat,
          classification_source: 'rule',
          classification_confidence: rule.confidence,
        });
        continue;
      }
      const llmCategory = await this.classifyArticleWithLLM(article).catch(() => null);
      result.push({
        ...article,
        category: normalizeMarketInsightCategory(llmCategory?.category || rule.category),
        classification_source: llmCategory ? 'llm' : 'rule',
        classification_confidence: llmCategory?.confidence || rule.confidence,
      });
    }
    return result;
  }

  private async classifyArticleWithLLM(article: any): Promise<{ category: string; confidence: number }> {
    const config = await this.getSafeLLMConfig();
    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    if (!apiKey) throw new Error('AI key not configured');
    const baseUrl = config.baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const model = config.model || 'openai/gpt-4o';
    const enumLine = getMarketInsightCategoryPromptEnum();
    const userContent = `可选类别（必须逐字使用其一）：${enumLine}
标题：${article.title}
摘要：${article.summary || ''}
链接：${article.url}`;
    const messagesClassify = [
      { role: 'system' as const, content: MARKET_INSIGHT_SYSTEM_CLASSIFIER },
      { role: 'user' as const, content: userContent },
    ];
    if (marketInsightClassifyPromptLoggingEnabled()) {
      logMarketInsightLLMPrompts('classifyArticleWithLLM', model, messagesClassify);
    } else if (marketInsightPromptLoggingEnabled()) {
      const t = String(article.title || '').slice(0, 120);
      console.log(
        `[MarketInsight][LLM Prompt][classifyArticleWithLLM] (full prompts: set MARKET_INSIGHT_LOG_CLASSIFY_PROMPTS=1) title=${t}`
      );
    }
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 120,
        messages: messagesClassify,
      }),
    });
    if (!response.ok) throw new Error(`AI API ${response.status}`);
    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Invalid classification response');
    const parsed = JSON.parse(match[0]);
    return {
      category: normalizeMarketInsightCategory(parsed.category || '其他'),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
    };
  }

  private async getSafeLLMConfig() {
    if (!llmConfigManager.isReady()) {
      await llmConfigManager.initialize();
    }
    return llmConfigManager.getCurrentConfig();
  }

  private async generatePureAIIndustryReport(
    industry: string,
    timeWindow: string,
    outputStyle: MarketInsightReportOutputStyle = 'default'
  ): Promise<{ content: string; summary: string; stats: any }> {
    const config = await this.getSafeLLMConfig();
    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    const baseUrl = config.baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const model = config.model || 'openai/gpt-4o';
    if (!apiKey) {
      throw new Error('AI API密钥未配置，请先在系统设置中配置大模型');
    }

    const userContent = `请生成完整报告。

行业：${industry}
时间窗（语义上的观察范围）：${timeWindow}`;

    const systemPure =
      outputStyle === 'angkai' ? MARKET_INSIGHT_SYSTEM_PURE_AI_ANGKAI : MARKET_INSIGHT_SYSTEM_PURE_AI;
    const logPureScene =
      outputStyle === 'angkai' ? 'generatePureAIIndustryReport_angkai' : 'generatePureAIIndustryReport';

    const messagesPureAi = [
      { role: 'system' as const, content: systemPure },
      { role: 'user' as const, content: userContent },
    ];
    logMarketInsightLLMPrompts(logPureScene, model, messagesPureAi);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 5000,
        messages: messagesPureAi,
      }),
    });
    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }
    const data = await response.json() as any;
    const body = String(data?.choices?.[0]?.message?.content || '').trim();
    const now = new Date();
    const summary = body.split('\n').find((line) => line.trim().length >= 12)?.trim() || `${industry} 行业资讯洞察`;
    const content =
      outputStyle === 'angkai'
        ? body.startsWith('#')
          ? body
          : `# ${industry}领域最新资讯\n\n${body}`
        : body.startsWith('#')
          ? body
          : `# 📰 ${industry} 行业洞察 — ${now.toISOString().slice(0, 10)}\n\n${body}`;
    return {
      content,
      summary,
      stats: {
        totalArticles: 0,
        categories: [],
        generatedAt: now.toISOString(),
        fetchErrors: [],
        fetchMode: 'pure_ai',
        analysisMode: 'pure_ai_longform',
        reportOutputStyle: outputStyle,
      },
    };
  }

  // ========== Import Markdown Report ==========

  async importReportFromMarkdown(taskId: number | null, markdownContent: string, filename?: string): Promise<number> {
    const mdTitle = this.extractTitleFromMarkdown(markdownContent).trim();
    const mdSummary = this.extractSummaryFromMarkdown(markdownContent);
    const titleRaw =
      mdTitle ||
      this.extractTitleFromPlainImport(markdownContent, filename) ||
      filename ||
      '导入报告';
    const title = this.truncateForDb(titleRaw, 255);
    const summary = mdSummary || this.extractSummaryFromPlainImport(markdownContent, title);
    const legacyTableStats = this.extractStatsFromMarkdown(markdownContent);
    const statsPayload = buildStatsForImportedReport(
      markdownContent,
      legacyTableStats ? (legacyTableStats as Record<string, unknown>) : undefined
    );

    const report = await this.prisma.market_insight_reports.create({
      data: {
        task_id: taskId,
        title,
        summary,
        content: markdownContent,
        stats_json: JSON.stringify(statsPayload),
        category: normalizeMarketInsightCategory('市场洞察'),
        status: 'success',
        executed_at: new Date(),
      }
    });

    return report.id;
  }

  /** Prisma `title` / `category` 等为 VarChar，超长会导致写入 500 */
  private truncateForDb(s: string, maxLen: number): string {
    const t = s.trim();
    if (t.length <= maxLen) return t;
    return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
  }

  private extractTitleFromMarkdown(content: string): string {
    const match = content.match(/^#\s+(.+)/m);
    return match ? match[1].replace(/[📰🤖🔒⚙️🛠💡📝]/g, '').trim() : '';
  }

  private extractSummaryFromMarkdown(content: string): string {
    const match = content.match(/## 📝 今日看点\n\n([\s\S]*?)\n\n---/);
    return match ? match[1].trim() : '';
  }

  private extractStatsFromMarkdown(content: string): any {
    const tableMatch = content.match(/\| 扫描源.*?\n\|.*?\n\|(.+?)\|/s);
    if (!tableMatch) return null;

    const cells = tableMatch[1].split('|').map(c => c.trim());
    return {
      scanInfo: cells[0] || '',
      articleInfo: cells[1] || '',
      timeRange: cells[2] || '',
      selected: cells[3] || '',
    };
  }

  /** PDF/HTML/Word 等导入无 Markdown 结构时的标题（首行或文件名） */
  private extractTitleFromPlainImport(content: string, filename?: string): string {
    const stem = filename?.replace(/\.[^.]+$/i, '').replace(/[_-]+/g, ' ').trim() || '';
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return stem;
    const first = lines[0];
    if (first.length >= 2 && first.length <= 200) return first;
    if (stem) return stem;
    return first.slice(0, 120);
  }

  /** 无「今日看点」区块时，用正文前段作摘要 */
  private extractSummaryFromPlainImport(content: string, title: string): string {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    let start = 0;
    if (lines[0] === title) start = 1;
    const rest = lines.slice(start).join('\n').replace(/\s+/g, ' ').trim();
    if (!rest) return '';
    return rest.length > 400 ? `${rest.slice(0, 400)}…` : rest;
  }

  // ========== Convert to Requirement ==========

  async convertToRequirement(params: ConvertToRequirementParams) {
    const report = await this.prisma.market_insight_reports.findUnique({
      where: { id: params.reportId }
    });

    if (!report) throw new Error('报告不存在');

    const requirementInput = `报告标题：${report.title}
分类：${report.category}
摘要：${report.summary || ''}
正文：
${report.content}`;

    const aiContent = await this.analysisService.generateRequirementDoc(requirementInput, undefined, {
      systemPrompt: MARKET_INSIGHT_REQUIREMENT_DOC_SYSTEM_PROMPT,
      logScene: 'marketInsightReportToRequirement',
    });

    const doc = await this.prisma.requirement_documents.create({
      data: {
        title: params.title,
        content: aiContent,
        summary: report.summary || '',
        source_filename: `market-insight-report-${report.id}`,
        creator_id: params.userId,
        project_id: params.projectId || null,
        project_version_id: params.projectVersionId || null,
        status: 'ACTIVE',
      }
    });

    return doc;
  }

  async deepReadArticleByUrl(url: string, fallback?: DeepReadFallback): Promise<DeepReadResult> {
    const startedAt = Date.now();
    try {
      const fetchedHtml = await this.fetchUrlHtml(url);
      const extracted = this.extractReadableContent(fetchedHtml, url);
      const contentMarkdown = this.toMarkdown(extracted.html);
      const images = this.collectImages(extracted.html, url);

      return {
        title: extracted.title || fallback?.fallbackTitle || '未命名文章',
        summary: extracted.summary || fallback?.fallbackSummary || extracted.text.slice(0, 240),
        contentText: extracted.text.slice(0, 24000),
        contentMarkdown: contentMarkdown.slice(0, 30000),
        contentHtml: extracted.html.slice(0, 120000),
        contentRawHtml: fetchedHtml.slice(0, 300000),
        images,
        sourceUrl: url,
        extractionMeta: {
          strategy: 'readable',
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (error: any) {
      const fallbackText = (fallback?.fallbackContent || '').trim();
      const fallbackSummary = (fallback?.fallbackSummary || '').trim();
      const fallbackTitle = (fallback?.fallbackTitle || '').trim() || '未命名文章';
      const contentText = fallbackText || fallbackSummary || `回源失败，原文链接：${url}`;

      return {
        title: fallbackTitle,
        summary: fallbackSummary || contentText.slice(0, 240),
        contentText: contentText.slice(0, 24000),
        contentMarkdown: this.toMarkdown(contentText).slice(0, 30000),
        contentHtml: '',
        contentRawHtml: '',
        images: [],
        sourceUrl: url,
        extractionMeta: {
          strategy: 'fallback_text',
          durationMs: Date.now() - startedAt,
          fallbackReason: 'fetch_or_extract_failed',
          errorCode: error?.name || 'DeepReadError',
          errorMessage: error?.message || '未知错误',
        },
      };
    }
  }

  private async fetchUrlHtml(url: string): Promise<string> {
    this.ensureDeepReadUrlAllowed(url);
    const maxBytes = parseInt(process.env.DEEP_READ_MAX_BYTES || '2097152', 10);
    const timeoutMs = parseInt(process.env.DEEP_READ_TIMEOUT_MS || '12000', 10);
    const retries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SakuraAI DeepRead Bot',
            'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          },
        });
        if (!response.ok) {
          throw new Error(`抓取失败: HTTP ${response.status}`);
        }
        const html = await response.text();
        if (Buffer.byteLength(html, 'utf8') > maxBytes) {
          throw new Error(`响应体过大，超过限制 ${maxBytes} bytes`);
        }
        return html;
      } catch (error: any) {
        lastError = error;
        if (attempt < retries) {
          const backoffMs = Math.min(1500 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError || new Error('抓取失败');
  }

  private ensureDeepReadUrlAllowed(url: string) {
    const host = (() => {
      try {
        return new URL(url).hostname.toLowerCase();
      } catch {
        throw new Error('非法 URL');
      }
    })();

    const allowlistRaw = process.env.DEEP_READ_HOST_ALLOWLIST?.trim();
    if (!allowlistRaw) return;

    const allowlist = allowlistRaw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (allowlist.length === 0) return;

    const allowed = allowlist.some((item) => host === item || host.endsWith(`.${item}`));
    if (!allowed) {
      throw new Error(`域名不在白名单中: ${host}`);
    }
  }

  private extractReadableContent(html: string, url: string): { title: string; summary: string; text: string; html: string } {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = (titleMatch?.[1] || '').replace(/\s+/g, ' ').trim();

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = bodyMatch?.[1] || html;
    const mainMatch = body.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i);
    const readableHtml = (mainMatch?.[2] || body)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/\s(on\w+)=["'][\s\S]*?["']/gi, '')
      .replace(/\sstyle=["'][\s\S]*?["']/gi, '');

    const text = readableHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    return {
      title: pageTitle,
      summary: text.slice(0, 240),
      text,
      html: this.rewriteRelativeUrls(readableHtml, url),
    };
  }

  private toMarkdown(input: string): string {
    if (!input) return '';
    const looksHtml = /<\/?[a-z][\s\S]*>/i.test(input);
    if (!looksHtml) {
      return input.replace(/\n{3,}/g, '\n\n').trim();
    }

    const markdown = input
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
      .replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, '\n\n![]($1)\n\n')
      .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return markdown;
  }

  private collectImages(readableHtml: string, baseUrl: string): string[] {
    const images = Array.from(
      readableHtml.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)
    ).map(match => this.toAbsoluteUrl(match[1], baseUrl)).filter(Boolean) as string[];
    return Array.from(new Set(images)).slice(0, 100);
  }

  private rewriteRelativeUrls(html: string, baseUrl: string): string {
    return html.replace(
      /\s(src|href)=["']([^"']+)["']/gi,
      (_match, attr: string, value: string) => ` ${attr}="${this.toAbsoluteUrl(value, baseUrl)}"`
    );
  }

  private toAbsoluteUrl(value: string, baseUrl: string): string {
    const raw = (value || '').trim();
    if (!raw || raw.startsWith('data:') || raw.startsWith('javascript:')) return raw;
    try {
      return new URL(raw, baseUrl).toString();
    } catch {
      return raw;
    }
  }

  async convertArticleToRequirement(params: ConvertArticleToRequirementParams) {
    const article = await this.prisma.insights_articles.findUnique({ where: { id: params.articleId } });
    if (!article) throw new Error('文章不存在');
    const aiContent = await this.analysisService.generateRequirementDoc(
      `文章标题：${article.title}\n来源链接：${article.url}\n分类：${article.category}\n摘要：${article.summary || ''}\n正文：\n${article.content}`,
      undefined,
      {
        systemPrompt: MARKET_INSIGHT_REQUIREMENT_DOC_SYSTEM_PROMPT,
        /** 深读「一键转需求」、行业资讯文章转需求：后台打印完整提示词与响应摘要 */
        logScene: 'deepReadArticleToRequirement',
      }
    );
    const doc = await this.prisma.requirement_documents.create({
      data: {
        title: params.title,
        content: aiContent,
        summary: article.summary || '',
        source_filename: `insights-article-${article.id}`,
        creator_id: params.userId,
        project_id: params.projectId || null,
        project_version_id: params.projectVersionId || null,
        status: 'ACTIVE',
      },
    });
    return doc;
  }
}
