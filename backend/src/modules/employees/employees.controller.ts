import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { EmployeesService } from './employees.service';

@UseGuards(JwtAuthGuard)
@Controller('employees')
@RequiresPermission('employees.list:view')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@Query() query: ListEmployeesDto) {
    return this.employees.list(query);
  }

  // Static route must precede ':id'
  @Get('next-code')
  nextCode(@Query('edaraId') edaraId?: string) {
    const id = edaraId ? Number(edaraId) : undefined;
    return this.employees.nextCode(Number.isNaN(id as number) ? undefined : id);
  }

  @Get('sales-reps')
  @RequiresPermission('club.members:view', 'club.members:create')
  salesReps() {
    return this.employees.salesReps();
  }

  @Get('pos-options')
  @RequiresPermission('gym-sales.sales.new_receipt:view', 'gym-sales.sales.treasury:view', 'gym-sales.sales.settlements:view')
  posOptions() {
    return this.employees.posOptions();
  }

  @Get(':id/identity')
  identity(@Param('id', ParseIntPipe) id: number) {
    return this.employees.identity(id);
  }

  @Get(':id')
  findForForm(@Param('id', ParseIntPipe) id: number) {
    return this.employees.findForForm(id);
  }

  @Get(':id/profile')
  profile(@Param('id', ParseIntPipe) id: number) {
    return this.employees.profile(id);
  }

  @Post()
  @RequiresPermission('employees.list:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser('sub') userId: number) {
    return this.employees.create(body, userId);
  }

  @Put(':id')
  @RequiresPermission('employees.list:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: number,
  ) {
    return this.employees.update(id, body, userId);
  }

  @Patch(':id/status')
  @RequiresPermission('employees.list:update')
  setStatus(@Param('id', ParseIntPipe) id: number, @Body('employee_type', ParseIntPipe) employeeType: number) {
    return this.employees.setStatus(id, employeeType);
  }

  @Delete(':id')
  @RequiresPermission('employees.list:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.employees.remove(id);
  }

  @Get(':id/finance')
  getFinance(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getFinance(id);
  }

  @Put(':id/finance')
  putFinance(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { rows?: unknown[]; basic_salary?: string },
    @CurrentUser('sub') userId: number,
  ) {
    return this.employees.putFinance(id, body, userId);
  }

  @Delete(':id/finance/:rowId')
  deleteFinanceRow(
    @Param('id', ParseIntPipe) id: number,
    @Param('rowId', ParseIntPipe) rowId: number,
  ) {
    return this.employees.deleteFinanceRow(id, rowId);
  }

  @Get(':id/dwam')
  getDwam(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getDwam(id);
  }

  @Put(':id/dwam')
  putDwam(@Param('id', ParseIntPipe) id: number, @Body() body: {
    shiftId?: number | string;
    branchId?: number | string;
    hdoorFromTime?: string;
    hdoorToTime?: string;
    hdoorKhasmFrom?: string;
    ensrafFromTime?: string;
    ensrafToTime?: string;
    ensrafKhasmFrom?: string;
    schedule?: unknown[];
    shift_type?: string;
  }) {
    return this.employees.putDwam(id, body);
  }

  @Delete(':id/dwam/:assignmentId')
  deleteDwamAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
  ) {
    return this.employees.deleteDwamAssignment(id, assignmentId);
  }

  @Get(':id/banks')
  getBanks(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getBanks(id);
  }

  @Put(':id/banks')
  putBanks(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      rows?: Array<{
        bank_id_fk: number;
        bank_account_num: string;
        bank_code?: string;
        approved_for_sarf?: number | boolean;
        emp_bank_name?: string;
      }>;
    },
  ) {
    return this.employees.putBanks(id, body);
  }

  @Get(':id/contract')
  getContract(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getContract(id);
  }

  @Put(':id/contract')
  putContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.employees.putContract(id, body);
  }

  @Get(':id/documents')
  getDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getDocuments(id);
  }

  @Put(':id/documents')
  putDocuments(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      rows?: Array<{
        id?: number;
        file_type?: string;
        file_name?: string;
        file_path?: string;
        expire_date?: string;
      }>;
    },
  ) {
    return this.employees.putDocuments(id, body);
  }

  @Get(':id/insurance')
  getInsurance(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getInsurance(id);
  }

  @Post(':id/app-user')
  @RequiresPermission('employees.list:update')
  convertToAppUser(@Param('id', ParseIntPipe) id: number) {
    return this.employees.convertToAppUser(id);
  }

  @Delete(':id/app-user')
  @RequiresPermission('employees.list:delete')
  removeAppUser(@Param('id', ParseIntPipe) id: number) {
    return this.employees.removeAppUser(id);
  }
}
