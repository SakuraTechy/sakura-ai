import { llmConfigManager } from '../../src/services/llmConfigManager.js';
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
    options?: { systemPrompt?: string; /** 设置后打印完整提示词与响应摘要（见 REQUIREMENT_DOC_LLM_LOG_PROMPTS） */ logScene?: string }
  ): Promise<string> {
    if (!llmConfigManager.isReady()) {
      await llmConfigManager.initialize();
    }
    const config = llmConfigManager.getCurrentConfig();

    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    const baseUrl = config.baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const selectedModel = model || config.model || 'openai/gpt-4o';

    if (!apiKey) {
      throw new Error('AI 服务未配置 API Key，请在设置中配置');
    }

    const apiEndpoint = baseUrl + '/chat/completions';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const systemPrompt = options?.systemPrompt ?? REQUIREMENT_GENERATION_PROMPT;
    const userMessage = `请根据以下内容生成结构化需求文档：\n\n${text}`;
    const logScene = options?.logScene;

    if (logScene) {
      logRequirementDocLLM(logScene, selectedModel, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ]);
    }

    const startedAt = Date.now();

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://sakura-ai.com',
          'X-Title': 'Sakura AI Testing Platform'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.3,
          max_tokens: 4000
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = (errorData as any).error?.message || response.statusText;
        if (logScene && requirementDocSceneLogEnabled()) {
          console.error(
            `[RequirementDoc][LLM][${logScene}] HTTP ${response.status} error=${errMsg} body=${JSON.stringify(errorData).slice(0, 2000)}`
          );
        }
        throw new Error(`AI 服务调用失败: ${errMsg}`);
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        if (logScene && requirementDocSceneLogEnabled()) {
          console.error(`[RequirementDoc][LLM][${logScene}] empty choices; raw=${JSON.stringify(data).slice(0, 2500)}`);
        }
        throw new Error('AI 返回了空内容');
      }

      const durationMs = Date.now() - startedAt;
      console.log(`✅ AI 需求文档生成成功，使用模型: ${selectedModel}`);
      if (logScene && requirementDocSceneLogEnabled()) {
        const usage = data.usage;
        const preview = clipRequirementLog(String(content), Math.min(4000, requirementDocLogMaxChars()));
        console.log(
          `[RequirementDoc][LLM][${logScene}] ok durationMs=${durationMs} responseChars=${content.length} model=${selectedModel}`
        );
        if (usage) {
          console.log(`[RequirementDoc][LLM][${logScene}] usage=${JSON.stringify(usage)}`);
        }
        console.log(`[RequirementDoc][LLM][${logScene}] ---------- assistant (preview) ----------`);
        console.log(preview);
      }
      return content;
    } catch (error: any) {
      if (logScene && requirementDocSceneLogEnabled()) {
        console.error(`[RequirementDoc][LLM][${logScene}] failed:`, error?.message || error);
      }
      if (error.name === 'AbortError') {
        throw new Error('AI 服务响应超时（60秒），请稍后重试');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
