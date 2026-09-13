import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class SettingsService {
  constructor(@Inject('PRISMA') private prisma: PrismaClient) {}

  async findAllSettings(): Promise<Record<string, any>> {
    const rows = await this.prisma.systemSetting.findMany();
    return rows.reduce<Record<string, any>>((acc, row) => {
      try {
        acc[row.key] = JSON.parse(row.value as string);
      } catch {
        acc[row.key] = row.value;
      }
      return acc;
    }, {});
  }

  async getSetting(key: string) { return this.prisma.systemSetting.findUnique({ where: { key } }); }
  async updateSetting(key: string, value: any, userId?: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, updatedById: userId },
      update: { value, updatedById: userId }
    });
  }

  async findAllTemplates() { return this.prisma.emailTemplate.findMany(); }
  async findTemplate(slug: string) { return this.prisma.emailTemplate.findUnique({ where: { slug }}); }
  async updateTemplate(id: string, data: any) { return this.prisma.emailTemplate.update({ where: { id }, data }); }
  
  async getIntegrationStatus() {
    return [
      { name: 'Stripe', status: 'ACTIVE' },
      { name: 'Resend', status: 'ACTIVE' }
    ];
  }

  async getDelinquencyConfig() {
    return this.getSetting('delinquency_config');
  }

  async updateDelinquencyConfig(data: { suspend_days: number; cancel_days: number }, userId?: string) {
    return this.updateSetting('delinquency_config', data, userId);
  }

  async getTrialCommunicationConfig() {
    return this.getSetting('trial_communication_config');
  }

  async updateTrialCommunicationConfig(data: any, userId?: string) {
    return this.updateSetting('trial_communication_config', data, userId);
  }
}
