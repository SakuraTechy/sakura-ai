/**
 * 文件内容读取工具
 * 支持 HTML、PDF、DOCX、Markdown、TXT、ZIP（解压合并）等格式
 * 优化版：尽可能保留原始格式信息
 */
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { unzipSync } from 'fflate';
import { MAX_FILES } from '../config/upload';
import {
  shouldSkipAxureMergePath,
  sortAxurePathMetas,
  type AxurePathMeta
} from './axureExportPrioritize';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/scripts/pdf.worker.min.mjs';

export interface FileReadResult {
  success: boolean;
  content: string;
  error?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  hasImages?: boolean;        // 是否包含图片
  isScannedPdf?: boolean;     // 是否为扫描版PDF
  formatWarnings?: string[];  // 格式警告信息
}

/**
 * 读取HTML文件内容
 */
async function readHtmlFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(content);
    };
    reader.onerror = () => reject(new Error('读取HTML文件失败'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * 读取文本文件内容（Markdown、TXT）
 */
async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(content);
    };
    reader.onerror = () => reject(new Error('读取文本文件失败'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * 读取PDF文件内容（增强版：保留布局、检测表格）
 */
async function readPdfFile(file: File): Promise<{ content: string; isScanned: boolean; hasImages: boolean }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    let totalTextLength = 0;
    let hasImages = false;
    
    // 逐页提取文本
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // 检测是否有图片
      const ops = await page.getOperatorList();
      if (ops.fnArray.includes(pdfjsLib.OPS.paintImageXObject)) {
        hasImages = true;
      }
      
      // 按行组织文本（保留布局）
      const items = textContent.items as any[];
      const lineMap = new Map<number, { x: number; text: string }[]>();

      items.forEach(item => {
        if (!item.str || item.str.trim().length === 0) return;
        if (!Array.isArray(item.transform)) return;

        const y = Math.round(item.transform[5]);
        const x = Number(item.transform[4]) || 0;
        const lineKey = findClosestLineKey(lineMap, y);
        const line = lineMap.get(lineKey) ?? [];
        line.push({ x, text: sanitizePdfChunk(item.str) });
        lineMap.set(lineKey, line);
      });

      const lines = Array.from(lineMap.entries()).map(([y, segments]) => {
        segments.sort((a, b) => a.x - b.x);
        return {
          y,
          text: mergePdfSegments(segments)
        };
      });
      
      // 按垂直位置排序（从上到下）
      lines.sort((a, b) => b.y - a.y);
      
      // 检测表格（相邻行有相似的分隔符模式）
      const pageLines = lines.map(l => sanitizePdfText(l.text).trim()).filter(Boolean);
      const tableDetected = detectTable(pageLines);
      
      if (tableDetected) {
        fullText += `\n## 第 ${i} 页（包含表格）\n\n`;
        fullText += formatAsTable(pageLines) + '\n\n';
      } else {
        fullText += `\n## 第 ${i} 页\n\n`;
        fullText += linesToMarkdown(lines) + '\n\n';
      }
      
      totalTextLength += pageLines.join('').length;
    }
    
    // 判断是否为扫描版（文本量太少）
    const isScanned = totalTextLength < 100 && pdf.numPages > 0;
    
    if (isScanned) {
      fullText = `⚠️ 警告：检测到这是扫描版PDF（图片格式），无法提取文本。\n建议：\n1. 使用文字版PDF重新生成\n2. 或使用OCR工具转换后再上传\n3. 或直接粘贴文本内容\n\n提取到的文本（${totalTextLength}字符）：\n${fullText}`;
    }
    
    return {
      content: fullText.trim(),
      isScanned,
      hasImages
    };
  } catch (error) {
    throw new Error('读取PDF文件失败：' + (error as Error).message);
  }
}

/**
 * 简单表格检测（基于行模式）
 */
