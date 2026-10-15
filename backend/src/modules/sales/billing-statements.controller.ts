import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { BillingStatementsService } from './billing-statements.service';
import {
  BillingPreviewQueryDto,
  CreateBillingStatementDto,
  ListBillingStatementsDto,
  SettleBillingStatementDto,
} from './dto/billing-statements.dto';

@UseGuards(JwtAuthGuard)
@Controller('billing-statements')
@RequiresPermission('gym-sales.sales.settlements:view')
export class BillingStatementsController {
  constructor(private readonly service: BillingStatementsService) {}

  @Get('preview')
  preview(@Query() query: BillingPreviewQueryDto, @CurrentUser() user: JwtUser) { return this.service.preview(query, user); }

  @Get()
  list(@Query() query: ListBillingStatementsDto, @CurrentUser() user: JwtUser) { return this.service.list(query, user); }

  @Post()
  @RequiresPermission('gym-sales.sales.settlements:create')
  create(@Body() body: CreateBillingStatementDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user.sub, user);
  }

  @Post(':id/settle')
  @RequiresPermission('gym-sales.sales.settlements:update')
  settle(@Param('id', ParseIntPipe) id: number, @Body() body: SettleBillingStatementDto, @CurrentUser() user: JwtUser) {
    return this.service.settle(id, body, user.sub, user);
  }
}
