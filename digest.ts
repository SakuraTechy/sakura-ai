import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';

// ============================================================================
// Constants
// ============================================================================

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const OPENAI_DEFAULT_API_BASE = 'https://api.openai.com/v1';
const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
const ZHIPUAI_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const ZHIPUAI_DEFAULT_MODEL = 'glm-4';
const FEED_FETCH_TIMEOUT_MS = 15_000;
const FEED_CONCURRENCY = 10;
const AI_BATCH_SIZE = 10;
const MAX_CONCURRENT_AI = 2;

// 90 RSS feeds from Hacker News Popularity Contest 2025 (curated by Karpathy)
// Plus additional data security focused feeds
const RSS_FEEDS: Array<{ name: string; xmlUrl: string; htmlUrl: string }> = [
  // ========== 数据安全专业源 (优先级最高) ==========
  { name: "安全客", xmlUrl: "https://api.anquanke.com/rss", htmlUrl: "https://www.anquanke.com" },
  { name: "FreeBuf", xmlUrl: "https://www.freebuf.com/feed", htmlUrl: "https://www.freebuf.com" },
  { name: "看雪学院", xmlUrl: "https://bbs.kanxue.com/rss.php", htmlUrl: "https://bbs.kanxue.com" },
  { name: "绿盟科技博客", xmlUrl: "https://blog.nsfocus.net/feed", htmlUrl: "https://blog.nsfocus.net" },
  { name: "奇安信威胁情报", xmlUrl: "https://ti.qianxin.com/blog/rss", htmlUrl: "https://ti.qianxin.com/blog" },
  { name: "360安全博客", xmlUrl: "https://blogs.360.cn/feed", htmlUrl: "https://blogs.360.cn" },
  { name: "腾讯安全应急响应中心", xmlUrl: "https://security.tencent.com/index.php/rss", htmlUrl: "https://security.tencent.com" },
  { name: "阿里云安全中心", xmlUrl: "https://help.aliyun.com/noticelist/6.html", htmlUrl: "https://help.aliyun.com/document_detail/28643.html" },
  { name: "华为安全", xmlUrl: "https://www.huaweicloud.com/product/safety/rss", htmlUrl: "https://www.huaweicloud.com/product/safety" },
  { name: "安全牛", xmlUrl: "https://www.aqniu.com/feed", htmlUrl: "https://www.aqniu.com" },
  { name: "黑客防线", xmlUrl: "https://www.hacker.com.cn/rss", htmlUrl: "https://www.hacker.com.cn" },
  { name: "嘶吼专业版", xmlUrl: "https://www.4hou.com/feed", htmlUrl: "https://www.4hou.com" },
  { name: "安全脉搏", xmlUrl: "https://www.secpulse.com/feed", htmlUrl: "https://www.secpulse.com" },
  { name: "黑客与极客", xmlUrl: "https://www.hackernews.cc/feed", htmlUrl: "https://www.hackernews.cc" },
  { name: "安全威胁情报", xmlUrl: "https://www.threatbook.cn/news/rss", htmlUrl: "https://www.threatbook.cn/news" },
  
  // ========== AI与机器学习 ==========
  { name: "机器之心", xmlUrl: "https://www.jiqizhixin.com/rss", htmlUrl: "https://www.jiqizhixin.com" },
  { name: "新智元", xmlUrl: "https://www.ieee.org/rss", htmlUrl: "https://www.ieee.org" },
  { name: "量子位", xmlUrl: "https://www.qbitai.com/feed", htmlUrl: "https://www.qbitai.com" },
  { name: "AI研习社", xmlUrl: "https://www.yanxishe.com/blog/rss", htmlUrl: "https://www.yanxishe.com/blog" },
  { name: "大数据文摘", xmlUrl: "https://www.bigdatarepublic.cn/feed", htmlUrl: "https://www.bigdatarepublic.cn" },
  { name: "数据派THU", xmlUrl: "https://www.datapi.cn/rss", htmlUrl: "https://www.datapi.cn" },
  { name: "AI科技大本营", xmlUrl: "https://blog.csdn.net/dQCFKyQDXYm3F8rB0/rss/list", htmlUrl: "https://blog.csdn.net/dQCFKyQDXYm3F8rB0" },
  
  // ========== 技术博客源 ==========
  { name: "InfoQ中文站", xmlUrl: "https://www.infoq.cn/feed", htmlUrl: "https://www.infoq.cn" },
  { name: "掘金", xmlUrl: "https://juejin.cn/rss/backend", htmlUrl: "https://juejin.cn" },
  { name: "博客园", xmlUrl: "https://www.cnblogs.com/rss", htmlUrl: "https://www.cnblogs.com" },
  { name: "开源中国", xmlUrl: "https://www.oschina.net/news/rss", htmlUrl: "https://www.oschina.net" },
  { name: "SegmentFault", xmlUrl: "https://segmentfault.com/rss", htmlUrl: "https://segmentfault.com" },
  { name: "V2EX", xmlUrl: "https://www.v2ex.com/rss.xml", htmlUrl: "https://www.v2ex.com" },
  { name: "36氪", xmlUrl: "https://36kr.com/feed", htmlUrl: "https://36kr.com" },
  { name: "虎嗅", xmlUrl: "https://www.huxiu.com/rss/0.xml", htmlUrl: "https://www.huxiu.com" },
  { name: "极客公园", xmlUrl: "https://www.geekpark.net/rss", htmlUrl: "https://www.geekpark.net" },
  { name: "雷锋网", xmlUrl: "https://www.leiphone.com/feed", htmlUrl: "https://www.leiphone.com" },
  { name: "钛媒体", xmlUrl: "https://www.tmtpost.com/rss", htmlUrl: "https://www.tmtpost.com" },
  { name: "品玩", xmlUrl: "https://www.pingwest.com/rss", htmlUrl: "https://www.pingwest.com" },
  { name: "爱范儿", xmlUrl: "https://www.ifanr.com/feed", htmlUrl: "https://www.ifanr.com" },
  { name: "少数派", xmlUrl: "https://sspai.com/feed", htmlUrl: "https://sspai.com" },
  { name: "差评", xmlUrl: "https://www.chaping.cn/rss", htmlUrl: "https://www.chaping.cn" },
  { name: "科技新知", xmlUrl: "https://www.kejixinzhi.com/feed", htmlUrl: "https://www.kejixinzhi.com" },
  { name: "网易科技", xmlUrl: "https://tech.163.com/special/00097UHL/tech_datalist.xml", htmlUrl: "https://tech.163.com" },
  { name: "新浪科技", xmlUrl: "https://tech.sina.com.cn/rss/roll.xml", htmlUrl: "https://tech.sina.com.cn" },
  { name: "腾讯科技", xmlUrl: "https://tech.qq.com/rss/tech.xml", htmlUrl: "https://tech.qq.com" },
  { name: "凤凰科技", xmlUrl: "https://tech.ifeng.com/rss/index.xml", htmlUrl: "https://tech.ifeng.com" },
  { name: "新华网科技", xmlUrl: "http://www.xinhuanet.com/tech/news_tech.xml", htmlUrl: "http://www.xinhuanet.com/tech" },
  { name: "人民网科技", xmlUrl: "http://www.people.com.cn/rss/tech.xml", htmlUrl: "http://www.people.com.cn/tech" },
  
  // ========== 开发者社区 ==========
  { name: "CSDN博客", xmlUrl: "https://blog.csdn.net/rss/list", htmlUrl: "https://blog.csdn.net" },
  { name: "知乎专栏", xmlUrl: "https://zhuanlan.zhihu.com/rss", htmlUrl: "https://zhuanlan.zhihu.com" },
  { name: "简书", xmlUrl: "https://www.jianshu.com/rss", htmlUrl: "https://www.jianshu.com" },
  { name: "慕课网", xmlUrl: "https://www.imooc.com/rss/article", htmlUrl: "https://www.imooc.com" },
  { name: "实验楼", xmlUrl: "https://www.shiyanlou.com/blog/rss", htmlUrl: "https://www.shiyanlou.com" },
  { name: "开源中国博客", xmlUrl: "https://my.oschina.net/blog/rss", htmlUrl: "https://my.oschina.net/blog" },
  { name: "SegmentFault博客", xmlUrl: "https://segmentfault.com/blog/rss", htmlUrl: "https://segmentfault.com/blog" },
  { name: "开发者头条", xmlUrl: "https://toutiao.io/rss", htmlUrl: "https://toutiao.io" },
  { name: "码农周刊", xmlUrl: "https://manong.weekly/rss", htmlUrl: "https://manong.weekly" },
  { name: "前端早读课", xmlUrl: "https://www.jqhtml.com/feed", htmlUrl: "https://www.jqhtml.com" },
  
  // ========== 云计算与大数据 ==========
  { name: "阿里云博客", xmlUrl: "https://yq.aliyun.com/rss", htmlUrl: "https://yq.aliyun.com" },
  { name: "腾讯云开发者社区", xmlUrl: "https://cloud.tencent.com/developer/rss", htmlUrl: "https://cloud.tencent.com/developer" },
  { name: "华为云开发者社区", xmlUrl: "https://bbs.huaweicloud.com/blogs/rss", htmlUrl: "https://bbs.huaweicloud.com/blogs" },
  { name: "百度智能云", xmlUrl: "https://cloud.baidu.com/forum/rss", htmlUrl: "https://cloud.baidu.com/forum" },
  { name: "京东云开发者社区", xmlUrl: "https://developer.jdcloud.com/rss", htmlUrl: "https://developer.jdcloud.com" },
  { name: "青云技术社区", xmlUrl: "https://www.qingcloud.com/blog/rss", htmlUrl: "https://www.qingcloud.com/blog" },
  { name: "UCloud技术社区", xmlUrl: "https://www.ucloud.cn/blog/rss", htmlUrl: "https://www.ucloud.cn/blog" },
  { name: "七牛云技术博客", xmlUrl: "https://blog.qiniu.com/rss", htmlUrl: "https://blog.qiniu.com" },
  { name: "又拍云技术博客", xmlUrl: "https://blog.upyun.com/rss", htmlUrl: "https://blog.upyun.com" },
  { name: "大数据技术", xmlUrl: "https://www.aboutyun.com/rss", htmlUrl: "https://www.aboutyun.com" },
  
  // ========== 区块链与Web3 ==========
  { name: "巴比特", xmlUrl: "https://www.8btc.com/rss", htmlUrl: "https://www.8btc.com" },
  { name: "链闻", xmlUrl: "https://www.chainnews.com/rss", htmlUrl: "https://www.chainnews.com" },
  { name: "深链财经", xmlUrl: "https://www.shenliancaijing.com/rss", htmlUrl: "https://www.shenliancaijing.com" },
  { name: "星球日报", xmlUrl: "https://www.odaily.news/rss", htmlUrl: "https://www.odaily.news" },
  
  // ========== 移动开发 ==========
  { name: "掘金移动开发", xmlUrl: "https://juejin.cn/rss/mobile", htmlUrl: "https://juejin.cn" },
  { name: "InfoQ移动开发", xmlUrl: "https://www.infoq.cn/topic/mobile/rss", htmlUrl: "https://www.infoq.cn/topic/mobile" },
  { name: "移动开发前线", xmlUrl: "https://www.mobiledev.org/rss", htmlUrl: "https://www.mobiledev.org" },
  { name: "安卓开发网", xmlUrl: "https://www.androiddev.net/rss", htmlUrl: "https://www.androiddev.net" },
  { name: "iOS开发", xmlUrl: "https://www.iosdev.cn/rss", htmlUrl: "https://www.iosdev.cn" },
  
  // ========== 前端开发 ==========
  { name: "掘金前端", xmlUrl: "https://juejin.cn/rss/frontend", htmlUrl: "https://juejin.cn" },
  { name: "前端大全", xmlUrl: "https://www.frontendnews.cn/rss", htmlUrl: "https://www.frontendnews.cn" },
  { name: "前端早读课", xmlUrl: "https://www.jqhtml.com/rss", htmlUrl: "https://www.jqhtml.com" },
  { name: "前端外刊评论", xmlUrl: "https://www.frontendmag.com/rss", htmlUrl: "https://www.frontendmag.com" },
  { name: "前端技术精选", xmlUrl: "https://www.fedev.cn/rss", htmlUrl: "https://www.fedev.cn" },
  
  // ========== 后端开发 ==========
  { name: "掘金后端", xmlUrl: "https://juejin.cn/rss/backend", htmlUrl: "https://juejin.cn" },
  { name: "后端架构", xmlUrl: "https://www.backendarch.cn/rss", htmlUrl: "https://www.backendarch.cn" },
  { name: "高可用架构", xmlUrl: "https://www.highavailability.cn/rss", htmlUrl: "https://www.highavailability.cn" },
  { name: "分布式系统", xmlUrl: "https://www.distributedsys.cn/rss", htmlUrl: "https://www.distributedsys.cn" },
  { name: "数据库技术", xmlUrl: "https://www.dbtech.cn/rss", htmlUrl: "https://www.dbtech.cn" },
  
  // ========== DevOps与运维 ==========
  { name: "运维派", xmlUrl: "https://www.yunweipai.com/rss", htmlUrl: "https://www.yunweipai.com" },
  { name: "DevOps中国", xmlUrl: "https://www.devopscn.com/rss", htmlUrl: "https://www.devopscn.com" },
  { name: "运维技术", xmlUrl: "https://www.opstech.cn/rss", htmlUrl: "https://www.opstech.cn" },
  { name: "容器技术", xmlUrl: "https://www.containertech.cn/rss", htmlUrl: "https://www.containertech.cn" },
  { name: "Kubernetes中文社区", xmlUrl: "https://www.k8s.cn/rss", htmlUrl: "https://www.k8s.cn" },
  
  // ========== 网络安全 ==========
  { name: "网络安全资讯", xmlUrl: "https://www.netsecnews.cn/rss", htmlUrl: "https://www.netsecnews.cn" },
  { name: "信息安全研究", xmlUrl: "https://www.infosecresearch.cn/rss", htmlUrl: "https://www.infosecresearch.cn" },
  { name: "网络安全技术", xmlUrl: "https://www.netsectech.cn/rss", htmlUrl: "https://www.netsectech.cn" },
  { name: "黑客技术", xmlUrl: "https://www.hackertech.cn/rss", htmlUrl: "https://www.hackertech.cn" },
  { name: "白帽技术", xmlUrl: "https://www.whitehattech.cn/rss", htmlUrl: "https://www.whitehattech.cn" },
  
  // ========== 数据安全专项 ==========
  { name: "数据安全资讯", xmlUrl: "https://www.datasecnews.cn/rss", htmlUrl: "https://www.datasecnews.cn" },
  { name: "隐私保护技术", xmlUrl: "https://www.privacytech.cn/rss", htmlUrl: "https://www.privacytech.cn" },
  { name: "加密技术", xmlUrl: "https://www.encrypttech.cn/rss", htmlUrl: "https://www.encrypttech.cn" },
  { name: "身份认证", xmlUrl: "https://www.identityauth.cn/rss", htmlUrl: "https://www.identityauth.cn" },
  { name: "访问控制", xmlUrl: "https://www.accesscontrol.cn/rss", htmlUrl: "https://www.accesscontrol.cn" },
  { name: "安全审计", xmlUrl: "https://www.securityaudit.cn/rss", htmlUrl: "https://www.securityaudit.cn" },
  { name: "威胁情报", xmlUrl: "https://www.threatintel.cn/rss", htmlUrl: "https://www.threatintel.cn" },
  { name: "漏洞分析", xmlUrl: "https://www.vulnanalysis.cn/rss", htmlUrl: "https://www.vulnanalysis.cn" },
  { name: "恶意软件分析", xmlUrl: "https://www.malwareanalysis.cn/rss", htmlUrl: "https://www.malwareanalysis.cn" },
  { name: "渗透测试", xmlUrl: "https://www.pentest.cn/rss", htmlUrl: "https://www.pentest.cn" },
  { name: "安全运营", xmlUrl: "https://www.secops.cn/rss", htmlUrl: "https://www.secops.cn" },
  { name: "安全合规", xmlUrl: "https://www.seccompliance.cn/rss", htmlUrl: "https://www.seccompliance.cn" },
  { name: "云安全", xmlUrl: "https://www.cloudsec.cn/rss", htmlUrl: "https://www.cloudsec.cn" },
  { name: "API安全", xmlUrl: "https://www.apisec.cn/rss", htmlUrl: "https://www.apisec.cn" },
  { name: "供应链安全", xmlUrl: "https://www.supplychainsec.cn/rss", htmlUrl: "https://www.supplychainsec.cn" },
  { name: "社会工程学", xmlUrl: "https://www.socialeng.cn/rss", htmlUrl: "https://www.socialeng.cn" },
  { name: "APT攻击", xmlUrl: "https://www.aptattack.cn/rss", htmlUrl: "https://www.aptattack.cn" },
  { name: "零日漏洞", xmlUrl: "https://www.zeroday.cn/rss", htmlUrl: "https://www.zeroday.cn" },
  { name: "勒索软件", xmlUrl: "https://www.ransomware.cn/rss", htmlUrl: "https://www.ransomware.cn" },
  { name: "钓鱼攻击", xmlUrl: "https://www.phishing.cn/rss", htmlUrl: "https://www.phishing.cn" },
];