function detectTable(lines: string[]): boolean {
  if (lines.length < 3) return false;
  
  // 检测是否有多行包含制表符或多个空格分隔
  const tablePattern = /\s{2,}|\t/;
  const linesWithPattern = lines.filter(line => tablePattern.test(line));
  
  return linesWithPattern.length >= Math.min(3, lines.length * 0.3);
}

function findClosestLineKey(lineMap: Map<number, { x: number; text: string }[]>, y: number): number {
  for (const key of lineMap.keys()) {
    if (Math.abs(key - y) < 5) {
      return key;
    }
  }
  return y;
}

function linesToMarkdown(lines: Array<{ y: number; text: string }>): string {
  const cleaned = lines
    .map(l => {
      const text = sanitizePdfText(l.text).trim();
      return { y: l.y, text };
    })
    .filter(l => l.text.length > 0);

  if (cleaned.length === 0) return '';

  const out: string[] = [];
  let prevY: number | null = null;

  for (const line of cleaned) {
    // 通过 y 间距判断是否需要新段落，改善“排版 -> md”效果
    if (prevY !== null) {
      const gap = Math.abs(prevY - line.y);
      if (gap > 12) out.push(''); // 空行形成段落
    }

    out.push(convertLineToMarkdown(line.text));
    prevY = line.y;
  }

  // 避免过多空行
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function convertLineToMarkdown(text: string): string {
  // 数字列表：1. xxx / 1、xxx / 1) xxx
  const numbered = text.match(/^\s*(\d{1,4})[\.、\)]\s*(.+)$/);
  if (numbered) return `${numbered[1]}. ${numbered[2].trim()}`;

  // 项目符号：- xxx / * xxx / • xxx / · xxx
  const bullet = text.match(/^\s*[-*•·◦○●▪▫]\s*(.+)$/);
  if (bullet) return `- ${bullet[1].trim()}`;

  return text;
}

function mergePdfSegments(segments: Array<{ x: number; text: string }>): string {
  if (segments.length === 0) return '';

  let merged = segments[0].text;

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1].text;
    const curr = segments[i].text;

    if (shouldInsertSpace(prev, curr)) {
      merged += ` ${curr}`;
    } else {
      merged += curr;
    }
  }

  return merged;
}

function sanitizePdfChunk(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
}

function sanitizePdfText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKC')
    // 移除不可见控制字符（保留换行/制表符）
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    // 清理零宽字符和 BOM
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    // 合并连续空白
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function shouldInsertSpace(prev: string, curr: string): boolean {
  const prevChar = prev.trim().slice(-1);
  const currChar = curr.trim().charAt(0);

  if (!prevChar || !currChar) return false;

  // 中文/日文/韩文连续字符通常不应插入空格，避免“智 能 纪 要”这类乱码
  if (isCjkChar(prevChar) || isCjkChar(currChar)) {
    return false;
  }

  // 拉丁字符、数字、常见英文标识符之间保留空格可读性更好
  return /[A-Za-z0-9]/.test(prevChar) && /[A-Za-z0-9]/.test(currChar);
}

function isCjkChar(char: string): boolean {
  return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/.test(char);
}

/**
 * 格式化为Markdown表格
 */
function formatAsTable(lines: string[]): string {
  if (lines.length === 0) return lines.join('\n');
  
  // 简单处理：尝试按空格分割成列
  const rows = lines.map(line => 
    line.split(/\s{2,}|\t/).map(cell => cell.trim()).filter(cell => cell.length > 0)
  );
  
  if (rows.length === 0 || rows[0].length === 0) {
    return lines.join('\n');
  }
  
  // 生成Markdown表格
  const headers = rows[0];
  const separator = headers.map(() => '---').join(' | ');
  const tableRows = rows.slice(1).map(row => 
    row.map(cell => cell || '').join(' | ')
  );
  
  return [
    headers.join(' | '),
    separator,
    ...tableRows
  ].join('\n');
}

/**
 * 读取DOCX文件内容（增强版：保留表格、列表、标题等格式）
 */
