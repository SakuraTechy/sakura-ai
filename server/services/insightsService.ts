import { PrismaClient } from '../../src/generated/prisma/index.js';
import { DatabaseService } from './databaseService.js';

export interface ArticleListParams {
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
  source?: string;
}

export interface CreateArticleParams {
  title: string;
  category: string;
  url: string;
  content: string;
  summary?: string;
  source?: string;
  published_at: Date;
}

export class InsightsService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = DatabaseService.getInstance().getClient();
  }

  async getArticleList(params: ArticleListParams) {
    const { page, pageSize, search, category, source } = params;
    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { summary: { contains: search } }
      ];
    }

    if (category) {
      where.category = category;
    }

    if (source) {
      where.source = source;
    }

    const [articles, total] = await Promise.all([
      this.prisma.insights_articles.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { published_at: 'desc' },
        select: {
          id: true,
          title: true,
          category: true,
          url: true,
          summary: true,
          source: true,
          published_at: true,
          created_at: true
        }
      }),
      this.prisma.insights_articles.count({ where })
    ]);

    return {
      data: articles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  }

  async getArticleById(id: number) {
    return this.prisma.insights_articles.findUnique({ where: { id } });
  }

  async findArticleIdByUrl(url: string): Promise<number | null> {
    const row = await this.prisma.insights_articles.findFirst({
      where: { url },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async createArticle(params: CreateArticleParams) {
    return this.prisma.insights_articles.create({
      data: {
        title: params.title,
        category: params.category,
        url: params.url,
        content: params.content,
        summary: params.summary || '',
        source: params.source || null,
        published_at: params.published_at
      }
    });
  }

  async deleteArticle(id: number) {
    return this.prisma.insights_articles.delete({ where: { id } });
  }

  async batchDeleteArticles(ids: number[]) {
    if (!ids.length) return { deletedCount: 0 };
    const uniqueIds = Array.from(new Set(ids));
    const result = await this.prisma.insights_articles.deleteMany({
      where: { id: { in: uniqueIds } },
    });
    return { deletedCount: result.count };
  }

  async correctArticleCategory(id: number, category: string) {
    const article = await this.prisma.insights_articles.update({
      where: { id },
      data: { category }
    });
    await this.prisma.audit_logs.create({
      data: {
        action: 'insights.correct_category',
        target_type: 'insights_article',
        target_id: BigInt(id),
        meta: { category }
      }
    }).catch(() => undefined);
    return article;
  }

  async getCategories(): Promise<string[]> {
    const result = await this.prisma.insights_articles.findMany({
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' }
    });
    return result.map(r => r.category);
  }

  /**
   * 从 Markdown 文件批量导入文章
   * 解析格式：以 ## 或 ### 开头的标题为文章分隔，
   * [标题](URL) 格式提取链接
   */
  async batchImportFromMarkdown(markdownContent: string): Promise<number> {
    const articles = this.parseMarkdownDigest(markdownContent);

    if (articles.length === 0) {
      throw new Error('未从文件中解析到任何文章');
    }

    let importedCount = 0;
    for (const article of articles) {
      try {
        const existing = await this.prisma.insights_articles.findFirst({
          where: { url: article.url }
        });
        if (!existing) {
          await this.createArticle({ ...article, source: 'digest_import' });
          importedCount++;
        }
      } catch (err: any) {
        console.error(`导入文章失败: ${article.title}`, err.message);
      }
    }

    return importedCount;
  }

  private parseMarkdownDigest(content: string): CreateArticleParams[] {
    const articles: CreateArticleParams[] = [];
    const lines = content.split('\n');

    let currentCategory = '其他';
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      // 检测分类标题: ## 📝 其他, ## 🤖 人工智能 等
      const categoryMatch = line.match(/^##\s+(?:[\u{1F000}-\u{1FFFF}]\s*)?(.+)$/u);
      if (categoryMatch && !line.includes('今日必读') && !line.includes('数据概览') && !line.includes('话题标签') && !line.includes('今日看点')) {
        currentCategory = categoryMatch[1].trim();
      }

      // 检测文章链接: [标题](URL)
      const linkMatch = line.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/);
      if (linkMatch) {
        const title = linkMatch[1];
        const url = linkMatch[2];

        // 跳过 mermaid 块中的内容或非文章链接
        if (title.length < 5 || url.includes('mermaid')) {
          i++;
          continue;
        }

        // 从后面的行提取摘要（> 开头）
        let summary = '';
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine.startsWith('>')) {
            summary = nextLine.replace(/^>\s*/, '').trim();
            break;
          }
        }

        // 提取时间信息
        const timeMatch = line.match(/(\d+)\s*小时前/);
        const publishedAt = new Date();
        if (timeMatch) {
          publishedAt.setHours(publishedAt.getHours() - parseInt(timeMatch[1]));
        }

        // 构建文章内容（把包含这个链接的上下文也带上）
        let articleContent = `# ${title}\n\n`;
        if (summary) {
          articleContent += `> ${summary}\n\n`;
        }
        articleContent += `原文链接: ${url}\n`;

        articles.push({
          title,
          category: currentCategory,
          url,
          content: articleContent,
          summary: summary || title,
          published_at: publishedAt
        });
      }

      i++;
    }

    // 去重（按URL）
    const seen = new Set<string>();
    return articles.filter(a => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });
  }
}
