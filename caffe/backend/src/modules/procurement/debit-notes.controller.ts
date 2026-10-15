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
  stats(@Query('branchId') branchId?: string) {
    return this.service.stats(branchId);
  }

  @Get()
  list(@Query() query: ListDebitNotesDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertDebitNoteDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertDebitNoteDto>,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Patch(':id/status')
  @RequiresPermission('gym-sales.procurement:approve')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeDebitNoteStatusDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.changeStatus(id, body, userId);
  }

  @Post(':id/send')
  @RequiresPermission('gym-sales.procurement:update')
  send(@Param('id', ParseIntPipe) id: number, @Body() body: SendDebitNoteDto) {
    return this.service.send(id, body);
  }
}
