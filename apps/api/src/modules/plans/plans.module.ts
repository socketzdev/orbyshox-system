import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController, CouponsController } from './plans.controller';

@Module({
  controllers: [PlansController, CouponsController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
