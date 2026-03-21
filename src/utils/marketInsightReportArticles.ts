/**
 * 从市场洞察报告正文（含导入的 Word/HTML/Markdown 混排）中识别可深读的外链，
 * 与任务自动生成报告中的 `[标题](url)` 行为对齐。
 */
export interface ReportArticleLink {
  title: string;
  url: string;
}

function normalizeUrl(raw: string): string {
  return raw.trim().replace(/[.,;:!?）)}\]]+$/u, '');
}

/** 用于去重：忽略末尾 /、统一 hostname 小写，减少同一链接被算两次 */
function normalizeUrlForDedup(raw: string): string {
  const u = normalizeUrl(raw);
  try {
    const p = new URL(u);
    p.hostname = p.hostname.toLowerCase();
    if (p.pathname.length > 1 && p.pathname.endsWith('/')) {
      p.pathname = p.pathname.slice(0, -1);
    }
    return p.toString();
  } catch {
    return u;
  }
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/** 从 URL 前几段生成简短占位标题 */
function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    return host || '原文链接';
  } catch {
    return '原文链接';
  }
}

/**
 * 报告里「字段名：」式元数据行（注意不要用「合规驱动」「AI驱动」等会匹配到小标题开头的过宽前缀）
 */
const METADATA_FIELD_LINE =
  /^(生效时间|截止时间|发布时间|核心内容|核心要求|影响|要求|发布部门|目标|原则|挑战|宏观政策|监管|防御端|攻击端|来源链接|原文链接|出处链接|主要竞争对手|报告涵盖|对每项|推出|提供免费|市场份额|IDC|合规需求|必须提供|数据合规治理)[：:]/;

function looksLikeFieldValueLine(line: string): boolean {
  const t = line.trim();
  const m = t.match(/^([^：:\n]{1,80})[：:]([\s\S]+)$/);
  if (m && m[2].trim().length >= 28) return true;
  return false;
}

function looksLikeMetadataLine(line: string): boolean {
  const t = line.trim();
  if (METADATA_FIELD_LINE.test(t)) return true;
  if (/^必须提供/.test(t)) return true;
  if (t.length > 90 && !/《/.test(t) && /[：:].{12,}/.test(t)) return true;
  return false;
}

/** 不像标题、更像正文长句（多逗号、无书名号） */
function looksLikeBodySentence(line: string): boolean {
  const t = line.trim();
  if (/《/.test(t)) return false;
  if (t.length < 42) return false;
  const commaLike = (t.match(/[，,；;]/g) || []).length;
  return commaLike >= 2;
}

/** 去掉行首缩进与 Markdown 列表标记（`- ` / `* ` / `• ` / `1. `），便于识别「来源链接：」 */
function stripLeadingListMarkers(line: string): string {
  return line
    .replace(/^\s+/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .trim();
}

/** 行内 URL 前的片段仅为「来源链接：」等标签、无实际标题（支持 `- 来源链接：`） */
function isLinkLabelOnlyBeforeUrl(before: string): boolean {
  const t = stripLeadingListMarkers(before);
  return /^(来源链接|原文链接|出处链接|来源|原文|链接|出处|Link|URL)[:：]?\s*$/i.test(t);
}

function stripLeadingLinkPrefix(line: string): string {
  let s = stripLeadingListMarkers(line);
  s = s.replace(/^\s*(来源链接|原文链接|出处链接|来源|原文|链接|出处|Link|URL)[:：]\s*/i, '').trim();
  return s;
}

function isSectionHeaderLine(line: string): boolean {
  const t = line.trim().replace(/^#+\s*/, '');
  return /^[一二三四五六七八九十]+、/.test(t) || /^第[一二三四五六七八九十]+[章节篇]/.test(t);
}

function cleanTitleCandidate(line: string): string {
  return line
    .replace(/^\d+[\.、]\s*/, '')
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^[*\-•]\s*/, '')
    .replace(/^(来源链接|原文链接|出处链接|来源|原文|链接|出处|Link|URL)[:：]?\s*$/i, '')
    .trim();
}

function scoreTitleCandidate(title: string): number {
  let score = 0;
  if (/《[^》]+》/.test(title)) score += 5;
  if (/（[^）]+）|\([^)]+\)/.test(title)) score += 2;
  if (!/[：:]/.test(title)) score += 2;
  if (title.length >= 6 && title.length <= 30) score += 3;
  else if (title.length <= 45) score += 1;
  if (/^(新)?《/.test(title)) score += 2;
  if (/[。！？]$/.test(title)) score -= 2;
  if ((title.match(/[，,；;]/g) || []).length >= 2) score -= 2;
  return score;
}

function guessTitleBeforeUrl(lines: string[], urlLineIndex: number): string {
  const startBoundary = Math.max(0, urlLineIndex - 30);
  let blockStart = startBoundary;
  for (let j = urlLineIndex - 1; j >= startBoundary; j--) {
    if (/https?:\/\//i.test(lines[j])) {
      blockStart = j + 1;
      break;
    }
  }

  let best: { title: string; score: number; index: number } | null = null;
  for (let i = blockStart; i < urlLineIndex; i++) {
    const raw = lines[i].trim();
    if (!raw || isHttpUrl(raw)) continue;
    if (isSectionHeaderLine(raw)) continue;
    if (/^["“].*["”]$/.test(raw)) continue;
    if (raw.length > 200) continue;
    if (looksLikeMetadataLine(raw)) continue;
    if (looksLikeFieldValueLine(raw)) continue;
    if (looksLikeBodySentence(raw)) continue;
    if (raw.length > 120 && !/《/.test(raw)) continue;

    const cleaned = cleanTitleCandidate(raw);
    if (cleaned.length < 2) continue;
    const score = scoreTitleCandidate(cleaned);
    if (!best || score > best.score || (score === best.score && i < best.index)) {
      best = { title: cleaned, score, index: i };
    }
  }

  return best ? best.title.slice(0, 200) : '';
}

