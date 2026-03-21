import type { MarketSourceConfig } from '../services/marketInsightService';

/** `categoryHint` 取值须属于 `MARKET_INSIGHT_REPORT_CATEGORIES`（见 marketInsightCategories.ts） */

/** 内置源（含两级领域，供下拉分组；与后端 DEFAULT_SOURCE_CONFIGS 同源） */
export type MarketInsightBuiltinSource = MarketSourceConfig & {
  domainL1: string;
  domainL2: string;
};

const DOMAIN_L1_ORDER: Record<string, number> = {
  数据安全: 0,
  '漏洞与情报数据': 1,
  'AI 与机器学习': 2,
  技术生态: 3,
  '区块链与 Web3': 4,
  竞品情报: 5,
};

const DOMAIN_L2_ORDER: Record<string, number> = {
  '数据安全|专业与社区': 0,
  '数据安全|漏洞与研究': 1,
  '数据安全|国际情报': 2,
  '漏洞与情报数据|CVE / 官方': 0,
  '漏洞与情报数据|政府与安全通告': 1,
  'AI 与机器学习|产业与媒体': 0,
  '技术生态|开发者社区': 0,
  '技术生态|科技媒体': 1,
  '区块链与 Web3|资讯': 0,
  '竞品情报|厂商与动态': 0,
};

function domainSortKey(s: MarketInsightBuiltinSource): [number, number, string] {
  const l1 = DOMAIN_L1_ORDER[s.domainL1] ?? 99;
  const l2 = DOMAIN_L2_ORDER[`${s.domainL1}|${s.domainL2}`] ?? 99;
  return [l1, l2, s.name];
}

/**
 * 市场洞察「内置数据源」唯一清单（参考 digest：数据安全 / AI / 技术媒体 / 云与社区 / 区块链 等分层）
 */