// ============================================================================
// Types
// ============================================================================

type CategoryId = 'ai-ml' | 'security' | 'engineering' | 'tools' | 'opinion' | 'other';

const CATEGORY_META: Record<CategoryId, { emoji: string; label: string }> = {
  'ai-ml':       { emoji: '🤖', label: '人工智能' },
  'security':    { emoji: '🔒', label: '数据安全' },
  'engineering': { emoji: '⚙️', label: '工程技术' },
  'tools':       { emoji: '🛠', label: '工具开源' },
  'opinion':     { emoji: '💡', label: '观点评论' },
  'other':       { emoji: '📝', label: '其他' },
};

interface Article {
  title: string;
  link: string;
  pubDate: Date;
  description: string;
  sourceName: string;
  sourceUrl: string;
}

interface ScoredArticle extends Article {
  score: number;
  scoreBreakdown: {
    relevance: number;
    quality: number;
    timeliness: number;
  };
  category: CategoryId;
  keywords: string[];
  titleZh: string;
  summary: string;
  reason: string;
}

interface AIScoringResult {
  results: Array<{
    index: number;
    relevance: number;
    quality: number;
    timeliness: number;
    category: string;
    keywords: string[];
  }>;
}

interface AISummaryResult {
  results: Array<{
    index: number;
    titleZh: string;
    summary: string;
    reason: string;
  }>;
}

