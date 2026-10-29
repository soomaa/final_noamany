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
import {
  ChangeDebitNoteStatusDto,
  ListDebitNotesDto,
  SendDebitNoteDto,
  UpsertDebitNoteDto,
} from './dto/procurement-ext.dto';
import { DebitNotesService } from './debit-notes.service';

@UseGuards(JwtAuthGuard)
@Controller('debit-notes')
@RequiresPermission('gym-sales.procurement:view')
export class DebitNotesController {
  constructor(private readonly service: DebitNotesService) {}

  @Get('stats')
  stats(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.service.stats(branchId, user);
  }

  @Get()
  list(@Query() query: ListDebitNotesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertDebitNoteDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertDebitNoteDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Patch(':id/status')
  @RequiresPermission('gym-sales.procurement:approve')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeDebitNoteStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.changeStatus(id, body, user);
  }

  @Post(':id/send')
  @RequiresPermission('gym-sales.procurement:update')
  send(@Param('id', ParseIntPipe) id: number, @Body() body: SendDebitNoteDto, @CurrentUser() user: JwtUser) {
    return this.service.send(id, body, user);
  }
}
