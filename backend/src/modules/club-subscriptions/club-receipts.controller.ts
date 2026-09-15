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
import { ClubReceiptsCrudService } from './club-receipts-crud.service';
import {
  CreateClubReceiptDto,
  ListClubReceiptsDto,
  UpdateClubReceiptDto,
} from './dto/club-receipts.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-receipts')
@RequiresPermission(
  'club.subscriptions:view',
  'club.subscriptions.receipts:view',
  'club.reception:view',
)
export class ClubReceiptsController {
  constructor(private readonly service: ClubReceiptsCrudService) {}

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser) {
    return this.service.statistics(user);
  }

  @Get()
  list(@Query() query: ListClubReceiptsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.subscriptions:create')
  create(@Body() body: CreateClubReceiptDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.subscriptions:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateClubReceiptDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

}
