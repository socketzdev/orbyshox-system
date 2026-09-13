import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { NfeController } from './nfe.controller';
import { NfeService } from './nfe.service';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { OfflineSyncController } from './offline-sync.controller';
import { OfflineSyncService } from './offline-sync.service';

@Module({
  controllers: [
    SuppliersController,
    NfeController,
    BatchesController,
    PurchaseOrdersController,
    OfflineSyncController,
  ],
  providers: [
    SuppliersService,
    NfeService,
    BatchesService,
    PurchaseOrdersService,
    OfflineSyncService,
  ],
  exports: [
    SuppliersService,
    NfeService,
    BatchesService,
    PurchaseOrdersService,
    OfflineSyncService,
  ],
})
export class MarketplaceModule {}
