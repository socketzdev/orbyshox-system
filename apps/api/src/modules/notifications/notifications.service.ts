import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(@Inject('PRISMA') private prisma: PrismaClient) {}

  async sendEmail(to: string, templateSlug: string, variables: any) {
    const template = await this.prisma.emailTemplate.findUnique({ where: { slug: templateSlug } });
    if (!template) {
      this.logger.warn(`Template ${templateSlug} not found`);
      return;
    }
    // Mock sending email
    this.logger.log(`Sending email to ${to} using template ${templateSlug}`);
  }

  async sendWelcome(tenant: any) { return this.sendEmail(tenant.email, 'welcome', { name: tenant.companyName }); }
  async sendTrialEnding(tenant: any, daysLeft: number) { return this.sendEmail(tenant.email, 'trial-ending', { name: tenant.companyName, daysLeft }); }
  async sendPaymentFailed(tenant: any, amount: number) { return this.sendEmail(tenant.email, 'payment-failed', { name: tenant.companyName, amount }); }
  async sendAccountSuspended(tenant: any, reason: string) { return this.sendEmail(tenant.email, 'account-suspended', { name: tenant.companyName, reason }); }

  async sendTicketCreated(ticket: { id: string; subject: string }, tenant: any, recipient?: string) {
    return this.sendEmail(recipient || tenant.email, 'ticket-created', {
      name: tenant.companyName,
      ticketId: ticket.id.slice(0, 8),
      subject: ticket.subject,
    });
  }
  async sendTicketAssigned(ticket: { id: string; subject: string }, assignee: { name: string; email: string }, tenant: any) {
    return this.sendEmail(assignee.email, 'ticket-assigned', {
      name: assignee.name,
      ticketId: ticket.id.slice(0, 8),
      subject: ticket.subject,
      company: tenant.companyName,
    });
  }
  async sendSlaWarning(ticket: { id: string; subject: string }, recipient: { name: string; email: string }) {
    return this.sendEmail(recipient.email, 'ticket-sla-warning', {
      name: recipient.name,
      ticketId: ticket.id.slice(0, 8),
      subject: ticket.subject,
    });
  }
  async sendSlaBreach(ticket: { id: string; subject: string }, recipient: { name: string; email: string }) {
    return this.sendEmail(recipient.email, 'ticket-sla-breach', {
      name: recipient.name,
      ticketId: ticket.id.slice(0, 8),
      subject: ticket.subject,
    });
  }
  async sendInternalNote(ticket: { id: string; subject: string }, recipient: { name: string; email: string }) {
    return this.sendEmail(recipient.email, 'ticket-message-internal', {
      name: recipient.name,
      ticketId: ticket.id.slice(0, 8),
      subject: ticket.subject,
    });
  }
}
