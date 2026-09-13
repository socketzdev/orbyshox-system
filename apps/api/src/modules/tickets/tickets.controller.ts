import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  findAll(@Query() q: any) {
    return this.ticketsService.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ticketsService.findOne(id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() data: any) {
    return this.ticketsService.create(data, user?.id || 'admin');
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.ticketsService.update(id, data);
  }

  @Post(':id/messages')
  addMessage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { content?: string; message?: string; isInternal?: boolean }
  ) {
    const text = body?.content ?? body?.message;
    return this.ticketsService.addMessage(id, user?.id || 'admin', text ?? '', body?.isInternal ?? false);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body('assignedToId') assignedToId: string | null) {
    return this.ticketsService.assign(id, assignedToId ?? null);
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.ticketsService.resolve(id);
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.ticketsService.close(id);
  }
}
