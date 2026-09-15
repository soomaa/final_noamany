import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccountsService } from './accounts.service';
import {
  CreateAccountDto,
  ListAccountsDto,
  NextCodeQueryDto,
  UpdateAccountDto,
  UpdateAccountingSettingsDto,
  CreateAccountingPeriodDto,
} from './dto/accounting.dto';

@UseGuards(JwtAuthGuard)
@Controller('accounting/accounts')
@RequiresPermission('accounting.accounts:view')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get('tree')
  tree() {
    return this.service.tree();
  }

  @Get('next-code')
  nextCode(@Query() query: NextCodeQueryDto) {
    return this.service.nextCode(query);
  }

  @Post('seed-defaults')
  @RequiresPermission('accounting.accounts:create')
  seedDefaults() {
    return this.service.seedDefaults();
  }

  @Post('seed-full-gym')
  @RequiresPermission('accounting.accounts:create')
  seedFullGym() {
    return this.service.seedFullGymTree();
  }

  @Get()
  list(@Query() query: ListAccountsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('accounting.accounts:create')
  create(@Body() body: CreateAccountDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('accounting.accounts:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateAccountDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('accounting.accounts:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('accounting/settings')
@RequiresPermission('accounting.settings:view')
export class AccountingSettingsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  getSettings() {
    return this.service.getSettings();
  }

  @Put()
  @RequiresPermission('accounting.settings:update')
  updateSettings(@Body() body: UpdateAccountingSettingsDto) {
    return this.service.updateSettings(body);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('accounting/periods')
@RequiresPermission('accounting.settings:view')
export class AccountingPeriodsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  listPeriods() {
    return this.service.listPeriods();
  }

  @Post()
  @RequiresPermission('accounting.settings:update')
  createPeriod(@Body() body: CreateAccountingPeriodDto) {
    return this.service.createPeriod(body);
  }

  @Post(':id/close')
  @RequiresPermission('accounting.settings:update')
  closePeriod(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) {
    return this.service.closePeriod(id, userId);
  }

  @Post(':id/reopen')
  @RequiresPermission('accounting.settings:update')
  reopenPeriod(@Param('id', ParseIntPipe) id: number) {
    return this.service.reopenPeriod(id);
  }
}
