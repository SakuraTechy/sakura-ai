/**
 * 市场洞察报告正文：与「需求分析」页上传预览、深读预览一致的 Markdown 规范化，
 * 便于 marked 渲染（章节、图片链接、HTML 片段等）。
 */
export function normalizeReportMarkdownBody(raw?: string): string {
  let content = (raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!content) return '';
  const originalContent = content;

  const navKeywords = ['首页', '沸点', '课程', '直播', 'APP', '插件', '搜索历史', '清空', '创作者中心', '写文章', '登录', '注册', '掘金', '更多', '活动'];
  const cleanedLines = content.split('\n').filter((line) => {
    const text = line.trim();
    if (!text) return false;
    const hitCount = navKeywords.reduce((count, kw) => (text.includes(kw) ? count + 1 : count), 0);
    if (text.length <= 120 && hitCount >= 3) return false;
    return true;
  });
  content = cleanedLines.join('\n').trim();

  const imageUrlToMarkdown = (input: string) =>
    input.replace(
      /(^|\s)(https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|svg))(?!\))/gi,
      (_m, prefix: string, url: string) => `${prefix}\n\n![图片](${url})\n\n`
    );

  const looksLikeMarkdown = /(^|\n)\s{0,3}(#|>|- |\* |\d+\. |\|)|```|!\[[^\]]*\]\([^)]+\)/.test(content);
  if (looksLikeMarkdown) {
    const normalized = imageUrlToMarkdown(content).replace(/\n{3,}/g, '\n\n').trim();
    return normalized || originalContent;
  }

  content = content
    .replace(/(^|\n)\s*([一二三四五六七八九十]+、[^\n]{2,40})/g, '\n## $2')
    .replace(/(^|\n)\s*(\d+\.\d+\s+[^\n]{2,60})/g, '\n### $2')
    .replace(/(^|\n)\s*(场景[一二三四五六七八九十]：[^\n]{2,60})/g, '\n### $2');

  if (/<\/?(html|head|body|script|form|input|button|title|meta)\b/i.test(content)) {
    content = content.replace(
      /<!DOCTYPE html[\s\S]*?<\/html>/gi,
      (snippet) => `\n\`\`\`html\n${snippet.trim()}\n\`\`\`\n`
    );
  }

  const normalized = imageUrlToMarkdown(content)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized || normalized.length < Math.max(80, Math.floor(originalContent.length * 0.2))) {
    return originalContent.replace(/\n{3,}/g, '\n\n').trim();
  }
  return normalized;
}
