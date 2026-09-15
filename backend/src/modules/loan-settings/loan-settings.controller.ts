import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { LoanSettingsService } from './loan-settings.service';

@UseGuards(JwtAuthGuard)
@Controller('loans/settings')
@RequiresPermission('finance.loan_settings:view')
export class LoanSettingsController {
  constructor(private readonly service: LoanSettingsService) {}

  @Get()
  list(@Query() q: PaginationDto) {
    return this.service.listDawabt(q);
  }

  @Get('main')
  getMain() {
    return this.service.getMain();
  }

  @Patch('main')
  @RequiresPermission('finance.loan_settings:update')
  updateMain(
    @Body()
    body: {
      da3mValue?: number;
      aqsaModaSadad?: number;
      hadAdna?: number;
      ratebAsasy?: number;
      bdlSakn?: number;
      bdlMowaslat?: number;
      bdlJwal?: number;
      ratebMokto3?: number;
      bdlAmal?: number;
      bdlTaklef?: number;
      bdlMa3esha?: number;
    },
  ) {
    return this.service.updateMain(body);
  }

  @Get('dawabt')
  listDawabt(@Query() q: PaginationDto) {
    return this.service.listDawabt(q);
  }

  @Post('dawabt')
  @RequiresPermission('finance.loan_settings:configure')
  createDawabt(@Body() body: { title: string; type: number }) {
    return this.service.createDawabt(body);
  }

  @Patch('dawabt/:id')
  @RequiresPermission('finance.loan_settings:update')
  updateDawabt(@Param('id', ParseIntPipe) id: number, @Body() body: { title?: string; type?: number }) {
    return this.service.updateDawabt(id, body);
  }

  @Delete('dawabt/:id')
  @RequiresPermission('finance.loan_settings:configure')
  removeDawabt(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeDawabt(id);
  }

  @Get('accounts')
  listAccounts(@Query() q: PaginationDto) {
    return this.service.listAccounts(q);
  }

  @Post('accounts')
  @RequiresPermission('finance.loan_settings:configure')
  createAccount(
    @Body() body: { empId: number; empCode?: number; empName?: string; accountNumber: string; accountName: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.createAccount(body, user.sub, user.name);
  }

  @Patch('accounts/:id')
  @RequiresPermission('finance.loan_settings:update')
  updateAccount(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { empId?: number; empCode?: number; empName?: string; accountNumber?: string; accountName?: string },
  ) {
    return this.service.updateAccount(id, body);
  }

  @Delete('accounts/:id')
  @RequiresPermission('finance.loan_settings:configure')
  removeAccount(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeAccount(id);
  }
}
