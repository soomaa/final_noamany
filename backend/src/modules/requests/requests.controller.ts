import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { RequestsService } from './requests.service';
import { RequestFlowService } from './request-flow.service';
import { FLOW_KINDS, FlowActionDto, FlowKind, FlowResubmitDto, InboxQueryDto } from './dto/inbox.dto';

@UseGuards(JwtAuthGuard)
@Controller('requests')
@RequiresPermission('leaves.requests:view')
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly flow: RequestFlowService,
  ) {}

  @Get()
  list(@Query() query: ListRequestsDto, @CurrentUser() user: JwtUser) {
    return this.requests.list(query, user);
  }

  @Post()
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: JwtUser) {
    return this.requests.create(dto, user);
  }

  /**
   * «بانتظار الموافقة»: leaves, permissions and overtime requests. HR / admin see every open
   * request (filters: type, branchId, stage, search); others see what is routed to them.
   * Declared before ':id' so the word never reaches the id pipe.
   */
  @Get('inbox')
  inbox(@Query() query: InboxQueryDto, @CurrentUser() user: JwtUser) {
    return this.flow.inbox(query, user);
  }

  /** Unified request card: fields, status chip, timeline, available actions. */
  @Get('flow/:kind/:id')
  flowDetail(@Param('kind', new ParseEnumPipe(FLOW_KINDS)) kind: FlowKind, @Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.flow.detail(kind, id, user);
  }

  /** accept | reject | return (comment required for return). Authorization is in each module. */
  @Post('flow/:kind/:id/action')
  flowAction(
    @Param('kind', new ParseEnumPipe(FLOW_KINDS)) kind: FlowKind,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FlowActionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.flow.action(kind, id, dto, user);
  }

  /** Edit + resubmit a request returned for changes. */
  @Post('flow/:kind/:id/resubmit')
  flowResubmit(
    @Param('kind', new ParseEnumPipe(FLOW_KINDS)) kind: FlowKind,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FlowResubmitDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.flow.resubmit(kind, id, dto, user);
  }

  /** Pre-filled exit (انتهاء خدمة) dialog for an approved resignation request. */
  @Get(':id/exit-draft')
  @RequiresPermission('leaves.requests:approve')
  exitDraft(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.requests.exitDraft(id, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.requests.findOne(id, user);
  }

  @Patch(':id/approve')
  @RequiresPermission('leaves.requests:approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.requests.approve(id, user, dryRun === 'true' || dryRun === '1');
  }

  @Patch(':id/reject')
  @RequiresPermission('leaves.requests:reject')
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.requests.reject(id, user);
  }
}
