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
import { EmployeeRecordScopeGuard } from '../../common/hr-scope/employee-record-scope.guard';
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';
import { HrScopeSafeLookup } from '../../common/hr-scope/hr-scope-safe-lookup.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import {
  EmployeeContractDto,
  EmployeePayloadDto,
  UpdateEmployeeBanksDto,
  UpdateEmployeeDocumentsDto,
  UpdateEmployeeDwamDto,
  UpdateEmployeeFinanceDto,
} from './dto/employee-mutation.dto';

@UseGuards(JwtAuthGuard, EmployeeRecordScopeGuard)
@Controller('employees')
@RequiresPermission('employees.list:view')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @ScopedHrData()
  list(@Query() query: ListEmployeesDto, @CurrentUser() user: JwtUser) {
    return this.employees.list(query, user);
  }

  // Static route must precede ':id'
  @Get('next-code')
  @HrScopeSafeLookup()
  @RequiresPermission(
    'employees.list:view',
    'employees.list:create',
    'employees.new:create',
  )
  nextCode(@Query('edaraId') edaraId?: string) {
    const id = edaraId ? Number(edaraId) : undefined;
    return this.employees.nextCode(Number.isNaN(id as number) ? undefined : id);
  }

  @Get(':id')
  @ScopedHrData()
  findForForm(@Param('id', ParseIntPipe) id: number) {
    return this.employees.findForForm(id);
  }

  @Get(':id/profile')
  @ScopedHrData()
  profile(@Param('id', ParseIntPipe) id: number) {
    return this.employees.profile(id);
  }

  @Post()
  @ScopedHrData()
  @RequiresPermission('employees.list:create', 'employees.new:create')
  create(@Body() body: EmployeePayloadDto, @CurrentUser('sub') userId: number) {
    return this.employees.create(body, userId);
  }

  @Put(':id')
  @ScopedHrData()
  @RequiresPermission('employees.list:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EmployeePayloadDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.employees.update(id, body, userId);
  }

  @Patch(':id/status')
  @ScopedHrData()
  @RequiresPermission('employees.list:update')
  setStatus(@Param('id', ParseIntPipe) id: number, @Body('employee_type', ParseIntPipe) employeeType: number) {
    return this.employees.setStatus(id, employeeType);
  }

  @Delete(':id')
  @ScopedHrData()
  @RequiresPermission('employees.list:delete')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
  ) {
    return this.employees.remove(id, userId);
  }

  @Post(':id/restore')
  @ScopedHrData()
  @RequiresPermission('employees.list:update')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.employees.restore(id);
  }

  @Get(':id/finance')
  @ScopedHrData()
  getFinance(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getFinance(id);
  }

  @Put(':id/finance')
  @ScopedHrData()
  @RequiresPermission('employees.list:update')
  putFinance(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateEmployeeFinanceDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.employees.putFinance(id, body, userId);
  }

  @Delete(':id/finance/:rowId')
  @ScopedHrData()
  @RequiresPermission('employees.list:delete')
  deleteFinanceRow(
    @Param('id', ParseIntPipe) id: number,
    @Param('rowId', ParseIntPipe) rowId: number,
  ) {
    return this.employees.deleteFinanceRow(id, rowId);
  }

  @Get(':id/dwam')
  @ScopedHrData()
  getDwam(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getDwam(id);
  }

  @Put(':id/dwam')
  @ScopedHrData()
  @RequiresPermission('employees.list:update')
  putDwam(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateEmployeeDwamDto) {
    return this.employees.putDwam(id, body);
  }

  @Get(':id/banks')
  @ScopedHrData()
  getBanks(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getBanks(id);
  }

  @Put(':id/banks')
  @ScopedHrData()
  @RequiresPermission('employees.list:update')
  putBanks(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateEmployeeBanksDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.employees.putBanks(id, body, userId);
  }

  @Get(':id/contract')
  @ScopedHrData()
  getContract(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getContract(id);
  }

  @Put(':id/contract')
  @ScopedHrData()
  @RequiresPermission('employees.list:update')
  putContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EmployeeContractDto,
  ) {
    return this.employees.putContract(id, body);
  }

  @Get(':id/documents')
  @ScopedHrData()
  getDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getDocuments(id);
  }

  @Put(':id/documents')
  @ScopedHrData()
  @RequiresPermission('employees.list:update')
  putDocuments(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateEmployeeDocumentsDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.employees.putDocuments(id, body, userId);
  }

  @Get(':id/insurance')
  @ScopedHrData()
  getInsurance(@Param('id', ParseIntPipe) id: number) {
    return this.employees.getInsurance(id);
  }

  @Post(':id/app-user')
  @ScopedHrData()
  @RequiresPermission('employees.list:update')
  convertToAppUser(@Param('id', ParseIntPipe) id: number) {
    return this.employees.convertToAppUser(id);
  }

  @Delete(':id/app-user')
  @ScopedHrData()
  @RequiresPermission('employees.list:delete')
  removeAppUser(@Param('id', ParseIntPipe) id: number) {
    return this.employees.removeAppUser(id);
  }
}
