import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { AiService, ChatRequestDto } from './ai.service';
import { AiToolsService } from './ai-tools.service';
import { AiConversationsService } from './ai-conversations.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiToolsService: AiToolsService,
    private readonly conversations: AiConversationsService,
  ) {}

  /** Empresa do usuário — toda conversa é isolada por aqui. */
  private companyIdOf(user: any): string {
    const companyId = user?.companyId || user?.tenantId;
    if (!companyId) throw new UnauthorizedException('Usuário não vinculado a uma empresa');
    return companyId;
  }

  @Post('chat')
  async chat(@CurrentUser() user: any, @Body() body: ChatRequestDto) {
    if (!user) throw new UnauthorizedException();
    return this.aiService.processChat(user, body);
  }

  // ─── Histórico de conversas ───
  // Toda rota resolve a empresa pelo token e repassa ao serviço, que filtra
  // por `companyId` em cada consulta — um id de outra empresa não abre nada.

  @Get('conversations')
  async listConversations(@CurrentUser() user: any, @Query('archived') archived?: string) {
    return this.conversations.list(this.companyIdOf(user), user?.sub || user?.id, {
      archived: archived === 'true',
    });
  }

  @Post('conversations')
  async createConversation(@CurrentUser() user: any, @Body('model') model?: string) {
    return this.conversations.create(this.companyIdOf(user), {
      tenantId: user?.tenantId,
      userId: user?.sub || user?.id,
      model,
    });
  }

  @Get('conversations/:id')
  async getConversation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.conversations.get(this.companyIdOf(user), id);
  }

  @Patch('conversations/:id')
  async renameConversation(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('title') title: string,
  ) {
    return this.conversations.rename(this.companyIdOf(user), id, title);
  }

  @Patch('conversations/:id/pin')
  async togglePin(@CurrentUser() user: any, @Param('id') id: string) {
    return this.conversations.togglePin(this.companyIdOf(user), id);
  }

  @Patch('conversations/:id/archive')
  async archiveConversation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.conversations.archive(this.companyIdOf(user), id);
  }

  @Delete('conversations/:id')
  async removeConversation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.conversations.remove(this.companyIdOf(user), id);
  }

  @Delete('conversations')
  async clearConversations(@CurrentUser() user: any) {
    return this.conversations.clearAll(this.companyIdOf(user));
  }

  @Get('tools')
  async listTools(@CurrentUser() user: any) {
    if (!user) throw new UnauthorizedException();
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    return this.aiToolsService.getToolDefinitions(isSuperAdmin ? 'GLOBAL' : 'TENANT');
  }

  @Get('suggestions')
  async getSuggestions(@CurrentUser() user: any, @Query('niche') niche?: string) {
    return this.aiService.getSuggestions(niche);
  }
}
