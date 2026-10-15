import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreatePayComponentDto,
  CreatePayrollRunDto,
  ListPayrollRunsDto,
  UpdatePayComponentDto,
} from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

@UseGuards(JwtAuthGuard)
@Controller('payroll')
@RequiresPermission('payroll:view')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('components')
  listComponents(@Query() q: PaginationDto) {
    return this.payroll.listComponents(q);
  }

  @Post('components')
  @RequiresPermission('payroll:create')
  createComponent(@Body() dto: CreatePayComponentDto) {
    return this.payroll.createComponent(dto);
  }

  @Patch('components/:id')
  @RequiresPermission('payroll:update')
  updateComponent(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePayComponentDto) {
    return this.payroll.updateComponent(id, dto);
  }

  @Delete('components/:id')
  @RequiresPermission('payroll:delete')
  removeComponent(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.removeComponent(id);
  }

  @Post('runs')
  @RequiresPermission('payroll:create')
  createRun(@Body() dto: CreatePayrollRunDto) {
    return this.payroll.createRun(dto);
  }

  @Get('runs')
  listRuns(@Query() q: ListPayrollRunsDto) {
    return this.payroll.listRuns(q);
  }

  @Get('runs/:id/lines')
  listRunLines(@Param('id', ParseIntPipe) id: number, @Query() q: PaginationDto) {
    return this.payroll.listRunLines(id, q);
  }

  @Get('runs/:id/slip/:empId')
  getSlip(
    @Param('id', ParseIntPipe) id: number,
    @Param('empId', ParseIntPipe) empId: number,
  ) {
    return this.payroll.getSlip(id, empId);
  }

  @Post('runs/:id/:action')
  @RequiresPermission('payroll:approve')
  runAction(
    @Param('id', ParseIntPipe) id: number,
    @Param('action') action: string,
    @CurrentUser('sub') userId: number,
  ) {
    return this.payroll.runAction(id, action, userId);
  }

  @Get('runs/:id')
  findRun(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.findRun(id);
  }

  @Delete('runs/:id')
  @RequiresPermission('payroll:delete')
  removeRun(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.removeRun(id);
  }
}
