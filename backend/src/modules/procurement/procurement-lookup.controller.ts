import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ProcurementLookupDto } from './dto/procurement-ext.dto';
import { ProcurementLookupService } from './procurement-lookup.service';

@UseGuards(JwtAuthGuard)
@Controller('procurement/search')
@RequiresPermission('gym-sales.procurement:view')
export class ProcurementLookupController {
  constructor(private readonly service: ProcurementLookupService) {}

  @Get()
  search(@Query() query: ProcurementLookupDto) {
    return this.service.search(query);
  }
}
