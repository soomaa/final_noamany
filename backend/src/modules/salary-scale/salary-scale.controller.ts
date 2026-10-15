import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SalaryScaleService } from './salary-scale.service';
import { CreateSalaryScaleDto, UpdateSalaryScaleDto } from './dto/salary-scale.dto';

@UseGuards(JwtAuthGuard)
@Controller('payroll/salary-scale')
@RequiresPermission('payroll.salary_scale:view')
export class SalaryScaleController {
  constructor(private readonly service: SalaryScaleService) {}

  @Get()
  list(@Query() q: PaginationDto) {
    return this.service.list(q);
  }

  @Post()
  @RequiresPermission('payroll.salary_scale:create')
  create(@Body() body: CreateSalaryScaleDto) {
    return this.service.create(body);
  }

  @Post(':id/apply')
  @RequiresPermission('payroll.salary_scale:update')
  applyToEmployees(@Param('id', ParseIntPipe) id: number) {
    return this.service.applyToEmployees(id);
  }

  @Patch(':id')
  @RequiresPermission('payroll.salary_scale:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSalaryScaleDto,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('payroll.salary_scale:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
