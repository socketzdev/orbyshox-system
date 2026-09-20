import { Module } from '@nestjs/common';
import { GymService } from './gym.service';
import { GymController } from './gym.controller';
import { GymGateway } from './gym.gateway';

@Module({
  controllers: [GymController],
  providers: [GymService, GymGateway],
  exports: [GymService, GymGateway],
})
export class GymModule {}
