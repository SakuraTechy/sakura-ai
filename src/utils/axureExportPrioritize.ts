/**
 * Axure HTML 导出（ZIP / 文件夹）路径优先级：自动识别「主页面」与关键 JS，减少无效合并与 token 浪费。
 * 规则为启发式，不依赖人工筛选。
 */

export interface AxurePathMeta {
  path: string;
  size: number;
  ext: string;
}

/** 明显与业务需求无关、或典型第三方大包，合并需求文档时可跳过 */
export function shouldSkipAxureMergePath(path: string, size: number, ext: string): boolean {
  const norm = path.replace(/\\/g, '/');
  const base = (norm.split('/').pop() || '').toLowerCase();

  if (ext === 'html' || ext === 'htm') {
    if (/chrome\.html?$|notes\.html?$|sitemap\.html?$/i.test(base)) return true;
  }

  if (ext === 'js') {
    if (size > 120_000) {
      if (/jquery(\.min)?\.js$/i.test(base)) return true;
      if (/lodash|vue\.min|react\.min|angular\.min|bootstrap(\.min)?\.js$/i.test(base)) return true;
    }
    if (size > 400_000 && /\.min\.js$/i.test(base)) return true;
  }

  return false;
}

/**
 * 分数越高越「主要」：index/start、Axure files 目录下的页面与 data.js、document.js 等。
 */
export function scoreAxureExportPath(path: string, size: number): number {
  const norm = path.replace(/\\/g, '/');
  const base = (norm.split('/').pop() || '').toLowerCase();
  let score = 0;

  if (base.endsWith('.html') || base.endsWith('.htm')) {
    if (/^index\.html?$/.test(base)) score += 220;
    else if (/^start/i.test(base)) score += 170;
    else if (/\/files\/[^/]+\.html?$/i.test(norm)) score += 120;
    else if (norm.includes('/files/')) score += 90;
    const depth = norm.split('/').filter(Boolean).length;
    if (depth <= 2) score += 35;
    else if (depth <= 4) score += 15;
    score += Math.min(25, Math.log10(size + 10) * 6);
    return score;
  }

  if (base.endsWith('.js')) {
    if (base === 'document.js') score += 200;
    if (/\/files\/[^/]+\/data\.js$/i.test(norm)) score += 190;
    if (norm.includes('/files/') && base === 'data.js') score += 170;
    if (/\baxure\b/i.test(norm) || base.includes('axure')) score += 45;
    if (base.includes('page') && base.includes('data')) score += 30;
    score += Math.min(20, Math.log10(size + 10) * 4);
    return score;
  }

  return 0;
}

export function sortAxurePathMetas(metas: AxurePathMeta[]): AxurePathMeta[] {
  return [...metas].sort((a, b) => {
    const d = scoreAxureExportPath(b.path, b.size) - scoreAxureExportPath(a.path, a.size);
    if (d !== 0) return d;
    return a.path.localeCompare(b.path, 'zh-CN');
  });
}

/** 对浏览器 File 列表排序（优先 webkitRelativePath） */
export function sortFilesByAxurePriority(files: File[]): File[] {
  return [...files].sort((a, b) => {
    const pa = a.webkitRelativePath || a.name;
    const pb = b.webkitRelativePath || b.name;
    const ext = (p: string) => (p.toLowerCase().split('.').pop() || '') as string;
    const d =
      scoreAxureExportPath(pb, b.size) - scoreAxureExportPath(pa, a.size);
    if (d !== 0) return d;
    return pa.localeCompare(pb, 'zh-CN');
  });
}