/**
 * 提取正文中的文章级外链（Markdown 链接、<a href>、裸 http(s) URL），按规范化 URL 去重；
 * 同一报告内若多链共用同一推断标题，为后续条目追加域名以区分展示。
 */
export function extractReportArticleLinks(content: string): ReportArticleLink[] {
  const text = content || '';
  const seen = new Set<string>();
  /** 展示标题去重：同标题不同 URL 时给后者加「 · 域名」 */
  const titleUseCount = new Map<string, number>();
  const out: ReportArticleLink[] = [];

  const disambiguateTitle = (rawTitle: string, canonicalUrl: string): string => {
    let t = (rawTitle || '').trim();
    if (!t || t === canonicalUrl) t = titleFromUrl(canonicalUrl);
    const key = t.toLowerCase();
    const n = titleUseCount.get(key) ?? 0;
    titleUseCount.set(key, n + 1);
    if (n > 0) {
      const host = titleFromUrl(canonicalUrl);
      t = `${t} · ${host}`;
    }
    return t.slice(0, 200);
  };

  const push = (title: string, url: string) => {
    const u = normalizeUrl(url);
    if (!isHttpUrl(u)) return;
    const dedupKey = normalizeUrlForDedup(u);
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    const displayTitle = disambiguateTitle(title, u);
    out.push({ title: displayTitle, url: u });
  };

  // 1) Markdown [text](url)
  const mdRe = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;
  for (const m of text.matchAll(mdRe)) {
    push(m[1] || titleFromUrl(m[2]), m[2]);
  }

  // 2) HTML <a href="url">text</a>（常见于 docx 转 HTML）
  const htmlRe = /<a[^>]*\bhref=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = htmlRe.exec(text)) !== null) {
    const inner = hm[2].replace(/<[^>]+>/g, '').trim();
    push(inner || titleFromUrl(hm[1]), hm[1]);
  }

  // 3) 行内裸 URL（跳过已在 markdown/html 中出现过的）
  const lines = text.split(/\r?\n/);
  let lastResolvedTitle = '';
  // 排除空白、引号、常见中文/全角标点后缀，避免吞掉整段 HTML
  const plainUrlRe = /https?:\/\/[^\s<>"'）\]\u3002\uFF0C\uFF1B\u3001]+/gi;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let pm: RegExpExecArray | null;
    let segmentStart = 0;
    plainUrlRe.lastIndex = 0;
    while ((pm = plainUrlRe.exec(line)) !== null) {
      const url = normalizeUrl(pm[0]);
      const idx = pm.index ?? 0;
      const urlEnd = idx + pm[0].length;
      if (!isHttpUrl(url) || seen.has(normalizeUrlForDedup(url))) {
        segmentStart = urlEnd;
        continue;
      }
      /** 当前 URL 之前整行前缀（用于判断「同行前一链接」） */
      const beforeCurrentUrl = line.slice(0, idx);
      /** 与上一同行 URL 之间的片段，避免把前一链接文本误当作标题 */
      const beforeRaw = line.slice(segmentStart, idx);
      segmentStart = urlEnd;

      const lineHasEarlierHttp = /https?:\/\//i.test(beforeCurrentUrl);
      const beforeTrim = beforeRaw.trim();
      let title = '';
      if (lineHasEarlierHttp) {
        title = lastResolvedTitle || guessTitleBeforeUrl(lines, i);
      } else if (isLinkLabelOnlyBeforeUrl(beforeRaw) || stripLeadingListMarkers(beforeRaw).length < 1) {
        title = guessTitleBeforeUrl(lines, i);
      } else {
        title = stripLeadingLinkPrefix(beforeRaw);
        if (!title || isLinkLabelOnlyBeforeUrl(title)) {
          title = guessTitleBeforeUrl(lines, i);
        }
      }
      if (!title && (isLinkLabelOnlyBeforeUrl(beforeRaw) || isLinkLabelOnlyBeforeUrl(beforeTrim))) {
        title = lastResolvedTitle;
      }
      push(title || titleFromUrl(url), url);
      if (title) lastResolvedTitle = title;
    }
  }

  return out.slice(0, 80);
}

/** 供导入落库：最小 stats，与 generateReportContent 中 totalArticles 字段一致 */
export function buildStatsForImportedReport(content: string, base?: Record<string, unknown>): Record<string, unknown> {
  const links = extractReportArticleLinks(content);
  const merged: Record<string, unknown> = { ...(base && typeof base === 'object' ? base : {}) };
  merged.totalArticles = links.length;
  if (links.length > 0) {
    merged.categories = [{ name: '正文外链', count: links.length }];
  }
  merged.importParsedAt = new Date().toISOString();
  return merged;
}
