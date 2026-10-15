import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { isDryRun } from '../../common/preview/dry-run.util';
import { BulkReplaceInsuranceDto } from './dto/insurance-settings.dto';
import { InsuranceSettingsService } from './insurance-settings.service';

@UseGuards(JwtAuthGuard)
@Controller('settings/insurance')
@RequiresPermission('admin.insurance:view')
export class InsuranceSettingsController {
  constructor(private readonly insurance: InsuranceSettingsService) {}

  @Get()
  getAll() {
    return this.insurance.getAll();
  }

  /** Flat (nationality × component) rate list — consumed by the GOSI/payroll engine. */
  @Get('rates')
  getRates() {
    return this.insurance.getRates();
  }

  // admin.insurance is a SETTINGS resource (view/update/configure/audit) —
  // all mutations map to the `update` action.
  @Put()
  @RequiresPermission('admin.insurance:update')
  bulkReplace(@Body() dto: BulkReplaceInsuranceDto, @Query('dryRun') dryRun?: string) {
    return this.insurance.replaceByNationality(dto, isDryRun(dryRun));
  }

  @Put(':nationalityType')
  @RequiresPermission('admin.insurance:update')
  replaceOne(
    @Param('nationalityType', ParseIntPipe) nationalityType: number,
    @Body() dto: BulkReplaceInsuranceDto,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.insurance.replaceByNationality({ ...dto, nationalityType }, isDryRun(dryRun));
  }

  @Delete(':nationalityType')
  @RequiresPermission('admin.insurance:update')
  remove(@Param('nationalityType', ParseIntPipe) nationalityType: number) {
    return this.insurance.removeByNationality(nationalityType);
  }
}
