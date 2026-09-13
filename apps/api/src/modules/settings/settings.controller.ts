import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AuditLog } from '../../common/interceptors/audit.interceptor';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  findAll() {
    return this.settingsService.findAllSettings();
  }

  @Patch(':key')
  @AuditLog('UPDATE_SETTING', 'Setting')
  update(@Param('key') key: string, @Body('value') value: any) {
    return this.settingsService.updateSetting(key, value);
  }

  @Get('integrations')
  getIntegrations() {
    return this.settingsService.getIntegrationStatus();
  }

  @Get('email-templates')
  getEmailTemplates() {
    return this.settingsService.findAllTemplates();
  }

  @Patch('email-templates/:id')
  updateEmailTemplate(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateTemplate(id, data);
  }

  @Get('delinquency')
  getDelinquency() {
    return this.settingsService.getDelinquencyConfig();
  }

  @Get('trial')
  getTrial() {
    return this.settingsService.getTrialCommunicationConfig();
  }
}
