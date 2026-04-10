import { llmConfigManager } from '../../src/services/llmConfigManager.js';
import { createAIAbortController, formatTimeoutError } from '../utils/aiTimeout.js';
import AdmZip from 'adm-zip';
import { unzipSync, strFromU8 } from 'fflate';

/** OLE 复合文档（旧版 Word .doc），mammoth 仅支持基于 ZIP 的 .docx */
function isOleWordBinary(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
}

/** .docx 为 ZIP 包（PK…），扩展名写错时仍可按内容解析 */
function looksLikeDocxZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function normalizeZipPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\//, '');
}

function xmlBytesToString(bytes: Buffer | Uint8Array): string {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf8').replace(/^\uFEFF/, '');
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le');
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return buf.swap16().toString('utf16le');
  }
  return buf.toString('utf8');
}

/** OOXML word/document.xml 中 w:t 纯文本（mammoth/JSZip 失败时的备用方案） */
function decodeXmlEntitiesForWord(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return '';
      }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        return String.fromCodePoint(parseInt(d, 10));
      } catch {
        return '';
      }
    })
    .replace(/&amp;/g, '&');
}

function extractTextFromWordDocumentXml(xml: string): string {
  let s = xml;
  s = s.replace(/<w:tab[^/]*\/>/gi, '\t');
  s = s.replace(/<w:br[^/]*\/>/gi, '\n');
  const parts: string[] = [];
  const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    parts.push(decodeXmlEntitiesForWord(m[1]));
  }
  return parts.join('').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

/** 部分 OOXML 使用任意前缀（如 w:p14），仍对应 wordprocessingml 的 t 节点 */
function extractTextFromWordDocumentXmlAnyPrefix(xml: string): string {
  const parts: string[] = [];
  const re = /<([a-z0-9]+):t\b[^>]*>([\s\S]*?)<\/\1:t>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    parts.push(decodeXmlEntitiesForWord(m[2]));
  }
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

function extractTextFromWordDocumentXmlLoose(xml: string): string {
  const s = xml.replace(/<w:tab[^/]*\/>/gi, '\t').replace(/<w:br[^/]*\/>/gi, '\n');
  const stripped = s.replace(/<[^>]+>/g, ' ');
  return decodeXmlEntitiesForWord(stripped).replace(/\s+/g, ' ').trim();
}

function extractDocxPlainTextFromDocumentXml(xml: string): string {
  const cleaned = xml.replace(/^\uFEFF/, '');
  const a = extractTextFromWordDocumentXml(cleaned);
  if (a.trim()) return a;
  const b = extractTextFromWordDocumentXmlAnyPrefix(cleaned);
  if (b.trim()) return b;
  return extractTextFromWordDocumentXmlLoose(cleaned);
}

function isWordMainDocumentPath(zipPath: string): boolean {
  const p = normalizeZipPath(zipPath).toLowerCase();
  return p === 'word/document.xml' || p.endsWith('/word/document.xml');
}

function findWordDocumentXmlKeyInUnzipped(out: Record<string, Uint8Array>): string | null {
  for (const k of Object.keys(out)) {
    if (isWordMainDocumentPath(k)) return k;
  }
  return null;
}

