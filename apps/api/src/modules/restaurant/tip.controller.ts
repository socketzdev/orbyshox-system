import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import {
  canRead,
  canUpdate,
  canApprove,
} from '../../common/rbac/policies';

/**
 * Caixinha dos 10% (taxa de serviço).
 *
 * Regra principal: Nota → 10% pago → Caixa 10% → divisão → participantes.
 * NÃO existe rota de criação avulsa de propósito: o 10% nasce 1:1 com a
 * comanda dentro do fechamento (`closeTableSession`), então é impossível
 * inventar pagamento sem nota. Ajuste/exclusão exigem motivo + deixam trilha.
 */
@Controller('restaurant/tips')
export class TipController {
  constructor(private readonly restaurantService: RestaurantService) {}

  private extractCompanyId(user: any): string {
    const companyId = user?.companyId || user?.tenantId;
    if (!companyId) {
      throw new UnauthorizedException('Usuário não vinculado a uma empresa');
    }
    return companyId;
  }

  private operator(user: any) {
    return { id: user?.id || user?.sub, name: user?.name };
  }

  /** Taxa vigente (leitura liberada p/ o garçom montar o pagamento). */
  @Get('rate')
  async rate(@CurrentUser() user: any) {
    const config = await this.restaurantService.getTipConfig(this.extractCompanyId(user));
    return { percentBps: (config as any).percentBps, active: (config as any).active };
  }

  /** Saldo do caixa 10% + semana + config (dono/gerente). */
  @Get('summary')
  @CheckPolicies(canApprove('Order'))
  async summary(@CurrentUser() user: any) {
    return this.restaurantService.getTipsSummary(this.extractCompanyId(user));
  }

  /** Histórico de pagamentos (dono/gerente). */
  @Get('history')
  @CheckPolicies(canApprove('Order'))
  async history(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.restaurantService.listTipPayments(this.extractCompanyId(user), { status, search });
  }

  /** Config da taxa e cargos participantes (dono/gerente). */
  @Get('config')
  @CheckPolicies(canApprove('Order'))
  async config(@CurrentUser() user: any) {
    return this.restaurantService.getTipConfig(this.extractCompanyId(user));
  }

  @Post('config')
  @CheckPolicies(canUpdate('StoreSettings'))
  async saveConfig(
    @CurrentUser() user: any,
    @Body() body: { percentBps?: number; eligibleRoles?: string[]; active?: boolean },
  ) {
    return this.restaurantService.updateTipConfig(this.extractCompanyId(user), body);
  }

  /** Prévia da divisão semanal (dono/gerente). */
  @Get('payout-preview')
  @CheckPolicies(canApprove('Order'))
  async payoutPreview(@CurrentUser() user: any) {
    return this.restaurantService.getPayoutPreview(this.extractCompanyId(user));
  }

  /** Histórico de divisões (dono/gerente). */
  @Get('payouts')
  @CheckPolicies(canApprove('Order'))
  async payouts(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.restaurantService.listPayouts(
      this.extractCompanyId(user),
      limit ? Number(limit) : 30,
    );
  }

  /** Confirma a divisão semanal e baixa o caixa (dono/gerente). */
  @Post('payouts')
  @CheckPolicies(canApprove('Order'))
  async createPayout(@CurrentUser() user: any) {
    return this.restaurantService.createPayout(this.extractCompanyId(user), this.operator(user));
  }

  /** Detalhe + nota original (dono/gerente). */
  @Get('history/:id')
  @CheckPolicies(canApprove('Order'))
  async detail(@CurrentUser() user: any, @Param('id') id: string) {
    return this.restaurantService.getTipPayment(this.extractCompanyId(user), id);
  }

  /** Ajusta valor/forma com motivo obrigatório + trilha (dono/gerente). */
  @Patch('history/:id')
  @CheckPolicies(canApprove('Order'))
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { paidCents?: number; paymentMethod?: string; reason: string },
  ) {
    return this.restaurantService.updateTipPayment(
      this.extractCompanyId(user),
      id,
      body,
      this.operator(user),
    );
  }

  /** Exclui com motivo obrigatório + trilha (dono/gerente). */
  @Delete('history/:id')
  @CheckPolicies(canApprove('Order'))
  async remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.restaurantService.deleteTipPayment(
      this.extractCompanyId(user),
      id,
      body?.reason,
      this.operator(user),
    );
  }

  /** Garçom consulta o próprio acumulado? Não — leitura é só gestão. */
  @Get('my-total')
  @CheckPolicies(canRead('Order'))
  async myTotal(@CurrentUser() user: any) {
    const companyId = this.extractCompanyId(user);
    const preview = await this.restaurantService.getPayoutPreview(companyId);
    const me = (preview.participants as any[]).find(
      (p) => p.userId === (user?.id || user?.sub),
    );
    return {
      participant: Boolean(me),
      amountCents: me?.amountCents ?? 0,
      totalCents: preview.totalCents,
    };
  }
}
