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
import { ClubQuickServicesService } from './club-quick-services.service';
import {
  ListClubQuickServicesDto,
  SellClubQuickServiceDto,
  UpsertClubQuickServiceDto,
} from './dto/club-quick-services.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-quick-services')
@RequiresPermission(
  'club.reception:view',
  'club.reception.quick_services:view',
)
export class ClubQuickServicesController {
  constructor(private readonly service: ClubQuickServicesService) {}

  /** Active catalog for reception quick-sale buttons. */
  @Get('catalog')
  catalog(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.service.catalog(
      user,
      branchId != null && branchId !== '' ? Number(branchId) : undefined,
    );
  }

  @Get()
  list(@Query() query: ListClubQuickServicesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  /** Sell a catalog service → club_receipts (type quick_service) + GL. */
  @Post('sell')
  @RequiresPermission(
    'club.reception:create',
    'club.reception.quick_services:create',
  )
  sell(@Body() body: SellClubQuickServiceDto, @CurrentUser() user: JwtUser) {
    return this.service.sell(body, user);
  }

  @Post()
  @RequiresPermission(
    'club.reception:create',
    'club.reception:update',
    'club.reception.quick_services:create',
  )
  create(@Body() body: UpsertClubQuickServiceDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @RequiresPermission(
    'club.reception:update',
    'club.reception.quick_services:update',
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpsertClubQuickServiceDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission(
    'club.reception:update',
    'club.reception:delete',
    'club.reception.quick_services:delete',
  )
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