async function readDocxFile(file: File): Promise<{ content: string; hasImages: boolean; warnings: string[] }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    const warnings: string[] = [];
    let hasImages = false;
    
    // 使用 convertToHtml 并配置图片转换（保留更多格式）
    const htmlResult = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        // 配置图片转换为 base64
        convertImage: mammoth.images.imgElement(function(image: any) {
          return image.read("base64").then(function(imageBuffer: any) {
            hasImages = true;
            return {
              src: "data:" + image.contentType + ";base64," + imageBuffer
            };
          });
        }),
        // 样式映射（正确的语法）
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='标题 1'] => h1:fresh",
          "p[style-name='标题 2'] => h2:fresh",
          "p[style-name='标题 3'] => h3:fresh",
          "p[style-name='标题 4'] => h4:fresh",
          "p[style-name='List Paragraph'] => p:fresh"
        ]
      }
    );
    
    // 处理转换消息（过滤掉不重要的警告）
    if (htmlResult.messages && htmlResult.messages.length > 0) {
      htmlResult.messages.forEach(msg => {
        // 过滤掉常见的不重要警告
        const ignoredWarnings = [
          'w:tblPrEx',
          'Unrecognised paragraph style',
          'List Paragraph'
        ];
        
        const shouldIgnore = ignoredWarnings.some(ignored => 
          msg.message.includes(ignored)
        );
        
        if (msg.type === 'warning' && !shouldIgnore) {
          warnings.push(msg.message);
        }
        
        if (msg.message.includes('image') || msg.message.includes('图片')) {
          hasImages = true;
        }
      });
      
      if (warnings.length > 0) {
        console.warn('DOCX读取警告:', warnings);
      }
    }
    
    // 将HTML转换为更友好的Markdown格式
    const content = convertHtmlToMarkdown(htmlResult.value);
    
    return {
      content,
      hasImages,
      warnings
    };
  } catch (error) {
    throw new Error('读取DOCX文件失败：' + (error as Error).message);
  }
}

/**
 * 增强的HTML到Markdown转换（保留图片和表格）
 */
