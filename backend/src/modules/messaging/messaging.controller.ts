import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import {
  CreateMemoDto,
  CreateMessageDto,
  ListMessagesDto,
  ReplyMessageDto,
} from './dto/messaging.dto';
import { MessagingService } from './messaging.service';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('inbox')
  inbox(@Query() query: ListMessagesDto, @CurrentUser() user: JwtUser) {
    return this.messaging.inbox(query, user);
  }

  @Get('sent')
  sent(@Query() query: ListMessagesDto, @CurrentUser() user: JwtUser) {
    return this.messaging.sent(query, user);
  }

  @Get('memos')
  memos(@Query() query: ListMessagesDto) {
    return this.messaging.listMemos(query);
  }

  @Post('memos')
  createMemo(@Body() dto: CreateMemoDto, @CurrentUser() user: JwtUser) {
    return this.messaging.createMemo(dto, user);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.messaging.get(id, user);
  }

  @Post()
  create(@Body() dto: CreateMessageDto, @CurrentUser() user: JwtUser) {
    return this.messaging.create(dto, user);
  }

  @Post(':id/reply')
  reply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplyMessageDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.messaging.reply(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.messaging.remove(id, user);
  }
}