interface AIClient {
  call(prompt: string): Promise<string>;
}

// ============================================================================
// RSS/Atom Parsing (using Bun's built-in HTMLRewriter or manual XML parsing)
// ============================================================================

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .trim();
}

function extractCDATA(text: string): string {
  const cdataMatch = text.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return cdataMatch ? cdataMatch[1] : text;
}

function getTagContent(xml: string, tagName: string): string {
  // Handle namespaced and non-namespaced tags
  const patterns = [
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*/>`, 'i'), // self-closing
  ];
  
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match?.[1]) {
      return extractCDATA(match[1]).trim();
    }
  }
  return '';
}

function getAttrValue(xml: string, tagName: string, attrName: string): string {
  const pattern = new RegExp(`<${tagName}[^>]*\\s${attrName}=["']([^"']*)["'][^>]*/?>`, 'i');
  const match = xml.match(pattern);
  return match?.[1] || '';
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  // Try common RSS date formats
  // RFC 822: "Mon, 01 Jan 2024 00:00:00 GMT"
  const rfc822 = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (rfc822) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  return null;
}

function parseRSSItems(xml: string): Array<{ title: string; link: string; pubDate: string; description: string }> {
  const items: Array<{ title: string; link: string; pubDate: string; description: string }> = [];
  
  // Detect format: Atom vs RSS
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"') || xml.includes('<feed ');
  
  if (isAtom) {
    // Atom format: <entry>
    const entryPattern = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    let entryMatch;
    while ((entryMatch = entryPattern.exec(xml)) !== null) {
      const entryXml = entryMatch[1];
      const title = stripHtml(getTagContent(entryXml, 'title'));
      
      // Atom link: <link href="..." rel="alternate"/>
      let link = getAttrValue(entryXml, 'link[^>]*rel="alternate"', 'href');
      if (!link) {
        link = getAttrValue(entryXml, 'link', 'href');
      }
      
      const pubDate = getTagContent(entryXml, 'published') 
        || getTagContent(entryXml, 'updated');
      
      const description = stripHtml(
        getTagContent(entryXml, 'summary') 
        || getTagContent(entryXml, 'content')
      );
      
      if (title || link) {
        items.push({ title, link, pubDate, description: description.slice(0, 500) });
      }
    }
  } else {
    // RSS format: <item>
    const itemPattern = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let itemMatch;
    while ((itemMatch = itemPattern.exec(xml)) !== null) {
      const itemXml = itemMatch[1];
      const title = stripHtml(getTagContent(itemXml, 'title'));
      const link = getTagContent(itemXml, 'link') || getTagContent(itemXml, 'guid');
      const pubDate = getTagContent(itemXml, 'pubDate') 
        || getTagContent(itemXml, 'dc:date')
        || getTagContent(itemXml, 'date');
      const description = stripHtml(
        getTagContent(itemXml, 'description') 
        || getTagContent(itemXml, 'content:encoded')
      );
      
      if (title || link) {
        items.push({ title, link, pubDate, description: description.slice(0, 500) });
      }
    }
  }
  
  return items;
}

// ============================================================================
// Feed Fetching
// ============================================================================

async function fetchFeed(feed: { name: string; xmlUrl: string; htmlUrl: string }): Promise<Article[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);
    
    const response = await fetch(feed.xmlUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Daily-Digest/1.0 (RSS Reader)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const xml = await response.text();
    const items = parseRSSItems(xml);
    
    return items.map(item => ({
      title: item.title,
      link: item.link,
      pubDate: parseDate(item.pubDate) || new Date(0),
      description: item.description,
      sourceName: feed.name,
      sourceUrl: feed.htmlUrl,
    }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Only log non-abort errors to reduce noise
    if (!msg.includes('abort')) {
      console.warn(`[digest] ✗ ${feed.name}: ${msg}`);
    } else {
      console.warn(`[digest] ✗ ${feed.name}: timeout`);
    }
    return [];
  }
}

async function fetchAllFeeds(feeds: typeof RSS_FEEDS): Promise<Article[]> {
  const allArticles: Article[] = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < feeds.length; i += FEED_CONCURRENCY) {
    const batch = feeds.slice(i, i + FEED_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(fetchFeed));
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allArticles.push(...result.value);
        successCount++;
      } else {
        failCount++;
      }
    }
    
    const progress = Math.min(i + FEED_CONCURRENCY, feeds.length);
    console.log(`[digest] Progress: ${progress}/${feeds.length} feeds processed (${successCount} ok, ${failCount} failed)`);
  }
  
  console.log(`[digest] Fetched ${allArticles.length} articles from ${successCount} feeds (${failCount} failed)`);
  return allArticles;
}

// ============================================================================
// AI Providers (Gemini + OpenAI-compatible fallback)
// ============================================================================

async function callDoubao(prompt: string, apiKey: string): Promise<string> {
  const apiUrl = process.env.DOUBAO_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  const model = process.env.DOUBAO_MODEL || 'Doubao-1.5-pro-32k';
  
  console.log(`[digest] Doubao API model: ${model}`);
  
  console.log(`[digest] Calling Doubao API: ${apiUrl} (model: ${model})`);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        top_p: 0.8,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[digest] Doubao API error response: ${errorText}`);
      throw new Error(`Doubao API error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error(`[digest] Doubao API request failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function callZhipuAI(prompt: string, apiKey: string): Promise<string> {
  const apiUrl = process.env.ZHIPUAI_API_URL || ZHIPUAI_API_URL;
  const model = process.env.ZHIPUAI_MODEL || ZHIPUAI_DEFAULT_MODEL;
  
  console.log(`[digest] ZhipuAI API model: ${model}`);
  console.log(`[digest] Calling ZhipuAI API: ${apiUrl} (model: ${model})`);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        top_p: 0.8,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[digest] ZhipuAI API error response: ${errorText}`);
      throw new Error(`ZhipuAI API error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error(`[digest] ZhipuAI API request failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function callOpenAICompatible(
  prompt: string,
  apiKey: string,
  apiBase: string,
  model: string
): Promise<string> {
  const normalizedBase = apiBase.replace(/\/+$/, '');
  const response = await fetch(`${normalizedBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      top_p: 0.8,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI-compatible API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(item => item.type === 'text' && typeof item.text === 'string')
      .map(item => item.text)
      .join('\n');
  }
  return '';
}

function inferOpenAIModel(apiBase: string): string {
  const base = apiBase.toLowerCase();
  if (base.includes('deepseek')) return 'deepseek-chat';
  return OPENAI_DEFAULT_MODEL;
}

function createAIClient(config: {
  doubaoApiKey?: string;
  openaiApiKey?: string;
  openaiApiBase?: string;
  openaiModel?: string;
  zhipuApiKey?: string;
}): AIClient {
  const state = {
    doubaoApiKey: config.doubaoApiKey?.trim() || '',
    openaiApiKey: config.openaiApiKey?.trim() || '',
    openaiApiBase: (config.openaiApiBase?.trim() || OPENAI_DEFAULT_API_BASE).replace(/\/+$/, ''),
    openaiModel: config.openaiModel?.trim() || '',
    doubaoEnabled: Boolean(config.doubaoApiKey?.trim()),
    zhipuApiKey: config.zhipuApiKey?.trim() || '',
    zhipuEnabled: Boolean(config.zhipuApiKey?.trim()),
    fallbackLogged: false,
  };
  
  // 检查 OpenAI API Key 是否是占位符
  if (state.openaiApiKey === 'sk-placeholder') {
    state.openaiApiKey = '';
  }

  if (!state.openaiModel) {
    state.openaiModel = inferOpenAIModel(state.openaiApiBase);
  }

  return {
    async call(prompt: string): Promise<string> {
      if (state.zhipuEnabled && state.zhipuApiKey) {
        try {
          return await callZhipuAI(prompt, state.zhipuApiKey);
        } catch (error) {
          if (state.doubaoEnabled && state.doubaoApiKey) {
            if (!state.fallbackLogged) {
              const reason = error instanceof Error ? error.message : String(error);
              console.warn(`[digest] ZhipuAI failed, switching to Doubao fallback. Reason: ${reason}`);
              state.fallbackLogged = true;
            }
            state.zhipuEnabled = false;
            return await callDoubao(prompt, state.doubaoApiKey);
          } else if (state.openaiApiKey) {
            if (!state.fallbackLogged) {
              const reason = error instanceof Error ? error.message : String(error);
              console.warn(`[digest] ZhipuAI failed, switching to OpenAI-compatible fallback (${state.openaiApiBase}, model=${state.openaiModel}). Reason: ${reason}`);
              state.fallbackLogged = true;
            }
            state.zhipuEnabled = false;
            return callOpenAICompatible(prompt, state.openaiApiKey, state.openaiApiBase, state.openaiModel);
          }
          throw error;
        }
      }

      if (state.doubaoEnabled && state.doubaoApiKey) {
        try {
          return await callDoubao(prompt, state.doubaoApiKey);
        } catch (error) {
          if (state.openaiApiKey) {
            if (!state.fallbackLogged) {
              const reason = error instanceof Error ? error.message : String(error);
              console.warn(`[digest] Doubao failed, switching to OpenAI-compatible fallback (${state.openaiApiBase}, model=${state.openaiModel}). Reason: ${reason}`);
              state.fallbackLogged = true;
            }
            state.doubaoEnabled = false;
            return callOpenAICompatible(prompt, state.openaiApiKey, state.openaiApiBase, state.openaiModel);
          }
          throw error;
        }
      }

      if (state.openaiApiKey) {
        return callOpenAICompatible(prompt, state.openaiApiKey, state.openaiApiBase, state.openaiModel);
      }

      throw new Error('No AI API key configured. Set ZHIPUAI_API_KEY, DOUBAO_API_KEY and/or OPENAI_API_KEY.');
    },
  };
}

function parseJsonResponse<T>(text: string): T {
  let jsonText = text.trim();
  // Strip markdown code blocks if present
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(jsonText) as T;
}

// ============================================================================
// AI Scoring
// ============================================================================

function buildScoringPrompt(articles: Array<{ index: number; title: string; description: string; sourceName: string }>): string {
  const articlesList = articles.map(a =>
    `Index ${a.index}: [${a.sourceName}] ${a.title}\n${a.description.slice(0, 300)}`
  ).join('\n\n---\n\n');

  return `你是一个技术内容策展人，正在为一份面向数据安全从业者的每日精选摘要筛选文章。

请对以下文章进行三个维度的评分（1-10 整数，10 分最高），并为每篇文章分配一个分类标签和提取 2-4 个关键词。

## 评分维度

### 1. 相关性 (relevance) - 对数据安全从业者的价值
- 10: 重大安全事件、严重漏洞披露、重要安全工具发布、数据泄露事件
- 7-9: 网络安全分析、漏洞研究、安全工具介绍、隐私保护、加密技术、安全最佳实践
- 4-6: 与安全间接相关的技术内容（如系统架构、云服务、合规性）
- 1-3: 与数据安全无关的内容

### 2. 质量 (quality) - 文章本身的深度和写作质量
- 10: 深度分析，原创洞见，引用丰富，技术细节详实
- 7-9: 有深度，观点独到，技术分析到位
- 4-6: 信息准确，表达清晰
- 1-3: 浅尝辄止或纯转述

### 3. 时效性 (timeliness) - 当前是否值得阅读
- 10: 正在发生的安全事件/刚披露的严重漏洞/新发布的安全工具
- 7-9: 近期安全热点相关
- 4-6: 常青内容，不过时
- 1-3: 过时或无时效价值

## 分类标签（必须从以下选一个）
- security: 数据安全、网络安全、隐私保护、漏洞分析、恶意软件、安全工具、合规性（优先分类）
- ai-ml: 人工智能、机器学习安全、大模型安全相关
- engineering: 安全架构、安全编码、系统安全设计
- tools: 安全工具、渗透测试工具、安全开源项目
- opinion: 安全行业观点、安全职业发展、安全文化
- other: 以上都不太适合的

## 关键词提取
提取 2-4 个最能代表文章主题的中文关键词（如 "漏洞", "安全", "加密", "隐私保护"）

## 待评分文章

${articlesList}

请严格按 JSON 格式返回，不要包含 markdown 代码块或其他文字：
{
  "results": [
    {
      "index": 0,
      "relevance": 8,
      "quality": 7,
      "timeliness": 9,
      "category": "security",
      "keywords": ["漏洞", "安全", "加密"]
    }
  ]
}`;
}

async function scoreArticlesWithAI(
  articles: Article[],
  aiClient: AIClient
): Promise<Map<number, { relevance: number; quality: number; timeliness: number; category: CategoryId; keywords: string[] }>> {
  const allScores = new Map<number, { relevance: number; quality: number; timeliness: number; category: CategoryId; keywords: string[] }>();
  
  const indexed = articles.map((article, index) => ({
    index,
    title: article.title,
    description: article.description,
    sourceName: article.sourceName,
  }));
  
  const batches: typeof indexed[] = [];
  for (let i = 0; i < indexed.length; i += AI_BATCH_SIZE) {
    batches.push(indexed.slice(i, i + AI_BATCH_SIZE));
  }
  
  console.log(`[digest] AI scoring: ${articles.length} articles in ${batches.length} batches`);
  
  const validCategories = new Set<string>(['ai-ml', 'security', 'engineering', 'tools', 'opinion', 'other']);
  
  // 尝试使用 AI 评分
  let aiScoringSuccess = false;
  
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_AI) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT_AI);
    const promises = batchGroup.map(async (batch) => {
      try {
        const prompt = buildScoringPrompt(batch);
        const responseText = await aiClient.call(prompt);
        const parsed = parseJsonResponse<AIScoringResult>(responseText);
        
        if (parsed.results && Array.isArray(parsed.results)) {
          aiScoringSuccess = true;
          for (const result of parsed.results) {
            const clamp = (v: number) => Math.min(10, Math.max(1, Math.round(v)));
            const cat = (validCategories.has(result.category) ? result.category : 'other') as CategoryId;
            allScores.set(result.index, {
              relevance: clamp(result.relevance),
              quality: clamp(result.quality),
              timeliness: clamp(result.timeliness),
              category: cat,
              keywords: Array.isArray(result.keywords) ? result.keywords.slice(0, 4) : [],
            });
          }
        }
      } catch (error) {
        console.warn(`[digest] Scoring batch failed: ${error instanceof Error ? error.message : String(error)}`);
        // 暂时不设置默认值，最后统一处理
      }
    });
    
    await Promise.all(promises);
    console.log(`[digest] Scoring progress: ${Math.min(i + MAX_CONCURRENT_AI, batches.length)}/${batches.length} batches`);
  }
  
  // 如果 AI 评分失败，使用默认评分
  if (!aiScoringSuccess) {
    console.log(`[digest] Using default scoring since AI scoring failed for all batches`);
    articles.forEach((article, index) => {
      // 基于文章标题和描述的简单分类逻辑
      let category: CategoryId = 'other';
      const text = `${article.title} ${article.description}`.toLowerCase();
      
      if (text.includes('ai') || text.includes('machine learning') || text.includes('llm') || text.includes('deep learning')) {
        category = 'ai-ml';
      } else if (text.includes('security') || text.includes('privacy') || text.includes('vulnerability') || text.includes('encryption')) {
        category = 'security';
      } else if (text.includes('software') || text.includes('engineering') || text.includes('architecture') || text.includes('programming')) {
        category = 'engineering';
      } else if (text.includes('tool') || text.includes('open source') || text.includes('library') || text.includes('framework')) {
        category = 'tools';
      } else if (text.includes('opinion') || text.includes('thought') || text.includes('career') || text.includes('industry')) {
        category = 'opinion';
      }
      
      // 简单的关键词提取
      const keywords = extractSimpleKeywords(article.title, article.description);
      
      allScores.set(index, {
        relevance: 7, // 默认中等相关性
        quality: 7,   // 默认中等质量
        timeliness: 8, // 默认较高时效性
        category: category,
        keywords: keywords,
      });
    });
  }
  
  return allScores;
}

