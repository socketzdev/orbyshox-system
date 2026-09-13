import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class KnowledgeService {
  constructor(@Inject('PRISMA') private prisma: PrismaClient) {}

  async listArticles(params: { search?: string; category?: string; isPublished?: boolean; page: number; limit: number }) {
    const { search, category, isPublished, page, limit } = params;
    
    const where: any = {};
    if (category) where.category = category;
    if (isPublished !== undefined) where.isPublished = isPublished;
    if (search) {
      // SQLite (provider atual) não suporta `mode: 'insensitive'` — o Prisma
      // rejeita a query com "Unknown argument `mode`" e a busca quebrava com 500.
      // `contains` no SQLite já é case-insensitive para ASCII (LIKE), então a
      // semântica é preservada sem o modificador. Ao migrar para PostgreSQL,
      // reative `mode: 'insensitive'` nos dois campos.
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.knowledgeArticle.findMany({
        where,
        skip: Number(skip),
        take: Number(limit),
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.knowledgeArticle.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listCategories() {
    const categories = await this.prisma.knowledgeArticle.findMany({
      select: { category: true },
      distinct: ['category'],
      where: { category: { not: '' } }
    });
    return categories.map(c => c.category).filter(Boolean);
  }

  async getArticle(id: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
    });
    if (!article) throw new NotFoundException(`Article with ID ${id} not found`);
    return article;
  }

  async createArticle(data: { title: string; content: string; category?: string; isPublished?: boolean; authorId?: string }) {
    const fallbackAuthor = await this.prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    });
    return this.prisma.knowledgeArticle.create({
      data: {
        title: data.title,
        content: data.content,
        category: data.category || 'Geral',
        isPublished: data.isPublished ?? true,
        authorId: data.authorId || fallbackAuthor?.id || '',
      },
    });
  }

  async updateArticle(id: string, data: Partial<{ title: string; content: string; category: string; isPublished: boolean }>) {
    await this.getArticle(id); // Check exists
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data,
    });
  }

  async deleteArticle(id: string) {
    await this.getArticle(id);
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: { isPublished: false },
    });
  }
}
