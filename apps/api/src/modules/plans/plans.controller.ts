import { Controller, Get, Post, Patch, Param, Body, Query, NotFoundException } from '@nestjs/common';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  findAll() {
    return this.plansService.findAllPlans();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const plan = await this.plansService.findOne(id);
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);
    return plan;
  }

  @Post()
  create(@Body() data: any) {
    return this.plansService.createPlan(data);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.plansService.updatePlan(id, data);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.plansService.archivePlan(id);
  }
}

@Controller('coupons')
export class CouponsController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  findAll(@Query() query?: any) {
    return this.plansService.findAllCoupons(query || {});
  }

  @Post()
  create(@Body() data: any) {
    return this.plansService.createCoupon(data);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.plansService.updateCoupon(id, data);
  }

  @Get(':id/usage')
  getUsage(@Param('id') id: string) {
    return this.plansService.getCouponUsage(id);
  }
}
