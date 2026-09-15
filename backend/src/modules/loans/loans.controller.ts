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
import { JwtUser } from '../../common/types/jwt-user';
import { CreateLoanDto } from './dto/create-loan.dto';
import { ListLoansDto } from './dto/list-loans.dto';
import { PayInstallmentDto } from './dto/pay-installment.dto';
import { isDryRun } from '../../common/preview/dry-run.util';
import { PostponeInstallmentDto } from './dto/postpone-installment.dto';
import { LoansService } from './loans.service';

@UseGuards(JwtAuthGuard)
@Controller('loans')
@RequiresPermission('finance.loans:view')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get()
  list(@Query() query: ListLoansDto) {
    return this.loans.list(query);
  }

  @Get('statement')
  statement() {
    return this.loans.statement();
  }

  @Get('statement/grid')
  statementGrid() {
    return this.loans.statementGrid();
  }

  @Get('ceiling/:empId')
  ceiling(@Param('empId', ParseIntPipe) empId: number) {
    return this.loans.ceiling(empId);
  }

  @Get('form-meta')
  formMeta() {
    return this.loans.formMeta();
  }

  @Post()
  @RequiresPermission('finance.loans:create')
  create(@Body() dto: CreateLoanDto, @CurrentUser() user: JwtUser) {
    return this.loans.create(dto, user.sub);
  }

  @Get(':id/schedule')
  schedule(@Param('id', ParseIntPipe) id: number) {
    return this.loans.schedule(id);
  }

  @Patch(':id/approve')
  @RequiresPermission('finance.loans:approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.loans.approve(id, user.sub);
  }

  @Patch(':id/reject')
  @RequiresPermission('finance.loans:reject')
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.loans.reject(id);
  }

  @Patch('installments/:questId/pay')
  @RequiresPermission('finance.loans:update')
  payInstallment(
    @Param('questId', ParseIntPipe) questId: number,
    @Body() dto: PayInstallmentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.loans.payInstallment(questId, dto, user.sub);
  }

  @Patch(':id/auto-deduct')
  @RequiresPermission('finance.loans:update')
  autoDeduct(
    @Param('id', ParseIntPipe) id: number,
    @Query('month') month?: string,
  ) {
    return this.loans.autoDeduct(id, month ? Number(month) : undefined);
  }

  @Post(':id/postpone')
  @RequiresPermission('finance.loans:update')
  postpone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PostponeInstallmentDto,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.loans.postponeInstallment(id, dto, user.sub, user.name, isDryRun(dryRun));
  }

  @Delete(':id')
  @RequiresPermission('finance.loans:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.loans.remove(id);
  }
}
