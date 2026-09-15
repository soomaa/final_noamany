import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BillingStatementsService } from './billing-statements.service';
import {
  BillingPreviewQueryDto,
  CreateBillingStatementDto,
  ListBillingStatementsDto,
  SettleBillingStatementDto,
} from './dto/billing-statements.dto';

@UseGuards(JwtAuthGuard)
@Controller('billing-statements')
@RequiresPermission('gym-sales.sales:view')
export class BillingStatementsController {
  constructor(private readonly service: BillingStatementsService) {}

  @Get('preview')
  preview(@Query() query: BillingPreviewQueryDto) { return this.service.preview(query); }

  @Get()
  list(@Query() query: ListBillingStatementsDto) { return this.service.list(query); }

  @Post()
  @RequiresPermission('gym-sales.sales:create')
  create(@Body() body: CreateBillingStatementDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Post(':id/settle')
  @RequiresPermission('gym-sales.sales:update')
  settle(@Param('id', ParseIntPipe) id: number, @Body() body: SettleBillingStatementDto, @CurrentUser('sub') userId: number) {
    return this.service.settle(id, body, userId);
  }
}
