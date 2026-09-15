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
import { JwtUser } from '../../common/types/jwt-user';
import { isDryRun } from '../../common/preview';
import {
  ListJournalEntriesDto,
  ReverseJournalEntryDto,
  UpsertJournalEntryDto,
} from './dto/accounting.dto';
import { JournalEntriesService } from './journal-entries.service';

@UseGuards(JwtAuthGuard)
@Controller('accounting/journal-entries')
@RequiresPermission('accounting.journal:view')
export class JournalEntriesController {
  constructor(private readonly service: JournalEntriesService) {}

  @Get()
  list(@Query() query: ListJournalEntriesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('accounting.journal:create')
  create(@Body() body: UpsertJournalEntryDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user.sub, user);
  }

  @Put(':id')
  @RequiresPermission('accounting.journal:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpsertJournalEntryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('accounting.journal:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Post(':id/post')
  @RequiresPermission('accounting.journal:approve')
  post(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.post(id, user.sub, user);
  }

  @Post(':id/reverse')
  @RequiresPermission('accounting.journal:approve')
  reverse(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReverseJournalEntryDto,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.reverse(id, body.reason, user.sub, isDryRun(dryRun), user);
  }
}
