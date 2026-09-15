import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/types/jwt-user';
import {
  CopyPosSettingsDto, PosListQueryDto, PreviewInvoiceDto, SavePosSettingsDto,
  ScheduleReportDto, TestNotificationDto, UpdateOrderDto,
  UpsertPosDeviceDto, UpsertPosInvoiceTemplateDto, UpsertPosNotificationRuleDto,
  UpsertPosPaymentMethodDto, UpsertPosReportTemplateDto,
} from './dto/pos-admin.dto';
import { PosDevicesService } from './pos-devices.service';
import { PosInvoiceTemplatesService, PosPaymentMethodsService } from './pos-payment-methods.service';
import { PosNotificationRulesService, PosReportTemplatesService, PosSettingsService } from './pos-reports-notifications.service';

const PERM = 'gym-sales.sales.pos_admin';
const POS_VIEW = 'gym-sales.sales.new_receipt:view';

@UseGuards(JwtAuthGuard)
@Controller('pos-devices')
@RequiresPermission(`${PERM}:view`)
export class PosDevicesController {
  constructor(private readonly service: PosDevicesService) {}

  @Get() list(@Query() q: PosListQueryDto) { return this.service.list(q); }
  @Get('stats') stats() { return this.service.stats(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Post() @RequiresPermission(`${PERM}:create`) create(@Body() body: UpsertPosDeviceDto, @CurrentUser('sub') uid: number) { return this.service.create(body, uid); }
  @Put(':id') @RequiresPermission(`${PERM}:update`) update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertPosDeviceDto, @CurrentUser('sub') uid: number) { return this.service.update(id, body, uid); }
  @Delete(':id') @RequiresPermission(`${PERM}:delete`) remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
  @Patch(':id/toggle-status') @RequiresPermission(`${PERM}:update`) toggle(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') uid: number) { return this.service.toggleStatus(id, uid); }
  @Post('sync') @RequiresPermission(`${PERM}:update`) sync() { return this.service.syncAll(); }
}

@UseGuards(JwtAuthGuard)
@Controller('pos-payment-methods')
@RequiresPermission(`${PERM}:view`, POS_VIEW)
export class PosPaymentMethodsController {
  constructor(private readonly service: PosPaymentMethodsService) {}

  @Get() list(@Query() q: PosListQueryDto) { return this.service.list(q); }
  @Get('stats') stats() { return this.service.stats(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Post() @RequiresPermission(`${PERM}:create`) create(@Body() body: UpsertPosPaymentMethodDto, @CurrentUser('sub') uid: number) { return this.service.create(body, uid); }
  @Put(':id') @RequiresPermission(`${PERM}:update`) update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertPosPaymentMethodDto, @CurrentUser('sub') uid: number) { return this.service.update(id, body, uid); }
  @Delete(':id') @RequiresPermission(`${PERM}:delete`) remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
  @Patch(':id/toggle') @RequiresPermission(`${PERM}:update`) toggle(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') uid: number) { return this.service.toggle(id, uid); }
  @Post(':id/test-connection') @RequiresPermission(`${PERM}:update`) test(@Param('id', ParseIntPipe) id: number) { return this.service.testConnection(id); }
  @Patch('update-order') @RequiresPermission(`${PERM}:update`) updateOrder(@Body() body: UpdateOrderDto) { return this.service.updateOrder(body.orderData); }
}

@UseGuards(JwtAuthGuard)
@Controller('pos-invoice-templates')
@RequiresPermission(`${PERM}:view`, POS_VIEW)
export class PosInvoiceTemplatesController {
  constructor(private readonly service: PosInvoiceTemplatesService) {}

  @Get() list(@Query() q: PosListQueryDto) { return this.service.list(q); }
  @Get('stats') stats() { return this.service.stats(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Post() @RequiresPermission(`${PERM}:create`) create(@Body() body: UpsertPosInvoiceTemplateDto, @CurrentUser('sub') uid: number) { return this.service.create(body, uid); }
  @Put(':id') @RequiresPermission(`${PERM}:update`) update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertPosInvoiceTemplateDto, @CurrentUser('sub') uid: number) { return this.service.update(id, body, uid); }
  @Delete(':id') @RequiresPermission(`${PERM}:delete`) remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
  @Patch(':id/set-default') @RequiresPermission(`${PERM}:update`) setDefault(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') uid: number) { return this.service.setDefault(id, uid); }
  @Post(':id/duplicate') @RequiresPermission(`${PERM}:create`) duplicate(@Param('id', ParseIntPipe) id: number, @Body('newName') newName: string, @CurrentUser('sub') uid: number) { return this.service.duplicate(id, newName, uid); }
  @Post(':id/preview') preview(@Param('id', ParseIntPipe) id: number, @Body() body: PreviewInvoiceDto) { return this.service.preview(id, body.sampleData); }
}

@UseGuards(JwtAuthGuard)
@Controller('pos-report-templates')
@RequiresPermission(`${PERM}:view`)
export class PosReportTemplatesController {
  constructor(private readonly service: PosReportTemplatesService) {}

  @Get() list(@Query() q: PosListQueryDto) { return this.service.list(q); }
  @Get('stats') stats() { return this.service.stats(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Post() @RequiresPermission(`${PERM}:create`) create(@Body() body: UpsertPosReportTemplateDto, @CurrentUser('sub') uid: number) { return this.service.create(body, uid); }
  @Put(':id') @RequiresPermission(`${PERM}:update`) update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertPosReportTemplateDto, @CurrentUser('sub') uid: number) { return this.service.update(id, body, uid); }
  @Delete(':id') @RequiresPermission(`${PERM}:delete`) remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
  @Patch(':id/toggle') @RequiresPermission(`${PERM}:update`) toggle(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') uid: number) { return this.service.toggle(id, uid); }
  @Post(':id/generate-sample') generateSample(@Param('id', ParseIntPipe) id: number) { return this.service.generateSample(id); }
  @Post(':id/schedule') @RequiresPermission(`${PERM}:update`) schedule(@Param('id', ParseIntPipe) id: number, @Body() body: ScheduleReportDto) { return this.service.schedule(id, body); }
  @Post(':id/unschedule') @RequiresPermission(`${PERM}:update`) unschedule(@Param('id', ParseIntPipe) id: number) { return this.service.unschedule(id); }
}

@UseGuards(JwtAuthGuard)
@Controller('pos-notification-rules')
@RequiresPermission(`${PERM}:view`)
export class PosNotificationRulesController {
  constructor(private readonly service: PosNotificationRulesService) {}

  @Get() list(@Query() q: PosListQueryDto) { return this.service.list(q); }
  @Get('stats') stats() { return this.service.stats(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Post() @RequiresPermission(`${PERM}:create`) create(@Body() body: UpsertPosNotificationRuleDto, @CurrentUser('sub') uid: number) { return this.service.create(body, uid); }
  @Put(':id') @RequiresPermission(`${PERM}:update`) update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertPosNotificationRuleDto, @CurrentUser('sub') uid: number) { return this.service.update(id, body, uid); }
  @Delete(':id') @RequiresPermission(`${PERM}:delete`) remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
  @Patch(':id/toggle') @RequiresPermission(`${PERM}:update`) toggle(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') uid: number) { return this.service.toggle(id, uid); }
  @Post(':id/test') @RequiresPermission(`${PERM}:update`) test(@Param('id', ParseIntPipe) id: number, @Body() body: TestNotificationDto) { return this.service.test(id, body); }
  @Post('send-immediate') @RequiresPermission(`${PERM}:update`) sendImmediate(@Body() body: TestNotificationDto) { return this.service.sendImmediate(body); }
}

@UseGuards(JwtAuthGuard)
@Controller('pos-settings')
@RequiresPermission(`${PERM}:view`, POS_VIEW)
export class PosSettingsController {
  constructor(private readonly service: PosSettingsService) {}

  @Get(':category') getCategory(@Param('category') category: string, @CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.service.getCategory(category, branchId ? Number(branchId) : undefined, user);
  }
  @Post(':category') @RequiresPermission(`${PERM}:update`) save(@Param('category') category: string, @Body() body: SavePosSettingsDto, @CurrentUser() user: JwtUser) {
    return this.service.saveCategory(category, body.settings, body.branchId, user.sub, user);
  }
  @Post('copy-to-branch') @RequiresPermission(`${PERM}:update`) copy(@Body() body: CopyPosSettingsDto, @CurrentUser() user: JwtUser) {
    return this.service.copyToBranch(body.category, body.fromBranchId, body.toBranchId, user.sub, user);
  }
  @Post(':category/reset') @RequiresPermission(`${PERM}:update`) reset(@Param('category') category: string, @CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.service.resetCategory(category, branchId ? Number(branchId) : undefined, user);
  }
}
