import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Persistência do histórico do Copiloto.
 *
 * Cada conversa pertence a uma empresa (`companyId`) e, quando disponível, a um
 * usuário. O isolamento por empresa é obrigatório: sem ele, um operador
 * conseguiria ler a conversa de outro tenant passando um `conversationId`.
 *
 * Toda consulta por id passa por `findFirst({ id, companyId })` — nunca
 * `findUnique({ id })` — para que o escopo não possa ser contornado.
 */
@Injectable()
export class AiConversationsService {
  private readonly logger = new Logger(AiConversationsService.name);

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /** Lista as conversas da empresa, mais recentes primeiro. */
  async list(companyId: string, userId?: string, options: { archived?: boolean } = {}) {
    if (!companyId) return [];

    const conversations = await this.prisma.aiConversation.findMany({
      where: {
        companyId,
        archived: options.archived === true,
      },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: 60,
      select: {
        id: true,
        title: true,
        model: true,
        pinned: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      model: c.model,
      pinned: c.pinned,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
    }));
  }

  /** Abre uma conversa com todas as mensagens. */
  async get(companyId: string, conversationId: string) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, companyId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    return {
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      pinned: conversation.pinned,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        thought: m.thought ?? undefined,
        toolsUsed: this.parseJson(m.toolsUsed),
        resultsSummary: this.parseJson(m.resultsSummary),
        modelUsed: m.modelUsed ?? undefined,
        usedFallback: m.usedFallback,
        timestamp: m.createdAt,
      })),
    };
  }

  /** Cria uma conversa vazia. O título é definido na primeira mensagem. */
  async create(companyId: string, data: { tenantId?: string; userId?: string; model?: string } = {}) {
    if (!companyId) throw new NotFoundException('Empresa não identificada');

    return this.prisma.aiConversation.create({
      data: {
        companyId,
        tenantId: data.tenantId || null,
        userId: data.userId || null,
        model: data.model || null,
        title: 'Nova conversa',
      },
      select: { id: true, title: true, model: true, createdAt: true },
    });
  }

  /**
   * Grava uma mensagem e atualiza o título na primeira do usuário.
   *
   * O título sai da primeira fala do usuário, truncado — é o que aparece na
   * lista lateral, então precisa ser curto e reconhecível.
   */
  async appendMessage(
    companyId: string,
    conversationId: string,
    message: {
      role: 'user' | 'model';
      text: string;
      thought?: string;
      toolsUsed?: any;
      resultsSummary?: any;
      modelUsed?: string;
      usedFallback?: boolean;
    },
  ) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true, title: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    const created = await this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: message.role,
        text: message.text,
        thought: message.thought || null,
        toolsUsed: message.toolsUsed ? JSON.stringify(message.toolsUsed) : null,
        resultsSummary: message.resultsSummary ? JSON.stringify(message.resultsSummary) : null,
        modelUsed: message.modelUsed || null,
        usedFallback: message.usedFallback === true,
      },
    });

    // Só a primeira mensagem do usuário renomeia a conversa.
    const shouldRename =
      message.role === 'user' && (!conversation.title || conversation.title === 'Nova conversa');

    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        ...(shouldRename ? { title: this.buildTitle(message.text) } : {}),
        ...(message.modelUsed ? { model: message.modelUsed } : {}),
      },
    });

    return { id: created.id, createdAt: created.createdAt, title: shouldRename ? this.buildTitle(message.text) : undefined };
  }

  /** Renomeia uma conversa. */
  async rename(companyId: string, conversationId: string, title: string) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    const clean = String(title || '').trim().slice(0, 120);
    return this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { title: clean || 'Nova conversa' },
      select: { id: true, title: true },
    });
  }

  /** Fixa/desafixa a conversa no topo da lista. */
  async togglePin(companyId: string, conversationId: string) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true, pinned: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    return this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { pinned: !conversation.pinned },
      select: { id: true, pinned: true },
    });
  }

  /** Arquiva (some da lista principal sem perder histórico). */
  async archive(companyId: string, conversationId: string) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { archived: true },
    });
    return { ok: true };
  }

  /** Remove a conversa e, por cascata, suas mensagens. */
  async remove(companyId: string, conversationId: string) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    await this.prisma.aiConversation.delete({ where: { id: conversationId } });
    return { ok: true };
  }

  /** Apaga todas as conversas da empresa. */
  async clearAll(companyId: string) {
    const result = await this.prisma.aiConversation.deleteMany({ where: { companyId } });
    return { ok: true, removed: result.count };
  }

  /** Título curto e legível a partir da primeira fala. */
  private buildTitle(text: string): string {
    const clean = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return 'Nova conversa';
    return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
  }

  /** JSON corrompido no banco não pode derrubar a leitura do histórico. */
  private parseJson(raw: string | null): any {
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      this.logger.warn('Campo JSON inválido em AiMessage — ignorado');
      return undefined;
    }
  }
}
