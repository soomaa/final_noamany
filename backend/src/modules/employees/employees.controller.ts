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
import { JwtUser } from '../../common/types/jwt-user';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { EmployeesService } from './employees.service';
import { PutWeeklyScheduleDto } from './dto/weekly-schedule.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';

@UseGuards(JwtAuthGuard)
@Controller('employees')
@RequiresPermission('employees.list:view')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  // Branch isolation: lists/pickers are clamped to the caller's branch scope inside the
  // service, and every `:id` route first checks the employee belongs to that scope
  // (`inScope`). System admins are unrestricted.
  private inScope(user: JwtUser, id: number) {
    return this.employees.assertEmployeeInScope(user, id);
  }

  @Get()
  list(@Query() query: ListEmployeesDto, @CurrentUser() user: JwtUser) {
    return this.employees.list(query, user);
  }

  // Static route must precede ':id'
  @Get('next-code')
  nextCode(@Query('edaraId') edaraId?: string) {
    const id = edaraId ? Number(edaraId) : undefined;
    return this.employees.nextCode(Number.isNaN(id as number) ? undefined : id);
  }

  @Get('sales-reps')
  @RequiresPermission('club.members:view', 'club.members:create')
  salesReps(@CurrentUser() user: JwtUser) {
    return this.employees.salesReps(user);
  }

  @Get('pos-options')
  @RequiresPermission('gym-sales.sales.new_receipt:view', 'gym-sales.sales.treasury:view', 'gym-sales.sales.settlements:view', 'gym-sales.procurement:create')
  posOptions(@CurrentUser() user: JwtUser) {
    return this.employees.posOptions(user);
  }

  // Static route must precede ':id'.
  @Get('subscription-options')
  @RequiresPermission('club.subscriptions:create', 'club.subscriptions.list:create', 'club.subscriptions.new:create', 'club.lockers:create', 'club.lockers:update')
  subscriptionOptions(@CurrentUser() user: JwtUser) {
    return this.employees.subscriptionOptions(user);
  }

  @Get(':id/identity')
  async identity(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.identity(id);
  }

  @Get(':id')
  async findForForm(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.findForForm(id);
  }

  @Get(':id/profile')
  async profile(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.profile(id);
  }

  @Post()
  @RequiresPermission('employees.list:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    this.employees.assertEmployeeBodyInScope(user, body, true);
    return this.employees.create(body, user.sub);
  }

  @Put(':id')
  @RequiresPermission('employees.list:update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    await this.inScope(user, id);
    this.employees.assertEmployeeBodyInScope(user, body, false);
    return this.employees.update(id, body, user.sub);
  }

  @Patch(':id/status')
  @RequiresPermission('employees.list:update')
  async setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    await this.inScope(user, id);
    return this.employees.setStatus(id, dto.employee_type);
  }

  @Delete(':id')
  @RequiresPermission('employees.list:delete')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.remove(id);
  }

  @Get(':id/finance')
  async getFinance(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.getFinance(id);
  }

  // Writes below used to inherit only the class-level `:view`; they now need update/delete.
  @Put(':id/finance')
  @RequiresPermission('employees.list:update')
  async putFinance(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { rows?: unknown[]; basic_salary?: string },
    @CurrentUser() user: JwtUser,
  ) {
    await this.inScope(user, id);
    return this.employees.putFinance(id, body, user.sub);
  }

  @Delete(':id/finance/:rowId')
  @RequiresPermission('employees.list:delete')
  async deleteFinanceRow(
    @Param('id', ParseIntPipe) id: number,
    @Param('rowId', ParseIntPipe) rowId: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.inScope(user, id);
    return this.employees.deleteFinanceRow(id, rowId);
  }

  @Get(':id/dwam')
  async getDwam(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.getDwam(id);
  }

  @Get(':id/weekly-schedule')
  async getWeeklySchedule(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Query('date') date?: string,
  ) {
    await this.inScope(user, id);
    return this.employees.getWeeklySchedule(id, date);
  }

  @Put(':id/weekly-schedule')
  @RequiresPermission('employees.list:update')
  async putWeeklySchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PutWeeklyScheduleDto,
    @CurrentUser() user: JwtUser,
  ) {
    await this.inScope(user, id);
    this.employees.assertScheduleInScope(user, dto);
    return this.employees.putWeeklySchedule(id, dto, user.sub);
  }

  @Post(':id/weekly-schedule/validate')
  @RequiresPermission('employees.list:update')
  async validateWeeklySchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PutWeeklyScheduleDto,
    @CurrentUser() user: JwtUser,
  ) {
    await this.inScope(user, id);
    this.employees.assertScheduleInScope(user, dto);
    return this.employees.validateWeeklySchedule(id, dto);
  }

  @Put(':id/dwam')
  @RequiresPermission('employees.list:update')
  async putDwam(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Body() body: {
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
    },
  ) {
    await this.inScope(user, id);
    return this.employees.putDwam(id, body);
  }

  @Delete(':id/dwam/:assignmentId')
  @RequiresPermission('employees.list:delete')
  async deleteDwamAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.inScope(user, id);
    return this.employees.deleteDwamAssignment(id, assignmentId);
  }

  @Get(':id/banks')
  async getBanks(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.getBanks(id);
  }

  @Put(':id/banks')
  @RequiresPermission('employees.list:update')
  async putBanks(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
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
    await this.inScope(user, id);
    return this.employees.putBanks(id, body);
  }

  @Get(':id/contract')
  async getContract(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.getContract(id);
  }

  @Put(':id/contract')
  @RequiresPermission('employees.list:update')
  async putContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    await this.inScope(user, id);
    return this.employees.putContract(id, body);
  }

  @Get(':id/documents')
  async getDocuments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.getDocuments(id);
  }

  @Put(':id/documents')
  @RequiresPermission('employees.list:update')
  async putDocuments(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
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
    await this.inScope(user, id);
    return this.employees.putDocuments(id, body);
  }

  @Get(':id/insurance')
  async getInsurance(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.getInsurance(id);
  }

  @Post(':id/app-user')
  @RequiresPermission('employees.list:update')
  async convertToAppUser(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.convertToAppUser(id);
  }

  @Delete(':id/app-user')
  @RequiresPermission('employees.list:delete')
  async removeAppUser(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.inScope(user, id);
    return this.employees.removeAppUser(id);
  }
}
