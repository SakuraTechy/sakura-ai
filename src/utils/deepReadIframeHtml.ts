/**
 * 深读「HTML（原貌）」iframe：为抓取到的整页 HTML 注入 base、放宽 CSP，
 * 避免相对路径的样式/脚本/字体解析到当前 SPA 域名（localhost）导致样式丢失。
 */

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * @param html 服务端返回的 contentRawHtml（整页或片段）
 * @param sourceUrl 文章原文 URL，用作 document base
 */
export function prepareIframeSrcDocHtml(html: string, sourceUrl: string): string {
  const trimmed = sourceUrl?.trim();
  if (!trimmed) return html;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return html;
  }

  const baseHref = escapeHtmlAttr(u.href);
  let out = html;

  // 内嵌文档中的 CSP 可能禁止外链样式/字体，预览时去掉 meta CSP（仍由 iframe sandbox 限制脚本）
  out = out.replace(/<meta[^>]+http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '');

  const baseTag = `<base href="${baseHref}">`;

  if (/<base\s/i.test(out)) {
    out = out.replace(/<base[^>]*>/i, baseTag);
  } else if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (open) => `${open}${baseTag}`);
  } else if (/<html[^>]*>/i.test(out)) {
    out = out.replace(
      /<html[^>]*>/i,
      (open) => `${open}<head><meta charset="utf-8"/>${baseTag}</head>`
    );
  } else {
    out = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>${baseTag}</head><body>${out}</body></html>`;
  }

  return out;
}
