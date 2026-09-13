import { Module } from '@nestjs/common';
import { ClientSitesController } from './client-sites.controller';
import { ClientSitesService } from './client-sites.service';

@Module({
  controllers: [ClientSitesController],
  providers: [ClientSitesService],
  exports: [ClientSitesService],
})
export class ClientSitesModule {}
