/**
 * 市场洞察：报告 / 文章分类统一枚举。
 * 筛选下拉、内置源 categoryHint、规则与 LLM 分类应与此表一致。
 */
export const MARKET_INSIGHT_REPORT_CATEGORIES = [
  '漏洞预警',
  '威胁情报',
  '攻防技术',
  '竞品情报',
  '产品动态',
  '行业报告',
  '合规政策',
  '市场洞察',
  '其他',
] as const;

export type MarketInsightReportCategory = (typeof MARKET_INSIGHT_REPORT_CATEGORIES)[number];

export const MARKET_INSIGHT_CATEGORY_SET = new Set<string>(MARKET_INSIGHT_REPORT_CATEGORIES);

/** 报告列表「分类」筛选 */
export const MARKET_INSIGHT_CATEGORY_FILTER_OPTIONS = MARKET_INSIGHT_REPORT_CATEGORIES.map((value) => ({
  label: value,
  value,
}));

/** 供 LLM 提示词：类别必须是以下之一（含「其他」） */
export function getMarketInsightCategoryPromptEnum(): string {
  return MARKET_INSIGHT_REPORT_CATEGORIES.join('、');
}

/** 将模型或历史数据中的类别收敛到统一枚举；无法识别则归为「其他」 */
export function normalizeMarketInsightCategory(input: string | null | undefined): MarketInsightReportCategory {
  const s = (input ?? '').trim();
  if (MARKET_INSIGHT_CATEGORY_SET.has(s)) return s as MarketInsightReportCategory;
  return '其他';
}

/**
 * 将 RSS `<item>` 内多个 `<category>`（如安全客的「漏洞情报」「网络攻击」「安全资讯」）映射为统一分类。
 * 在条目标题未命中关键词规则时仍能得到合理类别。
 */
export function mapRssChannelCategoriesToCanonical(categories: string[]): MarketInsightReportCategory | null {
  const list = categories.map((c) => c.trim()).filter(Boolean);
  if (!list.length) return null;
  if (list.some((s) => /漏洞|cve/i.test(s))) return '漏洞预警';
  if (list.some((s) => s.includes('网络攻击'))) return '威胁情报';
  if (list.some((s) => s.includes('竞品'))) return '竞品情报';
  if (list.some((s) => s.includes('合规'))) return '合规政策';
  if (list.some((s) => s.includes('行业资讯') || s.includes('安全资讯'))) return '行业报告';
  if (list.some((s) => s.includes('安全知识'))) return '攻防技术';
  if (list.some((s) => s.includes('安全活动'))) return '其他';
  return null;
}