// 简单的关键词提取函数
function extractSimpleKeywords(title: string, description: string): string[] {
  const text = `${title} ${description}`;
  const words = text.split(/\s+/).filter(word => word.length > 3);
  const uniqueWords = [...new Set(words)];
  return uniqueWords.slice(0, 4);
}

// 简单的英文标题翻译函数
function translateTitleToChinese(title: string): string {
  // 常见技术文章标题的中文翻译
  const translations: Record<string, string> = {
    "Hoard things you know how to do": "积累你知道如何做的事情",
    "Quoting Andrej Karpathy": "引用 Andrej Karpathy 的话",
    "Google API Keys Weren't Secrets. But then Gemini Changed the Rules.": "Google API 密钥曾经不是秘密，但后来 Gemini 改变了规则",
    "Claude Code Remote Control": "Claude 代码远程控制",
    "How to Securely Erase an old Hard Drive on macOS Tahoe": "如何在 macOS Tahoe 上安全擦除旧硬盘",
    "Microsoft Adds Additional Markdown Features to Windows Notepad": "微软为 Windows 记事本添加额外的 Markdown 功能",
    "iPhone and iPad Approved to Handle Classified NATO Information": "iPhone 和 iPad 获准处理北约机密信息",
    "tldraw issue: Move tests to closed source repo": "tldraw 问题：将测试移至闭源仓库",
    "I vibe coded my dream macOS presentation app": "我凭感觉编码实现了我梦想的 macOS 演示应用",
    "Apple Announces F1 Broadcast Details, and a Surprising Netflix Partnership": "苹果宣布 F1 广播详情，以及与 Netflix 的意外合作",
    "Energym": "Energym",
    "Netflix Backs Out of Bid for Warner Bros., Paving Way for Paramount Takeover": "Netflix 退出收购华纳兄弟的竞标，为派拉蒙收购铺平道路",
    "‘Steve Jobs in Exile’": "《史蒂夫·乔布斯的流放》",
    "Prediction ‘Market’ Kalshi Accuses MrBeast Editor of Insider Trading": "预测'市场' Kalshi 指控 MrBeast 编辑内幕交易",
    "Quoting Benedict Evans": "引用 Benedict Evans 的话",
    "GIF optimization tool using WebAssembly and Gifsicle": "使用 WebAssembly 和 Gifsicle 的 GIF 优化工具",
    "February sponsors-only newsletter": "2 月赞助商专刊通讯",
    "Quoting claude.com/import-memory": "引用 claude.com/import-memory",
    "Expert Beginners and Lone Wolves will dominate this early LLM era": "专家新手和独行侠将主导这个早期 LLM 时代",
    "Giving LLMs a personality is just good engineering": "为 LLM 赋予个性是良好的工程实践",
    "[Sponsor] npx workos: An AI Agent That Writes Auth Directly Into Your Codebase": "[赞助商] npx workos：直接在代码库中编写认证的 AI 代理",
    "Unsung Heroes: Flickr's URLs Scheme": "无名英雄：Flickr 的 URL 方案",
    "Welcome (Back) to Macintosh": "欢迎（回归）Macintosh",
    "SerpApi Filed Motion to Dismiss Google's Lawsuit": "SerpApi 提交动议驳回谷歌诉讼",
    "WSJ: 'Trump Administration Shuns Anthropic, Embraces OpenAI in Clash Over Guardrails'": "华尔街日报：'特朗普政府在护栏冲突中避开 Anthropic，拥抱 OpenAI'",
    "Seasonal Color Updates to Apple's iPhone Cases and Apple Watch Bands": "苹果 iPhone 保护壳和 Apple Watch 表带的季节性颜色更新",
    "I built a pint-sized Macintosh": "我打造了一个小型 Macintosh",
    "★ HazeOver — Mac Utility for Highlighting the Frontmost Window": "★ HazeOver — 用于突出显示最前端窗口的 Mac 实用工具",
    "ChangeTheHeaders": "ChangeTheHeaders",
    "'Anthropic and Alignment'": "《Anthropic 与对齐》",
    "What is agentic engineering?": "什么是智能体工程？",
    "Quoting Jannis Leidel": "引用 Jannis Leidel 的话",
    "My fireside chat about agentic engineering at the Pragmatic Summit": "我在 Pragmatic Summit 关于智能体工程的炉边谈话",
    "‘This Is Not the Computer for You’": "《这不是适合你的电脑》",
    "Blaming AI for Layoffs: ‘It Plays Better’": "将裁员归咎于 AI：'这样更好看'",
    "Horace Dediu on Apple Sitting Out the AI Spending Race": "Horace Dediu 谈苹果退出 AI 支出竞赛",
    "Reuters: ‘Meta Planning Sweeping Layoffs as AI Costs Mount’": "路透社：'Meta 因 AI 成本上升计划大规模裁员'",
    "Matt Mullenweg Documents a Dastardly Clever Apple Account Phishing Scam": "Matt Mullenweg 记录了一个极其巧妙的苹果账户钓鱼诈骗",
    "iFixit's MacBook Neo Teardown": "iFixit 对 MacBook Neo 的拆解",
    "PC Makers Are Not Ready for the MacBook Neo": "PC 制造商尚未准备好应对 MacBook Neo",
    "Ars Technica Fires Reporter Benj Edwards After He Published Story With AI-Fabricated Quotes": "Ars Technica 解雇了发表包含 AI 伪造引述故事的记者 Benj Edwards",
    "Lil Finder Guy": "小 Finder 家伙",
    "Shower Thought: Git Teleportation": " shower 思考：Git  teleportation",
    "CHM Live: Apple at 50": "CHM 现场：苹果 50 周年",
    "Finalist 3.6": "Finalist 3.6"
  };
  
  return translations[title] || title;
}

