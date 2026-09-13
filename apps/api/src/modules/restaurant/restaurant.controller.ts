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
  async createTable(
    @CurrentUser() user: any,
    @Body() body: { number: number; label?: string; capacity?: number },
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.createTable(companyId, body);
  }

  @Post('tables/batch')
  async batchCreateTables(
    @CurrentUser() user: any,
    @Body() body: { count: number; capacity?: number; startNumber?: number },
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.batchCreateTables(companyId, body);
  }

  @Post('tables/:id/devices')
  async pairDevice(
    @CurrentUser() user: any,
    @Param('id') tableId: string,
    @Body() body: { deviceName?: string },
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.pairDevice(companyId, tableId, body.deviceName);
  }

  @Post('tables/:id/rotate-qr')
  async rotateQr(@CurrentUser() user: any, @Param('id') tableId: string) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.rotateTableQr(companyId, tableId);
  }

  @Post('tables/:id/close-session')
  async closeSession(@CurrentUser() user: any, @Param('id') tableId: string) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.closeTableSession(companyId, tableId);
  }

  @Post('tables/:id/open-session')
  async openSession(
    @CurrentUser() user: any,
    @Param('id') tableId: string,
    @Body() body: { customerCount?: number; notes?: string },
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
  async addTableOrder(
    @CurrentUser() user: any,
    @Param('id') tableId: string,
    @Body() orderDto: CreateOrderDto,
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.createOrder(
      { companyId, tableId },
      { ...orderDto, origin: 'WAITER' },
    );
  }

  @Post('tables/:id/transfer')
  async transferTable(
    @CurrentUser() user: any,
    @Param('id') fromTableId: string,
    @Body('toTableId') toTableId: string,
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.transferTable(companyId, fromTableId, toTableId);
  }

  @Patch('tables/:id')
  async updateTable(
    @CurrentUser() user: any,
    @Param('id') tableId: string,
    @Body() body: { number?: number; label?: string; capacity?: number },
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.updateTable(companyId, tableId, body);
  }

  @Delete('tables/:id')
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
  async createProduct(@CurrentUser() user: any, @Body() body: any) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.createProduct(companyId, body);
  }

  @Post('categories')
  async createCategory(@CurrentUser() user: any, @Body() body: any) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.createCategory(companyId, body);
  }


  @Get('orders')
  async listOrders(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('tableId') tableId?: string,
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.listOrders(companyId, { status, tableId });
  }

  @Patch('orders/:id/status')
  async updateOrderStatus(
    @CurrentUser() user: any,
    @Param('id') orderId: string,
    @Body('status') newStatus: string,
  ) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.updateOrderStatus(companyId, orderId, newStatus);
  }

  @Patch('waiter-calls/:id/answer')
  async answerWaiterCall(@CurrentUser() user: any, @Param('id') callId: string) {
    const companyId = this.extractCompanyId(user);
    return this.restaurantService.answerWaiterCall(companyId, callId);
  }

  @Post('waiter-calls/:id/answer')
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
