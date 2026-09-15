import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ExportService } from '../../common/export/export.service';
import { SupplierDashboardQueryDto } from './dto/procurement-ext.dto';
import { SupplierDashboardService } from './supplier-dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('supplier-dashboard')
@RequiresPermission('gym-sales.procurement:view')
export class SupplierDashboardController {
  constructor(
    private readonly service: SupplierDashboardService,
    private readonly exportService: ExportService,
  ) {}

  @Get('stats')
  stats(@Query() query: SupplierDashboardQueryDto) {
    return this.service.stats(query);
  }

  @Get('top')
  top(@Query() query: SupplierDashboardQueryDto) {
    return this.service.top(query);
  }

  @Get('activity')
  activity(@Query() query: SupplierDashboardQueryDto) {
    return this.service.activity(query);
  }

  @Get('performance')
  performance(@Query() query: SupplierDashboardQueryDto) {
    return this.service.performance(query);
  }

  @Get('alerts')
  alerts(@Query() query: SupplierDashboardQueryDto) {
    return this.service.alerts(query);
  }

  @Post('export')
  @RequiresPermission('gym-sales.procurement:export')
  async exportSuppliers(@Query('format') format: string | undefined, @Res() res: Response) {
    const top = await this.service.top({ limit: 1000 });
    const cols = [
      { key: 'name', header: 'المورد' },
      { key: 'totalAmount', header: 'إجمالي المشتريات' },
      { key: 'status', header: 'الحالة' },
      { key: 'rating', header: 'التقييم' },
    ];
    const rows = (top as Array<{ supplierName?: string; totalAmount?: number; status?: string; supplierRating?: number }>).map((s) => ({
      name: s.supplierName ?? '—',
      totalAmount: s.totalAmount ?? 0,
      status: s.status ?? '—',
      rating: s.supplierRating ?? 0,
    }));
    if (format === 'xlsx') {
      await this.exportService.sendXlsx(res, 'suppliers.xlsx', [{ name: 'الموردين', columns: cols, rows }]);
    } else {
      this.exportService.sendCsv(res, 'suppliers.csv', cols, rows);
    }
  }
}
