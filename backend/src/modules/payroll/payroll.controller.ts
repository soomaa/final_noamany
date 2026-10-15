import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { CreatePayrollTaxPolicyDto } from './dto/payroll-tax-policy.dto';
import { PayrollTaxPolicyService } from './payroll-tax-policy.service';
import { CreateFinalSettlementDto, CreateSettlementPolicyDto } from './dto/final-settlement.dto';
import { FinalSettlementPolicyService } from './final-settlement-policy.service';
import { FinalSettlementService } from './final-settlement.service';
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('payroll')
@RequiresPermission('payroll.runs:view')
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly permissions: PermissionEngineService,
    private readonly taxPolicies: PayrollTaxPolicyService,
    private readonly settlementPolicies: FinalSettlementPolicyService,
    private readonly finalSettlements: FinalSettlementService,
  ) {}

  @Get('tax-policies')
  @RequiresPermission('payroll.setup:view')
  listTaxPolicies() {
    return this.taxPolicies.list();
  }

  @Post('tax-policies')
  @RequiresPermission('payroll.setup:update')
  createTaxPolicy(@Body() dto: CreatePayrollTaxPolicyDto, @CurrentUser('sub') userId: number) {
    return this.taxPolicies.create(dto, userId);
  }

  @Post('tax-policies/:id/publish')
  @RequiresPermission('payroll.setup:update')
  publishTaxPolicy(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) {
    return this.taxPolicies.publish(id, userId);
  }

  @Get('settlement-policies')
  @RequiresPermission('payroll.setup:view')
  listSettlementPolicies() {
    return this.settlementPolicies.list();
  }

  @Post('settlement-policies')
  @RequiresPermission('payroll.setup:update')
  createSettlementPolicy(@Body() dto: CreateSettlementPolicyDto, @CurrentUser('sub') userId: number) {
    return this.settlementPolicies.create(dto, userId);
  }

  @Post('settlement-policies/:id/publish')
  @RequiresPermission('payroll.setup:update')
  publishSettlementPolicy(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) {
    return this.settlementPolicies.publish(id, userId);
  }

  @Get('final-settlements')
  @ScopedHrData()
  @RequiresPermission('payroll.final_settlements:view')
  listFinalSettlements(@Query() q: PaginationDto, @CurrentUser() user: JwtUser) {
    return this.finalSettlements.list(q, user);
  }

  @Post('final-settlements')
  @ScopedHrData()
  @RequiresPermission('payroll.final_settlements:create')
  createFinalSettlement(@Body() dto: CreateFinalSettlementDto, @CurrentUser() user: JwtUser) {
    return this.finalSettlements.create(dto, user.sub, user);
  }

  @Get('final-settlements/:id')
  @ScopedHrData()
  @RequiresPermission('payroll.final_settlements:view')
  getFinalSettlement(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.finalSettlements.get(id, user);
  }

  @Post('final-settlements/:id/approve')
  @ScopedHrData()
  @RequiresPermission('payroll.final_settlements:approve')
  approveFinalSettlement(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.finalSettlements.approve(id, user.sub, user);
  }

  @Post('final-settlements/:id/post')
  @ScopedHrData()
  @RequiresPermission('payroll.final_settlements:execute')
  postFinalSettlement(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.finalSettlements.post(id, user.sub, user);
  }

  @Post('final-settlements/:id/pay')
  @ScopedHrData()
  @RequiresPermission('payroll.final_settlements:execute')
  payFinalSettlement(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.finalSettlements.pay(id, user.sub, user);
  }

  @Get('components')
  @RequiresPermission('payroll.pay_components:view')
  listComponents(@Query() q: PaginationDto) {
    return this.payroll.listComponents(q);
  }

  @Post('components')
  @RequiresPermission('payroll.pay_components:create')
  createComponent(@Body() dto: CreatePayComponentDto) {
    return this.payroll.createComponent(dto);
  }

  @Patch('components/:id')
  @RequiresPermission('payroll.pay_components:update')
  updateComponent(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePayComponentDto) {
    return this.payroll.updateComponent(id, dto);
  }

  @Delete('components/:id')
  @RequiresPermission('payroll.pay_components:delete')
  removeComponent(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.removeComponent(id);
  }

  @Post('runs')
  @ScopedHrData()
  @RequiresPermission('payroll.runs:create')
  createRun(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: JwtUser) {
    return this.payroll.createRun(dto, user);
  }

  @Get('runs')
  @ScopedHrData()
  @RequiresPermission('payroll.runs:view')
  listRuns(@Query() q: ListPayrollRunsDto, @CurrentUser() user: JwtUser) {
    return this.payroll.listRuns(q, user);
  }

  @Get('runs/:id/lines')
  @ScopedHrData()
  @RequiresPermission('payroll.runs:view')
  listRunLines(@Param('id', ParseIntPipe) id: number, @Query() q: PaginationDto, @CurrentUser() user: JwtUser) {
    return this.payroll.listRunLines(id, q, user);
  }

  @Get('runs/:id/slip/:empId')
  @ScopedHrData()
  @RequiresPermission('payroll.runs:view')
  getSlip(
    @Param('id', ParseIntPipe) id: number,
    @Param('empId', ParseIntPipe) empId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payroll.getSlip(id, empId, user);
  }

  @Get('runs/:id/bank-file')
  @ScopedHrData()
  @RequiresPermission('payroll.runs:execute')
  generateBankFile(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.payroll.generateBankFile(id, user);
  }

  @Get('runs/:id/reconciliation')
  @ScopedHrData()
  @RequiresPermission('payroll.runs:view')
  reconciliation(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.payroll.reconciliation(id, user);
  }

  @Post('runs/:id/:action')
  @ScopedHrData()
  async runAction(
    @Param('id', ParseIntPipe) id: number,
    @Param('action') action: string,
    @CurrentUser() user: JwtUser,
  ) {
    const permission = action === 'approve' ? 'payroll.runs:approve' : 'payroll.runs:execute';
    if (!(await this.permissions.canAny(user.sub, [permission]))) {
      throw new ForbiddenException('لا تملك صلاحية تنفيذ هذه الخطوة من مسيرة الرواتب');
    }
    return this.payroll.runAction(id, action, user.sub, user);
  }

  @Get('runs/:id')
  @ScopedHrData()
  findRun(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.payroll.findRun(id, user);
  }

  @Delete('runs/:id')
  @ScopedHrData()
  @RequiresPermission('payroll.runs:delete')
  removeRun(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.payroll.removeRun(id, user);
  }
}
