import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OfflineSyncService } from './offline-sync.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantOwnershipGuard } from '../../common/guards/tenant-ownership.guard';
import { Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

@Controller('tenant-app/:slug/offline-sync')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
export class OfflineSyncController {
  constructor(
    private readonly offlineSyncService: OfflineSyncService,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
  ) {}

  private async getTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: slug.toLowerCase() } });
    if (!tenant) throw new NotFoundException(`Tenant "${slug}" não encontrado`);
    return tenant;
  }

  @Get()
  list(@Param('slug') slug: string) {
    return this.getTenant(slug).then((t) => this.offlineSyncService.list(t.id));
  }

  @Post('enqueue')
  enqueue(
    @Param('slug') slug: string,
    @Body() body: { items: Array<{ clientId: string; kind: string; payload: string }> },
  ) {
    return this.getTenant(slug).then((t) =>
      this.offlineSyncService.enqueue(t.id, body?.items || []),
    );
  }

  @Post('process')
  process(@Param('slug') slug: string) {
    return this.getTenant(slug).then((t) => this.offlineSyncService.process(t.id));
  }
}
