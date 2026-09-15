import {
  Body,
  Controller,
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
import { JwtUser } from '../../common/types/jwt-user';
import { isDryRun } from '../../common/preview';
import {
  CreateQuickSaleDto,
  EditCompletedQuickSaleDto,
  InvoiceFeedbackDto,
  InvoiceItemFeedbackDto,
  ListCafeCustomersDto,
  ListQuickSalesDto,
  UpdateQuickSaleDto,
} from './dto/quick-sales.dto';
import { QuickSalesService } from './quick-sales.service';

@UseGuards(JwtAuthGuard)
@Controller('quick-sales')
@RequiresPermission(
  'gym-sales.sales.new_receipt:view',
  'gym-sales.sales.drafts:view',
)
export class QuickSalesController {
  constructor(private readonly service: QuickSalesService) {}

  @Get()
  list(@Query() query: ListQuickSalesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('shift-board')
  shiftBoard(
    @Query('branchId') branchId: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.shiftBoard(
      { branchId, limit: limit ? Number(limit) : 2 },
      user,
    );
  }

  @Get('stats/summary')
  summary(@Query() query: ListQuickSalesDto, @CurrentUser() user: JwtUser) {
    return this.service.summary(query, user);
  }

  @Get('customers')
  @RequiresPermission('club.cafe.customers:view')
  customers(@Query() query: ListCafeCustomersDto, @CurrentUser() user: JwtUser) {
    return this.service.customers(query, user);
  }

  @Get('customers/lookup')
  @RequiresPermission('gym-sales.sales.new_receipt:view')
  customerLookup(
    @Query('branchId', ParseIntPipe) branchId: number,
    @Query('phone') phone: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.customerLookup(branchId, phone, user);
  }

  @Get('customers/member-search')
  @RequiresPermission('gym-sales.sales.new_receipt:view')
  customerMemberSearch(
    @Query('branchId', ParseIntPipe) branchId: number,
    @Query('query') query: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.customerMemberSearch(branchId, query, user);
  }

  @Get('customers/member-lookup')
  @RequiresPermission('gym-sales.sales.new_receipt:view')
  customerMemberLookup(
    @Query('branchId', ParseIntPipe) branchId: number,
    @Query('code') code: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.customerMemberLookup(branchId, code, user);
  }

  @Get('customers/:kind/:key')
  @RequiresPermission('club.cafe.customers:view')
  customerDetail(
    @Param('kind') kind: string,
    @Param('key') key: string,
    @Query('branchId', ParseIntPipe) branchId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.customerDetail(branchId, kind, key, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Get('employees/:employeeId/benefits')
  async employeeBenefits(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query('branchId', ParseIntPipe) branchId: number,
    @Query('draftId') draftId: string | undefined,
    @Query('editId') editId: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    const draft = draftId || editId ? await this.service.findOne(Number(editId || draftId), user) : null;
    const editing = draft?.status === (editId ? 'completed' : 'draft') && draft.employeeId === employeeId && draft.branchId === branchId;
    return this.service.employeeBenefits(employeeId, branchId, user, editing ? draft.id : undefined,
      editing && editId ? draft.employeeBenefitDate || draft.saleDate : undefined);
  }

  @Post()
  @RequiresPermission('gym-sales.sales.new_receipt:create')
  create(@Body() body: CreateQuickSaleDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user.sub, user);
  }

  @Put(':id/draft')
  @RequiresPermission('gym-sales.sales.drafts:update', 'gym-sales.sales.new_receipt:update')
  reviseDraft(@Param('id', ParseIntPipe) id: number, @Body() body: CreateQuickSaleDto, @CurrentUser() user: JwtUser) {
    return this.service.reviseDraft(id, body, user.sub, false, user);
  }

  @Put(':id/completed')
  @RequiresPermission('gym-sales.sales.drafts:update')
  editCompleted(@Param('id', ParseIntPipe) id: number, @Body() body: EditCompletedQuickSaleDto, @CurrentUser() user: JwtUser) {
    return this.service.editCompleted(id, body, user.sub, user);
  }

  @Post(':id/finalize')
  @RequiresPermission('gym-sales.sales.drafts:update', 'gym-sales.sales.new_receipt:update')
  finalizeDraft(@Param('id', ParseIntPipe) id: number, @Body() body: CreateQuickSaleDto, @CurrentUser() user: JwtUser) {
    return this.service.reviseDraft(id, body, user.sub, true, user);
  }

  @Post(':id/cancel-draft')
  @RequiresPermission('gym-sales.sales.drafts:update', 'gym-sales.sales.new_receipt:update')
  cancelDraft(@Param('id', ParseIntPipe) id: number, @Body('notes') notes: string | undefined, @CurrentUser() user: JwtUser) {
    return this.service.cancelDraft(id, notes, user.sub, user);
  }

  @Put(':id/feedback')
  @RequiresPermission('gym-sales.sales.drafts:update')
  feedback(@Param('id', ParseIntPipe) id: number, @Body() body: InvoiceFeedbackDto, @CurrentUser() user: JwtUser) {
    return this.service.saveFeedback(id, body.rating, body.comment, user.sub, user);
  }

  @Put(':id/item-feedback')
  @RequiresPermission('gym-sales.sales.drafts:update')
  itemFeedback(@Param('id', ParseIntPipe) id: number, @Body() body: InvoiceItemFeedbackDto, @CurrentUser() user: JwtUser) {
    return this.service.saveItemFeedback(id, body.items, user.sub, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.sales.drafts:approve')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateQuickSaleDto,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.update(id, body, user.sub, isDryRun(dryRun), user);
  }

  @Post(':id/refund')
  @RequiresPermission('gym-sales.sales.drafts:approve')
  refund(
    @Param('id', ParseIntPipe) id: number,
    @Body('notes') notes: string,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.update(
      id,
      { status: 'refunded', notes },
      user.sub,
      isDryRun(dryRun),
      user,
    );
  }

  @Post(':id/cancel-completed')
  @RequiresPermission('gym-sales.sales.drafts:delete')
  cancelCompleted(
    @Param('id', ParseIntPipe) id: number,
    @Body('notes') notes: string,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.update(
      id,
      { status: 'cancelled', notes },
      user.sub,
      isDryRun(dryRun),
      user,
    );
  }

  @Put(':id/print')
  @RequiresPermission('gym-sales.sales.drafts:print', 'gym-sales.sales.new_receipt:print')
  markPrinted(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.markPrinted(id, user);
  }
}

