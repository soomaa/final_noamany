import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { UpdateProcurementSettingsDto } from './dto/procurement-ext.dto';
import { ProcurementSettingsService } from './procurement-settings.service';

@UseGuards(JwtAuthGuard)
@Controller('procurement-settings')
@RequiresPermission('gym-sales.procurement:view')
export class ProcurementSettingsController {
  constructor(private readonly service: ProcurementSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Put()
  @RequiresPermission('gym-sales.procurement:update')
  update(@Body() body: UpdateProcurementSettingsDto) {
    return this.service.update(body);
  }
}