export const MARKET_INSIGHT_BUILTIN_SOURCES: MarketInsightBuiltinSource[] = [
  // —— 数据安全 · 专业与社区
  { id: 'anquanke-rss', name: '安全客', type: 'rss', enabled: true, url: 'https://api.anquanke.com/rss', domainL1: '数据安全', domainL2: '专业与社区' },
  { id: 'freebuf-rss', name: 'FreeBuf', type: 'rss', enabled: true, url: 'https://www.freebuf.com/feed', domainL1: '数据安全', domainL2: '专业与社区' },
  { id: 'kanxue-rss', name: '看雪学院', type: 'rss', enabled: false, url: 'https://bbs.kanxue.com/rss.php', categoryHint: '攻防技术', domainL1: '数据安全', domainL2: '专业与社区' },
  { id: '4hou-rss', name: '嘶吼专业版', type: 'rss', enabled: true, url: 'https://www.4hou.com/feed', categoryHint: '攻防技术', domainL1: '数据安全', domainL2: '专业与社区' },
  { id: 'aqniu-rss', name: '安全牛', type: 'rss', enabled: false, url: 'https://www.aqniu.com/feed', categoryHint: '行业报告', domainL1: '数据安全', domainL2: '专业与社区' },
  { id: 'secpulse-rss', name: '安全脉搏', type: 'rss', enabled: false, url: 'https://www.secpulse.com/feed', categoryHint: '漏洞预警', domainL1: '数据安全', domainL2: '专业与社区' },
  { id: 'nsfocus-blog-rss', name: '绿盟科技博客', type: 'rss', enabled: true, url: 'https://blog.nsfocus.net/feed', categoryHint: '攻防技术', domainL1: '数据安全', domainL2: '专业与社区' },
  // —— 数据安全 · 漏洞与研究
  { id: 'seebug-paper-rss', name: 'Seebug 纸讯', type: 'rss', enabled: true, url: 'https://paper.seebug.org/rss/', categoryHint: '漏洞预警', domainL1: '数据安全', domainL2: '漏洞与研究' },
  { id: 'arxiv-cs-cr-rss', name: 'arXiv 密码学与安全 (cs.CR)', type: 'rss', enabled: true, url: 'https://rss.arxiv.org/rss/cs.CR', categoryHint: '攻防技术', domainL1: '数据安全', domainL2: '漏洞与研究' },
  // —— 数据安全 · 国际情报
  { id: 'krebsonsecurity-rss', name: 'Krebs on Security', type: 'rss', enabled: true, url: 'https://krebsonsecurity.com/feed/', categoryHint: '攻防技术', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'darkreading-rss', name: 'Dark Reading', type: 'rss', enabled: true, url: 'https://www.darkreading.com/rss.xml', categoryHint: '漏洞预警', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'securityweek-rss', name: 'SecurityWeek', type: 'rss', enabled: true, url: 'https://www.securityweek.com/feed/', categoryHint: '漏洞预警', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'google-tag-rss', name: 'Google TAG', type: 'rss', enabled: true, url: 'https://blog.google/threat-analysis-group/rss/', categoryHint: '攻防技术', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'hackersnews-rss', name: 'The Hacker News', type: 'rss', enabled: false, url: 'https://feeds.feedburner.com/TheHackersNews', categoryHint: '漏洞预警', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'cloudflare-blog-rss', name: 'Cloudflare Blog', type: 'rss', enabled: true, url: 'https://blog.cloudflare.com/rss/', categoryHint: '攻防技术', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'aws-security-blog-rss', name: 'AWS Security Blog', type: 'rss', enabled: true, url: 'https://aws.amazon.com/blogs/security/feed/', categoryHint: '合规政策', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'msft-security-blog-rss', name: 'Microsoft 安全博客', type: 'rss', enabled: true, url: 'https://www.microsoft.com/en-us/security/blog/feed/', categoryHint: '漏洞预警', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'checkpoint-research-rss', name: 'Check Point Research', type: 'rss', enabled: true, url: 'https://research.checkpoint.com/feed/', categoryHint: '攻防技术', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'unit42-feed-rss', name: 'Palo Alto Unit 42', type: 'rss', enabled: true, url: 'https://unit42.paloaltonetworks.com/feed/', categoryHint: '威胁情报', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'crowdstrike-blog-rss', name: 'CrowdStrike Blog', type: 'rss', enabled: true, url: 'https://www.crowdstrike.com/blog/feed/', categoryHint: '威胁情报', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'sentinelone-blog-rss', name: 'SentinelOne Blog', type: 'rss', enabled: true, url: 'https://www.sentinelone.com/blog/feed/', categoryHint: '威胁情报', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'welivesecurity-rss', name: 'WeLiveSecurity (ESET)', type: 'rss', enabled: true, url: 'https://www.welivesecurity.com/en/rss/feed/', categoryHint: '漏洞预警', domainL1: '数据安全', domainL2: '国际情报' },
  { id: 'theregister-security-atom', name: 'The Register 安全', type: 'rss', enabled: true, url: 'https://www.theregister.com/security/headlines.atom', categoryHint: '行业报告', domainL1: '数据安全', domainL2: '国际情报' },
  // —— 漏洞与情报数据 · CVE / 官方
  { id: 'nvd-feed', name: 'NVD CVE', type: 'api', enabled: false, url: 'https://nvd.nist.gov/feeds/json/cve/1.1/nvdcve-1.1-recent.json.gz', categoryHint: '漏洞预警', domainL1: '漏洞与情报数据', domainL2: 'CVE / 官方' },
  { id: 'mitre-web', name: 'MITRE CVE', type: 'web', enabled: true, url: 'https://cve.mitre.org', categoryHint: '漏洞预警', domainL1: '漏洞与情报数据', domainL2: 'CVE / 官方' },
  // —— 漏洞与情报数据 · 政府与安全通告（已抽检 HTTP 200 + 有效 Feed）
  { id: 'cisa-news-rss', name: 'CISA 新闻', type: 'rss', enabled: true, url: 'https://www.cisa.gov/news.xml', categoryHint: '合规政策', domainL1: '漏洞与情报数据', domainL2: '政府与安全通告' },
  { id: 'cisa-blog-rss', name: 'CISA 博客', type: 'rss', enabled: true, url: 'https://www.cisa.gov/cisa/blog.xml', categoryHint: '合规政策', domainL1: '漏洞与情报数据', domainL2: '政府与安全通告' },
  { id: 'cisa-advisories-rss', name: 'CISA 网络安全公告汇总', type: 'rss', enabled: true, url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', categoryHint: '漏洞预警', domainL1: '漏洞与情报数据', domainL2: '政府与安全通告' },
  // —— AI 与机器学习 · 产业与媒体
  { id: 'qbitai-rss', name: '量子位', type: 'rss', enabled: true, url: 'https://www.qbitai.com/feed', categoryHint: '竞品情报', domainL1: 'AI 与机器学习', domainL2: '产业与媒体' },
  { id: 'openai-news-rss', name: 'OpenAI 新闻', type: 'rss', enabled: true, url: 'https://openai.com/news/rss.xml', categoryHint: '竞品情报', domainL1: 'AI 与机器学习', domainL2: '产业与媒体' },
  // —— 技术生态 · 开发者社区
  { id: 'oschina-news-rss', name: '开源中国资讯', type: 'rss', enabled: true, url: 'https://www.oschina.net/news/rss', domainL1: '技术生态', domainL2: '开发者社区' },
  { id: 'infoq-rss', name: 'InfoQ 中文站', type: 'rss', enabled: true, url: 'https://www.infoq.cn/feed', domainL1: '技术生态', domainL2: '开发者社区' },
  { id: 'v2ex-rss', name: 'V2EX', type: 'rss', enabled: true, url: 'https://www.v2ex.com/index.xml', domainL1: '技术生态', domainL2: '开发者社区' },
  { id: 'juejin-backend-rss', name: '掘金', type: 'rss', enabled: true, url: 'https://juejin.cn/rss', domainL1: '技术生态', domainL2: '开发者社区' },
  { id: 'juejin-frontend-rss', name: '掘金（备用入口）', type: 'rss', enabled: false, url: 'https://juejin.cn/rss', domainL1: '技术生态', domainL2: '开发者社区' },
  { id: 'cnblogs-rss', name: '博客园', type: 'rss', enabled: true, url: 'https://www.cnblogs.com/rss', domainL1: '技术生态', domainL2: '开发者社区' },
  { id: 'github-blog-rss', name: 'GitHub 博客', type: 'rss', enabled: true, url: 'https://github.blog/feed/', domainL1: '技术生态', domainL2: '开发者社区' },
  { id: 'hnrss-newest-rss', name: 'Hacker News (hnrss)', type: 'rss', enabled: true, url: 'https://hnrss.org/newest?count=30', categoryHint: '行业报告', domainL1: '技术生态', domainL2: '开发者社区' },
  // —— 技术生态 · 科技媒体
  { id: 'sspai-rss', name: '少数派', type: 'rss', enabled: true, url: 'https://sspai.com/feed', domainL1: '技术生态', domainL2: '科技媒体' },
  { id: 'huxiu-rss', name: '虎嗅', type: 'rss', enabled: true, url: 'https://www.huxiu.com/rss/0.xml', domainL1: '技术生态', domainL2: '科技媒体' },
  { id: '36kr-rss', name: '36氪', type: 'rss', enabled: true, url: 'https://36kr.com/feed', domainL1: '技术生态', domainL2: '科技媒体' },
  { id: 'leiphone-rss', name: '雷锋网', type: 'rss', enabled: true, url: 'https://www.leiphone.com/feed', domainL1: '技术生态', domainL2: '科技媒体' },
  { id: 'tmtpost-rss', name: '钛媒体', type: 'rss', enabled: true, url: 'https://www.tmtpost.com/rss', domainL1: '技术生态', domainL2: '科技媒体' },
  { id: 'ifanr-rss', name: '爱范儿', type: 'rss', enabled: true, url: 'https://www.ifanr.com/feed', domainL1: '技术生态', domainL2: '科技媒体' },
  { id: 'cnet-news-rss', name: 'CNET News', type: 'rss', enabled: true, url: 'https://www.cnet.com/rss/news/', categoryHint: '行业报告', domainL1: '技术生态', domainL2: '科技媒体' },
  { id: 'theregister-headlines-atom', name: 'The Register 头条', type: 'rss', enabled: true, url: 'https://www.theregister.com/headlines.atom', categoryHint: '行业报告', domainL1: '技术生态', domainL2: '科技媒体' },
  // —— 区块链与 Web3 · 资讯
  { id: '8btc-rss', name: '巴比特', type: 'rss', enabled: false, url: 'https://www.8btc.com/rss', domainL1: '区块链与 Web3', domainL2: '资讯' },
  { id: 'odaily-rss', name: '星球日报', type: 'rss', enabled: false, url: 'https://www.odaily.news/rss', domainL1: '区块链与 Web3', domainL2: '资讯' },
  // —— 竞品情报 · 厂商与动态
  { id: 'competitor-news', name: '竞品官网资讯', type: 'web', enabled: false, url: 'https://www.qianxin.com', categoryHint: '竞品情报', domainL1: '竞品情报', domainL2: '厂商与动态' },
];

/** 排序后的内置源（领域优先，其次名称） */
export function getSortedMarketInsightBuiltinSources(): MarketInsightBuiltinSource[] {
  return [...MARKET_INSIGHT_BUILTIN_SOURCES].sort((a, b) => {
    const ka = domainSortKey(a);
    const kb = domainSortKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return ka[2].localeCompare(kb[2], 'zh-Hans-CN');
  });
}

/** Ant Design Select `options` 分组结构（无 antd 依赖，服务端也可安全 import 数据文件） */
export type MarketInsightSelectGroupedOption = {
  label: string;
  title?: string;
  options: Array<{ value: string; label: string; title: string }>;
};

export function buildMarketInsightGroupedSelectOptions(
  sources: MarketInsightBuiltinSource[] = getSortedMarketInsightBuiltinSources()
): MarketInsightSelectGroupedOption[] {
  const groupMap = new Map<string, MarketInsightBuiltinSource[]>();
  for (const s of sources) {
    const key = `${s.domainL1}\t${s.domainL2}`;
    const list = groupMap.get(key) || [];
    list.push(s);
    groupMap.set(key, list);
  }

  const orderedKeys = [...groupMap.keys()].sort((a, b) => {
    const [a1, a2] = a.split('\t');
    const [b1, b2] = b.split('\t');
    const oa = DOMAIN_L1_ORDER[a1] ?? 99;
    const ob = DOMAIN_L1_ORDER[b1] ?? 99;
    if (oa !== ob) return oa - ob;
    const la = DOMAIN_L2_ORDER[`${a1}|${a2}`] ?? 99;
    const lb = DOMAIN_L2_ORDER[`${b1}|${b2}`] ?? 99;
    if (la !== lb) return la - lb;
    return a.localeCompare(b, 'zh-Hans-CN');
  });

  return orderedKeys.map((key) => {
    const [domainL1, domainL2] = key.split('\t');
    const items = (groupMap.get(key) || []).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    return {
      label: `${domainL1} › ${domainL2}`,
      title: `${domainL1} - ${domainL2}`,
      options: items.map((s) => {
        const hint = s.categoryHint ? ` · ${s.categoryHint}` : '';
        const typeTag = s.type.toUpperCase();
        const searchText = `${domainL1} ${domainL2} ${s.name} ${typeTag}${hint}`;
        return {
          value: s.id,
          label: `${s.name} (${typeTag})${hint}${s.enabled ? '' : ' · 默认关'}`,
          title: searchText,
        };
      }),
    };
  });
}

export const marketInsightBuiltinSourceMap = new Map(
  MARKET_INSIGHT_BUILTIN_SOURCES.map((s) => [s.id, s])
);
