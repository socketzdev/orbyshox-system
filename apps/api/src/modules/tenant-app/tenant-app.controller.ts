import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { TenantAppService } from './tenant-app.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantOwnershipGuard } from '../../common/guards/tenant-ownership.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  upsertBarberProfileSchema,
  UpsertBarberProfileInput,
} from '@projeto-saas/shared-types';

const ACCESS_COOKIE = 'ta_access';
const REFRESH_COOKIE = 'ta_refresh';

/** Deve espelhar os TTLs de `tenant-app.service.ts`. */
const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Remove o `refreshToken` do corpo da resposta.
 *
 * Mesmo raciocínio do AuthController: o token vive em cookie `httpOnly` e
 * devolvê-lo no JSON entregava a credencial de 30 dias ao JavaScript da página,
 * anulando a proteção contra XSS. `null` em vez de omitir a chave para não
 * quebrar clientes que testam `response.refreshToken`.
 */
function stripRefreshToken<T extends Record<string, any>>(result: T) {
  if (!result || typeof result !== 'object') return result;
  return { ...result, refreshToken: null };
}

@Controller('tenant-app/:slug')
export class TenantAppController {
  constructor(private readonly tenantAppService: TenantAppService) {}

  @Public()
  @Get('public-info')
  getPublicInfo(@Param('slug') slug: string) {
    return this.tenantAppService.getPublicInfo(slug);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('login')
  async login(
    @Param('slug') slug: string,
    @Body() loginDto: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.tenantAppService.login(slug, loginDto);
    res.cookie(ACCESS_COOKIE, result.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ACCESS_COOKIE_MAX_AGE_MS,
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/v1/tenant-app',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
    // O accessToken permanece no corpo: o front do inquilino o guarda para
    // enviar via `Authorization: Bearer` em rotas de outros slugs.
    return stripRefreshToken(result);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  async refresh(
    @Param('slug') slug: string,
    @Body() body: { refreshToken?: string },
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = req?.cookies?.[REFRESH_COOKIE];
    const token = cookieToken || body?.refreshToken || '';
    const result = await this.tenantAppService.refreshSession(slug, token);
    res.cookie(ACCESS_COOKIE, result.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ACCESS_COOKIE_MAX_AGE_MS,
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/v1/tenant-app',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
    return stripRefreshToken(result);
  }

  @Public()
  @Post('logout')
  async logout(
    @Param('slug') slug: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Antes, apenas os cookies eram limpos: o refresh token continuava válido
    // no banco por até 30 dias. Quem tivesse uma cópia do valor mantinha a
    // sessão ativa mesmo após o "logout". Agora revogamos no servidor.
    const token = req?.cookies?.[REFRESH_COOKIE] || req?.body?.refreshToken;
    await this.tenantAppService.logoutSession(slug, token);

    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/tenant-app' });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('me')
  getMe(@Param('slug') slug: string, @CurrentUser() user: any) {
    return this.tenantAppService.getCurrentUser(slug, user.sub || user.id);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('setup/complete')
  completeSetup(
    @CurrentUser() user: any,
    @Body()
    body: {
      tradeName?: string;
      phone?: string;
      category?: string;
      tableCount?: number;
      tableCapacity?: number;
      tableCapacities?: number[];
      capacityDistribution?: any;
      enableQrCode?: boolean;
      enableTablet?: boolean;
      enableWaiterCall?: boolean;
    },
  ) {
    const userId = user?.id || user?.sub;
    return this.tenantAppService.completeSetup(userId, body);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('dashboard')
  getDashboard(@Param('slug') slug: string) {
    return this.tenantAppService.getDashboard(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('dashboard/supermarket')
  getSupermarketDashboard(@Param('slug') slug: string) {
    return this.tenantAppService.getSupermarketDashboard(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('products')
  getProducts(@Param('slug') slug: string) {
    return this.tenantAppService.getProducts(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('products')
  createProduct(@Param('slug') slug: string, @Body() data: any) {
    return this.tenantAppService.createProduct(slug, data);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('categories')
  createCategory(@Param('slug') slug: string, @Body() data: any) {
    return this.tenantAppService.createCategory(slug, data);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('products/:productId')
  updateProduct(
    @Param('slug') slug: string,
    @Param('productId') productId: string,
    @Body() data: any,
  ) {
    return this.tenantAppService.updateProduct(slug, productId, data);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('orders')
  getOrders(@Param('slug') slug: string) {
    return this.tenantAppService.getOrders(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('orders')
  createOrder(@Param('slug') slug: string, @Body() data: any) {
    return this.tenantAppService.createOrder(slug, data);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('customers')
  getCustomers(@Param('slug') slug: string) {
    return this.tenantAppService.getCustomers(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('customers')
  createCustomer(@Param('slug') slug: string, @Body() data: any) {
    return this.tenantAppService.createCustomer(slug, data);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('cash-register')
  getCashRegister(@Param('slug') slug: string) {
    return this.tenantAppService.getCashRegister(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('cash-register/open')
  openCashRegister(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Body() data: any,
  ) {
    return this.tenantAppService.openCashRegister(slug, user.sub || user.id, data);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('cash-register/close')
  closeCashRegister(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Body() data: any,
  ) {
    return this.tenantAppService.closeCashRegister(slug, user.sub || user.id, data);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('cash-register/movement')
  addCashMovement(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Body() data: any,
  ) {
    return this.tenantAppService.addCashMovement(slug, user.sub || user.id, data);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('automations')
  getAutomations(@Param('slug') slug: string) {
    return this.tenantAppService.getAutomations(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('automations/notifications/:id/read')
  markNotificationRead(
    @Param('slug') slug: string,
    @Param('id') notificationId: string,
  ) {
    return this.tenantAppService.markNotificationRead(slug, notificationId);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('appointments')
  getAppointments(@Param('slug') slug: string) {
    return this.tenantAppService.getAppointments(slug);
  }

  @Public()
  @Post('appointments')
  createAppointment(@Param('slug') slug: string, @Body() data: any) {
    return this.tenantAppService.createAppointment(slug, data);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('appointments/:id/status')
  updateAppointmentStatus(
    @Param('slug') slug: string,
    @Param('id') appointmentId: string,
    @Body() body: { status: string; paymentMethod?: string },
  ) {
    return this.tenantAppService.updateAppointmentStatus(
      slug,
      appointmentId,
      body.status,
      body.paymentMethod,
    );
  }

  // ─── Funcionários (Equipe do Painel do Cliente) ────────────────────────────

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('employees')
  getEmployees(@Param('slug') slug: string) {
    return this.tenantAppService.getEmployees(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('employees/:employeeId')
  getEmployee(
    @Param('slug') slug: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.tenantAppService.getEmployee(slug, employeeId);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('employees')
  createEmployee(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(createEmployeeSchema)) data: CreateEmployeeInput,
  ) {
    return this.tenantAppService.createEmployee(slug, data);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('employees/:employeeId')
  updateEmployee(
    @Param('slug') slug: string,
    @Param('employeeId') employeeId: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) data: UpdateEmployeeInput,
  ) {
    return this.tenantAppService.updateEmployee(slug, employeeId, data);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('employees/:employeeId/deactivate')
  deactivateEmployee(
    @Param('slug') slug: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.tenantAppService.setEmployeeActive(slug, employeeId, false);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('employees/:employeeId/activate')
  activateEmployee(
    @Param('slug') slug: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.tenantAppService.setEmployeeActive(slug, employeeId, true);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('employees/:employeeId')
  deleteEmployee(
    @Param('slug') slug: string,
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.deleteEmployee(slug, employeeId, user.sub || user.id);
  }

  // ─── Barbeiros (Equipe + Comissões) ───────────────────────────────────────

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('barbers')
  getBarbers(@Param('slug') slug: string) {
    return this.tenantAppService.getBarbers(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('barbers/:barberId')
  getBarber(
    @Param('slug') slug: string,
    @Param('barberId') barberId: string,
  ) {
    return this.tenantAppService.getBarber(slug, barberId);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Put('barbers/:barberId/profile')
  upsertBarberProfile(
    @Param('slug') slug: string,
    @Param('barberId') barberId: string,
    @Body(new ZodValidationPipe(upsertBarberProfileSchema)) data: UpsertBarberProfileInput,
  ) {
    return this.tenantAppService.upsertBarberProfile(slug, barberId, data);
  }

  // ─── Supermercado: Produtos, Estoque & Inventário ─────────────────────────

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('products/:productId/adjust-stock')
  adjustStock(
    @Param('slug') slug: string,
    @Param('productId') productId: string,
    @Body() body: { newQuantity: number; reason: string },
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.adjustStock(slug, productId, body, user?.sub || user?.id);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('stock/overview')
  getStockOverview(@Param('slug') slug: string) {
    return this.tenantAppService.getStockOverview(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('stock/losses')
  getStockLosses(@Param('slug') slug: string) {
    return this.tenantAppService.getStockLosses(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('stock/losses')
  createStockLoss(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.tenantAppService.createStockLoss(slug, user?.sub || user?.id, body);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('stock/movements')
  getStockMovements(
    @Param('slug') slug: string,
    @Query('productId') productId?: string,
  ) {
    return this.tenantAppService.getStockMovements(slug, productId);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('stock/inventory')
  getInventoryAudits(@Param('slug') slug: string) {
    return this.tenantAppService.getInventoryAudits(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('stock/inventory')
  createInventoryAudit(
    @Param('slug') slug: string,
    @Body() body: { notes?: string },
  ) {
    return this.tenantAppService.createInventoryAudit(slug, body?.notes);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('stock/inventory/:auditId/count')
  countInventoryItem(
    @Param('slug') slug: string,
    @Param('auditId') auditId: string,
    @Body() body: { productId: string; countedQty: number },
  ) {
    return this.tenantAppService.countInventoryItem(slug, auditId, body);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('stock/inventory/:auditId/reconcile')
  reconcileInventory(
    @Param('slug') slug: string,
    @Param('auditId') auditId: string,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.reconcileInventory(slug, auditId, user?.sub || user?.id);
  }

  // ─── Supermercado: Financeiro ─────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('finance/payables')
  getBillsPayable(
    @Param('slug') slug: string,
    @Query('status') status?: string,
  ) {
    return this.tenantAppService.getBillsPayable(slug, status);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('finance/payables')
  createBillPayable(@Param('slug') slug: string, @Body() body: any) {
    return this.tenantAppService.createBillPayable(slug, body);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('finance/payables/:id/pay')
  payBill(@Param('slug') slug: string, @Param('id') id: string) {
    return this.tenantAppService.payBill(slug, id);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('finance/payables/:id')
  deleteBillPayable(@Param('slug') slug: string, @Param('id') id: string) {
    return this.tenantAppService.deleteBillPayable(slug, id);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('finance/receivables')
  getBillsReceivable(
    @Param('slug') slug: string,
    @Query('status') status?: string,
  ) {
    return this.tenantAppService.getBillsReceivable(slug, status);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('finance/receivables')
  createBillReceivable(@Param('slug') slug: string, @Body() body: any) {
    return this.tenantAppService.createBillReceivable(slug, body);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('finance/receivables/:id/receive')
  receiveBill(@Param('slug') slug: string, @Param('id') id: string) {
    return this.tenantAppService.receiveBill(slug, id);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('finance/receivables/:id')
  deleteBillReceivable(@Param('slug') slug: string, @Param('id') id: string) {
    return this.tenantAppService.deleteBillReceivable(slug, id);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('finance/cash-flow')
  getCashFlow(@Param('slug') slug: string) {
    return this.tenantAppService.getCashFlow(slug);
  }

  // ─── Supermercado: Operação PDV & Devoluções ───────────────────────────────

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('pos/authorize-manager')
  authorizeManager(@Param('slug') slug: string, @Body() body: { pin: string }) {
    return this.tenantAppService.authorizeManager(slug, body.pin);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('pos/cancel-sale')
  cancelOrder(
    @Param('slug') slug: string,
    @Body() body: { orderId: string; reason: string },
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.cancelOrder(slug, body.orderId, body.reason, user?.sub || user?.id);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('pos/returns')
  getOrderReturns(@Param('slug') slug: string) {
    return this.tenantAppService.getOrderReturns(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('pos/returns')
  createOrderReturn(
    @Param('slug') slug: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.createOrderReturn(slug, body, user?.sub || user?.id);
  }

  // ─── Clientes & Fiado ─────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('customers/:customerId')
  updateCustomer(
    @Param('slug') slug: string,
    @Param('customerId') customerId: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.updateCustomer(slug, customerId, body);
  }

  // ─── Relatórios & Configurações da Loja ───────────────────────────────────

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('reports/summary')
  getReportsSummary(
    @Param('slug') slug: string,
    @Query('period') period?: string,
  ) {
    return this.tenantAppService.getReportsSummary(slug, period);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('settings/store')
  getStoreSettings(@Param('slug') slug: string) {
    return this.tenantAppService.getStoreSettings(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Put('settings/store')
  updateStoreSettings(@Param('slug') slug: string, @Body() body: any) {
    return this.tenantAppService.updateStoreSettings(slug, body);
  }

  // ─── Central de Personalização & Modais de Pedido ─────────────────────────

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('modifier-groups')
  getModifierGroups(
    @Param('slug') slug: string,
    @Query('productId') productId?: string,
  ) {
    return this.tenantAppService.getModifierGroups(slug, productId);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('modifier-groups')
  createModifierGroup(
    @Param('slug') slug: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.createModifierGroup(slug, body);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Put('modifier-groups/:groupId')
  updateModifierGroup(
    @Param('slug') slug: string,
    @Param('groupId') groupId: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.updateModifierGroup(slug, groupId, body);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('modifier-groups/:groupId')
  deleteModifierGroup(
    @Param('slug') slug: string,
    @Param('groupId') groupId: string,
  ) {
    return this.tenantAppService.deleteModifierGroup(slug, groupId);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('modifier-groups/:groupId/items')
  addModifierItem(
    @Param('slug') slug: string,
    @Param('groupId') groupId: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.addModifierItem(slug, groupId, body);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('modifier-groups/:groupId/items/:itemId')
  deleteModifierItem(
    @Param('slug') slug: string,
    @Param('groupId') groupId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.tenantAppService.deleteModifierItem(slug, groupId, itemId);
  }

  // ─── Módulo Notas de Compra ────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('purchase-notes')
  getPurchaseNotes(
    @Param('slug') slug: string,
    @Query('status') status?: string,
  ) {
    return this.tenantAppService.listPurchaseNotes(slug, status);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('purchase-notes')
  createPurchaseNote(
    @Param('slug') slug: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.createPurchaseNote(slug, body);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('purchase-notes/:id')
  getPurchaseNote(
    @Param('slug') slug: string,
    @Param('id') id: string,
  ) {
    return this.tenantAppService.getPurchaseNote(slug, id);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('purchase-notes/:id/status')
  updatePurchaseNoteStatus(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.updatePurchaseNoteStatus(slug, id, body);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('purchase-notes/:id/items/:itemId')
  updatePurchaseNoteItem(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.updatePurchaseNoteItem(slug, id, itemId, body);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('purchase-notes/:id/items')
  addItemsToPurchaseNote(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.addItemsToPurchaseNote(slug, id, body.items);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('purchase-notes/:id')
  deletePurchaseNote(
    @Param('slug') slug: string,
    @Param('id') id: string,
  ) {
    return this.tenantAppService.deletePurchaseNote(slug, id);
  }
}