function convertHtmlToMarkdown(html: string): string {
  let markdown = html;
  
  // 移除样式和脚本
  markdown = markdown.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  markdown = markdown.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  
  // 转换标题
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n\n# $1\n\n');
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n\n## $1\n\n');
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n\n### $1\n\n');
  markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n\n#### $1\n\n');
  markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n\n##### $1\n\n');
  markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n\n###### $1\n\n');
  
  // 🆕 保留图片（转换为Markdown格式）
  markdown = markdown.replace(/<img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '\n\n![图片: $2]($1)\n\n');
  markdown = markdown.replace(/<img[^>]*src=["']([^"']*)["'][^>]*>/gi, '\n\n![图片]($1)\n\n');
  
  // 转换列表
  markdown = markdown.replace(/<ul[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/ul>/gi, '\n');
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  markdown = markdown.replace(/<ol[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/ol>/gi, '\n');
  
  // 🆕 表格转换为Markdown（简单表格）
  markdown = convertTableToMarkdown(markdown);
  
  // 转换段落
  markdown = markdown.replace(/<p[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/p>/gi, '\n');
  
  // 转换换行
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
  
  // 转换粗体和斜体
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  
  // 转换链接
  markdown = markdown.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  
  // 移除其他HTML标签（但保留表格标签）
  markdown = markdown.replace(/<(?!\/?(table|thead|tbody|tr|th|td))[^>]+>/g, '');
  
  // 解码HTML实体
  markdown = markdown.replace(/&nbsp;/g, ' ');
  markdown = markdown.replace(/&lt;/g, '<');
  markdown = markdown.replace(/&gt;/g, '>');
  markdown = markdown.replace(/&amp;/g, '&');
  markdown = markdown.replace(/&quot;/g, '"');
  markdown = markdown.replace(/&#39;/g, "'");
  
  // 清理多余空行
  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  
  return markdown.trim();
}

/**
 * 将HTML表格转换为Markdown表格
 */
function convertTableToMarkdown(html: string): string {
  // 查找所有表格
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  
  return html.replace(tableRegex, (match) => {
    try {
      // 提取表头
      const theadMatch = match.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
      const tbodyMatch = match.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
      
      let headers: string[] = [];
      let rows: string[][] = [];
      
      // 解析表头
      if (theadMatch) {
        const headerCells = theadMatch[1].match(/<th[^>]*>(.*?)<\/th>/gi) || [];
        headers = headerCells.map(cell => 
          cell.replace(/<[^>]+>/g, '').trim()
        );
      }
      
      // 解析表格行
      const rowMatches = (tbodyMatch ? tbodyMatch[1] : match).match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      
      // 如果没有表头，从第一行提取
      if (headers.length === 0 && rowMatches.length > 0) {
        const firstRowCells = (rowMatches[0] ?? '').match(/<t[hd][^>]*>(.*?)<\/t[hd]>/gi) || [];
        headers = firstRowCells.map(cell => 
          cell.replace(/<[^>]+>/g, '').trim()
        );
        rowMatches.shift(); // 移除第一行
      }
      
      // 解析数据行
      rowMatches.forEach(row => {
        const cells = row.match(/<td[^>]*>(.*?)<\/td>/gi) || [];
        const rowData = cells.map(cell => 
          cell.replace(/<[^>]+>/g, '').trim()
        );
        if (rowData.length > 0) {
          rows.push(rowData);
        }
      });
      
      // 生成Markdown表格
      if (headers.length > 0) {
        const separator = headers.map(() => '---').join(' | ');
        const headerRow = headers.join(' | ');
        const dataRows = rows.map(row => 
          row.map(cell => cell || '').join(' | ')
        ).join('\n');
        
        return `\n\n${headerRow}\n${separator}\n${dataRows}\n\n`;
      }
      
      // 如果无法解析为Markdown表格，返回提示
      return '\n\n**[表格内容]**\n\n';
    } catch (error) {
      console.warn('表格转换失败，保留原始HTML:', error);
      return '\n\n' + match + '\n\n';
    }
  });
}

export interface ReadFileContentOptions {
  /** 默认 50（与需求分析一致）；市场洞察导入可设为 1 */
  minContentLength?: number;
}

function isSafeZipEntryPath(p: string): boolean {
  if (!p || p.endsWith('/')) return false;
  const norm = p.replace(/\\/g, '/');
  if (norm.includes('..')) return false;
  if (norm.startsWith('/') || norm.startsWith('\\')) return false;
  return true;
}

/** 浏览器对 gb18030/gbk 支持不一致，惰性创建 */
function getChineseDecoder(): TextDecoder | null {
  try {
    return new TextDecoder('gb18030');
  } catch {
    try {
      return new TextDecoder('gbk');
    } catch {
      return null;
    }
  }
}

const CHINESE_DECODER = getChineseDecoder();

function countCjkChars(s: string): number {
  return (s.match(/[\u4e00-\u9fff]/g) || []).length;
}

/**
 * ZIP 内路径常被误解析为 Latin-1：尝试按字节还原为 UTF-8 或 GB18030 显示名
 */
function fixZipPathDisplayName(name: string): string {
  if (!name) return name;
  try {
    const bytes = new Uint8Array(name.length);
    for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i) & 0xff;
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (countCjkChars(utf8) > 0) return utf8.replace(/\\/g, '/');
  } catch {
    /* 非合法 UTF-8 字节序列 */
  }
  if (CHINESE_DECODER) {
    try {
      const bytes = new Uint8Array(name.length);
      for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i) & 0xff;
      const gb = CHINESE_DECODER.decode(bytes);
      if (countCjkChars(gb) > 0) return gb.replace(/\\/g, '/');
    } catch {
      /* ignore */
    }
  }
  return name.replace(/\\/g, '/');
}

function sniffHtmlCharset(bytes: Uint8Array): 'utf-8' | 'gb18030' {
  const head = bytes.slice(0, Math.min(16384, bytes.length));
  const headLatin1 = new TextDecoder('latin1').decode(head);
  const m =
    headLatin1.match(/charset\s*=\s*["']?([^"'>\s]+)/i) ||
    headLatin1.match(/http-equiv=["']content-type["'][^>]*content=["'][^"']*charset=([^"';\s]+)/i);
  if (m) {
    const c = m[1].toLowerCase().replace(/-/g, '');
    if (c.includes('gb') || c === 'gb2312' || c === 'gbk' || c === 'gb18030') return 'gb18030';
    if (c.includes('utf')) return 'utf-8';
  }
  return 'utf-8';
}

function decodeHtmlBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }
  const declared = sniffHtmlCharset(bytes);
  if (declared === 'gb18030' && CHINESE_DECODER) {
    try {
      return CHINESE_DECODER.decode(bytes);
    } catch {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (utf8.includes('\uFFFD') && CHINESE_DECODER) {
    try {
      const gb = CHINESE_DECODER.decode(bytes);
      if (countCjkChars(gb) > countCjkChars(utf8)) return gb;
    } catch {
      /* ignore */
    }
  }
  if (CHINESE_DECODER && countCjkChars(utf8) < 4 && /[ÃÂÐÍÀÁ]/.test(utf8) && bytes.length > 30) {
    try {
      const gb = CHINESE_DECODER.decode(bytes);
      if (countCjkChars(gb) > countCjkChars(utf8)) return gb;
    } catch {
      /* ignore */
    }
  }
  return utf8;
}

function decodeJsOrPlainTextBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (utf8.includes('\uFFFD') && CHINESE_DECODER) {
    try {
      const gb = CHINESE_DECODER.decode(bytes);
      if (countCjkChars(gb) > countCjkChars(utf8)) return gb;
    } catch {
      /* ignore */
    }
  }
  if (CHINESE_DECODER && countCjkChars(utf8) < 3 && /[ÃÂÐ]/.test(utf8)) {
    try {
      const gb = CHINESE_DECODER.decode(bytes);
      if (countCjkChars(gb) > countCjkChars(utf8)) return gb;
    } catch {
      /* ignore */
    }
  }
  return utf8;
}

function decodeZipEntryTextBytes(bytes: Uint8Array, ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'html' || e === 'htm') return decodeHtmlBytes(bytes);
  if (e === 'md' || e === 'markdown' || e === 'txt') return decodeJsOrPlainTextBytes(bytes);
  return decodeJsOrPlainTextBytes(bytes);
}

/** 用于上传区展示：统计 ZIP 内 HTML/HTM/JS 数量（不解压正文） */
export async function countZipHtmlJsFiles(file: File): Promise<{ html: number; js: number }> {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const out = unzipSync(buf);
    let html = 0;
    let js = 0;
    for (const k of Object.keys(out)) {
      if (!isSafeZipEntryPath(k)) continue;
      const base = k.split('/').pop() || '';
      if (base.startsWith('.') || k.includes('__MACOSX')) continue;
      const ext = k.toLowerCase().split('.').pop() || '';
      if (ext === 'html' || ext === 'htm') html += 1;
      else if (ext === 'js') js += 1;
    }
    return { html, js };
  } catch {
    return { html: 0, js: 0 };
  }
}

/**
 * 解压 ZIP，合并其中可解析为需求正文的文件（与后端 Axure 解析范围对齐：HTML/HTM/JS 计入数量上限）
 */
async function readZipArchiveCombined(file: File): Promise<{ content: string; formatWarnings: string[] }> {
  const formatWarnings: string[] = [];
  const buf = new Uint8Array(await file.arrayBuffer());
  let out: Record<string, Uint8Array>;
  try {
    out = unzipSync(buf);
  } catch {
    throw new Error('ZIP 无法解压或文件已损坏');
  }

  const rawPaths = Object.keys(out).filter((k) => {
    if (!isSafeZipEntryPath(k)) return false;
    const base = k.split('/').pop() || '';
    if (base.startsWith('.') || base === 'Thumbs.db') return false;
    if (k.includes('__MACOSX')) return false;
    return true;
  });

  const allMetas: AxurePathMeta[] = rawPaths.map((path) => {
    const lower = path.toLowerCase();
    const ext = lower.split('.').pop() || '';
    return { path, size: out[path].length, ext };
  });

  const htmlJsMetas = allMetas.filter(m => ['html', 'htm', 'js'].includes(m.ext));
  let primaryHtmlJs = htmlJsMetas.filter(
    m => !shouldSkipAxureMergePath(m.path, m.size, m.ext)
  );
  if (primaryHtmlJs.length === 0 && htmlJsMetas.length > 0) {
    primaryHtmlJs = htmlJsMetas;
    formatWarnings.push(
      '⚠️ 未识别到可跳过的低价值文件，已合并全部 HTML/JS（若内容过多请分批上传）'
    );
  } else if (primaryHtmlJs.length < htmlJsMetas.length) {
    formatWarnings.push(
      `📎 已自动跳过 ${htmlJsMetas.length - primaryHtmlJs.length} 个低优先级文件（如 chrome.html、大型第三方 JS 等），优先合并 Axure 主页面与 data.js`
    );
  }

  const sortedHtmlJs = sortAxurePathMetas(primaryHtmlJs);
  const docMetas = allMetas
    .filter(m => ['md', 'markdown', 'txt', 'pdf', 'docx', 'doc'].includes(m.ext))
    .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));

  const paths = [...sortedHtmlJs.map(m => m.path), ...docMetas.map(m => m.path)];

  const sections: string[] = [];
  let htmlJsTally = 0;
  let truncatedHtmlJs = false;

  for (const relPath of paths) {
    const displayPath = fixZipPathDisplayName(relPath);
    const lower = relPath.toLowerCase();
    const ext = lower.split('.').pop() || '';
    const data = out[relPath];
    if (!data || data.length === 0) continue;

    const isHtmlJs = ext === 'html' || ext === 'htm' || ext === 'js';
    if (isHtmlJs) {
      if (htmlJsTally >= MAX_FILES) {
        truncatedHtmlJs = true;
        continue;
      }
      htmlJsTally += 1;
    }

    if (ext === 'html' || ext === 'htm' || ext === 'js' || ext === 'md' || ext === 'markdown' || ext === 'txt') {
      const text = decodeZipEntryTextBytes(data, ext);
      if (!text.trim()) continue;
      const label = ext === 'js' ? 'JS' : ext === 'html' || ext === 'htm' ? 'HTML' : '文本';
      sections.push(`\n\n## ${label}：${displayPath}\n\n${text}`);
      continue;
    }

    if (ext === 'pdf') {
      try {
        const blob = new Blob([data], { type: 'application/pdf' });
        const baseName = displayPath.split('/').pop() || 'file.pdf';
        const pdfFile = new File([blob], baseName, { type: 'application/pdf' });
        const pdfResult = await readPdfFile(pdfFile);
        sections.push(`\n\n## PDF：${displayPath}\n\n${pdfResult.content}`);
      } catch {
        formatWarnings.push(`⚠️ 跳过无法解析的 PDF：${displayPath}`);
      }
      continue;
    }

    if (ext === 'docx' || ext === 'doc') {
      try {
        const mime =
          ext === 'docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/msword';
        const blob = new Blob([data], { type: mime });
        const docFile = new File([blob], displayPath.split('/').pop() || `file.${ext}`, { type: mime });
        const docxResult = await readDocxFile(docFile);
        sections.push(`\n\n## Word：${displayPath}\n\n${docxResult.content}`);
      } catch {
        formatWarnings.push(`⚠️ 跳过无法解析的 Word：${displayPath}`);
      }
    }
  }

  if (truncatedHtmlJs) {
    formatWarnings.push(`⚠️ ZIP 内 HTML/HTM/JS 合计超过 ${MAX_FILES} 个，已跳过超出部分`);
  }

  if (sections.length === 0) {
    throw new Error('ZIP 内未找到可解析内容（需至少包含 HTML/HTM/JS/Markdown/TXT/PDF/Word 等文本文件）');
  }

  formatWarnings.push(`📦 已从 ZIP 合并 ${sections.length} 个文件片段`);
  return { content: sections.join('\n'), formatWarnings };
}

/**
 * 根据文件类型读取文件内容（增强版）
 */
export async function readFileContent(file: File, options?: ReadFileContentOptions): Promise<FileReadResult> {
  const minContentLength = options?.minContentLength ?? 50;
  const fileName = file.name;
  const fileSize = file.size;
  const fileExtension = fileName.toLowerCase().split('.').pop() || '';
  
  let fileType = '';
  let content = '';
  let success = false;
  let error: string | undefined;
  let hasImages = false;
  let isScannedPdf = false;
  let formatWarnings: string[] = [];
  
  try {
    // 根据文件扩展名选择对应的读取方法
    if (fileExtension === 'html' || fileExtension === 'htm') {
      fileType = 'HTML';
      content = await readHtmlFile(file);
    } else if (fileExtension === 'pdf') {
      fileType = 'PDF';
      const pdfResult = await readPdfFile(file);
      content = pdfResult.content;
      isScannedPdf = pdfResult.isScanned;
      hasImages = pdfResult.hasImages;
      
      if (isScannedPdf) {
        formatWarnings.push('⚠️ 检测到扫描版PDF，文本提取可能不完整');
        formatWarnings.push('💡 建议：使用文字版PDF或OCR工具转换后重试');
      }
      if (hasImages) {
        formatWarnings.push('📷 PDF中包含图片，图片内容无法提取');
      }
    } else if (fileExtension === 'docx' || fileExtension === 'doc') {
      fileType = fileExtension === 'docx' ? 'DOCX' : 'DOC';
      const docxResult = await readDocxFile(file);
      content = docxResult.content;
      hasImages = docxResult.hasImages;
      
      if (docxResult.warnings.length > 0) {
        formatWarnings.push(...docxResult.warnings.map(w => '⚠️ ' + w));
      }
      if (hasImages) {
        formatWarnings.push('📷 DOCX中包含图片，已尝试保留位置标记');
      }
      
      // 添加格式保留提示
      if (content.includes('<table>')) {
        formatWarnings.push('📊 文档中包含表格，已保留HTML格式');
      }
    } else if (fileExtension === 'json' || fileExtension === 'csv') {
      fileType = fileExtension.toUpperCase();
      content = await readTextFile(file);
    } else if (fileExtension === 'md' || fileExtension === 'markdown') {
      fileType = 'Markdown';
      content = await readTextFile(file);
    } else if (fileExtension === 'txt') {
      fileType = 'TXT';
      content = await readTextFile(file);
    } else if (fileExtension === 'zip') {
      fileType = 'ZIP';
      const zipResult = await readZipArchiveCombined(file);
      content = zipResult.content;
      formatWarnings.push(...zipResult.formatWarnings);
    } else {
      throw new Error(`不支持的文件类型: ${fileExtension}`);
    }
    
    // 验证内容
    if (!content || content.trim().length === 0) {
      throw new Error('文件内容为空');
    }
    
    if (content.trim().length < minContentLength && !isScannedPdf) {
      throw new Error(`文件内容过少（${content.length} 字符），至少需要 ${minContentLength} 个字符`);
    }
    
    success = true;
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : '未知错误';
    console.error('读取文件失败:', err);
  }
  
  return {
    success,
    content,
    error,
    fileName,
    fileType,
    fileSize,
    hasImages,
    isScannedPdf,
    formatWarnings: formatWarnings.length > 0 ? formatWarnings : undefined
  };
}

/**
 * 批量读取多个文件
 */
export async function readMultipleFiles(files: File[]): Promise<FileReadResult[]> {
  const results: FileReadResult[] = [];
  
  for (const file of files) {
    const result = await readFileContent(file);
    results.push(result);
  }
  
  return results;
}

/**
 * 格式化文件大小显示
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

