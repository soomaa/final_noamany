import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortalManagementService } from './portal-management.service';

@UseGuards(JwtAuthGuard)
@Controller('portal-management')
export class PortalManagementController {
  constructor(private readonly service: PortalManagementService) {}

  @Get('summary') @RequiresPermission('portal-management:view') summary() { return this.service.summary(); }
  @Get('options') @RequiresPermission('portal-management:view') options() { return this.service.options(); }
  @Get('reports/captain-sales') @RequiresPermission('portal-management:view') report(@Query() query: Record<string, string>) { return this.service.report(query); }
  @Get('settings/:key') @RequiresPermission('portal-management:view') setting(@Param('key') key: string) { return this.service.getSetting(key); }
  @Put('settings/:key') @RequiresPermission('portal-management:update') saveSetting(@Param('key') key: string, @Body() body: Record<string, unknown>, @CurrentUser('sub') userId: number) { return this.service.saveSetting(key, body, userId); }
  @Get(':type') @RequiresPermission('portal-management:view') list(@Param('type') type: string, @Query() query: Record<string, string>) { return this.service.list(type, query); }
  @Post(':type') @RequiresPermission('portal-management:create') create(@Param('type') type: string, @Body() body: any, @CurrentUser('sub') userId: number) { return this.service.create(type, body, userId); }
  @Put(':type/:id') @RequiresPermission('portal-management:update') update(@Param('type') type: string, @Param('id', ParseIntPipe) id: number, @Body() body: any, @CurrentUser('sub') userId: number) { return this.service.update(type, id, body, userId); }
  @Patch(':type/:id/status') @RequiresPermission('portal-management:update') status(@Param('type') type: string, @Param('id', ParseIntPipe) id: number, @Body('status') status: string, @Body('comment') comment: string, @CurrentUser('sub') userId: number) { return this.service.updateStatus(type, id, status, userId, comment); }
  @Post('products/:id/stock') @RequiresPermission('portal-management:update') stock(@Param('id', ParseIntPipe) id: number, @Body('quantity', ParseIntPipe) quantity: number) { return this.service.addStock(id, quantity); }
  @Delete(':type/:id') @RequiresPermission('portal-management:delete') remove(@Param('type') type: string, @Param('id', ParseIntPipe) id: number) { return this.service.remove(type, id); }
}
