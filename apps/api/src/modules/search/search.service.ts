import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export type SearchResultKind = 'tenant' | 'ticket' | 'invoice' | 'article';

export interface SearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  detail: string;
  status?: string;
  href: string;
}

@Injectable()
export class SearchService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async search(rawQuery: string, rawLimit = 5) {
    const query = String(rawQuery || '').trim().slice(0, 80);
    const limit = Math.min(Math.max(Number(rawLimit) || 5, 1), 8);

    if (query.length < 2) {
      return { query, data: [], total: 0 };
    }

    const lowered = query.toLowerCase();
    const contains = { contains: lowered };

    const [tenants, tickets, invoices, articles] = await Promise.all([
      this.prisma.tenant.findMany({
        where: {
          OR: [
            { companyName: contains },
            { tradeName: contains },
            { email: contains },
            { slug: contains },
            { cnpj: contains },
            { phone: contains },
          ],
        },
        select: {
          id: true,
          companyName: true,
          tradeName: true,
          email: true,
          niche: true,
          status: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.ticket.findMany({
        where: {
          OR: [
            { subject: contains },
            { tenant: { companyName: contains } },
          ],
        },
        select: {
          id: true,
          subject: true,
          category: true,
          priority: true,
          status: true,
          tenant: { select: { companyName: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.invoice.findMany({
        where: {
          OR: [
            { id: contains },
            { stripeInvoiceId: contains },
            { tenant: { companyName: contains } },
          ],
        },
        select: {
          id: true,
          amountCents: true,
          status: true,
          dueDate: true,
          tenant: { select: { companyName: true } },
        },
        orderBy: { dueDate: 'desc' },
        take: limit,
      }),
      this.prisma.knowledgeArticle.findMany({
        where: {
          OR: [
            { title: contains },
            { content: contains },
            { category: contains },
          ],
        },
        select: {
          id: true,
          title: true,
          category: true,
          isPublished: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
    ]);

    const data: SearchResult[] = [
      ...tenants.map((tenant) => ({
        id: tenant.id,
        kind: 'tenant' as const,
        title: tenant.companyName,
        subtitle: tenant.tradeName || tenant.email,
        detail: `${this.formatNiche(tenant.niche)} · ${this.formatTenantStatus(tenant.status)}`,
        status: tenant.status,
        href: `/tenants/${tenant.id}`,
      })),
      ...tickets.map((ticket) => ({
        id: ticket.id,
        kind: 'ticket' as const,
        title: ticket.subject,
        subtitle: ticket.tenant.companyName,
        detail: `${this.formatTicketCategory(ticket.category)} · Prioridade ${this.formatPriority(ticket.priority)}`,
        status: ticket.status,
        href: `/tickets/${ticket.id}`,
      })),
      ...invoices.map((invoice) => ({
        id: invoice.id,
        kind: 'invoice' as const,
        title: `Fatura #${invoice.id.slice(0, 8).toUpperCase()}`,
        subtitle: invoice.tenant.companyName,
        detail: `${this.formatCurrency(invoice.amountCents)} · vence em ${this.formatDate(invoice.dueDate)}`,
        status: invoice.status,
        href: `/billing/invoices?search=${encodeURIComponent(invoice.id)}`,
      })),
      ...articles.map((article) => ({
        id: article.id,
        kind: 'article' as const,
        title: article.title,
        subtitle: article.category || 'Base de conhecimento',
        detail: article.isPublished ? 'Publicado' : 'Rascunho',
        status: article.isPublished ? 'PUBLISHED' : 'DRAFT',
        href: `/knowledge/${article.id}/edit`,
      })),
    ];

    return { query, data, total: data.length };
  }

  private formatCurrency(amountCents: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amountCents / 100);
  }

  private formatDate(date: Date) {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
      .format(date)
      .replace('.', '');
  }

  private formatNiche(niche: string) {
    return {
      RESTAURANT: 'Restaurante',
      BARBERSHOP: 'Barbearia',
      SUPERMARKET: 'Supermercado',
      UNIVERSAL: 'Universal',
    }[niche] || niche;
  }

  private formatTenantStatus(status: string) {
    return {
      TRIAL: 'Trial',
      ACTIVE: 'Ativo',
      PAST_DUE: 'Em atraso',
      SUSPENDED: 'Suspenso',
      CANCELED: 'Cancelado',
    }[status] || status;
  }

  private formatTicketCategory(category: string) {
    return {
      FINANCIAL: 'Financeiro',
      TECHNICAL: 'Técnico',
      USAGE_QUESTION: 'Dúvida de uso',
      FEATURE_REQUEST: 'Solicitação',
    }[category] || category;
  }

  private formatPriority(priority: string) {
    return {
      CRITICAL: 'crítica',
      HIGH: 'alta',
      MEDIUM: 'média',
      LOW: 'baixa',
    }[priority] || priority.toLowerCase();
  }
}
