import { Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { RestaurantGateway } from './restaurant.gateway';

@Module({
  controllers: [RestaurantController],
  providers: [RestaurantService, RestaurantGateway],
  exports: [RestaurantService, RestaurantGateway],
})
export class RestaurantModule {}