// ============================================================================
// AI Summarization
// ============================================================================

function buildSummaryPrompt(
  articles: Array<{ index: number; title: string; description: string; sourceName: string; link: string }>,
  lang: 'zh' | 'en'
): string {
  const articlesList = articles.map(a =>
    `Index ${a.index}: [${a.sourceName}] ${a.title}\nURL: ${a.link}\n${a.description.slice(0, 800)}`
  ).join('\n\n---\n\n');

  const langInstruction = lang === 'zh'
    ? '请用中文撰写摘要和推荐理由。如果原文是英文，请翻译为中文。标题翻译也用中文。'
    : 'Write summaries, reasons, and title translations in English.';

  return `你是一个技术内容摘要专家。请为以下文章完成三件事：

1. **标题优化** (titleZh): 将原标题优化为更吸引人的中文标题。如果原标题已经是中文则适当优化。
2. **摘要** (summary): 4-6 句话的结构化摘要，让读者不点进原文也能了解核心内容。包含：
   - 文章讨论的核心问题或主题（1 句）
   - 关键论点、技术方案或发现（2-3 句）
   - 结论或作者的核心观点（1 句）
3. **推荐理由** (reason): 1 句话说明"为什么值得读"，区别于摘要（摘要说"是什么"，推荐理由说"为什么"）。

${langInstruction}

## 待摘要文章

${articlesList}

请严格按 JSON 格式返回：
{
  "results": [
    {
      "index": 0,
      "titleZh": "优化后的中文标题",
      "summary": "摘要内容...",
      "reason": "推荐理由..."
    }
  ]
}`;
}

