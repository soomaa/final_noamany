import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../../common/types/jwt-user';
import { STAFF_SECTIONS, StaffSetupService } from './staff-setup.service';

export class SaveStaffSetupDto {
  @Type(() => Number)
  @IsIn([...STAFF_SECTIONS], { message: 'اختار رجالي أو حريمي أو الكل' })
  section!: number;

  @Type(() => Number)
  @IsInt({ message: 'اختار المسمى الوظيفي' })
  @Min(1, { message: 'اختار المسمى الوظيفي' })
  jobTitleId!: number;
}

/** System administration → تظبيط الموظفين (section + job title, and the login account that follows). */
@UseGuards(JwtAuthGuard)
@Controller('rbac/staff-setup')
export class StaffSetupController {
  constructor(private readonly staff: StaffSetupService) {}

  @Get()
  @RequiresPermission('admin.roles:view')
  list() {
    return this.staff.list();
  }

  @Put(':employeeId')
  @RequiresPermission('admin.roles:manage')
  save(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: SaveStaffSetupDto,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.staff.save(employeeId, dto, actor.sub, actor);
  }
}
