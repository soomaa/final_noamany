import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('company')
  @RequiresPermission('admin.company:view')
  getCompany() {
    return this.settings.getCompany();
  }

  @Patch('company')
  @RequiresPermission('admin.company:update')
  updateCompany(@Body() patch: Record<string, unknown>, @CurrentUser('sub') userId: number) {
    return this.settings.updateCompany(patch, userId);
  }

  @Get('global')
  getGlobal() {
    return this.settings.getGlobal();
  }

  @Patch('global')
  @RequiresPermission('admin.company:update')
  updateGlobal(
    @Body()
    patch: {
      instituteName?: string;
      instituteEmail?: string;
      address?: string;
      mobile?: string;
      currency?: string;
      currencySymbol?: string;
      timezone?: string;
      footerText?: string;
      alertDaysContract?: number;
      alertDaysResidency?: number;
    },
  ) {
    return this.settings.updateGlobal(patch);
  }
}
