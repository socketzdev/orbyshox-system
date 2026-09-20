import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { RestaurantService, CreateOrderDto } from './restaurant.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import {
  canCreate,
  canUpdate,
  canManage,
} from '../../common/rbac/policies';

@Controller('restaurant')
export class RestaurantController {
  constructor(private readonly restaurantService: RestaurantService) {}

  private extractCompanyId(user: any): string {
    const companyId = user?.companyId || user?.tenantId;
    if (!companyId) {
      throw new UnauthorizedException('Usuário não vinculado a uma empresa');
    }
    return companyId;
  }

  // ─── Rotas do Salão / Gestão do Restaurante (Requer Autenticação Staff) ────

  @Get('tables')
  async getTables(@CurrentUser() user: any) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.listTables(companyId);
  }

  @Post('tables')
  @CheckPolicies(canManage('Table'))
  async createTable(
    @CurrentUser() user: any,
    @Body() body: { number: number; label?: string; capacity?: number },
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.createTable(companyId, body);
  }

  @Post('tables/batch')
  @CheckPolicies(canManage('Table'))
  async batchCreateTables(
    @CurrentUser() user: any,
    @Body() body: { count: number; capacity?: number; startNumber?: number },
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.batchCreateTables(companyId, body);
  }

  @Post('tables/:id/devices')
  @CheckPolicies(canManage('Table'))
  async pairDevice(
    @CurrentUser() user: any,
    @Param('id') tableId: string,
    @Body() body: { deviceName?: string },
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.pairDevice(companyId, tableId, body.deviceName);
  }

  @Post('tables/:id/rotate-qr')
  @CheckPolicies(canManage('Table'))
  async rotateQr(@CurrentUser() user: any, @Param('id') tableId: string) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.rotateTableQr(companyId, tableId);
  }

  /**
   * Fecha a comanda. O `payment` vem do modal de forma de pagamento e é o que
   * faz a linha "Pagamento" aparecer no cupom — antes o corpo era ignorado e o
   * recibo saía sem forma de pagamento nenhuma.
   */
  @Post('tables/:id/close-session')
  @CheckPolicies(canUpdate('TableSession'))
  async closeSession(
    @CurrentUser() user: any,
    @Param('id') tableId: string,
    @Body()
    body?: {
      paymentMethod?: string;
      method?: string;
      amountReceivedCents?: number;
      notes?: string;
      tip?: { paidCents?: number; method?: string };
    },
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.closeTableSession(
      companyId,
      tableId,
      {
        // Aceita as duas grafias: `method` é o nome curto usado pelo modal e
        // `paymentMethod` é o nome histórico da API.
        method: body?.method ?? body?.paymentMethod,
        amountReceivedCents: body?.amountReceivedCents,
        notes: body?.notes,
        // 10%: consumo → caixa da empresa, 10% → caixinha separado.
        tip: body?.tip ? { paidCents: body.tip.paidCents, method: body.tip.method } : undefined,
      },
      { id: user?.id || user?.sub, name: user?.name },
    );
  }

  /**
   * Gera a cobrança PIX (BR Code e payload Copia e Cola) para o valor da comanda
   * em aberto da mesa ou um valor customizado.
   */
  @Get('tables/:id/pix-charge')
  async getTablePixCharge(
    @CurrentUser() user: any,
    @Param('id') tableId: string,
    @Query('amountCents') amountCents?: string,
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.getTablePixCharge(
      companyId,
      tableId,
      amountCents ? Number(amountCents) : undefined,
    );
  }

  @Post('tables/:id/open-session')
  @CheckPolicies(canCreate('TableSession'))
  async openSession(
    @CurrentUser() user: any,
    @Param('id') tableId: string,
    @Body() body: { customerCount?: number; notes?: string; comandaName?: string; waiterName?: string; waiterId?: string },
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.openTableSession(companyId, tableId, body);
  }

  @Get('tables/:id/session')
  async getTableSession(@CurrentUser() user: any, @Param('id') tableId: string) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.getTableSession(companyId, tableId);
  }

  @Post('tables/:id/orders')
  @CheckPolicies(canCreate('Order'))
  async addTableOrder(
    @CurrentUser() user: any,
    @Param('id') tableId: string,
    @Body() orderDto: CreateOrderDto,
  ) {
    const companyId = this.extractCompanyId(user);
    // Garçom responsável: o front manda `waiterName`/`waiterId`, mas se vier
    // vazio cai no usuário logado — o KDS e o alerta no celular dependem disso.
    // O ID é o vínculo confiável (nome pode repetir entre garçons).
    const waiterName =
      (orderDto as any)?.waiterName?.trim?.() || user?.name?.trim?.() || null;
    const waiterId = (orderDto as any)?.waiterId?.trim?.() || user?.id || null;
    return this.restaurantService.createOrder(
      { companyId, tableId },
      { ...orderDto, origin: 'WAITER', waiterName, waiterId },
    );
  }

  @Post('tables/:id/transfer')
  @CheckPolicies(canUpdate('TableSession'))
  async transferTable(
    @CurrentUser() user: any,
    @Param('id') fromTableId: string,
    @Body('toTableId') toTableId: string,
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.transferTable(companyId, fromTableId, toTableId);
  }

  @Patch('tables/:id')
  @CheckPolicies(canManage('Table'))
  async updateTable(
    @CurrentUser() user: any,
    @Param('id') tableId: string,
    @Body() body: { number?: number; label?: string; capacity?: number },
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.updateTable(companyId, tableId, body);
  }

  @Delete('tables/:id')
  @CheckPolicies(canManage('Table'))
  async deleteTable(@CurrentUser() user: any, @Param('id') tableId: string) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.deleteTable(companyId, tableId);
  }

  @Get('menu')
  async getMenu(@CurrentUser() user: any) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.getCompanyMenu(companyId);
  }

  @Post('products')
  @CheckPolicies(canCreate('Product'))
  async createProduct(@CurrentUser() user: any, @Body() body: any) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.createProduct(companyId, body);
  }

  @Post('categories')
  @CheckPolicies(canUpdate('Product'))
  async createCategory(@CurrentUser() user: any, @Body() body: any) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.createCategory(companyId, body);
  }

  @Delete('categories/:categoryId')
  @CheckPolicies(canUpdate('Product'))
  async deleteCategory(@CurrentUser() user: any, @Param('categoryId') categoryId: string) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.deleteCategory(companyId, categoryId);
  }


  // Declarado antes de qualquer rota com parâmetro para não ser confundido
  // com um id de pedido.
  @Get('orders/stats')
  async getKitchenStats(@CurrentUser() user: any) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.getKitchenStats(companyId);
  }

  @Get('orders')
  async listOrders(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('tableId') tableId?: string,
    @Query('active') active?: string,
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.listOrders(companyId, {
      status,
      tableId,
      active: active === '1' || active === 'true',
    });
  }

  @Patch('orders/:id/status')
  @CheckPolicies(canUpdate('Order'))
  async updateOrderStatus(
    @CurrentUser() user: any,
    @Param('id') orderId: string,
    @Body('status') newStatus: string,
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.updateOrderStatus(companyId, orderId, newStatus);
  }

  @Patch('orders/:id/notes')
  @CheckPolicies(canUpdate('Order'))
  async updateOrderNotes(
    @CurrentUser() user: any,
    @Param('id') orderId: string,
    @Body('notes') notes: string,
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.updateOrderNotes(companyId, orderId, notes);
  }

  // ─── Correção de lançamento ───
  // O garçom não conseguia corrigir um item errado: só dava para cancelar a
  // comanda toda. Estes dois endpoints permitem ajustar quantidade e remover
  // item preservando o restante do pedido.

  @Patch('orders/:id/items/:itemId')
  @CheckPolicies(canUpdate('Order'))
  async updateOrderItem(
    @CurrentUser() user: any,
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body('quantity') quantity: number,
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.updateOrderItem(companyId, orderId, itemId, Number(quantity));
  }

  @Delete('orders/:id/items/:itemId')
  @CheckPolicies(canUpdate('Order'))
  async removeOrderItem(
    @CurrentUser() user: any,
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.removeOrderItem(companyId, orderId, itemId);
  }

  @Patch('waiter-calls/:id/answer')
  @CheckPolicies(canUpdate('WaiterCall'))
  async answerWaiterCall(@CurrentUser() user: any, @Param('id') callId: string) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.answerWaiterCall(companyId, callId);
  }

  @Post('waiter-calls/:id/answer')
  @CheckPolicies(canUpdate('WaiterCall'))
  async answerWaiterCallPost(@CurrentUser() user: any, @Param('id') callId: string) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.answerWaiterCall(companyId, callId);
  }

  // ─── Rotas do Cliente via QR Code (Zero-Trust via Hash de Token Opaco) ─────

  @Public()
  @Get('public/qr/:qrToken')
  async getTableByQr(@Param('qrToken') qrToken: string) {
    return this.restaurantService.resolveByQrToken(qrToken);
  }

  @Public()
  @Post('public/qr/:qrToken/order')
  async createOrderByQr(
    @Param('qrToken') qrToken: string,
    @Body() orderDto: CreateOrderDto,
  ) {
    const resolved = await this.restaurantService.resolveByQrToken(qrToken);
    return this.restaurantService.createOrder(
      { companyId: resolved.company.id, tableId: resolved.table.id },
      { ...orderDto, origin: 'QR_CODE' },
    );
  }

  @Public()
  @Post('public/qr/:qrToken/call-waiter')
  async callWaiterByQr(
    @Param('qrToken') qrToken: string,
    @Body('type') type: 'ASSISTANCE' | 'BILL' = 'ASSISTANCE',
  ) {
    const resolved = await this.restaurantService.resolveByQrToken(qrToken);
    return this.restaurantService.callWaiter(
      { companyId: resolved.company.id, tableId: resolved.table.id },
      type,
    );
  }

  // ─── Rotas do Tablet Fixo de Mesa (Autenticado via Device Token) ───────────

  @Public()
  @Get('device/:deviceToken')
  async getTableByDevice(@Param('deviceToken') deviceToken: string) {
    return this.restaurantService.resolveByDeviceToken(deviceToken);
  }

  @Public()
  @Post('device/:deviceToken/order')
  async createOrderByDevice(
    @Param('deviceToken') deviceToken: string,
    @Body() orderDto: CreateOrderDto,
  ) {
    const resolved = await this.restaurantService.resolveByDeviceToken(deviceToken);
    return this.restaurantService.createOrder(
      { companyId: resolved.company.id, tableId: resolved.table.id },
      { ...orderDto, origin: 'TABLET' },
    );
  }

  @Public()
  @Post('device/:deviceToken/call-waiter')
  async callWaiterByDevice(
    @Param('deviceToken') deviceToken: string,
    @Body('type') type: 'ASSISTANCE' | 'BILL' = 'ASSISTANCE',
  ) {
    const resolved = await this.restaurantService.resolveByDeviceToken(deviceToken);
    return this.restaurantService.callWaiter(
      { companyId: resolved.company.id, tableId: resolved.table.id },
      type,
    );
  }
}