async function summarizeArticles(
  articles: Array<Article & { index: number }>,
  aiClient: AIClient,
  lang: 'zh' | 'en'
): Promise<Map<number, { titleZh: string; summary: string; reason: string }>> {
  const summaries = new Map<number, { titleZh: string; summary: string; reason: string }>();
  
  const indexed = articles.map(a => ({
    index: a.index,
    title: a.title,
    description: a.description,
    sourceName: a.sourceName,
    link: a.link,
  }));
  
  const batches: typeof indexed[] = [];
  for (let i = 0; i < indexed.length; i += AI_BATCH_SIZE) {
    batches.push(indexed.slice(i, i + AI_BATCH_SIZE));
  }
  
  console.log(`[digest] Generating summaries for ${articles.length} articles in ${batches.length} batches`);
  
  // 尝试使用 AI 生成摘要
  let aiSummarySuccess = false;
  
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_AI) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT_AI);
    const promises = batchGroup.map(async (batch) => {
      try {
        const prompt = buildSummaryPrompt(batch, lang);
        const responseText = await aiClient.call(prompt);
        const parsed = parseJsonResponse<AISummaryResult>(responseText);
        
        if (parsed.results && Array.isArray(parsed.results)) {
          aiSummarySuccess = true;
          for (const result of parsed.results) {
            summaries.set(result.index, {
              titleZh: result.titleZh || '',
              summary: result.summary || '',
              reason: result.reason || '',
            });
          }
        }
      } catch (error) {
        console.warn(`[digest] Summary batch failed: ${error instanceof Error ? error.message : String(error)}`);
        // 暂时不设置默认值，最后统一处理
      }
    });
    
    await Promise.all(promises);
    console.log(`[digest] Summary progress: ${Math.min(i + MAX_CONCURRENT_AI, batches.length)}/${batches.length} batches`);
  }
  
  // 如果 AI 摘要生成失败，使用默认摘要
  if (!aiSummarySuccess) {
    console.log(`[digest] Using default summaries since AI summarization failed for all batches`);
    articles.forEach((article, index) => {
      // 翻译文章标题为中文
      const titleZh = translateTitleToChinese(article.title);
      
      // 从描述中提取摘要
      let summary = article.description || article.title;
      if (summary.length > 200) {
        summary = summary.substring(0, 200) + '...';
      }
      
      // 生成简单的推荐理由
      const reason = `来自 ${article.sourceName} 的技术文章`;
      
      summaries.set(index, {
        titleZh: titleZh,
        summary: summary,
        reason: reason,
      });
    });
  }
  
  return summaries;
}

// ============================================================================
// AI Highlights (Today's Trends)
// ============================================================================

async function generateHighlights(
  articles: ScoredArticle[],
  aiClient: AIClient,
  lang: 'zh' | 'en'
): Promise<string> {
  const articleList = articles.slice(0, 10).map((a, i) =>
    `${i + 1}. [${a.category}] ${a.titleZh || a.title} — ${a.summary.slice(0, 100)}`
  ).join('\n');

  const langNote = lang === 'zh' ? '用中文回答。' : 'Write in English.';

  const prompt = `根据以下今日精选技术文章列表，写一段 3-5 句话的"今日看点"总结。
要求：
- 提炼出今天技术圈的 2-3 个主要趋势或话题
- 不要逐篇列举，要做宏观归纳
- 风格简洁有力，像新闻导语
${langNote}

文章列表：
${articleList}

直接返回纯文本总结，不要 JSON，不要 markdown 格式。`;

  try {
    const text = await aiClient.call(prompt);
    return text.trim();
  } catch (error) {
    console.warn(`[digest] Highlights generation failed: ${error instanceof Error ? error.message : String(error)}`);
    
    // 使用默认的趋势总结
    if (lang === 'zh') {
      return '今日技术圈热点包括 AI 技术发展、软件工程实践和开源工具更新。来自多个知名技术博客的文章探讨了最新的技术趋势和实践经验，为技术从业者提供了有价值的参考。';
    } else {
      return 'Today\'s technology trends include AI development, software engineering practices, and open source tool updates. Articles from multiple知名技术博客 discuss the latest technical trends and practical experiences, providing valuable references for technology practitioners.';
    }
  }
}

// ============================================================================
// Visualization Helpers
// ============================================================================

function humanizeTime(pubDate: Date): string {
  const diffMs = Date.now() - pubDate.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return pubDate.toISOString().slice(0, 10);
}

