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
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import {
  canApprove,
  canCreate,
  canDelete,
  canManage,
  canRead,
  canUpdate,
} from '../../common/rbac/policies';
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
const ACCESS_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
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

/**
 * Rotas do painel do cliente.
 *
 * Os `@CheckPolicies` abaixo cobrem os módulos que a auditoria sinalizou como
 * críticos (H10): financeiro, estoque, PDV, funcionários e configurações da
 * loja. Rotas de leitura de baixo risco (dashboard, `me`, agendamentos
 * públicos) seguem sem política — o `JwtAuthGuard` continua exigindo sessão.
 *
 * Regras que dependem do REGISTRO (autor do lançamento, janela de tempo,
 * estado do pedido) não cabem aqui: o guard não carrega a entidade. Elas vivem
 * no serviço — ver regra R1.
 */
@Controller('tenant-app/:slug')
export class TenantAppController {
  constructor(private readonly tenantAppService: TenantAppService) {}

  @Public()
  @Get('public-info')
  getPublicInfo(@Param('slug') slug: string) {
    return this.tenantAppService.getPublicInfo(slug);
  }

  @Public()
  @Get('public/booking-data')
  getPublicBookingData(@Param('slug') slug: string) {
    return this.tenantAppService.getPublicBookingData(slug);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('public/availability')
  getPublicAvailability(@Param('slug') slug: string, @Query('days') days?: string) {
    return this.tenantAppService.getPublicAvailability(slug, days ? Number(days) : 7);
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
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
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
    // Na janela de tolerância a resposta vem sem refresh novo: nunca escrever
    // `undefined` no cookie, senão as próximas renovações quebram.
    if ((result as any).refreshToken) {
      res.cookie(REFRESH_COOKIE, (result as any).refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: REFRESH_COOKIE_MAX_AGE_MS,
      });
    }
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
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/tenant-app' });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('me')
  getMe(@Param('slug') slug: string, @CurrentUser() user: any) {
    return this.tenantAppService.getCurrentUser(slug, user.sub || user.id);
  }

  @CheckPolicies(canUpdate('StoreSettings'))
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
  @Get('dashboard/restaurant')
  getRestaurantDashboard(@Param('slug') slug: string) {
    return this.tenantAppService.getRestaurantDashboard(slug);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('dashboard/supermarket')
  getSupermarketDashboard(@Param('slug') slug: string) {
    return this.tenantAppService.getSupermarketDashboard(slug);
  }

  @CheckPolicies(canRead('Product'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('products')
  getProducts(@Param('slug') slug: string) {
    return this.tenantAppService.getProducts(slug);
  }

  @CheckPolicies(canCreate('Product'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('products')
  createProduct(@Param('slug') slug: string, @Body() data: any) {
    return this.tenantAppService.createProduct(slug, data);
  }

  @CheckPolicies(canCreate('Product'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('categories')
  createCategory(@Param('slug') slug: string, @Body() data: any) {
    return this.tenantAppService.createCategory(slug, data);
  }

  @CheckPolicies(canUpdate('Product'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('categories/:categoryId')
  deleteCategory(
    @Param('slug') slug: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.tenantAppService.deleteCategory(slug, categoryId);
  }

  @CheckPolicies(canUpdate('Product'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('categories/:categoryId')
  updateCategory(
    @Param('slug') slug: string,
    @Param('categoryId') categoryId: string,
    @Body() body: { name?: string; color?: string },
  ) {
    return this.tenantAppService.updateCategory(slug, categoryId, body);
  }

  // O guard libera o estoquista; o SERVIÇO é que barra a alteração de preço
  // para quem não tem `update` no campo `salePriceCents` (regra de campo).
  @CheckPolicies(canUpdate('Product'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('products/:productId')
  updateProduct(
    @Param('slug') slug: string,
    @Param('productId') productId: string,
    @Body() data: any,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.updateProduct(slug, productId, data, user);
  }

  @CheckPolicies(canDelete('Product'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('products')
  deleteProducts(@Param('slug') slug: string, @Body() body: { ids?: string[] }) {
    return this.tenantAppService.deleteProducts(slug, body?.ids);
  }

  @CheckPolicies(canDelete('Product'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('products/:productId')
  deleteProduct(@Param('slug') slug: string, @Param('productId') productId: string) {
    return this.tenantAppService.deleteProduct(slug, productId);
  }

  @CheckPolicies(canRead('Order'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('orders')
  getOrders(@Param('slug') slug: string) {
    return this.tenantAppService.getOrders(slug);
  }

  @CheckPolicies(canCreate('Order'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('orders')
  createOrder(
    @Param('slug') slug: string,
    @Body() data: any,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.createOrder(slug, data, user?.sub || user?.id);
  }

  @CheckPolicies(canRead('Customer'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('customers')
  getCustomers(@Param('slug') slug: string) {
    return this.tenantAppService.getCustomers(slug);
  }

  @CheckPolicies(canCreate('Customer'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('customers')
  createCustomer(@Param('slug') slug: string, @Body() data: any) {
    return this.tenantAppService.createCustomer(slug, data);
  }

  @CheckPolicies(canRead('CashRegister'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('cash-register')
  getCashRegister(@Param('slug') slug: string) {
    return this.tenantAppService.getCashRegister(slug);
  }

  @CheckPolicies(canCreate('CashRegister'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('cash-register/open')
  openCashRegister(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Body() data: any,
  ) {
    return this.tenantAppService.openCashRegister(slug, user.sub || user.id, data);
  }

  @CheckPolicies(canUpdate('CashRegister'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('cash-register/close')
  closeCashRegister(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Body() data: any,
  ) {
    return this.tenantAppService.closeCashRegister(slug, user.sub || user.id, data);
  }

  @CheckPolicies(canUpdate('CashRegister'))
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

  @CheckPolicies(canRead('Appointment'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('appointments')
  getAppointments(@Param('slug') slug: string) {
    return this.tenantAppService.getAppointments(slug);
  }

  // Catálogo de serviços da casa (o que aparece no agendamento online).
  // Usa as políticas de Appointment: quem gerencia a agenda gerencia os serviços.
  @CheckPolicies(canRead('Appointment'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('services')
  listServices(@Param('slug') slug: string) {
    return this.tenantAppService.listServices(slug);
  }

  @CheckPolicies(canCreate('Appointment'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('services')
  createService(@Param('slug') slug: string, @Body() body: any) {
    return this.tenantAppService.createService(slug, body);
  }

  @CheckPolicies(canUpdate('Appointment'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('services/:id')
  updateService(@Param('slug') slug: string, @Param('id') id: string, @Body() body: any) {
    return this.tenantAppService.updateService(slug, id, body);
  }

  @CheckPolicies(canDelete('Appointment'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('services/:id')
  deleteService(@Param('slug') slug: string, @Param('id') id: string) {
    return this.tenantAppService.deleteService(slug, id);
  }

  // ─── Calendário da empresa (visão Google Calendar) ─────────────────────
  // Usa as políticas de Appointment: quem gerencia a agenda gerencia o
  // calendário. Tarefas e agendamentos entram sozinhos na leitura.
  @CheckPolicies(canRead('Appointment'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('calendar')
  listCalendar(
    @Param('slug') slug: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.tenantAppService.listCalendarEvents(slug, from, to);
  }

  @CheckPolicies(canRead('Appointment'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('calendar/export.ics')
  exportCalendar(@Param('slug') slug: string) {
    return this.tenantAppService.exportCalendarICS(slug);
  }

  @CheckPolicies(canCreate('Appointment'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('calendar')
  createCalendarEvent(
    @Param('slug') slug: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.createCalendarEvent(slug, body, user?.sub || user?.id);
  }

  @CheckPolicies(canUpdate('Appointment'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('calendar/:id')
  updateCalendarEvent(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: { mode?: 'single' | 'series' } & Record<string, any>,
  ) {
    return this.tenantAppService.updateCalendarEvent(slug, id, body, body?.mode === 'series' ? 'series' : 'single');
  }

  @CheckPolicies(canDelete('Appointment'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('calendar/:id')
  deleteCalendarEvent(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Query('mode') mode?: string,
  ) {
    return this.tenantAppService.deleteCalendarEvent(slug, id, mode === 'series' ? 'series' : 'single');
  }

  @Public()
  @Post('appointments')
  createAppointment(@Param('slug') slug: string, @Body() data: any) {
    return this.tenantAppService.createAppointment(slug, data);
  }

  @CheckPolicies(canUpdate('Appointment'))
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
  // LER a equipe é liberado para os papéis operacionais: a agenda, a atribuição
  // de garçom e o cálculo de comissão dependem da lista de profissionais.
  // GERIR contas — criar, editar papel, desativar, apagar — é do TENANT_ADMIN.
  // Era o vetor de escalada de privilégio mais direto do sistema.

  @CheckPolicies(canRead('Employee'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('employees')
  getEmployees(@Param('slug') slug: string) {
    return this.tenantAppService.getEmployees(slug);
  }

  @CheckPolicies(canRead('Employee'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('employees/:employeeId')
  getEmployee(
    @Param('slug') slug: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.tenantAppService.getEmployee(slug, employeeId);
  }

  @CheckPolicies(canManage('Employee'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('employees')
  createEmployee(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(createEmployeeSchema)) data: CreateEmployeeInput,
  ) {
    return this.tenantAppService.createEmployee(slug, data);
  }

  @CheckPolicies(canManage('Employee'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('employees/:employeeId')
  updateEmployee(
    @Param('slug') slug: string,
    @Param('employeeId') employeeId: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) data: UpdateEmployeeInput,
  ) {
    return this.tenantAppService.updateEmployee(slug, employeeId, data);
  }

  @CheckPolicies(canManage('Employee'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('employees/:employeeId/deactivate')
  deactivateEmployee(
    @Param('slug') slug: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.tenantAppService.setEmployeeActive(slug, employeeId, false);
  }

  @CheckPolicies(canManage('Employee'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('employees/:employeeId/activate')
  activateEmployee(
    @Param('slug') slug: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.tenantAppService.setEmployeeActive(slug, employeeId, true);
  }

  @CheckPolicies(canManage('Employee'))
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

  @CheckPolicies(canManage('Employee'))
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

  @CheckPolicies(canUpdate('StockMovement'))
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

  @CheckPolicies(canRead('Product'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('stock/overview')
  getStockOverview(@Param('slug') slug: string) {
    return this.tenantAppService.getStockOverview(slug);
  }

  @CheckPolicies(canRead('StockMovement'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('stock/losses')
  getStockLosses(@Param('slug') slug: string) {
    return this.tenantAppService.getStockLosses(slug);
  }

  @CheckPolicies(canCreate('StockMovement'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('stock/losses')
  createStockLoss(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.tenantAppService.createStockLoss(slug, user?.sub || user?.id, body);
  }

  @CheckPolicies(canRead('StockMovement'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('stock/movements')
  getStockMovements(
    @Param('slug') slug: string,
    @Query('productId') productId?: string,
  ) {
    return this.tenantAppService.getStockMovements(slug, productId);
  }

  @CheckPolicies(canRead('StockMovement'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('stock/inventory')
  getInventoryAudits(@Param('slug') slug: string) {
    return this.tenantAppService.getInventoryAudits(slug);
  }

  @CheckPolicies(canCreate('StockMovement'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('stock/inventory')
  createInventoryAudit(
    @Param('slug') slug: string,
    @Body() body: { notes?: string },
  ) {
    return this.tenantAppService.createInventoryAudit(slug, body?.notes);
  }

  @CheckPolicies(canUpdate('StockMovement'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('stock/inventory/:auditId/count')
  countInventoryItem(
    @Param('slug') slug: string,
    @Param('auditId') auditId: string,
    @Body() body: { productId: string; countedQty: number },
  ) {
    return this.tenantAppService.countInventoryItem(slug, auditId, body);
  }

  // Reconciliar inventário reescreve o saldo de estoque: gerente e acima.
  @CheckPolicies(canUpdate('StockMovement'))
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

  @CheckPolicies(canRead('BillPayable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('finance/payables')
  getBillsPayable(
    @Param('slug') slug: string,
    @Query('status') status?: string,
  ) {
    return this.tenantAppService.getBillsPayable(slug, status);
  }

  @CheckPolicies(canCreate('BillPayable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('finance/payables')
  createBillPayable(@Param('slug') slug: string, @Body() body: any) {
    return this.tenantAppService.createBillPayable(slug, body);
  }

  @CheckPolicies(canUpdate('BillPayable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('finance/payables/:id/pay')
  payBill(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.payBill(slug, id, user?.sub || user?.id);
  }

  // Exclusão irreversível: só TENANT_ADMIN.
  @CheckPolicies(canDelete('BillPayable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('finance/payables/:id')
  deleteBillPayable(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.deleteBillPayable(slug, id, user?.sub || user?.id);
  }

  @CheckPolicies(canRead('BillReceivable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('finance/receivables')
  getBillsReceivable(
    @Param('slug') slug: string,
    @Query('status') status?: string,
  ) {
    return this.tenantAppService.getBillsReceivable(slug, status);
  }

  @CheckPolicies(canCreate('BillReceivable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('finance/receivables')
  createBillReceivable(@Param('slug') slug: string, @Body() body: any) {
    return this.tenantAppService.createBillReceivable(slug, body);
  }

  @CheckPolicies(canUpdate('BillReceivable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('finance/receivables/:id/receive')
  receiveBill(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.receiveBill(slug, id, user?.sub || user?.id);
  }

  @CheckPolicies(canCreate('BillReceivable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('finance/receivables/installments')
  createReceivableSale(
    @Param('slug') slug: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.createReceivableSale(slug, body, user?.sub || user?.id);
  }

  @CheckPolicies(canUpdate('BillReceivable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('finance/receivables/:id/pay')
  payReceivable(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.payReceivable(slug, id, body, user?.sub || user?.id);
  }

  @CheckPolicies(canDelete('BillReceivable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('finance/receivables/group/:groupId')
  deleteReceivableGroup(
    @Param('slug') slug: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.deleteReceivableGroup(slug, groupId, user?.sub || user?.id);
  }

  @CheckPolicies(canDelete('BillReceivable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('finance/receivables/:id')
  deleteBillReceivable(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.deleteBillReceivable(slug, id, user?.sub || user?.id);
  }

  // Visão consolidada do caixa: gerente e admin (matriz: ❌ caixa e garçom).
  @CheckPolicies(canRead('Finance'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('finance/cash-flow')
  getCashFlow(@Param('slug') slug: string) {
    return this.tenantAppService.getCashFlow(slug);
  }

  // ─── Supermercado: Operação PDV & Devoluções ───────────────────────────────

  // Aprovação por PIN: só papéis superiores (regra R3).
  @CheckPolicies(canApprove('Order'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('pos/authorize-manager')
  authorizeManager(
    @Param('slug') slug: string,
    @Body() body: { pin: string },
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.authorizeManager(slug, body.pin, user?.sub || user?.id);
  }

  @CheckPolicies(canUpdate('Order'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('pos/cancel-sale')
  cancelOrder(
    @Param('slug') slug: string,
    @Body() body: { orderId: string; reason: string },
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.cancelOrder(slug, body.orderId, body.reason, user?.sub || user?.id);
  }

  @CheckPolicies(canRead('Order'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('pos/returns')
  getOrderReturns(@Param('slug') slug: string) {
    return this.tenantAppService.getOrderReturns(slug);
  }

  @CheckPolicies(canCreate('Order'))
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

  @CheckPolicies(canUpdate('Customer'))
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

  @CheckPolicies(canRead('Report'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('reports/summary')
  getReportsSummary(
    @Param('slug') slug: string,
    @Query('period') period?: string,
  ) {
    return this.tenantAppService.getReportsSummary(slug, period);
  }

  // Fechamento do dia para a térmica: notas sequenciais + totais por pagamento.
  @CheckPolicies(canRead('Report'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('reports/day-closing')
  getDayClosing(@Param('slug') slug: string, @Query('period') period?: string) {
    return this.tenantAppService.getDayClosing(slug, period);
  }

  // Histórico de fechamentos de caixa (salvos para consulta/reimpressão).
  @CheckPolicies(canRead('Report'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('finance/closings')
  listCashClosings(@Param('slug') slug: string, @Query('limit') limit?: string) {
    return this.tenantAppService.listCashClosings(slug, limit ? Number(limit) : 30);
  }

  @CheckPolicies(canRead('Report'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('finance/closings')
  saveCashClosing(
    @Param('slug') slug: string,
    @Body() body: { period?: string },
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.saveCashClosing(slug, body?.period, user?.name);
  }

  @CheckPolicies(canRead('Report'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('finance/closings/:id')
  getCashClosing(@Param('slug') slug: string, @Param('id') id: string) {
    return this.tenantAppService.getCashClosing(slug, id);
  }

  // Alertas de contas a pagar (vencidas, vencendo hoje, vencendo em 3 dias).
  @CheckPolicies(canRead('BillPayable'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('finance/bills/alerts')
  getBillsAlerts(@Param('slug') slug: string) {
    return this.tenantAppService.getBillsAlerts(slug);
  }

  @CheckPolicies(canRead('StoreSettings'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('settings/store')
  getStoreSettings(@Param('slug') slug: string) {
    return this.tenantAppService.getStoreSettingsWithPix(slug);
  }

  @CheckPolicies(canUpdate('StoreSettings'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Put('settings/store')
  updateStoreSettings(@Param('slug') slug: string, @Body() body: any) {
    return this.tenantAppService.updateStoreSettings(slug, body);
  }

  // ─── PIX: geração do BR Code para a tela de pagamento ─────────────────────
  // Política de leitura (não de escrita): quem opera o caixa recebe o QR, mas
  // só quem altera StoreSettings troca a chave. Sem isso, o atendente veria a
  // tela de pagamento quebrada por falta de permissão para gerar o QR.

  @CheckPolicies(canRead('StoreSettings'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('payments/pix/charge')
  getPixCharge(
    @Param('slug') slug: string,
    @Query('amountCents') amountCents: string,
    @Query('txid') txid?: string,
    @Query('description') description?: string,
  ) {
    return this.tenantAppService.generatePixCharge(slug, Number(amountCents), txid, description);
  }

  // ─── Logo do estabelecimento (Configurações > Personalização) ──────────────
  // Mesma política do restante das configurações: só quem pode alterar
  // StoreSettings (dono/gestor) troca a logo. O TenantOwnershipGuard garante
  // que o token pertence ao slug da URL.

  @CheckPolicies(canRead('StoreSettings'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('settings/branding/logo')
  getBrandingLogo(@Param('slug') slug: string) {
    return this.tenantAppService.getBrandingLogo(slug);
  }

  @CheckPolicies(canUpdate('StoreSettings'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('settings/branding/logo')
  updateBrandingLogo(@Param('slug') slug: string, @Body('dataUrl') dataUrl: string) {
    return this.tenantAppService.updateBrandingLogo(slug, dataUrl);
  }

  @CheckPolicies(canUpdate('StoreSettings'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('settings/branding/logo')
  removeBrandingLogo(@Param('slug') slug: string) {
    return this.tenantAppService.removeBrandingLogo(slug);
  }

  // ─── Central de Personalização & Modais de Pedido ─────────────────────────

  @CheckPolicies(canRead('ModifierGroup'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('modifier-groups')
  getModifierGroups(
    @Param('slug') slug: string,
    @Query('productId') productId?: string,
  ) {
    return this.tenantAppService.getModifierGroups(slug, productId);
  }

  @CheckPolicies(canCreate('ModifierGroup'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('modifier-groups')
  createModifierGroup(
    @Param('slug') slug: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.createModifierGroup(slug, body);
  }

  @CheckPolicies(canUpdate('ModifierGroup'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Put('modifier-groups/:groupId')
  updateModifierGroup(
    @Param('slug') slug: string,
    @Param('groupId') groupId: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.updateModifierGroup(slug, groupId, body);
  }

  @CheckPolicies(canDelete('ModifierGroup'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('modifier-groups/:groupId')
  deleteModifierGroup(
    @Param('slug') slug: string,
    @Param('groupId') groupId: string,
  ) {
    return this.tenantAppService.deleteModifierGroup(slug, groupId);
  }

  @CheckPolicies(canCreate('ModifierGroup'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('modifier-groups/:groupId/items')
  addModifierItem(
    @Param('slug') slug: string,
    @Param('groupId') groupId: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.addModifierItem(slug, groupId, body);
  }

  @CheckPolicies(canDelete('ModifierGroup'))
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

  @CheckPolicies(canRead('PurchaseNote'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('purchase-notes')
  getPurchaseNotes(
    @Param('slug') slug: string,
    @Query('status') status?: string,
  ) {
    return this.tenantAppService.listPurchaseNotes(slug, status);
  }

  @CheckPolicies(canCreate('PurchaseNote'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('purchase-notes')
  createPurchaseNote(
    @Param('slug') slug: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.createPurchaseNote(slug, body);
  }

  @CheckPolicies(canRead('PurchaseNote'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('purchase-notes/:id')
  getPurchaseNote(
    @Param('slug') slug: string,
    @Param('id') id: string,
  ) {
    return this.tenantAppService.getPurchaseNote(slug, id);
  }

  @CheckPolicies(canUpdate('PurchaseNote'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('purchase-notes/:id/status')
  updatePurchaseNoteStatus(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.updatePurchaseNoteStatus(slug, id, body);
  }

  @CheckPolicies(canUpdate('PurchaseNote'))
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

  @CheckPolicies(canUpdate('PurchaseNote'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('purchase-notes/:id/items')
  addItemsToPurchaseNote(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.tenantAppService.addItemsToPurchaseNote(slug, id, body.items);
  }

  // Confirma o pagamento da nota e abate por canal no caixa do turno.
  @CheckPolicies(canUpdate('PurchaseNote'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post('purchase-notes/:id/confirm')
  confirmPurchaseNote(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: { totalCents: number; payments: { method: string; amountCents: number }[]; items?: { itemId: string; priceCents?: number; paymentMethod?: string }[]; supplierName?: string },
    @CurrentUser() user: any,
  ) {
    return this.tenantAppService.confirmPurchaseNote(slug, id, body, {
      id: user?.sub || user?.id,
      name: user?.name,
    });
  }

  @CheckPolicies(canDelete('PurchaseNote'))
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete('purchase-notes/:id')
  deletePurchaseNote(
    @Param('slug') slug: string,
    @Param('id') id: string,
  ) {
    return this.tenantAppService.deletePurchaseNote(slug, id);
  }
}
