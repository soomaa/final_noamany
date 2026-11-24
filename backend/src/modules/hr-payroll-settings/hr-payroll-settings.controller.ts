import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { HrPayrollSettingsService } from './hr-payroll-settings.service';

/** «إعدادات الحضور والمرتبات» — RBAC resource `payroll.attendance_settings` (view / update). */
@UseGuards(JwtAuthGuard)
@Controller('hr/payroll-settings')
@RequiresPermission('payroll.attendance_settings:view')
export class HrPayrollSettingsController {
  constructor(private readonly settings: HrPayrollSettingsService) {}

  @Get()
  get() {
    return this.settings.view();
  }

  @Put()
  @RequiresPermission('payroll.attendance_settings:update')
  save(@Body() body: { values?: Record<string, unknown> }, @CurrentUser() user: JwtUser) {
    return this.settings.save(body?.values, user);
  }
}