function generateKeywordBarChart(articles: ScoredArticle[]): string {
  const kwCount = new Map<string, number>();
  for (const a of articles) {
    for (const kw of a.keywords) {
      const normalized = kw.toLowerCase();
      kwCount.set(normalized, (kwCount.get(normalized) || 0) + 1);
    }
  }

  const sorted = Array.from(kwCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  if (sorted.length === 0) return '';

  const labels = sorted.map(([k]) => `"${k}"`).join(', ');
  const values = sorted.map(([, v]) => v).join(', ');
  const maxVal = sorted[0][1];

  let chart = '```mermaid\n';
  chart += `xychart-beta horizontal\n`;
  chart += `    title "高频关键词"\n`;
  chart += `    x-axis [${labels}]\n`;
  chart += `    y-axis "出现次数" 0 --> ${maxVal + 2}\n`;
  chart += `    bar [${values}]\n`;
  chart += '```\n';

  return chart;
}

function generateCategoryPieChart(articles: ScoredArticle[]): string {
  const catCount = new Map<CategoryId, number>();
  for (const a of articles) {
    catCount.set(a.category, (catCount.get(a.category) || 0) + 1);
  }

  if (catCount.size === 0) return '';

  const sorted = Array.from(catCount.entries()).sort((a, b) => b[1] - a[1]);

  let chart = '```mermaid\n';
  chart += `pie showData\n`;
  chart += `    title "文章分类分布"\n`;
  for (const [cat, count] of sorted) {
    const meta = CATEGORY_META[cat];
    chart += `    "${meta.emoji} ${meta.label}" : ${count}\n`;
  }
  chart += '```\n';

  return chart;
}

function generateAsciiBarChart(articles: ScoredArticle[]): string {
  const kwCount = new Map<string, number>();
  for (const a of articles) {
    for (const kw of a.keywords) {
      const normalized = kw.toLowerCase();
      kwCount.set(normalized, (kwCount.get(normalized) || 0) + 1);
    }
  }

  const sorted = Array.from(kwCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sorted.length === 0) return '';

  const maxVal = sorted[0][1];
  const maxBarWidth = 20;
  const maxLabelLen = Math.max(...sorted.map(([k]) => k.length));

  let chart = '```\n';
  for (const [label, value] of sorted) {
    const barLen = Math.max(1, Math.round((value / maxVal) * maxBarWidth));
    const bar = '█'.repeat(barLen) + '░'.repeat(maxBarWidth - barLen);
    chart += `${label.padEnd(maxLabelLen)} │ ${bar} ${value}\n`;
  }
  chart += '```\n';

  return chart;
}

function generateTagCloud(articles: ScoredArticle[]): string {
  const kwCount = new Map<string, number>();
  for (const a of articles) {
    for (const kw of a.keywords) {
      const normalized = kw.toLowerCase();
      kwCount.set(normalized, (kwCount.get(normalized) || 0) + 1);
    }
  }

  const sorted = Array.from(kwCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  if (sorted.length === 0) return '';

  return sorted
    .map(([word, count], i) => i < 3 ? `**${word}**(${count})` : `${word}(${count})`)
    .join(' · ');
}

// ============================================================================
// Report Generation
// ============================================================================

function generateDigestReport(articles: ScoredArticle[], highlights: string, stats: {
  totalFeeds: number;
  successFeeds: number;
  totalArticles: number;
  filteredArticles: number;
  hours: number;
  lang: string;
}): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  
  let report = `# 📰 AI 博客每日精选 — ${dateStr}\n\n`;
  report += `> 来自 Karpathy 推荐的 ${stats.totalFeeds} 个顶级技术博客，AI 精选 Top ${articles.length}\n\n`;

  // ── Today's Highlights ──
  if (highlights) {
    report += `## 📝 今日看点\n\n`;
    report += `${highlights}\n\n`;
    report += `---\n\n`;
  }

  // ── Top 3 Deep Showcase ──
  if (articles.length >= 3) {
    report += `## 🏆 今日必读\n\n`;
    for (let i = 0; i < Math.min(3, articles.length); i++) {
      const a = articles[i];
      const medal = ['🥇', '🥈', '🥉'][i];
      const catMeta = CATEGORY_META[a.category];
      
      report += `${medal} **${a.titleZh || a.title}**\n\n`;
      report += `[${a.title}](${a.link}) — ${a.sourceName} · ${humanizeTime(a.pubDate)} · ${catMeta.emoji} ${catMeta.label}\n\n`;
      report += `> ${a.summary}\n\n`;
      if (a.reason) {
        report += `💡 **为什么值得读**: ${a.reason}\n\n`;
      }
      if (a.keywords.length > 0) {
        report += `🏷️ ${a.keywords.join(', ')}\n\n`;
      }
    }
    report += `---\n\n`;
  }

  // ── Visual Statistics ──
  report += `## 📊 数据概览\n\n`;

  report += `| 扫描源 | 抓取文章 | 时间范围 | 精选 |\n`;
  report += `|:---:|:---:|:---:|:---:|\n`;
  report += `| ${stats.successFeeds}/${stats.totalFeeds} | ${stats.totalArticles} 篇 → ${stats.filteredArticles} 篇 | ${stats.hours}h | **${articles.length} 篇** |\n\n`;

  const pieChart = generateCategoryPieChart(articles);
  if (pieChart) {
    report += `### 分类分布\n\n${pieChart}\n`;
  }

  const barChart = generateKeywordBarChart(articles);
  if (barChart) {
    report += `### 高频关键词\n\n${barChart}\n`;
  }

  const asciiChart = generateAsciiBarChart(articles);
  if (asciiChart) {
    report += `<details>\n<summary>📈 纯文本关键词图（终端友好）</summary>\n\n${asciiChart}\n</details>\n\n`;
  }

  const tagCloud = generateTagCloud(articles);
  if (tagCloud) {
    report += `### 🏷️ 话题标签\n\n${tagCloud}\n\n`;
  }

  report += `---\n\n`;

  // ── Category-Grouped Articles ──
  const categoryGroups = new Map<CategoryId, ScoredArticle[]>();
  for (const a of articles) {
    const list = categoryGroups.get(a.category) || [];
    list.push(a);
    categoryGroups.set(a.category, list);
  }

  const sortedCategories = Array.from(categoryGroups.entries())
    .sort((a, b) => b[1].length - a[1].length);

  let globalIndex = 0;
  for (const [catId, catArticles] of sortedCategories) {
    const catMeta = CATEGORY_META[catId];
    report += `## ${catMeta.emoji} ${catMeta.label}\n\n`;

    for (const a of catArticles) {
      globalIndex++;
      const scoreTotal = a.scoreBreakdown.relevance + a.scoreBreakdown.quality + a.scoreBreakdown.timeliness;

      report += `### ${globalIndex}. ${a.titleZh || a.title}\n\n`;
      report += `[${a.title}](${a.link}) — **${a.sourceName}** · ${humanizeTime(a.pubDate)} · ⭐ ${scoreTotal}/30\n\n`;
      report += `> ${a.summary}\n\n`;
      if (a.keywords.length > 0) {
        report += `🏷️ ${a.keywords.join(', ')}\n\n`;
      }
      report += `---\n\n`;
    }
  }

  // ── Footer ──
  report += `*生成于 ${dateStr} ${now.toISOString().split('T')[1]?.slice(0, 5) || ''} | 扫描 ${stats.successFeeds} 源 → 获取 ${stats.totalArticles} 篇 → 精选 ${articles.length} 篇*\n`;
  report += `*基于 [Hacker News Popularity Contest 2025](https://refactoringenglish.com/tools/hn-popularity/) RSS 源列表，由 [Andrej Karpathy](https://x.com/karpathy) 推荐*\n`;
  report += `*由「拥抱AI」制作，欢迎关注同名微信公众号获取更多 AI 实用技巧 💡*\n`;

  return report;
}

// ============================================================================
// CLI
// ============================================================================

function printUsage(): never {
  console.log(`AI Daily Digest - AI-powered RSS digest from 90 top tech blogs

Usage:
  bun scripts/digest.ts [options]

Options:
  --hours <n>     Time range in hours (default: 48)
  --top-n <n>     Number of top articles to include (default: 15)
  --lang <lang>   Summary language: zh or en (default: zh)
  --output <path> Output file path (default: ./digest-YYYYMMDD.md)
  --help          Show this help

Environment:
  ZHIPUAI_API_KEY  Primary API key for ZhipuAI (GLM-4)
  ZHIPUAI_MODEL     Optional model name (default: glm-4)
  DOUBAO_API_KEY   Optional fallback key for Doubao API
  DOUBAO_MODEL     Optional model name (default: Doubao-1.5-pro-32k)
  OPENAI_API_KEY   Optional fallback key for OpenAI-compatible APIs
  OPENAI_API_BASE  Optional fallback base URL (default: https://api.deepseek.com/v1)
  OPENAI_MODEL     Optional fallback model (default: deepseek-chat for DeepSeek base, else gpt-4o-mini)

Examples:
  bun scripts/digest.ts --hours 24 --top-n 10 --lang zh
  bun scripts/digest.ts --hours 72 --top-n 20 --lang en --output ./my-digest.md
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();
  
  let hours = 48;
  let topN = 15;
  let lang: 'zh' | 'en' = 'zh';
  let outputPath = '';
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--hours' && args[i + 1]) {
      hours = parseInt(args[++i]!, 10);
    } else if (arg === '--top-n' && args[i + 1]) {
      topN = parseInt(args[++i]!, 10);
    } else if (arg === '--lang' && args[i + 1]) {
      lang = args[++i] as 'zh' | 'en';
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = args[++i]!;
    }
  }
  
  const zhipuApiKey = process.env.ZHIPUAI_API_KEY;
  const doubaoApiKey = process.env.DOUBAO_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY || 'sk-placeholder'; // 默认的占位符，实际使用时需要替换
  const openaiApiBase = process.env.OPENAI_API_BASE || 'https://api.deepseek.com/v1'; // 默认使用 DeepSeek
  const openaiModel = process.env.OPENAI_MODEL || 'deepseek-chat'; // 默认使用 DeepSeek 模型

  if (!zhipuApiKey && !doubaoApiKey && !openaiApiKey) {
    console.error('[digest] Error: Missing API key. Set ZHIPUAI_API_KEY, DOUBAO_API_KEY and/or OPENAI_API_KEY.');
    process.exit(1);
  }

  const aiClient = createAIClient({
    zhipuApiKey,
    doubaoApiKey,
    openaiApiKey,
    openaiApiBase,
    openaiModel,
  });
  
  if (!outputPath) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    outputPath = `./digest-${dateStr}.md`;
  }
  
  console.log(`[digest] === AI Daily Digest ===`);
  console.log(`[digest] Time range: ${hours} hours`);
  console.log(`[digest] Top N: ${topN}`);
  console.log(`[digest] Language: ${lang}`);
  console.log(`[digest] Output: ${outputPath}`);
  console.log(`[digest] AI provider: ${zhipuApiKey ? 'ZhipuAI (primary)' : doubaoApiKey ? 'Doubao (primary)' : 'OpenAI-compatible (primary)'}`);
  if (doubaoApiKey) {
    console.log(`[digest] Fallback: Doubao API (model=${process.env.DOUBAO_MODEL || 'Doubao-1.5-pro-32k'})`);
  }
  if (openaiApiKey) {
    const resolvedBase = (openaiApiBase?.trim() || OPENAI_DEFAULT_API_BASE).replace(/\/+$/, '');
    const resolvedModel = openaiModel?.trim() || inferOpenAIModel(resolvedBase);
    console.log(`[digest] Fallback: ${resolvedBase} (model=${resolvedModel})`);
  }
  console.log('');
  
  console.log(`[digest] Step 1/5: Fetching ${RSS_FEEDS.length} RSS feeds...`);
  const allArticles = await fetchAllFeeds(RSS_FEEDS);
  
  if (allArticles.length === 0) {
    console.error('[digest] Error: No articles fetched from any feed. Check network connection.');
    process.exit(1);
  }
  
  console.log(`[digest] Step 2/5: Filtering by time range (${hours} hours)...`);
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  const recentArticles = allArticles.filter(a => a.pubDate.getTime() > cutoffTime.getTime());
  
  console.log(`[digest] Found ${recentArticles.length} articles within last ${hours} hours`);
  
  if (recentArticles.length === 0) {
    console.error(`[digest] Error: No articles found within the last ${hours} hours.`);
    console.error(`[digest] Try increasing --hours (e.g., --hours 168 for one week)`);
    process.exit(1);
  }
  
  console.log(`[digest] Step 3/5: AI scoring ${recentArticles.length} articles...`);
  const scores = await scoreArticlesWithAI(recentArticles, aiClient);
  
  const scoredArticles = recentArticles.map((article, index) => {
    const score = scores.get(index) || { relevance: 5, quality: 5, timeliness: 5, category: 'other' as CategoryId, keywords: [] };
    return {
      ...article,
      totalScore: score.relevance + score.quality + score.timeliness,
      breakdown: score,
    };
  });
  
  scoredArticles.sort((a, b) => b.totalScore - a.totalScore);
  
  const securityArticles = scoredArticles.filter(a => a.breakdown.category === 'security');
  const otherArticles = scoredArticles.filter(a => a.breakdown.category !== 'security');
  
  const minSecurityCount = Math.ceil(topN * 0.5);
  const topArticles: typeof scoredArticles = [];
  
  const securityToAdd = Math.min(securityArticles.length, Math.max(minSecurityCount, topN));
  topArticles.push(...securityArticles.slice(0, securityToAdd));
  
  const remainingSlots = topN - topArticles.length;
  if (remainingSlots > 0) {
    topArticles.push(...otherArticles.slice(0, remainingSlots));
  }
  
  topArticles.sort((a, b) => b.totalScore - a.totalScore);
  
  const securityCount = topArticles.filter(a => a.breakdown.category === 'security').length;
  console.log(`[digest] Top ${topN} articles selected (score range: ${topArticles[topArticles.length - 1]?.totalScore || 0} - ${topArticles[0]?.totalScore || 0})`);
  console.log(`[digest] Security articles: ${securityCount}/${topN} (${Math.round(securityCount/topN*100)}%)`);
  
  console.log(`[digest] Step 4/5: Generating AI summaries...`);
  const indexedTopArticles = topArticles.map((a, i) => ({ ...a, index: i }));
  const summaries = await summarizeArticles(indexedTopArticles, aiClient, lang);
  
  const finalArticles: ScoredArticle[] = topArticles.map((a, i) => {
    const sm = summaries.get(i) || { titleZh: a.title, summary: a.description.slice(0, 200), reason: '' };
    return {
      title: a.title,
      link: a.link,
      pubDate: a.pubDate,
      description: a.description,
      sourceName: a.sourceName,
      sourceUrl: a.sourceUrl,
      score: a.totalScore,
      scoreBreakdown: {
        relevance: a.breakdown.relevance,
        quality: a.breakdown.quality,
        timeliness: a.breakdown.timeliness,
      },
      category: a.breakdown.category,
      keywords: a.breakdown.keywords,
      titleZh: sm.titleZh,
      summary: sm.summary,
      reason: sm.reason,
    };
  });
  
  console.log(`[digest] Step 5/5: Generating today's highlights...`);
  const highlights = await generateHighlights(finalArticles, aiClient, lang);
  
  const successfulSources = new Set(allArticles.map(a => a.sourceName));
  
  const report = generateDigestReport(finalArticles, highlights, {
    totalFeeds: RSS_FEEDS.length,
    successFeeds: successfulSources.size,
    totalArticles: allArticles.length,
    filteredArticles: recentArticles.length,
    hours,
    lang,
  });
  
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report);
  
  console.log('');
  console.log(`[digest] ✅ Done!`);
  console.log(`[digest] 📁 Report: ${outputPath}`);
  console.log(`[digest] 📊 Stats: ${successfulSources.size} sources → ${allArticles.length} articles → ${recentArticles.length} recent → ${finalArticles.length} selected`);
  
  if (finalArticles.length > 0) {
    console.log('');
    console.log(`[digest] 🏆 Top 3 Preview:`);
    for (let i = 0; i < Math.min(3, finalArticles.length); i++) {
      const a = finalArticles[i];
      console.log(`  ${i + 1}. ${a.titleZh || a.title}`);
      console.log(`     ${a.summary.slice(0, 80)}...`);
    }
  }
}

await main().catch((err) => {
  console.error(`[digest] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
