import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ExportService } from '../../common/export/export.service';
import { JwtUser } from '../../common/types/jwt-user';
import { UnifiedTreasuryService } from './unified-treasury.service';

@UseGuards(JwtAuthGuard)
@Controller('treasury')
@RequiresPermission('club.dashboard:view')
export class UnifiedTreasuryController {
  constructor(
    private readonly service: UnifiedTreasuryService,
    private readonly exportService: ExportService,
  ) {}

  @Get('daily')
  daily(
    @CurrentUser() user: JwtUser,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.daily(
      {
        date,
        dateFrom,
        dateTo,
        branchId: branchId ? Number(branchId) : undefined,
      },
      user,
    );
  }

  @Get('daily/export')
  @RequiresPermission('club.dashboard:export')
  async exportDaily(
    @CurrentUser() user: JwtUser,
    @Query('date') date: string | undefined,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.service.daily(
      {
        date,
        dateFrom,
        dateTo,
        branchId: branchId ? Number(branchId) : undefined,
      },
      user,
    );
    const sheets = this.service.buildExportSheets(data);
    const stamp = data.date ?? `${data.dateFrom ?? 'all'}_${data.dateTo ?? 'all'}`;
    const filename = `treasury_${stamp}.xlsx`;
    if (format === 'csv') {
      this.exportService.sendCsv(res, `treasury_${stamp}.csv`, sheets[0].columns, sheets[0].rows);
    } else {
      await this.exportService.sendXlsx(res, filename, sheets);
    }
  }
}