/** unzipper 支持 Zip64 / 与 JSZip 不同的目录解析，优先于 fflate / adm-zip */
async function tryExtractDocxTextWithUnzipper(buf: Buffer): Promise<string | null> {
  try {
    const { Open } = await import('unzipper');
    const directory = await Open.buffer(buf);
    const target = directory.files.find((f: { path: string }) => isWordMainDocumentPath(f.path));
    if (!target) return null;
    const content = await target.buffer();
    const xml = xmlBytesToString(Buffer.from(content));
    const text = extractDocxPlainTextFromDocumentXml(xml);
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

/**
 * 少数 docx 在内存 buffer 上解析失败，但落盘后用 Open.file（随机读）可成功。
 */
async function tryExtractDocxTextWithUnzipperFromDisk(buf: Buffer): Promise<string | null> {
  const fs = await import('fs/promises');
  const os = await import('os');
  const path = await import('path');
  const { randomUUID } = await import('crypto');
  const tmp = path.join(os.tmpdir(), `docx-extract-${randomUUID()}.docx`);
  try {
    await fs.writeFile(tmp, buf);
    const { Open } = await import('unzipper');
    const directory = await Open.file(tmp);
    const target = directory.files.find((f: { path: string }) => isWordMainDocumentPath(f.path));
    if (!target) return null;
    const content = await target.buffer();
    const xml = xmlBytesToString(Buffer.from(content));
    const text = extractDocxPlainTextFromDocumentXml(xml);
    return text.trim() ? text : null;
  } catch {
    return null;
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

function tryExtractDocxTextWithFflate(buf: Buffer): string | null {
  try {
    const out = unzipSync(new Uint8Array(buf));
    const key = findWordDocumentXmlKeyInUnzipped(out);
    if (!key) return null;
    const xml = strFromU8(out[key]);
    const text = extractDocxPlainTextFromDocumentXml(xml);
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

function tryExtractDocxTextWithAdmZip(buf: Buffer): string | null {
  try {
    const zip = new AdmZip(buf);
    let entry = zip.getEntry('word/document.xml');
    if (!entry) {
      for (const e of zip.getEntries()) {
        if (isWordMainDocumentPath(e.entryName)) {
          entry = e;
          break;
        }
      }
    }
    if (!entry) return null;
    const xml = xmlBytesToString(entry.getData());
    const text = extractDocxPlainTextFromDocumentXml(xml);
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

/**
 * 先解压取 word/document.xml，再 mammoth。
 * mammoth 内置 JSZip 对部分「Word 可打开」的 docx 会报 Corrupted zip / missing bytes，故不能优先走 mammoth。
 */
async function extractDocxTextWithZipFallbacks(buf: Buffer): Promise<string | null> {
  const u = await tryExtractDocxTextWithUnzipper(buf);
  if (u) return u;
  const ud = await tryExtractDocxTextWithUnzipperFromDisk(buf);
  if (ud) return ud;
  const f = tryExtractDocxTextWithFflate(buf);
  if (f) return f;
  return tryExtractDocxTextWithAdmZip(buf);
}

const REQUIREMENT_GENERATION_PROMPT = `你是一个专业的需求分析师。请根据用户提供的文本内容，生成结构化的需求文档。

输出要求：
1. 使用 Markdown 格式
2. 包含以下结构：
   - # 需求文档标题
   - ## 概述（简要描述需求背景和目标）
   - ## 功能需求（每个需求包含标题、描述、验收标准）
   - ## 非功能需求（如有）
   - ## 约束与假设（如有）
3. 每个功能需求使用 ### 标题，包含：
   - **需求描述**：具体说明
   - **验收标准**：可测试的验证条件列表
   - **优先级**：高/中/低
4. 语言清晰、专业，避免模糊描述
5. 验收标准要具体、可测试

直接输出 Markdown 格式的需求文档，不要输出其他内容。`;

const REQUIREMENT_USER_MESSAGE_PREFIX = '请根据以下内容生成结构化需求文档：\n\n';
const REQUIREMENT_CHUNK_PROMPT_PREFIX =
  '请基于当前分片内容提取结构化需求要点（仅依据本分片，不补充材料外信息）。要求尽量完整覆盖页面/模块/字段/按钮/规则，避免过度摘要：\n\n';
const REQUIREMENT_MERGE_PROMPT_PREFIX =
  '以下是同一份材料的分片需求草稿，请去重、合并冲突、统一编号并输出最终完整需求文档（仅依据这些草稿，不得编造）。\n' +
  '重要：不要为了简洁而省略任何分片中的有效需求点；若内容较长，优先保证覆盖完整性，再保证表达简洁。\n\n';

/** OpenRouter 等：128k 上下文下 max_tokens=8000 时常见 max input tokens≈120000，留余量避免 400 */
function estimateTokensApprox(s: string): number {
  if (!s) return 0;
  return Math.ceil(s.length / 2);
}

function truncateUserTextForRequirementModel(
  text: string,
  systemPrompt: string,
  userPrefix: string,
  maxInputTokens: number
): { text: string; truncated: boolean } {
  const sysT = estimateTokensApprox(systemPrompt);
  const margin = 500;
  const maxTotal = maxInputTokens - margin;
  const full = userPrefix + text;
  if (sysT + estimateTokensApprox(full) <= maxTotal) {
    return { text, truncated: false };
  }
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const chunk = userPrefix + text.slice(0, mid);
    if (sysT + estimateTokensApprox(chunk) <= maxTotal) lo = mid;
    else hi = mid - 1;
  }
  const cut = lo;
  const suffix =
    '\n\n---\n\n[以上内容因模型单次输入长度限制已截断，请减少导入文件或分批生成。]';
  return { text: text.slice(0, cut) + suffix, truncated: true };
}

function parseJsonRecordEnv(envValue: string | undefined): Record<string, unknown> | null {
  const raw = (envValue || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as any;
    return null;
  } catch {
    return null;
  }
}

function normalizeModelKeyForLookup(model: string): string {
  return String(model || '').trim().toLowerCase();
}

/**
 * 估算不同模型的上下文长度（token）。
 * - 优先使用 REQUIREMENT_DOC_MODEL_CONTEXT_WINDOWS_JSON 显式映射（key 为模型名，value 为整数 token）。
 * - 其次做少量启发式匹配。
 * - 最后兜底 128k。
 *
 * 注意：OpenRouter / 各家 API 并不总能可靠返回 context_length，因此这里采用“可配置 + 兜底”的策略。
 */
function estimateContextWindowTokensByModel(model: string | undefined, mappingOverride?: Record<string, unknown> | null): number {
  const key = normalizeModelKeyForLookup(model || '');

  // 1) 用户显式映射：{"openai/gpt-4o":128000, "qwen3.5-122b-a10b":131072, "...":200000}
  const mapping =
    mappingOverride ||
    parseJsonRecordEnv(process.env.REQUIREMENT_DOC_MODEL_CONTEXT_WINDOWS_JSON);
  if (mapping) {
    const direct = (mapping as any)[key];
    if (Number.isFinite(direct) && direct > 8000) return Math.floor(direct);
    // 允许用短 key（如 gpt-4o / claude-sonnet-4.5）匹配
    for (const [k, v] of Object.entries(mapping)) {
      const kk = normalizeModelKeyForLookup(k);
      if (!kk) continue;
      if (key === kk || key.endsWith(`/${kk}`) || key.includes(kk)) {
        if (Number.isFinite(v as any) && (v as any) > 8000) return Math.floor(v as any);
      }
    }
  }

  // 2) 常见模式：名字里包含 128k / 200k / 1m 等
  const m = key.match(/(\d+(?:\.\d+)?)\s*(k|m)\b/);
  if (m) {
    const n = parseFloat(m[1]);
    const unit = m[2];
    if (Number.isFinite(n) && n > 0) {
      const tokens = unit === 'm' ? Math.round(n * 1_000_000) : Math.round(n * 1_000);
      if (tokens > 8000) return tokens;
    }
  }

  // 3) 少量模型族兜底（避免“完全写死”，但给到合理默认）
  if (key.includes('claude') && (key.includes('opus') || key.includes('sonnet'))) return 200_000;
  if (key.includes('gemini') && (key.includes('1.5') || key.includes('2.5') || key.includes('3'))) return 1_000_000;
  if (key.includes('kimi') || key.includes('moonshot')) return 128_000;
  if (key.includes('qwen')) return 128_000;
  if (key.includes('deepseek')) return 128_000;
  if (key.includes('gpt-4o') || key.includes('gpt-4.1') || key.includes('gpt-5')) return 128_000;

  // 默认：128k（够大且常见）
  return 128_000;
}

/**
 * 计算需求文档场景「最大输入 tokens」（近似，用于提前截断避免 400）。
 *
 * 优先级：
 * - REQUIREMENT_DOC_MAX_INPUT_TOKENS：完全手动覆盖（保持兼容历史）
 * - 否则：用模型 context window - max_tokens（输出预留） - safety margin
 */
function computeRequirementDocMaxInputTokens(params: {
  model: string | undefined;
  maxTokens: number;
  maxInputTokensOverride?: number;
  modelContextWindowsJson?: string;
  inputSafetyMarginTokens?: number;
}): number {
  const override = params.maxInputTokensOverride;
  if (Number.isFinite(override) && (override as number) > 8000) return Math.floor(override as number);

  const envRaw = parseInt(process.env.REQUIREMENT_DOC_MAX_INPUT_TOKENS || '', 10);
  if (Number.isFinite(envRaw) && envRaw > 8000) return envRaw;

  const mappingOverride = parseJsonRecordEnv(params.modelContextWindowsJson);
  const contextWindow = estimateContextWindowTokensByModel(params.model, mappingOverride);
  // 给输出预留 maxTokens，再留出少量空间给 provider 的额外包装 / 计费偏差 / metadata 等。
  const safetyMarginFromSettings = params.inputSafetyMarginTokens;
  const safetyMargin =
    Number.isFinite(safetyMarginFromSettings) && (safetyMarginFromSettings as number) >= 200
      ? Math.floor(safetyMarginFromSettings as number)
      : parseInt(process.env.REQUIREMENT_DOC_INPUT_SAFETY_MARGIN_TOKENS || '1500', 10);
  const margin = Number.isFinite(safetyMargin) && safetyMargin >= 200 ? safetyMargin : 1500;

  const maxInput = Math.floor(contextWindow - Math.max(0, params.maxTokens) - margin);
  return Math.max(8000, maxInput);
}

function getResolvedInputLimits(config: ReturnType<typeof llmConfigManager.getCurrentConfig>) {
  return config.inputLimits ?? config.requirementDoc;
}

function computeFittableCharsByApprox(text: string, baseTokens: number, maxTotalTokens: number): number {
  if (!text) return 0;
  if (baseTokens + estimateTokensApprox(text) <= maxTotalTokens) return text.length;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (baseTokens + estimateTokensApprox(text.slice(0, mid)) <= maxTotalTokens) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}

function splitTextForRequirementChunks(params: {
  text: string;
  systemPrompt: string;
  userPrefix: string;
  maxInputTokens: number;
}): string[] {
  const { text, systemPrompt, userPrefix, maxInputTokens } = params;
  const margin = 500;
  const maxTotal = Math.max(2000, maxInputTokens - margin);
  const baseTokens = estimateTokensApprox(systemPrompt) + estimateTokensApprox(userPrefix);
  const maxCharsByWindow = Math.max(1, (maxTotal - baseTokens) * 2);
  // 分片过大会导致“单片过度压缩”，降低覆盖率；默认目标约 7~10 万字符/片。
  const preferredCharsFromEnv = parseInt(process.env.REQUIREMENT_DOC_CHUNK_PREFERRED_MAX_CHARS || '90000', 10);
  const preferredChars =
    Number.isFinite(preferredCharsFromEnv) && preferredCharsFromEnv >= 20000
      ? preferredCharsFromEnv
      : 90000;
  const maxChars = Math.max(20000, Math.min(maxCharsByWindow, preferredChars));

  const candidateBlocks = text
    .split(/\n(?=##\s+HTML：|##\s+PDF：|##\s+DOCX：|##\s+DOC：|##\s+TXT：|##\s+Markdown：|##\s+JSON：|##\s+CSV：)/g)
    .map(s => s.trim())
    .filter(Boolean);
  const blocks = candidateBlocks.length > 0 ? candidateBlocks : [text];

  const chunks: string[] = [];
  let current = '';
  for (const block of blocks) {
    if ((current.length + block.length + 2) <= maxChars) {
      current = current ? `${current}\n\n${block}` : block;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = '';
    }
    if (block.length <= maxChars) {
      current = block;
      continue;
    }
    let cursor = 0;
    while (cursor < block.length) {
      const remain = block.slice(cursor);
      const fit = computeFittableCharsByApprox(remain, baseTokens, maxTotal);
      if (fit <= 0) break;
      chunks.push(remain.slice(0, fit));
      cursor += fit;
    }
    if (cursor < block.length) {
      chunks.push(block.slice(cursor));
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.filter(Boolean);
}

function splitChunkNearMiddle(text: string): [string, string] | null {
  if (!text || text.length < 2) return null;
  const mid = Math.floor(text.length / 2);
  const window = Math.min(5000, Math.floor(text.length / 4));
  const start = Math.max(0, mid - window);
  const end = Math.min(text.length, mid + window);
  const slice = text.slice(start, end);
  const rel = slice.lastIndexOf('\n\n');
  const pivot = rel >= 0 ? start + rel + 2 : mid;
  const left = text.slice(0, pivot).trim();
  const right = text.slice(pivot).trim();
  if (!left || !right) return null;
  return [left, right];
}

function enforceMinimumChunkCount(params: {
  chunks: string[];
  minChunkCount: number;
  minChunkSizeChars: number;
}): string[] {
  const result = [...params.chunks].filter(Boolean);
  const minChunkCount = Math.max(1, Math.floor(params.minChunkCount));
  const minChunkSizeChars = Math.max(1000, Math.floor(params.minChunkSizeChars));
  if (result.length >= minChunkCount) return result;

  while (result.length < minChunkCount) {
    let longestIdx = -1;
    let longestLen = 0;
    for (let i = 0; i < result.length; i++) {
      const len = result[i].length;
      if (len > longestLen) {
        longestLen = len;
        longestIdx = i;
      }
    }
    if (longestIdx < 0) break;
    if (longestLen < minChunkSizeChars * 2) break;
    const pair = splitChunkNearMiddle(result[longestIdx]);
    if (!pair) break;
    const [left, right] = pair;
    if (left.length < minChunkSizeChars || right.length < minChunkSizeChars) break;
    result.splice(longestIdx, 1, left, right);
  }

  return result;
}

function splitDraftsForMergeBatches(params: {
  drafts: string[];
  systemPrompt: string;
  mergePrefix: string;
  maxInputTokens: number;
}): string[][] {
  const { drafts, systemPrompt, mergePrefix, maxInputTokens } = params;
  const margin = 500;
  const maxTotal = Math.max(2000, maxInputTokens - margin);
  const baseTokens = estimateTokensApprox(systemPrompt) + estimateTokensApprox(mergePrefix);
  const batches: string[][] = [];
  let current: string[] = [];
  let currentTokens = baseTokens;

  for (let i = 0; i < drafts.length; i++) {
    const wrapped = `### 分片草稿 ${i + 1}\n\n${drafts[i]}`;
    const wrappedTokens = estimateTokensApprox(wrapped) + 8;

    if (current.length > 0 && currentTokens + wrappedTokens > maxTotal) {
      batches.push(current);
      current = [wrapped];
      currentTokens = baseTokens + wrappedTokens;
      continue;
    }

    if (current.length === 0 && currentTokens + wrappedTokens > maxTotal) {
      const hardLimitChars = Math.max(800, (maxTotal - baseTokens - 200) * 2);
      current.push(wrapped.slice(0, hardLimitChars));
      batches.push(current);
      current = [];
      currentTokens = baseTokens;
      continue;
    }

    current.push(wrapped);
    currentTokens += wrappedTokens;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

function sanitizeRequirementInputText(text: string): string {
  const lines = text.split('\n');
  const sanitized: string[] = [];
  let skipVendorBlock = false;
  let vendorBlockEmptyLines = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const noisyVendorLike =
      lower.includes('postcss') ||
      lower.includes('autoprefixer') ||
      lower.includes('tailwindcss') ||
      lower.includes('sourceMappingURL'.toLowerCase()) ||
      line.length > 3000;
    const veryDenseCode =
      line.length > 800 &&
      ((line.match(/[{}()[\];,]/g)?.length || 0) > 80) &&
      !line.includes(' ') &&
      !line.includes('\t');

    if (!skipVendorBlock && (noisyVendorLike || veryDenseCode)) {
      skipVendorBlock = true;
      vendorBlockEmptyLines = 0;
      sanitized.push('[已自动过滤疑似第三方构建产物/压缩代码片段，避免干扰需求提取]');
      continue;
    }

    if (skipVendorBlock) {
      if (!line.trim()) {
        vendorBlockEmptyLines += 1;
        if (vendorBlockEmptyLines >= 2) {
          skipVendorBlock = false;
        }
      } else {
        vendorBlockEmptyLines = 0;
      }
      continue;
    }

    sanitized.push(line);
  }

  return sanitized.join('\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

/** 深读/市场洞察转需求等场景：是否打印完整 system/user 提示词与响应摘要。默认开启，设 REQUIREMENT_DOC_LLM_LOG_PROMPTS=0 关闭 */
function requirementDocSceneLogEnabled(): boolean {
  const v = process.env.REQUIREMENT_DOC_LLM_LOG_PROMPTS?.trim().toLowerCase();
  if (v === '0' || v === 'false') return false;
  return true;
}

function requirementDocLogMaxChars(): number {
  const n = parseInt(process.env.MARKET_INSIGHT_LOG_PROMPT_MAX_CHARS || '12000', 10);
  return Number.isFinite(n) && n >= 200 ? n : 12000;
}

function clipRequirementLog(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

function hasRequirementSectionTitle(content: string, title: string): boolean {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plain = new RegExp(`^##\\s*${escaped}\\s*$`, 'm');
  if (plain.test(content)) return true;
  const numbered = new RegExp(`^##\\s*\\d+[\\.、]?\\s*${escaped}\\s*$`, 'm');
  return numbered.test(content);
}

function logRequirementDocLLM(
  scene: string,
  model: string | undefined,
  messages: Array<{ role: string; content: string }>
): void {
  if (!requirementDocSceneLogEnabled()) return;
  const maxChars = requirementDocLogMaxChars();
  console.log(
    `[RequirementDoc][LLM Prompt][${scene}] model=${model ?? '(default)'} messages=${messages.length}`
  );
  for (const m of messages) {
    const role = m.role || 'unknown';
    const body = clipRequirementLog(String(m.content ?? ''), maxChars);
    console.log(`[RequirementDoc][LLM Prompt][${scene}] ---------- ${role} ----------`);
    console.log(body);
  }
}

export class AnalysisService {
  private async callRequirementModelOnce(params: {
    apiEndpoint: string;
    apiKey: string;
    selectedModel: string;
    maxTokens: number;
    timeoutConfig: ReturnType<typeof llmConfigManager.getCurrentConfig>['timeout'];
    systemPrompt: string;
    userMessage: string;
    logScene?: string;
  }): Promise<{ content: string; finishReason?: string }> {
    const { controller, timeout, timeoutMs } = createAIAbortController('long', params.timeoutConfig);
    const startedAt = Date.now();
    try {
      const response = await fetch(params.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${params.apiKey}`,
          'HTTP-Referer': 'https://sakura-ai.com',
          'X-Title': 'Sakura AI Testing Platform'
        },
        body: JSON.stringify({
          model: params.selectedModel,
          messages: [
            { role: 'system', content: params.systemPrompt },
            { role: 'user', content: params.userMessage }
          ],
          temperature: 0.3,
          max_tokens: params.maxTokens
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = (errorData as any).error?.message || response.statusText;
        if (params.logScene && requirementDocSceneLogEnabled()) {
          console.error(
            `[RequirementDoc][LLM][${params.logScene}] HTTP ${response.status} error=${errMsg} body=${JSON.stringify(errorData).slice(0, 2000)}`
          );
        }
        throw new Error(`AI 服务调用失败: ${errMsg}`);
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content;
      const finishReason = data.choices?.[0]?.finish_reason;
      if (!content) {
        if (params.logScene && requirementDocSceneLogEnabled()) {
          console.error(`[RequirementDoc][LLM][${params.logScene}] empty choices; raw=${JSON.stringify(data).slice(0, 2500)}`);
        }
        throw new Error('AI 返回了空内容');
      }

      if (params.logScene && requirementDocSceneLogEnabled()) {
        const durationMs = Date.now() - startedAt;
        const usage = data.usage;
        const preview = clipRequirementLog(String(content), Math.min(4000, requirementDocLogMaxChars()));
        console.log(
          `[RequirementDoc][LLM][${params.logScene}] ok durationMs=${durationMs} responseChars=${content.length} model=${params.selectedModel} finish_reason=${finishReason ?? 'unknown'}`
        );
        if (usage) console.log(`[RequirementDoc][LLM][${params.logScene}] usage=${JSON.stringify(usage)}`);
        console.log(`[RequirementDoc][LLM][${params.logScene}] ---------- assistant (preview) ----------`);
        console.log(preview);
      }
      return { content: String(content), finishReason: finishReason ? String(finishReason) : undefined };
    } catch (error: any) {
      if (params.logScene && requirementDocSceneLogEnabled()) {
        console.error(`[RequirementDoc][LLM][${params.logScene}] failed:`, error?.message || error);
      }
      if (error.name === 'AbortError') {
        throw new Error(formatTimeoutError(timeoutMs));
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async continueRequirementOutputIfNeeded(params: {
    apiEndpoint: string;
    apiKey: string;
    selectedModel: string;
    maxTokens: number;
    timeoutConfig: ReturnType<typeof llmConfigManager.getCurrentConfig>['timeout'];
    systemPrompt: string;
    initialContent: string;
    initialFinishReason?: string;
    logScene?: string;
  }): Promise<string> {
    let content = params.initialContent;
    let finishReason = params.initialFinishReason;
    let rounds = 0;
    const maxRounds = 3;

    while (finishReason === 'length' && rounds < maxRounds) {
      rounds += 1;
      const tail = content.slice(-2200);
      const continueScene = params.logScene ? `${params.logScene}:continue-${rounds}` : undefined;
      const mustKeepStructureTip =
        params.logScene?.includes(':merge') || params.logScene?.includes(':single')
          ? '\n\n重要：请保持同一份需求文档的章节连续性；若尚未输出“8. 交付计划与优先级”和“9. 测试范围与回归建议”，必须继续补全。'
          : '';
      const continuePrompt =
        '你上一条输出因长度上限被截断。请仅继续输出剩余内容，从末尾自然续写，不要重复已有内容。\n\n' +
        `已输出末尾参考：\n${tail}` +
        mustKeepStructureTip;

      const next = await this.callRequirementModelOnce({
        apiEndpoint: params.apiEndpoint,
        apiKey: params.apiKey,
        selectedModel: params.selectedModel,
        maxTokens: params.maxTokens,
        timeoutConfig: params.timeoutConfig,
        systemPrompt: params.systemPrompt,
        userMessage: continuePrompt,
        logScene: continueScene,
      });
      content += `\n${next.content}`;
      finishReason = next.finishReason;
    }

    return content;
  }

  private async appendMissingTailSectionsIfNeeded(params: {
    apiEndpoint: string;
    apiKey: string;
    selectedModel: string;
    maxTokens: number;
    timeoutConfig: ReturnType<typeof llmConfigManager.getCurrentConfig>['timeout'];
    systemPrompt: string;
    mergedContent: string;
    sourceDrafts: string[];
    logScene?: string;
  }): Promise<string> {
    const needDeliveryPlan = !hasRequirementSectionTitle(params.mergedContent, '交付计划与优先级');
    const needTestPlan = !hasRequirementSectionTitle(params.mergedContent, '测试范围与回归建议');
    if (!needDeliveryPlan && !needTestPlan) return params.mergedContent;

    const missingTitles: string[] = [];
    if (needDeliveryPlan) missingTitles.push('8. 交付计划与优先级');
    if (needTestPlan) missingTitles.push('9. 测试范围与回归建议');

    const scene = params.logScene ? `${params.logScene}:tail-sections` : undefined;
    const sourceDigest = params.sourceDrafts.map((d, i) => `### 分片草稿 ${i + 1}\n\n${d}`).join('\n\n---\n\n');
    const prompt =
      `当前需求文档缺少以下章节：${missingTitles.join('、')}。\n` +
      '请仅基于“当前已合并文档”和“分片草稿”补齐缺失章节，禁止改写已存在章节，禁止新增其他章节。\n' +
      '输出要求：只输出需要补充的章节正文（从对应 ## 标题开始），不要重复前文。\n\n' +
      '【当前已合并文档】\n' +
      `${params.mergedContent}\n\n` +
      '【分片草稿】\n' +
      `${sourceDigest}`;

    if (scene) {
      logRequirementDocLLM(scene, params.selectedModel, [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: prompt },
      ]);
    }

    const first = await this.callRequirementModelOnce({
      apiEndpoint: params.apiEndpoint,
      apiKey: params.apiKey,
      selectedModel: params.selectedModel,
      maxTokens: params.maxTokens,
      timeoutConfig: params.timeoutConfig,
      systemPrompt: params.systemPrompt,
      userMessage: prompt,
      logScene: scene,
    });
    const appendix = await this.continueRequirementOutputIfNeeded({
      apiEndpoint: params.apiEndpoint,
      apiKey: params.apiKey,
      selectedModel: params.selectedModel,
      maxTokens: params.maxTokens,
      timeoutConfig: params.timeoutConfig,
      systemPrompt: params.systemPrompt,
      initialContent: first.content,
      initialFinishReason: first.finishReason,
      logScene: scene,
    });

    const finalContent = `${params.mergedContent}\n\n${appendix}`.trim();
    console.warn(`[RequirementDoc] 检测到尾部章节缺失，已自动补齐：${missingTitles.join('、')}`);
    return finalContent;
  }

  async extractTextFromFile(file: Express.Multer.File): Promise<string> {
    const ext = file.originalname.toLowerCase().split('.').pop();

    switch (ext) {
      case 'txt':
      case 'md':
      case 'markdown':
      case 'json':
      case 'csv':
        return file.buffer.toString('utf-8').replace(/^\uFEFF/, '');

      case 'html':
      case 'htm': {
        try {
          const { load } = await import('cheerio');
          const raw = file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
          const $ = load(raw);
          $('script, style, noscript').remove();
          const body = $('body');
          const text = (body.length ? body.text() : $.text()).replace(/\u00a0/g, ' ');
          return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : '未知错误';
          throw new Error(`HTML 解析失败: ${msg}`);
        }
      }

      case 'pdf':
        try {
          const pdfParse = await import('pdf-parse');
          const pdfData = await pdfParse.default(file.buffer);
          return pdfData.text;
        } catch {
          throw new Error('PDF 解析失败，请确保已安装 pdf-parse 依赖');
        }

      case 'docx':
      case 'doc': {
        const buf = file.buffer;
        if (isOleWordBinary(buf)) {
          throw new Error(
            '不支持旧版 Word 二进制格式（.doc）。请在 Word 中「另存为」选择「Word 文档 (*.docx)」后重新导入；或导出为 PDF / 纯文本。'
          );
        }
        if (ext === 'doc' && !looksLikeDocxZip(buf)) {
          throw new Error(
            '无法识别为 .docx（ZIP）内容。若为旧版 .doc 请另存为 .docx；若扩展名错误，请将文件改为 .docx 后再试。'
          );
        }

        const fromZip = await extractDocxTextWithZipFallbacks(buf);
        if (fromZip) return fromZip;

        try {
          const mammoth = await import('mammoth');
          const result = await mammoth.extractRawText({ buffer: buf });
          return (result.value ?? '').trim();
        } catch (e: unknown) {
          if (e instanceof Error) {
            if (e.message.startsWith('不支持旧版') || e.message.startsWith('无法识别')) throw e;
          }
          const detail = e instanceof Error ? e.message : String(e);
          throw new Error(
            `无法从该文档中读取正文（${detail}）。可尝试：在 Word 中另存为新的 .docx；或导出 PDF；或将全文粘贴到 TXT 后导入。`
          );
        }
      }

      default:
        throw new Error(
          `不支持的文件格式: .${ext ?? '（无扩展名）'}，支持 Markdown、TXT、HTML、PDF、Word（.docx）、JSON、CSV`
        );
    }
  }

  async generateRequirementDoc(
    text: string,
    model?: string,
    options?: {
      systemPrompt?: string;
      /** 设置后打印完整提示词与响应摘要（见 REQUIREMENT_DOC_LLM_LOG_PROMPTS） */
      logScene?: string;
      onProgress?: (event: { phase: string; current?: number; total?: number; message?: string }) => void;
    }
  ): Promise<{ content: string; inputTruncated: boolean }> {
    if (!llmConfigManager.isReady()) {
      await llmConfigManager.initialize();
    }
    const config = llmConfigManager.getCurrentConfig();

    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    const baseUrl = config.baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const selectedModel = model || config.model || 'openai/gpt-4o';

    // 从系统设置中获取模型的 max_tokens 配置
    const modelInfo = llmConfigManager.getModelInfo();
    const maxTokens = config.maxTokens || modelInfo.defaultConfig.maxTokens || 8000;

    if (!apiKey) {
      throw new Error('AI 服务未配置 API Key，请在设置中配置');
    }

    const apiEndpoint = baseUrl + '/chat/completions';

    const systemPrompt = options?.systemPrompt ?? REQUIREMENT_GENERATION_PROMPT;
    const inputLimits = getResolvedInputLimits(config);
    const maxInputTokens = computeRequirementDocMaxInputTokens({
      model: selectedModel,
      maxTokens,
      maxInputTokensOverride: inputLimits?.maxInputTokensOverride,
      modelContextWindowsJson: inputLimits?.modelContextWindowsJson,
      inputSafetyMarginTokens: inputLimits?.inputSafetyMarginTokens,
    });
    const logScene = options?.logScene;

    const cleanedText = sanitizeRequirementInputText(text);
    options?.onProgress?.({
      phase: 'preprocess',
      message: cleanedText.length !== text.length ? '已净化输入噪声内容' : '输入预处理完成'
    });
    const fullUserMessage = REQUIREMENT_USER_MESSAGE_PREFIX + cleanedText;
    const singlePassFits =
      estimateTokensApprox(systemPrompt) + estimateTokensApprox(fullUserMessage) <= Math.max(2000, maxInputTokens - 500);

    if (singlePassFits) {
      options?.onProgress?.({
        phase: 'generating',
        message: 'AI 正在生成结构化需求文档，请耐心等待...'
      });
      if (logScene) {
        logRequirementDocLLM(logScene, selectedModel, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: fullUserMessage },
        ]);
      }
      const firstPass = await this.callRequirementModelOnce({
        apiEndpoint,
        apiKey,
        selectedModel,
        maxTokens,
        timeoutConfig: config.timeout,
        systemPrompt,
        userMessage: fullUserMessage,
        logScene,
      });
      const content = await this.continueRequirementOutputIfNeeded({
        apiEndpoint,
        apiKey,
        selectedModel,
        maxTokens,
        timeoutConfig: config.timeout,
        systemPrompt,
        initialContent: firstPass.content,
        initialFinishReason: firstPass.finishReason,
        logScene: logScene ? `${logScene}:single` : undefined
      });
      console.log(`✅ AI 需求文档生成成功，使用模型: ${selectedModel}`);
      options?.onProgress?.({
        phase: 'done',
        message: '生成完成'
      });
      return { content, inputTruncated: false };
    }

    let chunks = splitTextForRequirementChunks({
      text: cleanedText,
      systemPrompt,
      userPrefix: REQUIREMENT_CHUNK_PROMPT_PREFIX,
      maxInputTokens
    });
    const minChunkCountRaw = parseInt(process.env.REQUIREMENT_DOC_MIN_CHUNK_COUNT || '6', 10);
    const minChunkCount = Number.isFinite(minChunkCountRaw) && minChunkCountRaw >= 2 ? minChunkCountRaw : 6;
    const minChunkTriggerCharsRaw = parseInt(process.env.REQUIREMENT_DOC_MIN_CHUNK_TRIGGER_CHARS || '300000', 10);
    const minChunkTriggerChars =
      Number.isFinite(minChunkTriggerCharsRaw) && minChunkTriggerCharsRaw >= 50000 ? minChunkTriggerCharsRaw : 300000;
    if (cleanedText.length >= minChunkTriggerChars && chunks.length < minChunkCount) {
      const before = chunks.length;
      chunks = enforceMinimumChunkCount({
        chunks,
        minChunkCount,
        minChunkSizeChars: 20000
      });
      console.log(
        `[RequirementDoc] 最小分片保护生效：${before} -> ${chunks.length}（minChunkCount=${minChunkCount} triggerChars=${minChunkTriggerChars}）`
      );
    }
    options?.onProgress?.({
      phase: 'chunking',
      total: chunks.length,
      // message: `已切分为 ${chunks.length} 个分片`
    });
    const inputTruncated = true;
    if (inputTruncated) {
      const mappingOverride = parseJsonRecordEnv(inputLimits?.modelContextWindowsJson);
      const contextWindow = estimateContextWindowTokensByModel(selectedModel, mappingOverride);
      const preferredChunkChars = parseInt(process.env.REQUIREMENT_DOC_CHUNK_PREFERRED_MAX_CHARS || '90000', 10);
      console.warn(
        `[RequirementDoc] 输入超窗，启用分片生成（contextWindow≈${contextWindow} max_tokens=${maxTokens} maxInput≈${maxInputTokens} preferredChunkChars≈${Number.isFinite(preferredChunkChars) ? preferredChunkChars : 90000}）原始字符数=${text.length} 净化后字符数=${cleanedText.length} 分片数=${chunks.length}`
      );
    }

    const chunkOutputs: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const chunkScene = logScene ? `${logScene}:chunk-${i + 1}/${chunks.length}` : undefined;
      const chunkUserMessage =
        `${REQUIREMENT_CHUNK_PROMPT_PREFIX}[分片 ${i + 1}/${chunks.length}]\n` +
        `${chunkText}\n\n` +
        '请输出该分片的结构化需求要点，保留可追溯信息，避免与其他未知分片相关的推断。';
      if (chunkScene) {
        logRequirementDocLLM(chunkScene, selectedModel, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: chunkUserMessage },
        ]);
      }
      const partialResp = await this.callRequirementModelOnce({
        apiEndpoint,
        apiKey,
        selectedModel,
        maxTokens,
        timeoutConfig: config.timeout,
        systemPrompt,
        userMessage: chunkUserMessage,
        logScene: chunkScene,
      });
      const partial = await this.continueRequirementOutputIfNeeded({
        apiEndpoint,
        apiKey,
        selectedModel,
        maxTokens,
        timeoutConfig: config.timeout,
        systemPrompt,
        initialContent: partialResp.content,
        initialFinishReason: partialResp.finishReason,
        logScene: chunkScene
      });
      chunkOutputs.push(partial);
      console.log(`[RequirementDoc] 分片生成进度 ${i + 1}/${chunks.length}，chars=${chunkText.length}`);
      options?.onProgress?.({
        phase: 'chunk_progress',
        current: i + 1,
        total: chunks.length,
        // message: `分片生成进度 ${i + 1}/${chunks.length}`
        message: `请耐心等待...`
      });
    }

    let drafts = [...chunkOutputs];
    let mergeRound = 0;
    while (drafts.length > 1) {
      mergeRound += 1;
      const batches = splitDraftsForMergeBatches({
        drafts,
        systemPrompt,
        mergePrefix: REQUIREMENT_MERGE_PROMPT_PREFIX,
        maxInputTokens
      });
      const mergedRound: string[] = [];

      for (let i = 0; i < batches.length; i++) {
        options?.onProgress?.({
          phase: 'merging',
          current: i + 1,
          total: batches.length,
          message: `正在进行第 ${mergeRound} 轮合并（${i + 1}/${batches.length}）`
        });
        const mergeScene = logScene ? `${logScene}:merge-r${mergeRound}-${i + 1}/${batches.length}` : undefined;
        const mergeUserMessage = `${REQUIREMENT_MERGE_PROMPT_PREFIX}${batches[i].join('\n\n---\n\n')}`;
        if (mergeScene) {
          logRequirementDocLLM(mergeScene, selectedModel, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: mergeUserMessage },
          ]);
        }
        const mergeResp = await this.callRequirementModelOnce({
          apiEndpoint,
          apiKey,
          selectedModel,
          maxTokens,
          timeoutConfig: config.timeout,
          systemPrompt,
          userMessage: mergeUserMessage,
          logScene: mergeScene,
        });
        const mergedPart = await this.continueRequirementOutputIfNeeded({
          apiEndpoint,
          apiKey,
          selectedModel,
          maxTokens,
          timeoutConfig: config.timeout,
          systemPrompt,
          initialContent: mergeResp.content,
          initialFinishReason: mergeResp.finishReason,
          logScene: mergeScene
        });
        mergedRound.push(mergedPart);
      }

      drafts = mergedRound;
      console.log(`[RequirementDoc] 合并轮次完成 round=${mergeRound} remain=${drafts.length}`);
      if (mergeRound >= 6) break;
    }
    let mergedContent = drafts.join('\n\n');
    mergedContent = await this.appendMissingTailSectionsIfNeeded({
      apiEndpoint,
      apiKey,
      selectedModel,
      maxTokens,
      timeoutConfig: config.timeout,
      systemPrompt,
      mergedContent,
      sourceDrafts: chunkOutputs,
      logScene
    });
    console.log(`✅ AI 需求文档分片合并完成，使用模型: ${selectedModel} 分片数=${chunks.length}`);
    options?.onProgress?.({
      phase: 'done',
      current: chunks.length,
      total: chunks.length,
      message: '分片合并完成'
    });
    return { content: mergedContent, inputTruncated };
  }
}
