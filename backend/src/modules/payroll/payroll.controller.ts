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
import { JwtUser } from '../../common/types/jwt-user';
import {
  ApplySalaryOverridesDto,
  CreatePayComponentDto,
  ListPayComponentsDto,
  CreatePayrollRunDto,
  CreateSalaryIncreaseDto,
  ListPayrollRunsDto,
  ListSalaryIncreasesDto,
  PayrollPreviewDto,
  UpdatePayComponentDto,
  UpdateSalaryIncreaseDto,
} from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

@UseGuards(JwtAuthGuard)
@Controller('payroll')
@RequiresPermission('payroll:view')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('components')
  listComponents(@Query() q: ListPayComponentsDto) {
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

  @Get('preview')
  previewSalarySheet(@Query() q: PayrollPreviewDto, @CurrentUser() user: JwtUser) {
    return this.payroll.previewSalarySheet(q, user);
  }

  @Get('salary-increases')
  listSalaryIncreases(@Query() q: ListSalaryIncreasesDto) {
    return this.payroll.listSalaryIncreases(q);
  }

  @Post('salary-increases')
  @RequiresPermission('payroll:create')
  createSalaryIncrease(
    @Body() dto: CreateSalaryIncreaseDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.payroll.createSalaryIncrease(dto, userId);
  }

  @Patch('salary-increases/:id')
  @RequiresPermission('payroll:update')
  updateSalaryIncrease(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalaryIncreaseDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.payroll.updateSalaryIncrease(id, dto, userId);
  }

  @Delete('salary-increases/:id')
  @RequiresPermission('payroll:delete')
  removeSalaryIncrease(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.removeSalaryIncrease(id);
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

  @Patch('runs/:id/slip/:empId/overrides')
  @RequiresPermission('payroll:update')
  applySlipOverrides(
    @Param('id', ParseIntPipe) id: number,
    @Param('empId', ParseIntPipe) empId: number,
    @Body() dto: ApplySalaryOverridesDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.payroll.applySlipOverrides(id, empId, dto, userId);
  }

  @Get('runs/:id/bank-file')
  getBankFile(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.generateBankFile(id);
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
