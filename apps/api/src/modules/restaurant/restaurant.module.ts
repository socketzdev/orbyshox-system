import { Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { TipController } from './tip.controller';
import { RestaurantService } from './restaurant.service';
import { RestaurantGateway } from './restaurant.gateway';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [RestaurantController, TipController],
  providers: [RestaurantService, RestaurantGateway],
  exports: [RestaurantService, RestaurantGateway],
})
export class RestaurantModule {}
